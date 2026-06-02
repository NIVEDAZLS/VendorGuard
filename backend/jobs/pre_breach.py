"""
Pre-Breach Warning Job
Scans in-progress operational logs where completed_at IS NULL.
If 80%+ of the SLA window has elapsed, sends a warning email with a JWT exception token.

Run manually: python backend/jobs/pre_breach.py
Cron (every 15 min): */15 * * * * python /path/to/backend/jobs/pre_breach.py
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
import psycopg2.extras

from backend.db.connection import DBConn
from backend.utils.email import send_email
from backend.utils.secrets import require, get

LOCK_FILE = Path("/tmp/pre_breach.lock")
JWT_SECRET = get("JWT_SECRET", "vendorguard-local-secret")
EXCEPTION_BASE_URL = "https://vendorguard.io/exception"
WARNING_RATIO = 0.80  # fire when 80% of SLA window has elapsed


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
    with DBConn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT ol.*, sr.threshold_hours, sr.metric_name, sr.id AS rule_id,
                   v.contact_email, v.name AS vendor_name
            FROM operational_logs ol
            JOIN vendors v ON v.id = ol.vendor_id
            LEFT JOIN sla_rules sr ON sr.vendor_id = ol.vendor_id
                AND sr.metric_name ILIKE '%' || ol.event_type || '%'
            WHERE ol.completed_at IS NULL
            ORDER BY ol.started_at
            """
        )
        rows = cur.fetchall()

    now = datetime.now(timezone.utc)
    warned = 0

    for row in rows:
        threshold_hours = row.get("threshold_hours")
        if not threshold_hours:
            continue

        started_at = row["started_at"]
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)

        elapsed_hours = (now - started_at).total_seconds() / 3600
        ratio = elapsed_hours / float(threshold_hours)

        if ratio < WARNING_RATIO:
            continue

        log_id = row["id"]
        vendor_id = row["vendor_id"]
        vendor_email = row.get("contact_email", "")
        vendor_name = row.get("vendor_name", vendor_id)
        rule_id = row.get("rule_id", "")
        metric_name = row.get("metric_name", row["event_type"])

        # Create JWT exception token (valid for 4 hours)
        expires_at = now + timedelta(hours=4)
        token_id = str(uuid.uuid4())
        token = jwt.encode(
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
            # Skip if warning already sent for this log
            cur.execute("SELECT id FROM exception_tokens WHERE log_id = %s AND used = FALSE", (log_id,))
            if cur.fetchone():
                continue

            cur.execute(
                """
                INSERT INTO exception_tokens (id, log_id, vendor_id, token_jwt, expires_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (token_id, log_id, vendor_id, token, expires_at),
            )

        exception_url = f"{EXCEPTION_BASE_URL}/{token}"
        hours_remaining = max(0, float(threshold_hours) - elapsed_hours)

        subject = f"[VendorGuard] Pre-Breach Warning — {metric_name} | {row.get('external_id', log_id)}"
        body = (
            f"Dear {vendor_name} Operations Team,\n\n"
            f"This is an automated pre-breach warning from VendorGuard.\n\n"
            f"SLA Rule  : {metric_name}\n"
            f"Order/Log : {row.get('external_id', log_id)}\n"
            f"Started   : {started_at.strftime('%d %b %Y %H:%M UTC')}\n"
            f"Elapsed   : {elapsed_hours:.1f} hours ({ratio*100:.0f}% of {threshold_hours}h threshold)\n"
            f"Remaining : {hours_remaining:.1f} hours\n\n"
            f"If there is a valid exception under your SLA agreement, please file it before the deadline:\n"
            f"{exception_url}\n\n"
            f"Failure to respond will result in a formal breach notice and penalty claim.\n\n"
            f"VendorGuard Compliance System"
        )

        send_email(to=vendor_email, subject=subject, body=body)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ts}] [pre_breach] WARNING sent → {vendor_name} | {metric_name} | {ratio*100:.0f}% elapsed")
        warned += 1

    print(f"[pre_breach] Job complete — {warned} warning(s) sent from {len(rows)} in-progress logs.")


if __name__ == "__main__":
    run()
