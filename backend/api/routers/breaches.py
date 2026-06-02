"""
Breaches router.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.db.connection import DBConn

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
