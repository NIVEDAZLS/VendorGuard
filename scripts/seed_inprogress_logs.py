"""
Seed in-progress operational logs at ~82% of SLA threshold elapsed.

Run on demand or every 5 minutes so the pre_breach.py job (which fires at 80%)
will detect them immediately and send warning emails.

Usage:
    python scripts/seed_inprogress_logs.py            # insert 2 logs per SLA rule
    python scripts/seed_inprogress_logs.py --dry-run  # print without inserting
    python scripts/seed_inprogress_logs.py --count 3  # insert N logs per rule

Cron (every 5 min):
    */5 * * * * python /path/to/scripts/seed_inprogress_logs.py
"""

import argparse
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from random import Random

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg2.extras
from backend.db.connection import DBConn


ELAPSED_RATIO = 0.82  # 82% of threshold — triggers pre_breach at 80%


def _event_type_from_metric(metric_name: str) -> str:
    return metric_name.lower().replace(" ", "_").replace("-", "_")[:40]


def fetch_vendor_rules(conn) -> dict[str, list[dict]]:
    """Return approved/draft SLA rules with threshold_hours, keyed by vendor_id."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT sr.id, sr.vendor_id, sr.metric_name, sr.threshold_hours
        FROM sla_rules sr
        WHERE sr.threshold_hours IS NOT NULL
          AND sr.threshold_hours > 0
          AND sr.status IN ('approved', 'draft')
        """
    )
    rules_by_vendor: dict[str, list[dict]] = {}
    for r in cur.fetchall():
        rules_by_vendor.setdefault(r["vendor_id"], []).append(dict(r))
    return rules_by_vendor


def build_log(vendor_id: str, rule: dict, now: datetime, rng: Random) -> dict:
    threshold_hours = float(rule["threshold_hours"])
    started_at = now - timedelta(hours=threshold_hours * ELAPSED_RATIO)
    # Add a small random jitter (±5 min) so repeated runs don't produce identical timestamps
    started_at += timedelta(minutes=rng.uniform(-5, 5))
    event_type = _event_type_from_metric(rule["metric_name"])
    order_num = rng.randint(10000, 99999)
    return {
        "id": str(uuid.uuid4()),
        "vendor_id": vendor_id,
        "event_type": event_type,
        "external_id": f"ORD-{order_num}",
        "started_at": started_at,
        "completed_at": None,
        "metadata": {
            "rule_id": rule["id"],
            "metric_name": rule["metric_name"],
            "source_system": "VendorGuard-seed",
            "seeded_at": now.isoformat(),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Seed in-progress logs for pre-breach demo")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--count", type=int, default=2, help="Logs to insert per SLA rule")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    rng = Random(int(now.timestamp()))

    with DBConn() as conn:
        rules_by_vendor = fetch_vendor_rules(conn)

    if not rules_by_vendor:
        print("[seed_inprogress] No approved SLA rules found — nothing to seed.")
        return

    rows = []
    for vendor_id, rules in rules_by_vendor.items():
        for rule in rules:
            for _ in range(args.count):
                rows.append(build_log(vendor_id, rule, now, rng))

    print(f"[seed_inprogress] {'DRY RUN — ' if args.dry_run else ''}"
          f"{len(rows)} log(s) across {len(rules_by_vendor)} vendor(s)")

    if args.dry_run:
        for r in rows:
            threshold_h = float(next(
                rule["threshold_hours"]
                for vr in rules_by_vendor.values()
                for rule in vr
                if rule["id"] == r["metadata"]["rule_id"]
            ))
            elapsed_h = (now - r["started_at"].replace(tzinfo=timezone.utc)).total_seconds() / 3600
            print(
                f"  vendor={r['vendor_id']:<14}  event={r['event_type']:<35}  "
                f"started={r['started_at'].strftime('%H:%M')}  "
                f"elapsed={elapsed_h:.1f}h / {threshold_h:.1f}h  ({elapsed_h/threshold_h*100:.0f}%)"
            )
        return

    inserted = 0
    with DBConn() as conn:
        cur = conn.cursor()
        for r in rows:
            import json
            cur.execute(
                """
                INSERT INTO operational_logs
                    (id, vendor_id, event_type, external_id, started_at, completed_at, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    r["id"], r["vendor_id"], r["event_type"], r["external_id"],
                    r["started_at"], r["completed_at"], json.dumps(r["metadata"]),
                ),
            )
            if cur.rowcount:
                inserted += 1

    print(f"[seed_inprogress] Inserted {inserted} / {len(rows)} row(s) (rest were duplicate IDs).")


if __name__ == "__main__":
    main()
