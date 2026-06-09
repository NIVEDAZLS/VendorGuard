"""
Portfolio router — vendor KPI scorecard aggregation.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter

from backend.db.connection import DBConn

router = APIRouter()


def _s(v):
    if isinstance(v, datetime): return v.isoformat()
    if isinstance(v, Decimal): return float(v)
    return v


@router.get("/")
def get_portfolio():
    """
    Returns aggregated vendor compliance scorecard in a single query.
    """
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    start_of_year = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    with DBConn() as conn:
        cur = conn.cursor()

        # Per-vendor scorecard — separate subqueries avoid Cartesian product
        cur.execute(
            """
            SELECT
                v.id AS vendor_id,
                v.name AS vendor_name,
                v.industry,
                c.id AS contract_id,
                c.file_name AS contract_name,
                (SELECT COUNT(*) FROM operational_logs ol WHERE ol.vendor_id = v.id) AS total_events,
                (SELECT COUNT(*) FROM breaches b WHERE b.vendor_id = v.id AND b.breached_at >= %s) AS breaches_30d,
                COALESCE((SELECT SUM(b.penalty_amount) FROM breaches b WHERE b.vendor_id = v.id AND b.dispute_status IN ('open','pending_review','sent')), 0) AS penalties_owed,
                COALESCE((SELECT SUM(b.penalty_amount) FROM breaches b WHERE b.vendor_id = v.id AND b.dispute_status = 'paid'), 0) AS penalties_paid
            FROM vendors v
            LEFT JOIN contracts c ON c.vendor_id = v.id AND c.status = 'approved'
            WHERE c.id IS NOT NULL
               OR EXISTS (SELECT 1 FROM breaches b WHERE b.vendor_id = v.id)
            ORDER BY v.name
            """,
            (thirty_days_ago,),
        )
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]

        # MTD penalties identified
        cur.execute(
            """
            SELECT COALESCE(SUM(penalty_amount), 0) FROM breaches
            WHERE breached_at >= %s AND dispute_status IN ('open','pending_review','sent','paid')
            """,
            (thirty_days_ago,),
        )
        penalties_identified_mtd = float(cur.fetchone()[0])

        # YTD penalties recovered
        cur.execute(
            "SELECT COALESCE(SUM(penalty_amount), 0) FROM breaches WHERE breached_at >= %s AND dispute_status = 'paid'",
            (start_of_year,),
        )
        penalties_recovered_ytd = float(cur.fetchone()[0])

        # Active breaches (last 30d)
        cur.execute(
            "SELECT COUNT(*) FROM breaches WHERE breached_at >= %s AND dispute_status IN ('open','pending_review')",
            (thirty_days_ago,),
        )
        active_breaches = int(cur.fetchone()[0])

        # Pending disputes
        cur.execute("SELECT COUNT(*) FROM disputes WHERE status = 'sent' AND payment_status = 'unpaid'")
        pending_disputes = int(cur.fetchone()[0])

        # Contracts monitored
        cur.execute("SELECT COUNT(*) FROM contracts WHERE status = 'approved'")
        contracts_monitored = int(cur.fetchone()[0])

    # Compute compliance % per vendor
    scorecard = []
    for r in rows:
        total = r["total_events"] or 0
        breaches_30d = r["breaches_30d"] or 0
        compliance_pct = max(0.0, ((total - breaches_30d) / total) * 100) if total > 0 else 100.0

        if compliance_pct > 99:
            status = "Healthy"
        elif compliance_pct >= 90:
            status = "At Risk"
        else:
            status = "Critical"

        scorecard.append({
            **{k: _s(v) for k, v in r.items()},
            "compliance_pct": round(compliance_pct, 1),
            "status": status,
        })

    return {
        "kpis": {
            "penalties_identified_mtd": penalties_identified_mtd,
            "penalties_recovered_ytd": penalties_recovered_ytd,
            "active_breaches_30d": active_breaches,
            "pending_disputes": pending_disputes,
            "contracts_monitored": contracts_monitored,
        },
        "scorecard": scorecard,
    }
