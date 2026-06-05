"""
Lambda handler — vg-seed-logs
Triggered by EventBridge every 20 minutes.

Simulates realistic live operational data each run:
  - Completed logs spread across last 48 hours (~70% within SLA, ~30% breached)
  - In-progress logs at 82% elapsed so pre-breach warning fires next cycle
  - Each run adds a fresh batch — data grows naturally over time
  - Event types derived from actual SLA rule metric names in DB

Credentials fetched from AWS SSM Parameter Store (free tier).
"""

import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from random import Random

import boto3
import psycopg2
import psycopg2.extras


def _load_ssm():
    region = os.environ.get("VG_AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "ap-south-1")
    ssm = boto3.client("ssm", region_name=region)
    prefix = os.environ.get("SSM_PREFIX", "/vendorguard")
    names = [
        f"{prefix}/db_host",
        f"{prefix}/db_port",
        f"{prefix}/db_name",
        f"{prefix}/db_user",
        f"{prefix}/db_password",
    ]
    resp = ssm.get_parameters(Names=names, WithDecryption=True)
    params = {p["Name"].split("/")[-1]: p["Value"] for p in resp["Parameters"]}
    os.environ["DB_HOST"]     = params["db_host"]
    os.environ["DB_PORT"]     = params.get("db_port", "5432")
    os.environ["DB_NAME"]     = params["db_name"]
    os.environ["DB_USER"]     = params["db_user"]
    os.environ["DB_PASSWORD"] = params["db_password"]


_load_ssm()

from backend.db.connection import DBConn  # noqa: E402

LOGS_PER_RULE  = int(os.environ.get("LOGS_PER_RULE", "5"))
BREACH_RATE    = 0.30   # 30% of completed logs will exceed SLA threshold
INPROGRESS_RATIO = 0.82 # in-progress logs seeded at 82% elapsed


def _event_type_from_metric(metric_name: str) -> str:
    et = metric_name.lower()
    for ch in (" ", "-", "/", "(", ")", ".", "&", "'"):
        et = et.replace(ch, "_")
    while "__" in et:
        et = et.replace("__", "_")
    return et.strip("_")[:60]


def _fetch_rules(conn) -> dict[str, list[dict]]:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT id, vendor_id, metric_name, threshold_hours, threshold_unit
        FROM sla_rules
        WHERE threshold_hours IS NOT NULL
          AND threshold_hours > 0
          AND threshold_unit IN ('hours', 'minutes', 'days_hours', 'business_hours')
          AND status IN ('approved', 'draft')
        """
    )
    rules: dict[str, list[dict]] = {}
    for r in cur.fetchall():
        rules.setdefault(r["vendor_id"], []).append(dict(r))
    return rules


def _order_ref(rng: Random) -> str:
    prefix = rng.choice(["ORD", "SHP", "DEL", "INV", "TRK"])
    return f"{prefix}-{rng.randint(10000, 99999)}"


def _build_completed_log(vendor_id: str, rule: dict, now: datetime, rng: Random) -> dict:
    """Completed log — either within SLA (70%) or breached (30%)."""
    threshold_h = min(float(rule["threshold_hours"]), 720.0)  # cap at 30 days

    # started_at somewhere in the last 48 hours
    started_at = now - timedelta(hours=rng.uniform(2, 48))

    if rng.random() < BREACH_RATE:
        # Breached: took 110–200% of threshold
        actual_h = threshold_h * rng.uniform(1.10, 2.00)
    else:
        # Within SLA: took 40–95% of threshold
        actual_h = threshold_h * rng.uniform(0.40, 0.95)

    completed_at = started_at + timedelta(hours=actual_h)
    # Don't create future completed_at
    if completed_at > now:
        completed_at = now - timedelta(minutes=rng.uniform(5, 30))

    return {
        "id":           str(uuid.uuid4()),
        "vendor_id":    vendor_id,
        "event_type":   _event_type_from_metric(rule["metric_name"]),
        "external_id":  _order_ref(rng),
        "started_at":   started_at,
        "completed_at": completed_at,
        "metadata": json.dumps({
            "rule_id":       rule["id"],
            "metric_name":   rule["metric_name"],
            "source_system": "VendorGuard-lambda",
            "seeded_at":     now.isoformat(),
        }),
    }


def _build_inprogress_log(vendor_id: str, rule: dict, now: datetime, rng: Random) -> dict:
    """In-progress log at 82% elapsed — triggers pre-breach warning next cycle."""
    threshold_h = min(float(rule["threshold_hours"]), 720.0)
    started_at  = now - timedelta(hours=threshold_h * INPROGRESS_RATIO)
    started_at += timedelta(minutes=rng.uniform(-5, 5))

    return {
        "id":           str(uuid.uuid4()),
        "vendor_id":    vendor_id,
        "event_type":   _event_type_from_metric(rule["metric_name"]),
        "external_id":  _order_ref(rng),
        "started_at":   started_at,
        "completed_at": None,
        "metadata": json.dumps({
            "rule_id":       rule["id"],
            "metric_name":   rule["metric_name"],
            "source_system": "VendorGuard-lambda",
            "seeded_at":     now.isoformat(),
        }),
    }


def handler(event, context):
    now = datetime.now(timezone.utc)
    rng = Random(int(now.timestamp()))

    with DBConn() as conn:
        rules_by_vendor = _fetch_rules(conn)

    if not rules_by_vendor:
        print("[seed_logs] No time-based SLA rules found — nothing to seed")
        return {"inserted": 0, "total_generated": 0}

    completed_rows  = []
    inprogress_rows = []

    for vendor_id, rules in rules_by_vendor.items():
        for rule in rules:
            # Per rule: LOGS_PER_RULE completed logs + 1 in-progress log
            for _ in range(LOGS_PER_RULE):
                completed_rows.append(_build_completed_log(vendor_id, rule, now, rng))
            inprogress_rows.append(_build_inprogress_log(vendor_id, rule, now, rng))

    all_rows = completed_rows + inprogress_rows
    inserted = 0

    with DBConn() as conn:
        cur = conn.cursor()
        for r in all_rows:
            cur.execute(
                """
                INSERT INTO operational_logs
                    (id, vendor_id, event_type, external_id, started_at, completed_at, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    r["id"], r["vendor_id"], r["event_type"], r["external_id"],
                    r["started_at"], r["completed_at"], r["metadata"],
                ),
            )
            if cur.rowcount:
                inserted += 1

    # Mark ~40% of 'sent' disputes older than 2 hours as 'paid'
    # This simulates vendors settling penalties after receiving dispute emails
    paid_count = 0
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id, d.breach_id
            FROM disputes d
            WHERE d.status = 'sent'
              AND d.sent_at < NOW() - INTERVAL '2 hours'
            ORDER BY d.sent_at ASC
            """
        )
        sent_disputes = cur.fetchall()
        to_pay = [r for i, r in enumerate(sent_disputes) if rng.random() < 0.40]
        for dispute_id, breach_id in to_pay:
            cur.execute("UPDATE disputes SET status='paid' WHERE id=%s", (dispute_id,))
            cur.execute("UPDATE breaches SET dispute_status='paid' WHERE id=%s", (breach_id,))
            paid_count += 1

    breached_est = int(len(completed_rows) * BREACH_RATE)
    print(
        f"[seed_logs] {inserted}/{len(all_rows)} logs inserted "
        f"({len(completed_rows)} completed ~{breached_est} breached, "
        f"{len(inprogress_rows)} in-progress) "
        f"across {len(rules_by_vendor)} vendor(s) | {paid_count} dispute(s) marked paid"
    )
    return {
        "inserted":        inserted,
        "total_generated": len(all_rows),
        "completed":       len(completed_rows),
        "in_progress":     len(inprogress_rows),
        "disputes_paid":   paid_count,
    }
