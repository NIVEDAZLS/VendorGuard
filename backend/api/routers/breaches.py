"""
Breaches router.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

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
