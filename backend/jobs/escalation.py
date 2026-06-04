"""
Escalation Job
Sends 7-day follow-up or 30-day legal escalation for sent-but-unpaid disputes.

Run manually: python backend/jobs/escalation.py
Cron (daily): 0 9 * * * python /path/to/backend/jobs/escalation.py
"""

import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import psycopg2.extras

from backend.db.connection import DBConn
from backend.utils.email import send_email
from backend.utils.email_helpers import vendor_email
from backend.utils.secrets import get

LOCK_FILE = Path("/tmp/escalation.lock")
FOLLOW_UP_DAYS = 7
LEGAL_ESCALATION_DAYS = 30


def _check_lock():
    if LOCK_FILE.exists():
        print("[escalation] Lock file exists — skipping. Exiting.")
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

    with DBConn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT d.*, v.name AS vendor_name, v.contact_email,
                   b.penalty_amount, b.delay_hours,
                   sr.metric_name, sr.contract_section
            FROM disputes d
            JOIN vendors v ON v.id = d.vendor_id
            LEFT JOIN breaches b ON b.id = d.breach_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE d.status = 'sent'
              AND d.payment_status = 'unpaid'
              AND d.sent_at IS NOT NULL
            ORDER BY d.sent_at
            """
        )
        disputes = cur.fetchall()

    follow_ups = 0
    legal_escalations = 0

    for d in disputes:
        d = dict(d)
        sent_at = d["sent_at"]
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)

        days_since_sent = (now - sent_at).days

        if days_since_sent >= LEGAL_ESCALATION_DAYS:
            _send_legal_escalation(d, days_since_sent)
            _update_dispute(d["id"], "needs_human_review", "legal_escalated")
            legal_escalations += 1

        elif days_since_sent >= FOLLOW_UP_DAYS:
            _send_follow_up(d, days_since_sent)
            _update_dispute(d["id"], "sent", "follow_up_sent")
            follow_ups += 1

    print(f"[escalation] Done — Follow-ups: {follow_ups} | Legal escalations: {legal_escalations}")


def _send_follow_up(d: dict, days: int) -> None:
    subject = f"[FOLLOW-UP] SLA Penalty Claim — {d.get('metric_name','SLA Breach')} | Breach {d['breach_id']}"
    body = (
        f"Dear {d['vendor_name']} Operations Team,\n\n"
        f"This is a follow-up to our penalty notice sent {days} days ago.\n\n"
        f"Breach Reference : {d['breach_id']}\n"
        f"SLA Rule         : {d.get('metric_name', 'N/A')}\n"
        f"Contract Section : {d.get('contract_section', 'N/A')}\n"
        f"Penalty Amount   : ₹{d.get('penalty_amount', 0):,.0f}\n\n"
        f"Payment remains outstanding. Please remit within 7 business days to avoid legal escalation.\n\n"
        f"VendorGuard Compliance System"
    )
    send_email(to=vendor_email(d.get("contact_email")), subject=subject, body=body)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [escalation] FOLLOW-UP sent → {d['vendor_name']} | {d['breach_id']}")


def _send_legal_escalation(d: dict, days: int) -> None:
    recipient = vendor_email(d.get("contact_email"))
    subject = f"[LEGAL ESCALATION] Unpaid SLA Penalty — {d['vendor_name']} | INR {d.get('penalty_amount',0):,.0f}"
    body = (
        f"LEGAL ESCALATION NOTICE\n\n"
        f"Vendor           : {d['vendor_name']}\n"
        f"Breach Reference : {d['breach_id']}\n"
        f"SLA Rule         : {d.get('metric_name', 'N/A')}\n"
        f"Penalty Amount   : INR {d.get('penalty_amount', 0):,.0f}\n"
        f"Dispute Sent     : {d['sent_at']}\n"
        f"Days Outstanding : {days}\n\n"
        f"This dispute has been unpaid for {days} days. "
        f"Please escalate to the legal team for further action.\n\n"
        f"VendorGuard Compliance System"
    )
    send_email(to=recipient, subject=subject, body=body)
    # Also send vendor-facing notice
    vendor_body = (
        f"Dear {d['vendor_name']} Legal Team,\n\n"
        f"This matter has been escalated to our legal department after {days} days of non-payment.\n\n"
        f"Breach Reference : {d['breach_id']}\n"
        f"Penalty Amount   : INR {d.get('penalty_amount', 0):,.0f}\n\n"
        f"Please contact our legal team immediately to resolve this matter.\n\n"
        f"VendorGuard Legal Compliance"
    )
    send_email(to=recipient, subject=subject, body=vendor_body)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [escalation] LEGAL ESCALATION → {d['vendor_name']} | {d['breach_id']} | ₹{d.get('penalty_amount',0):,.0f}")


def _update_dispute(dispute_id: str, status: str, audit_note: str) -> None:
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE disputes SET status = %s WHERE id = %s",
            (status, dispute_id),
        )
        cur.execute(
            """
            INSERT INTO audit_log (id, status, reasoning)
            VALUES (%s, 'dispute_sent', %s)
            """,
            (str(uuid.uuid4()), audit_note),
        )


if __name__ == "__main__":
    run()
