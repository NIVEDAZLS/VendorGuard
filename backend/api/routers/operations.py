"""
Operations router — query operational_logs table.
"""
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Query
from backend.db.connection import DBConn

router = APIRouter()


@router.get("/")
def list_operations(
    vendor_id: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    with DBConn() as conn:
        cur = conn.cursor()
        where = "WHERE ol.vendor_id = %s" if vendor_id else ""
        params: list = [vendor_id] if vendor_id else []
        params += [limit, offset]

        cur.execute(f"""
            SELECT
                ol.id,
                ol.vendor_id,
                v.name AS vendor_name,
                ol.event_type,
                ol.external_id,
                ol.started_at,
                ol.completed_at,
                ol.metadata,
                CASE
                    WHEN ol.completed_at IS NULL THEN 'in_progress'
                    ELSE 'completed'
                END AS status,
                CASE
                    WHEN ol.completed_at IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (ol.completed_at - ol.started_at)) / 3600.0
                    ELSE NULL
                END AS duration_hours
            FROM operational_logs ol
            LEFT JOIN vendors v ON v.id = ol.vendor_id
            {where}
            ORDER BY ol.started_at DESC
            LIMIT %s OFFSET %s
        """, params)

        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for key, val in d.items():
                if isinstance(val, datetime):
                    d[key] = val.isoformat()
                elif isinstance(val, Decimal):
                    d[key] = round(float(val), 2)
            rows.append(d)

    return rows


@router.get("/summary")
def operations_summary():
    """Per-vendor counts: total, in_progress, completed, breach_rate."""
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                ol.vendor_id,
                v.name AS vendor_name,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ol.completed_at IS NULL) AS in_progress,
                COUNT(*) FILTER (WHERE ol.completed_at IS NOT NULL) AS completed,
                MIN(ol.started_at) AS earliest,
                MAX(ol.started_at) AS latest
            FROM operational_logs ol
            LEFT JOIN vendors v ON v.id = ol.vendor_id
            GROUP BY ol.vendor_id, v.name
            ORDER BY total DESC
        """)
        cols = [d[0] for d in cur.description]
        rows = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            for key, val in d.items():
                if isinstance(val, datetime):
                    d[key] = val.isoformat()
                elif isinstance(val, Decimal):
                    d[key] = float(val)
            rows.append(d)
    return rows
