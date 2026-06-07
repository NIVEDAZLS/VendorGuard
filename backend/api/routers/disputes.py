"""
Disputes router.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agents.agent3 import draft_dispute_email
from backend.db.connection import DBConn
from backend.utils.email import send_email
from backend.utils.email_helpers import vendor_email
from backend.utils.secrets import get

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


@router.get("/breach/{breach_id}")
def get_dispute_for_breach(breach_id: str):
    """Get the dispute draft for a specific breach (if it exists)."""
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.*, v.name AS vendor_name, v.contact_email,
                   b.penalty_amount, b.delay_hours, sr.metric_name
            FROM disputes d
            LEFT JOIN vendors v ON v.id = d.vendor_id
            LEFT JOIN breaches b ON b.id = d.breach_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE d.breach_id = %s
            ORDER BY d.created_at DESC
            LIMIT 1
            """,
            (breach_id,),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
    if not row:
        return None
    return _s(dict(zip(cols, row)))


@router.post("/breach/{breach_id}/draft")
def draft_dispute(breach_id: str):
    """Call Agent 3 to draft a dispute email for this breach."""
    draft_dispute_email(breach_id)
    # Return full dispute record so frontend can display it immediately
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.*, v.name AS vendor_name, v.contact_email,
                   b.penalty_amount, b.delay_hours, sr.metric_name
            FROM disputes d
            LEFT JOIN vendors v ON v.id = d.vendor_id
            LEFT JOIN breaches b ON b.id = d.breach_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE d.breach_id = %s
            ORDER BY d.created_at DESC LIMIT 1
            """,
            (breach_id,),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
    if not row:
        raise HTTPException(500, "Draft was not saved")
    return _s(dict(zip(cols, row)))


@router.put("/breach/{breach_id}/email-body")
def update_email_body(breach_id: str, payload: dict):
    """Update the email body of an existing draft."""
    new_body = payload.get("email_body", "")
    if not new_body:
        raise HTTPException(400, "email_body required")
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE disputes SET email_body=%s WHERE breach_id=%s RETURNING id",
            (new_body, breach_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "No draft found for this breach")
    return {"updated": True}


@router.post("/breach/{breach_id}/send")
def send_dispute_email(breach_id: str):
    """Send the drafted dispute email to the vendor contact."""
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id, d.email_subject, d.email_body, d.vendor_id,
                   v.contact_email, v.name AS vendor_name
            FROM disputes d
            LEFT JOIN vendors v ON v.id = d.vendor_id
            WHERE d.breach_id = %s
            ORDER BY d.created_at DESC LIMIT 1
            """,
            (breach_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "No draft found — generate a draft first")
        dispute_id, subject, body, vendor_id, contact_email, vendor_name = row

    recipient = vendor_email(contact_email)
    send_email(to=recipient, subject=subject, body=body)

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE disputes SET status='sent', sent_at=NOW() WHERE id=%s",
            (dispute_id,),
        )
        cur.execute(
            "UPDATE breaches SET dispute_status='sent' WHERE id=%s",
            (breach_id,),
        )

    return {"sent": True, "recipient": recipient, "dispute_id": dispute_id}


@router.post("/breach/{breach_id}/magic-link")
def send_magic_link(breach_id: str):
    """Generate a one-time exception token and email the magic link to the vendor."""
    import jwt as pyjwt
    from datetime import timezone, timedelta

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT b.log_id, b.vendor_id, v.contact_email, v.name,
                   ol.external_id, sr.metric_name
            FROM breaches b
            LEFT JOIN vendors v ON v.id = b.vendor_id
            LEFT JOIN operational_logs ol ON ol.id = b.log_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE b.id = %s
            """,
            (breach_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Breach not found")
        log_id, vendor_id, contact_email, vendor_name, order_id, metric_name = row

    # Create exception token
    secret = get("JWT_SECRET", "vendorguard-local-secret")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    token_id = str(uuid.uuid4())
    payload = {
        "token_id": token_id,
        "log_id": log_id,
        "vendor_id": vendor_id,
        "breach_id": breach_id,
        "exp": expires_at,
    }
    token_jwt = pyjwt.encode(payload, secret, algorithm="HS256")

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO exception_tokens (id, log_id, vendor_id, token_jwt, expires_at) VALUES (%s,%s,%s,%s,%s)",
            (token_id, log_id, vendor_id, token_jwt, expires_at),
        )

    base_url = get("APP_BASE_URL", "http://localhost:3000")
    magic_url = f"{base_url}/exception?token={token_jwt}"

    email_body = (
        f"Dear {vendor_name},\n\n"
        f"VendorGuard has detected a potential SLA breach for {metric_name} (Ref: {order_id}).\n\n"
        f"If you believe this breach was due to an exceptional circumstance covered under your contract, "
        f"please submit your exception reason using the secure link below within 7 days:\n\n"
        f"{magic_url}\n\n"
        f"This link is single-use and expires on {expires_at.strftime('%d %b %Y')}.\n\n"
        f"If you have no exception to raise, you may disregard this notice.\n\n"
        f"Regards,\nVendorGuard Compliance Team"
    )

    recipient = vendor_email(contact_email)
    send_email(
        to=recipient,
        subject=f"[VendorGuard] Exception window open — {metric_name} | Ref {order_id}",
        body=email_body,
    )

    return {
        "sent": True,
        "recipient": recipient,
        "magic_url": magic_url,
        "expires_at": expires_at.isoformat(),
        "token_id": token_id,
    }


@router.get("/pre-breach-warnings")
def list_pre_breach_warnings():
    """
    Return all exception tokens (used + active) with vendor response info.
    Frontend splits into:
      - Section A: used=False  → awaiting vendor response
      - Section B: used=True   → vendor responded, action required
    """
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT et.id, et.log_id, et.vendor_id, et.used,
                   et.expires_at, et.created_at AS sent_at, et.token_jwt,
                   v.name  AS vendor_name,
                   ol.event_type, ol.external_id, ol.started_at,
                   sr.metric_name, sr.threshold_hours,
                   er.id          AS exception_request_id,
                   er.reason      AS vendor_reason,
                   er.description AS vendor_description,
                   er.submitted_at AS vendor_submitted_at,
                   b.id           AS breach_id
            FROM exception_tokens et
            JOIN  vendors v   ON v.id  = et.vendor_id
            JOIN  operational_logs ol ON ol.id = et.log_id
            LEFT JOIN sla_rules sr
                   ON sr.vendor_id = et.vendor_id
                  AND sr.status IN ('approved', 'draft')
            LEFT JOIN exception_requests er ON er.token_id = et.id
            LEFT JOIN breaches b             ON b.log_id   = et.log_id
            ORDER BY et.created_at DESC
            """
        )
        cols = [d[0] for d in cur.description]
        rows = [_s(dict(zip(cols, r))) for r in cur.fetchall()]

    # Deduplicate: a token may join multiple sla_rules rows; keep the best match
    seen: dict[str, dict] = {}
    for r in rows:
        tid = r["id"]
        if tid not in seen or (r["metric_name"] and not seen[tid]["metric_name"]):
            seen[tid] = r
    return list(seen.values())


@router.get("/")
def list_disputes(status: str = "pending_review"):
    with DBConn() as conn:
        cur = conn.cursor()
        if status == "all":
            cur.execute(
                """
                SELECT d.*, v.name AS vendor_name, v.contact_email,
                       b.penalty_amount, sr.metric_name
                FROM disputes d
                LEFT JOIN vendors v ON v.id = d.vendor_id
                LEFT JOIN breaches b ON b.id = d.breach_id
                LEFT JOIN sla_rules sr ON sr.id = b.rule_id
                ORDER BY d.created_at DESC
                """
            )
        else:
            cur.execute(
                """
                SELECT d.*, v.name AS vendor_name, v.contact_email,
                       b.penalty_amount, sr.metric_name
                FROM disputes d
                LEFT JOIN vendors v ON v.id = d.vendor_id
                LEFT JOIN breaches b ON b.id = d.breach_id
                LEFT JOIN sla_rules sr ON sr.id = b.rule_id
                WHERE d.status = %s
                ORDER BY d.created_at DESC
                """,
                (status,),
            )
        cols = [d[0] for d in cur.description]
        rows = [_s(dict(zip(cols, r))) for r in cur.fetchall()]
    return rows


class StatusUpdate(BaseModel):
    status: str
    payment_status: str | None = None


@router.put("/{dispute_id}/status")
def update_dispute_status(dispute_id: str, body: StatusUpdate):
    valid_statuses = {"pending_review", "approved", "sent", "rejected"}
    if body.status not in valid_statuses:
        raise HTTPException(400, f"status must be one of {valid_statuses}")
    with DBConn() as conn:
        cur = conn.cursor()
        if body.payment_status:
            cur.execute(
                "UPDATE disputes SET status=%s, payment_status=%s WHERE id=%s",
                (body.status, body.payment_status, dispute_id),
            )
        else:
            cur.execute("UPDATE disputes SET status=%s WHERE id=%s", (body.status, dispute_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Dispute not found")
    return {"dispute_id": dispute_id, "status": body.status}
