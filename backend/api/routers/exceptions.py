"""
Exception tokens router.
Handles vendor magic-link submissions.
"""

import jwt as pyjwt
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.connection import DBConn
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


@router.get("/validate")
def validate_token(token: str):
    """
    Validate a JWT exception token and return the pre-breach context for the vendor.
    Called when vendor clicks the magic link.
    """
    secret = get("JWT_SECRET", "vendorguard-local-secret")
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(400, "This link has expired. Please contact your VendorGuard account manager.")
    except pyjwt.InvalidTokenError:
        raise HTTPException(400, "Invalid or tampered link.")

    token_id  = payload.get("token_id")
    log_id    = payload.get("log_id")
    vendor_id = payload.get("vendor_id")

    with DBConn() as conn:
        cur = conn.cursor()

        # Check token exists and is not already used
        cur.execute(
            "SELECT id, used, expires_at FROM exception_tokens WHERE id = %s",
            (token_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Token not found.")
        _, used, expires_at = row
        if used:
            raise HTTPException(400, "This link has already been used.")

        # Fetch operational log details
        cur.execute(
            """
            SELECT ol.id, ol.event_type, ol.external_id, ol.started_at,
                   v.name AS vendor_name,
                   sr.metric_name, sr.threshold_hours, sr.threshold_unit,
                   sr.exception_clauses, sr.contract_section
            FROM operational_logs ol
            JOIN vendors v ON v.id = ol.vendor_id
            LEFT JOIN sla_rules sr
                   ON sr.vendor_id = ol.vendor_id
                  AND sr.status IN ('approved', 'draft')
                  AND sr.threshold_hours IS NOT NULL
            WHERE ol.id = %s
            ORDER BY sr.threshold_hours ASC
            LIMIT 1
            """,
            (log_id,),
        )
        cols = [d[0] for d in cur.description]
        log_row = cur.fetchone()
        if not log_row:
            raise HTTPException(404, "Associated log not found.")
        log_data = _s(dict(zip(cols, log_row)))

    now = datetime.now(timezone.utc)
    started_at = datetime.fromisoformat(log_data["started_at"]) if isinstance(log_data["started_at"], str) else log_data["started_at"]
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    elapsed_hours = (now - started_at).total_seconds() / 3600
    threshold_h   = float(log_data["threshold_hours"] or 1)
    pct_elapsed   = round(elapsed_hours / threshold_h * 100, 1)

    return {
        "valid":           True,
        "token_id":        token_id,
        "log_id":          log_id,
        "vendor_id":       vendor_id,
        "vendor_name":     log_data["vendor_name"],
        "metric_name":     log_data["metric_name"],
        "order_ref":       log_data["external_id"],
        "event_type":      log_data["event_type"],
        "started_at":      log_data["started_at"],
        "threshold_hours": log_data["threshold_hours"],
        "threshold_unit":  log_data["threshold_unit"],
        "elapsed_hours":   round(elapsed_hours, 2),
        "pct_elapsed":     pct_elapsed,
        "contract_section":log_data["contract_section"],
        "exception_clauses": log_data["exception_clauses"] or [],
        "expires_at":      expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at),
    }


class ExceptionSubmission(BaseModel):
    token: str
    reason: str
    description: str


@router.post("/submit")
def submit_exception(body: ExceptionSubmission):
    """
    Vendor submits their exception reason via the magic link form.
    Marks token as used and saves exception_request row.
    """
    import uuid
    secret = get("JWT_SECRET", "vendorguard-local-secret")
    try:
        payload = pyjwt.decode(body.token, secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(400, "This link has expired.")
    except pyjwt.InvalidTokenError:
        raise HTTPException(400, "Invalid link.")

    token_id  = payload.get("token_id")
    log_id    = payload.get("log_id")
    vendor_id = payload.get("vendor_id")

    with DBConn() as conn:
        cur = conn.cursor()

        cur.execute("SELECT id, used FROM exception_tokens WHERE id = %s", (token_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Token not found.")
        if row[1]:
            raise HTTPException(400, "This link has already been used.")

        # Save exception request
        request_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO exception_requests (id, token_id, vendor_id, reason, description, submitted_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (request_id, token_id, vendor_id, body.reason, body.description),
        )

        # Mark token as used
        cur.execute("UPDATE exception_tokens SET used = TRUE WHERE id = %s", (token_id,))

    return {
        "submitted": True,
        "request_id": request_id,
        "message": "Your exception has been submitted. The compliance team will review it shortly.",
    }
