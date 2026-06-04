"""
Audit router.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query

from backend.db.connection import DBConn

router = APIRouter()


def _s(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return v


@router.get("/")
def list_audit(
    vendor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    days: int = Query(30),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    # Date range: prefer explicit date_from/date_to over days lookback
    if date_from:
        try:
            since = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        except ValueError:
            since = datetime.now(timezone.utc) - timedelta(days=days)
    else:
        since = datetime.now(timezone.utc) - timedelta(days=days)

    if date_to:
        try:
            until = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            # include full day
            until = until.replace(hour=23, minute=59, second=59)
        except ValueError:
            until = None
    else:
        until = None

    with DBConn() as conn:
        cur = conn.cursor()
        query = """
            SELECT al.id, al.vendor_id, al.breach_id, al.status,
                   al.confidence, al.reasoning, al.created_at,
                   v.name AS vendor_name,
                   b.delay_hours, b.penalty_amount,
                   sr.metric_name, sr.contract_section
            FROM audit_log al
            LEFT JOIN vendors v ON v.id = al.vendor_id
            LEFT JOIN breaches b ON b.id = al.breach_id
            LEFT JOIN sla_rules sr ON sr.id = b.rule_id
            WHERE al.created_at >= %s
        """
        params: list = [since]

        if until:
            query += " AND al.created_at <= %s"
            params.append(until)
        if vendor_id:
            query += " AND al.vendor_id = %s"
            params.append(vendor_id)
        if status_filter:
            query += " AND al.status = %s"
            params.append(status_filter)

        query += " ORDER BY al.created_at DESC"
        cur.execute(query, params)
        cols = [d[0] for d in cur.description]
        rows = [{k: _s(v) for k, v in dict(zip(cols, r)).items()} for r in cur.fetchall()]

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
