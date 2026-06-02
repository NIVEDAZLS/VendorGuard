"""
Cron/Task Scheduler script: generates and inserts operational logs for today
(or a configurable look-back window) into the VendorGuard DB.

Designed to run daily — e.g. via Windows Task Scheduler or a cron job.

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
from psycopg2.extras import execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env.local")

from operation_logs_genrator import LOG_TYPES, spread_timestamps  # noqa: E402


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def build_rows_for_date(target: datetime) -> list[dict]:
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


def main():
    parser = argparse.ArgumentParser(description="Daily cron: generate operational logs")
    parser.add_argument("--days",    type=int, default=1, help="Number of past days to generate (default: 1 = today)")
    parser.add_argument("--dry-run", action="store_true", help="Generate but don't insert")
    args = parser.parse_args()

    today = datetime.combine(date.today(), datetime.min.time())
    dates = [today - timedelta(days=i) for i in range(args.days - 1, -1, -1)]

    all_rows: list[dict] = []
    for d in dates:
        all_rows.extend(build_rows_for_date(d))

    print(f"[cron_generate_logs] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Dates covered : {dates[0].date()} -> {dates[-1].date()}")
    print(f"  Rows generated: {len(all_rows):,}")

    if args.dry_run:
        print("  [dry-run] No rows inserted.")
        return

    conn = get_conn()
    inserted = insert_rows(all_rows, conn)
    conn.close()
    print(f"  Inserted      : {inserted:,} rows")


if __name__ == "__main__":
    main()
