"""
Cron/Task Scheduler script: generates and inserts operational logs for today
(or a configurable look-back window) into the VendorGuard DB.

Designed to run daily — e.g. via Windows Task Scheduler or a cron job.

For the three demo vendors (VND-EL-001, VND-CS-001, VND-FR-001) it uses the
hardcoded LOG_TYPES from operation_logs_genrator.py to preserve realistic
metadata (shipment IDs, SKUs, IoT sensor readings, etc.).

For any OTHER vendor added via the Contract Manager UI, it dynamically reads
that vendor's approved SLA rules from the DB and generates proportional logs.
New vendors automatically appear in the next midnight run without any script
changes.

Usage:
    # Insert today's logs
    python scripts/cron_generate_logs.py

    # Insert the last N days (useful on first run after a gap)
    python scripts/cron_generate_logs.py --days 7

    # Dry-run
    python scripts/cron_generate_logs.py --dry-run

Windows Task Scheduler setup:
    Action:  python "C:\\...\\VendorGuard\\scripts\\cron_generate_logs.py"
    Trigger: Daily, 00:05 AM
    Start in: C:\\...\\VendorGuard
"""

import argparse
import json
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, date
from pathlib import Path

import psycopg2
import psycopg2.extras
from psycopg2.extras import execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env.local")

from operation_logs_genrator import LOG_TYPES, spread_timestamps  # noqa: E402

# Vendor IDs that have hardcoded LOG_TYPES with rich metadata
DEMO_VENDOR_IDS = {lt["vendor_id"] for lt in LOG_TYPES}


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


# ── Demo vendor path (original LOG_TYPES) ─────────────────────────────────────

def build_rows_for_date(target: datetime) -> list[dict]:
    """Build rows for all demo vendors using hardcoded LOG_TYPES."""
    rng = random.Random(int(target.timestamp()))  # deterministic per day
    rows = []
    for lt in LOG_TYPES:
        timestamps = spread_timestamps(target, lt["logs_per_day"])
        for ts in timestamps:
            value = lt["value_fn"]()
            meta = lt["metadata_fn"]()

            if "counted_qty" in meta and callable(meta["counted_qty"]):
                sq = meta.get("system_qty", 100)
                meta["counted_qty"] = sq + rng.randint(-8, 2)

            unit = lt["unit"]
            if unit == "hours":
                duration_h = value
            elif unit == "minutes":
                duration_h = value / 60
            else:
                duration_h = round(rng.uniform(0.5, 4.0), 2)

            started_at = ts
            completed_at = started_at + timedelta(hours=duration_h)

            ext_id = None
            for key in ("shipment_id", "order_id", "ticket_id", "batch_id"):
                if key in meta:
                    ext_id = str(meta[key])
                    break
            if not ext_id:
                vals = list(meta.values())
                ext_id = str(vals[0]) if vals else ""

            rows.append({
                "id":           str(uuid.uuid4()),
                "vendor_id":    lt["vendor_id"],
                "event_type":   lt["operation"],
                "external_id":  ext_id,
                "started_at":   started_at,
                "completed_at": completed_at,
                "metadata":     json.dumps(meta),
            })
    return rows


# ── Dynamic vendor path (DB-driven for new vendors) ───────────────────────────

def _logs_per_day_from_threshold(threshold_hours: float) -> int:
    """Derive realistic event frequency from SLA window size."""
    if threshold_hours < 2:
        return 6
    elif threshold_hours < 8:
        return 4
    elif threshold_hours < 24:
        return 2
    else:
        return 1


def _event_type_from_metric(metric_name: str) -> str:
    """Convert SLA metric_name to a snake_case event_type."""
    et = metric_name.lower()
    for ch in (" ", "-", "/", "(", ")", "."):
        et = et.replace(ch, "_")
    # collapse multiple underscores
    while "__" in et:
        et = et.replace("__", "_")
    return et.strip("_")[:40]


def build_rows_for_vendor_from_db(
    vendor_id: str,
    rules: list[dict],
    target: datetime,
    rng: random.Random,
) -> list[dict]:
    """Generate log rows for a non-demo vendor using its approved SLA rules."""
    rows = []
    for rule in rules:
        threshold_hours = float(rule["threshold_hours"])
        if threshold_hours <= 0:
            continue

        logs_per_day = _logs_per_day_from_threshold(threshold_hours)
        timestamps = spread_timestamps(target, logs_per_day)
        event_type = _event_type_from_metric(rule["metric_name"])

        for ts in timestamps:
            # Realistic duration: normal distribution centred at 85% of threshold
            raw_duration = rng.gauss(threshold_hours * 0.85, threshold_hours * 0.15)
            duration_h = max(0.1, raw_duration)

            started_at = ts
            # 15% in-progress (completed_at = NULL), 85% completed
            if rng.random() < 0.15:
                completed_at = None
            else:
                completed_at = started_at + timedelta(hours=duration_h)

            ext_id = f"ORD-{rng.randint(10000, 99999)}"
            meta = {
                "rule_id":       rule["id"],
                "metric_name":   rule["metric_name"],
                "source_system": "VendorGuard",
            }

            rows.append({
                "id":           str(uuid.uuid4()),
                "vendor_id":    vendor_id,
                "event_type":   event_type,
                "external_id":  ext_id,
                "started_at":   started_at,
                "completed_at": completed_at,
                "metadata":     json.dumps(meta),
            })
    return rows


def fetch_dynamic_vendor_rules(conn, vendor_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch approved SLA rules (hours/minutes units) for non-demo vendors."""
    if not vendor_ids:
        return {}
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        placeholders = ",".join(["%s"] * len(vendor_ids))
        cur.execute(
            f"""
            SELECT id, vendor_id, metric_name, threshold_hours
            FROM sla_rules
            WHERE vendor_id IN ({placeholders})
              AND status IN ('approved', 'draft')
              AND threshold_hours IS NOT NULL
              AND threshold_unit IN ('hours', 'minutes', 'days_hours')
            ORDER BY vendor_id, metric_name
            """,
            vendor_ids,
        )
        rules_by_vendor: dict[str, list[dict]] = {}
        for r in cur.fetchall():
            rules_by_vendor.setdefault(r["vendor_id"], []).append(dict(r))
    return rules_by_vendor


# ── DB insert ─────────────────────────────────────────────────────────────────

def insert_rows(rows: list[dict], conn) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO operational_logs
                (id, vendor_id, event_type, external_id, started_at, completed_at, metadata)
            VALUES %s
            ON CONFLICT (id) DO NOTHING
            """,
            [
                (
                    r["id"], r["vendor_id"], r["event_type"], r["external_id"],
                    r["started_at"], r["completed_at"], r["metadata"],
                )
                for r in rows
            ],
            page_size=500,
        )
    conn.commit()
    return len(rows)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Daily cron: generate operational logs")
    parser.add_argument("--days",    type=int, default=1, help="Number of past days to generate (default: 1 = today)")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't insert")
    args = parser.parse_args()

    today = datetime.combine(date.today(), datetime.min.time())
    dates = [today - timedelta(days=i) for i in range(args.days - 1, -1, -1)]

    print(f"[cron_generate_logs] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Dates covered : {dates[0].date()} -> {dates[-1].date()}")

    # Fetch all vendors from DB to discover non-demo ones
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM vendors ORDER BY id")
        all_vendor_ids = [r[0] for r in cur.fetchall()]

    dynamic_vendor_ids = [v for v in all_vendor_ids if v not in DEMO_VENDOR_IDS]
    dynamic_rules_by_vendor = fetch_dynamic_vendor_rules(conn, dynamic_vendor_ids) if dynamic_vendor_ids else {}

    all_rows: list[dict] = []
    for d in dates:
        rng = random.Random(int(d.timestamp()))

        # Demo vendors: use rich LOG_TYPES metadata
        demo_rows = build_rows_for_date(d)
        all_rows.extend(demo_rows)

        # Dynamic vendors: DB-driven generation
        for vendor_id in dynamic_vendor_ids:
            rules = dynamic_rules_by_vendor.get(vendor_id, [])
            if not rules:
                continue
            dyn_rows = build_rows_for_vendor_from_db(vendor_id, rules, d, rng)
            all_rows.extend(dyn_rows)

    print(f"  Demo vendors  : {len(DEMO_VENDOR_IDS)} ({', '.join(sorted(DEMO_VENDOR_IDS))})")
    print(f"  Dynamic vendors: {len(dynamic_vendor_ids)}" + (f" ({', '.join(dynamic_vendor_ids)})" if dynamic_vendor_ids else " (none)"))
    print(f"  Rows generated: {len(all_rows):,}")

    if args.dry_run:
        print("  [dry-run] No rows inserted.")
        conn.close()
        return

    inserted = insert_rows(all_rows, conn)
    conn.close()
    print(f"  Inserted      : {inserted:,} rows")


if __name__ == "__main__":
    main()
