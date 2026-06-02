"""
Seed operational_logs table from the operation_logs_genrator.py logic.

Aligns the generator's CSV columns to the DB schema:
  event_time   → started_at
  operation    → event_type
  external_id  → extracted from metadata (shipment_id / order_id / first key)
  actual_value, actual_unit, sla_id, source, contract_id → stored inside metadata jsonb

~15% of rows have completed_at = NULL (in-progress, 80-85% of SLA window elapsed).

Usage:
    python scripts/seed_logs.py
    python scripts/seed_logs.py --reset    # truncate first
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
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

# Import generator reference data
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from operation_logs_genrator import LOG_TYPES, START_DATE, END_DATE, spread_timestamps

random.seed(42)

SLA_THRESHOLDS = {
    # (vendor_id, operation): threshold_hours
    ("VND-EL-001", "goods_receipt"):               4.0,
    ("VND-EL-001", "gr_accuracy_scan"):             4.0,
    ("VND-EL-001", "order_fulfillment"):            8.0,
    ("VND-EL-001", "cycle_count"):                 120.0,  # 5 days
    ("VND-EL-001", "wms_uptime_snapshot"):          1.0,
    ("VND-EL-001", "warehouse_temperature_reading"): 1.0,
    ("VND-EL-001", "warehouse_humidity_reading"):    1.0,
    ("VND-EL-001", "shift_headcount_report"):        1.0,
    ("VND-CS-001", "hot_lot_goods_receipt"):          2.0,
    ("VND-CS-001", "standard_goods_receipt"):         8.0,
    ("VND-CS-001", "damage_discrepancy_notification"): 24.0,
    ("VND-CS-001", "cycle_count"):                   168.0,  # 1 week
    ("VND-CS-001", "outbound_pull_to_ship"):           4.0,
    ("VND-CS-001", "csc_acknowledgement"):             2.0,
    ("VND-FR-001", "order_to_delivery"):              24.0,
    ("VND-FR-001", "goods_receipt_dc"):                4.0,
    ("VND-FR-001", "store_fill_rate_snapshot"):        1.0,
    ("VND-FR-001", "transit_damage_scan"):             1.0,
    ("VND-FR-001", "cold_chain_temperature_reading"):  1.0,
    ("VND-FR-001", "shelf_life_check"):                1.0,
    ("VND-FR-001", "oos_incident_report"):             1.0,
}

IN_PROGRESS_PER_VENDOR = 5
BREACH_RATIO = 0.15  # ~15% of completed rows exceed threshold


def _get_external_id(meta: dict) -> str:
    for key in ("shipment_id", "order_id", "ticket_id", "batch_id", "hub", "location"):
        if key in meta:
            return str(meta[key])
    vals = list(meta.values())
    return str(vals[0]) if vals else str(uuid.uuid4())[:8]


def generate_rows() -> list[dict]:
    rows = []
    current = START_DATE

    while current <= END_DATE:
        for lt in LOG_TYPES:
            timestamps = spread_timestamps(current, lt["logs_per_day"])
            threshold = SLA_THRESHOLDS.get((lt["vendor_id"], lt["operation"]), 8.0)

            for ts in timestamps:
                value = lt["value_fn"]()
                meta = lt["metadata_fn"]()

                if "counted_qty" in meta and callable(meta["counted_qty"]):
                    sq = meta.get("system_qty", 100)
                    meta["counted_qty"] = sq + random.randint(-8, 2)

                ext_id = _get_external_id(meta)

                # ~15% of rows: force actual_value > threshold so breach is detectable
                if lt["unit"] == "hours" and random.random() < BREACH_RATIO:
                    value = round(threshold * random.uniform(1.1, 1.8), 2)

                # completed_at = started_at + actual_value hours (for time-based)
                if lt["unit"] == "hours":
                    completed_at = ts + timedelta(hours=float(value))
                else:
                    completed_at = ts + timedelta(hours=1)

                meta_stored = {
                    "actual_value": value,
                    "actual_unit": lt["unit"],
                    "sla_id": lt["sla_id"],
                    "contract_id": lt["contract_id"],
                    "source": lt["source"],
                    **meta,
                }

                rows.append({
                    "id": str(uuid.uuid4()),
                    "vendor_id": lt["vendor_id"],
                    "event_type": lt["operation"],
                    "external_id": ext_id,
                    "started_at": ts,
                    "completed_at": completed_at,
                    "metadata": json.dumps(meta_stored, default=str),
                })

        current += timedelta(days=1)

    return rows


def add_in_progress_rows(rows: list[dict]) -> list[dict]:
    """Add 5 NULL-completed rows per vendor with 80-85% of SLA window elapsed."""
    now = datetime.now()
    vendors = ["VND-EL-001", "VND-CS-001", "VND-FR-001"]

    for vid in vendors:
        vendor_ops = [lt for lt in LOG_TYPES if lt["vendor_id"] == vid][:IN_PROGRESS_PER_VENDOR]
        for lt in vendor_ops:
            threshold = SLA_THRESHOLDS.get((vid, lt["operation"]), 8.0)
            elapsed_ratio = random.uniform(0.80, 0.85)
            elapsed_hours = threshold * elapsed_ratio
            started_at = now - timedelta(hours=elapsed_hours)

            meta = lt["metadata_fn"]()
            if "counted_qty" in meta and callable(meta["counted_qty"]):
                sq = meta.get("system_qty", 100)
                meta["counted_qty"] = sq + random.randint(-8, 2)

            meta_stored = {
                "actual_unit": lt["unit"],
                "sla_id": lt["sla_id"],
                "contract_id": lt["contract_id"],
                "source": lt["source"],
                **meta,
            }

            rows.append({
                "id": str(uuid.uuid4()),
                "vendor_id": vid,
                "event_type": lt["operation"],
                "external_id": _get_external_id(meta),
                "started_at": started_at,
                "completed_at": None,
                "metadata": json.dumps(meta_stored, default=str),
            })

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Truncate operational_logs before seeding")
    args = parser.parse_args()

    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )

    try:
        with conn.cursor() as cur:
            if args.reset:
                print("Truncating operational_logs...")
                cur.execute("TRUNCATE TABLE operational_logs CASCADE")
                conn.commit()

            print("Generating rows...")
            rows = generate_rows()
            rows = add_in_progress_rows(rows)

            total = len(rows)
            print(f"Total rows to insert: {total:,}")

            BATCH = 1000
            for i in range(0, total, BATCH):
                batch = rows[i : i + BATCH]
                psycopg2.extras.execute_batch(
                    cur,
                    """
                    INSERT INTO operational_logs (id, vendor_id, event_type, external_id, started_at, completed_at, metadata)
                    VALUES (%(id)s, %(vendor_id)s, %(event_type)s, %(external_id)s, %(started_at)s, %(completed_at)s, %(metadata)s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    batch,
                    page_size=500,
                )
                conn.commit()
                if (i + BATCH) % 5000 == 0 or i + BATCH >= total:
                    pct = min(100, ((i + BATCH) / total) * 100)
                    print(f"  Progress: {min(i+BATCH, total):,} / {total:,} rows ({pct:.0f}%)")

        print(f"\n✓ Seeded {total:,} operational log rows ({IN_PROGRESS_PER_VENDOR * 3} in-progress).")
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
