"""
Audit router.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query

from backend.db.connection import DBConn

router = APIRouter()


@router.get("/")
def list_audit(
    vendor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    days: int = Query(30),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    with DBConn() as conn:
        cur = conn.cursor()
        query = """
            SELECT al.*, v.name AS vendor_name,
                   b.delay_hours, b.penalty_amount,
                   sr.metric_name, sr.contract_section
            FROM audit_log al
            LEFT JOIN vendors v ON v.id = al.vendor_id
            LEFT JOIN breaches b ON b.id = al.breach_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE al.created_at >= %s
        """
        params: list = [since]

        if vendor_id:
            query += " AND al.vendor_id = %s"
            params.append(vendor_id)
        if status_filter:
            query += " AND al.status = %s"
            params.append(status_filter)

        query += " ORDER BY al.created_at DESC"
        cur.execute(query, params)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    # Stats
    confirmed = sum(1 for r in rows if r["status"] == "confirmed")
    false_alarms = sum(1 for r in rows if r["status"] == "false_alarm")

    return {
        "stats": {
            "total": len(rows),
            "confirmed_breaches": confirmed,
            "false_alarms": false_alarms,
        },
        "entries": rows,
    }
