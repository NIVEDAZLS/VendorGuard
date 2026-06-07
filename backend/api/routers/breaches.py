"""
Breaches router.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import psycopg2.extras
from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import DBConn
from backend.utils.email import send_email
from backend.utils.email_helpers import vendor_email

router = APIRouter()


def _s(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


@router.get("/")
def list_breaches(
    vendor_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    days: int = Query(365),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    with DBConn() as conn:
        cur = conn.cursor()
        query = """
            SELECT b.*, v.name AS vendor_name, ol.external_id AS order_id,
                   sr.metric_name, sr.threshold_hours, sr.contract_section
            FROM breaches b
            LEFT JOIN vendors v ON v.id = b.vendor_id
            LEFT JOIN operational_logs ol ON ol.id = b.log_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE b.breached_at >= %s
        """
        params: list = [since]

        if vendor_id:
            query += " AND b.vendor_id = %s"
            params.append(vendor_id)
        if status:
            query += " AND b.dispute_status = %s"
            params.append(status)

        query += " ORDER BY b.breached_at DESC"
        cur.execute(query, params)
        cols = [d[0] for d in cur.description]
        rows = [_s(dict(zip(cols, r))) for r in cur.fetchall()]

    return rows


@router.post("/{breach_id}/waive")
def waive_breach(breach_id: str):
    """Mark a breach as waived and notify the vendor that their exception was accepted."""
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.id, b.penalty_amount, v.name AS vendor_name, v.contact_email,
                   ol.external_id AS order_ref, sr.metric_name, sr.contract_section,
                   er.reason, er.description
            FROM breaches b
            LEFT JOIN vendors v ON v.id = b.vendor_id
            LEFT JOIN operational_logs ol ON ol.id = b.log_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            LEFT JOIN exception_tokens et ON et.log_id = b.log_id AND et.used = TRUE
            LEFT JOIN exception_requests er ON er.token_id = et.id
            WHERE b.id = %s
            ORDER BY er.submitted_at DESC
            LIMIT 1
            """,
            (breach_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Breach not found")
        (_, penalty_amount, vendor_name, contact_email,
         order_ref, metric_name, contract_section, vendor_reason, vendor_desc) = row

        cur.execute(
            "UPDATE breaches SET dispute_status='waived' WHERE id=%s",
            (breach_id,),
        )

    to_email = vendor_email(contact_email)
    reason_line = f"\n\nYour submitted reason: {vendor_reason}" if vendor_reason else ""
    if vendor_desc:
        reason_line += f"\nDetails: {vendor_desc}"

    subject = f"[VendorGuard] Exception Accepted — No Penalty | {metric_name or ''} | Ref {order_ref or ''}"
    body = (
        f"Dear {vendor_name or 'Vendor'} Operations Team,\n\n"
        f"We have reviewed your exception submission for the following SLA event and have decided to waive the breach penalty.\n\n"
        f"SLA Metric       : {metric_name or '—'}\n"
        f"Order / Reference: {order_ref or '—'}\n"
        f"Contract Section : {contract_section or '—'}\n"
        f"Penalty Amount   : {'INR {:,.2f}'.format(float(penalty_amount)) if penalty_amount else '—'}"
        f"{reason_line}\n\n"
        f"Decision: EXCEPTION ACCEPTED — No penalty will be raised for this event.\n\n"
        f"This decision has been recorded in VendorGuard. Please ensure continued compliance "
        f"with your SLA obligations to avoid future breach notices.\n\n"
        f"Regards,\nVendorGuard Compliance Team"
    )

    send_email(to=to_email, subject=subject, body=body)

    return {"breach_id": breach_id, "dispute_status": "waived", "email_sent_to": to_email}


@router.post("/from-log/{log_id}")
def create_breach_from_log(log_id: str):
    """
    Create a breach record on demand for a specific log_id.
    Used when a vendor has responded to a pre-breach warning but breach detection
    hasn't run yet (log had completed_at=NULL at detection time).
    Marks the log completed NOW, runs rule matching, inserts breach.
    Returns the breach_id.
    """
    with DBConn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Check if breach already exists for this log
        cur.execute("SELECT id FROM breaches WHERE log_id = %s LIMIT 1", (log_id,))
        existing = cur.fetchone()
        if existing:
            return {"breach_id": existing["id"], "created": False}

        # Fetch the log
        cur.execute("SELECT * FROM operational_logs WHERE id = %s", (log_id,))
        log = cur.fetchone()
        if not log:
            raise HTTPException(404, "Log not found")
        log = dict(log)

        # Mark completed_at = NOW() if still null
        if not log.get("completed_at"):
            cur.execute(
                "UPDATE operational_logs SET completed_at = NOW() WHERE id = %s",
                (log_id,),
            )
            log["completed_at"] = datetime.now(timezone.utc)

        # Fetch SLA rules for this vendor
        cur.execute(
            """SELECT * FROM sla_rules
               WHERE vendor_id = %s AND threshold_hours IS NOT NULL
                 AND threshold_unit IN ('hours','minutes','days_hours')
                 AND status IN ('approved','draft')""",
            (log["vendor_id"],),
        )
        rules = [dict(r) for r in cur.fetchall()]

    if not rules:
        raise HTTPException(422, "No SLA rules found for this vendor")

    # Match rule using same logic as breach_detection
    from backend.jobs.breach_detection import _match_rule, _calc_penalty
    rule = _match_rule(log["event_type"], rules)
    if not rule:
        raise HTTPException(422, f"No matching SLA rule for event_type '{log['event_type']}'")

    started = log["started_at"]
    completed = log["completed_at"]
    if hasattr(started, "tzinfo") and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if hasattr(completed, "tzinfo") and completed.tzinfo is None:
        completed = completed.replace(tzinfo=timezone.utc)

    threshold = float(rule.get("threshold_hours", 0))
    actual_hours = (completed - started).total_seconds() / 3600
    delay_hours = max(0.0, actual_hours - threshold)
    penalty = _calc_penalty(rule, delay_hours)
    breach_id = str(uuid.uuid4())

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO breaches
                (id, log_id, rule_id, vendor_id, actual_hours, delay_hours,
                 penalty_amount, dispute_status, confidence, reasoning, breached_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'open',85,%s,NOW())
            ON CONFLICT DO NOTHING
            """,
            (
                breach_id, log_id, rule["id"], log["vendor_id"],
                round(actual_hours, 2), round(delay_hours, 2), penalty,
                f"On-demand breach created: vendor responded to pre-breach warning. "
                f"Log completed at {completed}. Delay: {delay_hours:.1f}h against {threshold}h SLA.",
            ),
        )
        # Also insert audit log
        cur.execute(
            """INSERT INTO audit_log (id, vendor_id, breach_id, status, confidence, reasoning)
               VALUES (%s,%s,%s,'confirmed',85,%s)""",
            (str(uuid.uuid4()), log["vendor_id"], breach_id,
             "On-demand breach from vendor exception response"),
        )

    return {"breach_id": breach_id, "created": True, "penalty_amount": penalty}


@router.get("/{breach_id}")
def get_breach(breach_id: str):
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.*, v.name AS vendor_name, v.contact_email,
                   ol.external_id AS order_id, ol.started_at, ol.completed_at, ol.metadata,
                   sr.metric_name, sr.threshold_hours, sr.threshold_unit,
                   sr.penalty_type, sr.penalty_value, sr.contract_section,
                   sr.exception_clauses
            FROM breaches b
            LEFT JOIN vendors v ON v.id = b.vendor_id
            LEFT JOIN operational_logs ol ON ol.id = b.log_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE b.id = %s
            """,
            (breach_id,),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Breach not found")
    return _s(dict(zip(cols, row)))
