"""
One-shot seeder: generates dummy operational logs and inserts them into the DB.

Reads from operation_logs_genrator.py (the generator), maps to the
operational_logs table schema, and upserts using ON CONFLICT DO NOTHING.

Usage:
    python scripts/seed_operational_logs.py

    # Dry-run (print stats, no DB writes):
    python scripts/seed_operational_logs.py --dry-run

    # Custom date range:
    python scripts/seed_operational_logs.py --start 2026-06-01 --end 2026-06-30
"""

import argparse
import json
import os
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# ── path setup ───────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env.local")

# Import the generator definitions (LOG_TYPES, spread_timestamps, etc.)
from operation_logs_genrator import LOG_TYPES, spread_timestamps  # noqa: E402


# ── DB connection ─────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


# ── row builder ───────────────────────────────────────────────────────────────
def build_rows(start: datetime, end: datetime) -> list[dict]:
    """Generate all operational log rows for the given date range."""
    rows = []
    current = start
    rng = random.Random(42)

    while current <= end:
        for lt in LOG_TYPES:
            timestamps = spread_timestamps(current, lt["logs_per_day"])
            for ts in timestamps:
                value = lt["value_fn"]()
                meta = lt["metadata_fn"]()

                # resolve nested lambdas (cycle_count counted_qty)
                if "counted_qty" in meta and callable(meta["counted_qty"]):
                    sq = meta.get("system_qty", 100)
                    meta["counted_qty"] = sq + rng.randint(-8, 2)

                # duration = actual_value interpreted as hours (where unit=hours),
                # otherwise pick a realistic random duration
                unit = lt["unit"]
                if unit == "hours":
                    duration_h = value
                elif unit == "minutes":
                    duration_h = value / 60
                else:
                    duration_h = round(rng.uniform(0.5, 4.0), 2)

                started_at = ts
                completed_at = started_at + timedelta(hours=duration_h)

                # extract a human-readable external reference from metadata
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

        current += timedelta(days=1)

    return rows


# ── insert ────────────────────────────────────────────────────────────────────
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
                    r["id"],
                    r["vendor_id"],
                    r["event_type"],
                    r["external_id"],
                    r["started_at"],
                    r["completed_at"],
                    r["metadata"],
                )
                for r in rows
            ],
            page_size=500,
        )
    conn.commit()
    return len(rows)


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Seed operational logs into VendorGuard DB")
    parser.add_argument("--start", default="2026-06-01", help="Start date YYYY-MM-DD")
    parser.add_argument("--end",   default="2026-07-31", help="End date YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="Generate rows but don't insert")
    args = parser.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d")
    end   = datetime.strptime(args.end,   "%Y-%m-%d")

    print(f"Generating logs from {start.date()} to {end.date()} ...")
    rows = build_rows(start, end)

    by_vendor: dict[str, int] = {}
    by_op: dict[str, int] = {}
    for r in rows:
        by_vendor[r["vendor_id"]] = by_vendor.get(r["vendor_id"], 0) + 1
        by_op[r["event_type"]] = by_op.get(r["event_type"], 0) + 1

    print(f"\n  Total rows : {len(rows):,}")
    print(f"  Date range : {start.date()} -> {end.date()}")
    print(f"\n  By vendor:")
    for vid, n in by_vendor.items():
        print(f"    {vid:<15} {n:>5} rows")
    print(f"\n  By event type ({len(by_op)} types):")
    for op, n in sorted(by_op.items(), key=lambda x: -x[1]):
        print(f"    {op:<45} {n:>4}")

    if args.dry_run:
        print("\n  [dry-run] No rows inserted.")
        return

    print("\nConnecting to DB ...")
    conn = get_conn()
    inserted = insert_rows(rows, conn)
    conn.close()
    print(f"  Inserted {inserted:,} rows. Done.")


if __name__ == "__main__":
    main()
