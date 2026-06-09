"""
Pre-Breach Warning Job
Scans in-progress operational logs where completed_at IS NULL.
If 80%+ of the SLA window has elapsed, sends a warning email with a JWT exception token.

Uses EVENT_TYPE_MAP and _match_rule() from breach_detection.py for accurate rule matching
(same logic as breach detection — no fragile SQL ILIKE fuzzy matching).

Exception token expiry: 24 hours.
Magic link format: {APP_BASE_URL}/exception?token={jwt}

Run manually: python backend/jobs/pre_breach.py
Cron (every 15 min): */15 * * * * python /path/to/backend/jobs/pre_breach.py
"""

import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
import psycopg2.extras

from backend.db.connection import DBConn
from backend.jobs.breach_detection import EVENT_TYPE_MAP, _match_rule
from backend.utils.email import send_email
from backend.utils.email_helpers import vendor_email
from backend.utils.secrets import get

LOCK_FILE = Path("/tmp/pre_breach.lock")
JWT_SECRET = get("JWT_SECRET", "vendorguard-local-secret")
WARNING_RATIO = 0.80   # fire when 80% of SLA window has elapsed
TOKEN_EXPIRY_HOURS = 24
MAX_EMAILS_PER_RUN = 15  # cap per Lambda invocation to stay within Gmail daily limit


def _check_lock():
    if LOCK_FILE.exists():
        print("[pre_breach] Lock file exists — another instance may be running. Exiting.")
        sys.exit(0)


def _create_lock():
    LOCK_FILE.write_text(str(os.getpid()))


def _release_lock():
    if LOCK_FILE.exists():
        LOCK_FILE.unlink()


def run():
    _check_lock()
    _create_lock()
    try:
        _run_job()
    finally:
        _release_lock()


def _run_job():
    now = datetime.now(timezone.utc)
    base_url = get("APP_BASE_URL", "http://localhost:3000")

    # Fetch all in-progress logs with vendor info
    with DBConn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT ol.*, v.contact_email, v.name AS vendor_name
            FROM operational_logs ol
            JOIN vendors v ON v.id = ol.vendor_id
            WHERE ol.completed_at IS NULL
              AND ol.started_at >= NOW() - INTERVAL '1 hour'
            ORDER BY ol.started_at DESC
            """
        )
        logs = [dict(r) for r in cur.fetchall()]

        # Fetch all approved SLA rules with time-based thresholds
        cur.execute(
            """
            SELECT * FROM sla_rules
            WHERE threshold_hours IS NOT NULL
              AND threshold_unit IN ('hours', 'minutes', 'days_hours')
              AND status IN ('approved', 'draft')
            """
        )
        all_rules = [dict(r) for r in cur.fetchall()]

    # Index rules by vendor
    rules_by_vendor: dict[str, list[dict]] = {}
    for r in all_rules:
        rules_by_vendor.setdefault(r["vendor_id"], []).append(r)

    print(f"[pre_breach] {len(logs)} in-progress logs | {len(all_rules)} SLA rules | cap={MAX_EMAILS_PER_RUN}")

    warned = 0
    warned_vendors: set[str] = set()  # one email per vendor per run

    for log in logs:
        if warned >= MAX_EMAILS_PER_RUN:
            print(f"[pre_breach] Email cap ({MAX_EMAILS_PER_RUN}) reached — stopping.")
            break
        vendor_id = log["vendor_id"]

        # One warning email per vendor per run — avoid flooding same vendor
        if vendor_id in warned_vendors:
            continue
        event_type = log["event_type"]

        # Match log to SLA rule using EVENT_TYPE_MAP (same as breach_detection)
        rule = _match_rule(event_type, rules_by_vendor.get(vendor_id, []))
        if not rule:
            continue

        threshold_hours = float(rule["threshold_hours"])
        if threshold_hours <= 0:
            continue

        started_at = log["started_at"]
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)

        elapsed_hours = (now - started_at).total_seconds() / 3600
        ratio = elapsed_hours / threshold_hours

        # Only warn in the 80–100% window — skip if not yet close or already breached
        if ratio < WARNING_RATIO or ratio >= 1.0:
            continue

        log_id = log["id"]

        # Skip if a warning was ever sent for this log (used, expired, or pending)
        with DBConn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id FROM exception_tokens WHERE log_id = %s",
                (log_id,),
            )
            if cur.fetchone():
                continue

        hours_remaining = max(0.0, threshold_hours - elapsed_hours)
        minutes_remaining = int(hours_remaining * 60)

        # Create 24-hour JWT exception token
        expires_at = now + timedelta(hours=TOKEN_EXPIRY_HOURS)
        token_id = str(uuid.uuid4())
        token_jwt = jwt.encode(
            {
                "token_id": token_id,
                "log_id": log_id,
                "vendor_id": vendor_id,
                "exp": int(expires_at.timestamp()),
            },
            JWT_SECRET,
            algorithm="HS256",
        )

        with DBConn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO exception_tokens (id, log_id, vendor_id, token_jwt, expires_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (token_id, log_id, vendor_id, token_jwt, expires_at),
            )

        exception_url = f"{base_url}/exception?token={token_jwt}"
        vendor_name = log.get("vendor_name", vendor_id)
        metric_name = rule.get("metric_name", event_type)
        order_ref = log.get("external_id", log_id)
        to_email = vendor_email(log.get("contact_email"))

        subject = f"[VendorGuard] Pre-Breach Warning — {metric_name} | {order_ref}"
        body = (
            f"Dear {vendor_name} Operations Team,\n\n"
            f"This is an automated pre-breach warning from VendorGuard.\n\n"
            f"SLA Rule  : {metric_name}\n"
            f"Order/Log : {order_ref}\n"
            f"Started   : {started_at.strftime('%d %b %Y %H:%M UTC')}\n"
            f"Elapsed   : {elapsed_hours:.1f}h ({ratio*100:.0f}% of {threshold_hours}h threshold)\n"
            f"Remaining : {minutes_remaining} minutes before breach threshold\n\n"
            f"If there is a valid exception under your SLA agreement, please file it before the deadline:\n"
            f"{exception_url}\n\n"
            f"This link expires in {TOKEN_EXPIRY_HOURS} hours and is single-use.\n\n"
            f"Failure to respond will result in a formal breach notice and penalty claim.\n\n"
            f"VendorGuard Compliance System"
        )

        try:
            send_email(to=to_email, subject=subject, body=body)
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{ts}] [pre_breach] SENT → {vendor_name} | {metric_name} | {ratio*100:.0f}% elapsed | {minutes_remaining}min remaining | to={to_email}")
        except Exception as e:
            print(f"[pre_breach] Email failed (non-fatal): {e}")
        warned += 1
        warned_vendors.add(vendor_id)

    print(f"[pre_breach] Job complete — {warned}/{MAX_EMAILS_PER_RUN} warning(s) sent from {len(logs)} in-progress logs.")


if __name__ == "__main__":
    run()
