"""
VendorGuard — Raw Operational Log Generator
Simulates raw transaction dumps from source systems (WMS, IoT, NetSuite etc.)
into the operational_logs table format.

No breach detection. No status calculation. Just raw logs.
Those are handled by VendorGuard's tooling downstream.

Contracts:
  c-elogix-001     → eLogix 3PL SLA
  c-cisco-001      → Cisco WSA Hub SLA
  c-freshroute-001 → FreshRoute Retail SLA
"""

import csv
import uuid
import random
import json
from datetime import datetime, timedelta

OUTPUT_FILE = "operational_logs.csv"
START_DATE  = datetime(2026, 7, 1)
END_DATE    = datetime(2026, 7, 31)
random.seed(42)

# ──────────────────────────────────────────────────────────────
# REFERENCE DATA  (realistic IDs that would exist in real systems)
# ──────────────────────────────────────────────────────────────

SKUS_ELOGIX  = ["EL-4421", "EL-3302", "EL-5509", "EL-8871", "EL-2203", "EL-7714"]
SKUS_CISCO   = ["CSC-A14", "CSC-B22", "CSC-C07", "CSC-D91", "CSC-E55"]
SKUS_FRESH   = ["FR-MILK-001", "FR-YGT-003", "FR-CHZ-007", "FR-BTR-002", "FR-CRM-011"]
STORES       = ["STR-BLR-01", "STR-MUM-04", "STR-DEL-12", "STR-HYD-03", "STR-CHN-07"]
VEHICLES     = ["VH-TN-3321", "VH-KA-1102", "VH-MH-5543", "VH-AP-2214"]
CISCO_HUBS   = ["HUB-SHZ-01", "HUB-BJS-02"]
ELOGIX_ZONES = ["Zone-A", "Zone-B", "Zone-C"]
WH_SENSORS   = [f"SNS-{i:02d}" for i in range(1, 9)]


def shipment_id():  return f"SHP-{random.randint(10000, 99999)}"
def order_id():     return f"ORD-{random.randint(10000, 99999)}"
def pallet_id():    return f"PLT-{random.randint(1000, 9999)}"
def ticket_id():    return f"TKT-{random.randint(10000, 99999)}"
def batch_id():     return f"BCH-{random.randint(1000, 9999)}"


# ──────────────────────────────────────────────────────────────
# LOG DEFINITIONS
# Each entry = one type of log event that a source system emits.
#
# Fields:
#   contract_id   → which contract this vendor belongs to
#   sla_id        → which SLA metric this log feeds into
#   vendor_id     → vendor's system ID
#   vendor_name   → human readable
#   operation     → what the source system recorded
#   unit          → unit of actual_value
#   value_fn      → lambda that returns a realistic raw value (no breach logic)
#   metadata_fn   → lambda that returns realistic metadata dict
#   source        → which source system emitted this log
#   logs_per_day  → how many times per day this event fires
# ──────────────────────────────────────────────────────────────

LOG_TYPES = [

    # ═══════════════════════════════════════════════
    # eLOGIX  —  source systems: NetSuite, WMS, IoT
    # ═══════════════════════════════════════════════

    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-001",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "goods_receipt",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(1.5, 7.5), 2),
        "metadata_fn":  lambda: {
            "shipment_id": shipment_id(),
            "sku":         random.choice(SKUS_ELOGIX),
            "pallets":     random.randint(2, 18),
            "po_number":   f"PO-{random.randint(50000,59999)}",
        },
        "source":       "NetSuite",
        "logs_per_day": 4,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-002",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "gr_accuracy_scan",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(97.8, 100.0), 2),
        "metadata_fn":  lambda: {
            "shipment_id":  shipment_id(),
            "sku":          random.choice(SKUS_ELOGIX),
            "units_scanned": random.randint(50, 500),
            "discrepancies": random.randint(0, 6),
        },
        "source":       "NetSuite",
        "logs_per_day": 4,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-003",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "order_fulfillment",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(3.0, 12.0), 2),
        "metadata_fn":  lambda: {
            "order_id":    order_id(),
            "sku":         random.choice(SKUS_ELOGIX),
            "order_value": round(random.uniform(5000, 80000), 2),
            "units":       random.randint(10, 200),
        },
        "source":       "D365/WMS",
        "logs_per_day": 6,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-006",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "cycle_count",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(97.5, 100.0), 2),
        "metadata_fn":  lambda: {
            "location":      f"BIN-{random.randint(1, 99):02d}",
            "sku":           random.choice(SKUS_ELOGIX),
            "system_qty":    random.randint(100, 500),
            "counted_qty":   lambda sq: sq + random.randint(-8, 2),
            "staff_id":      f"STF-{random.randint(100, 199)}",
        },
        "source":       "Oracle WMS",
        "logs_per_day": 1,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-008",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "wms_uptime_snapshot",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(97.0, 100.0), 2),
        "metadata_fn":  lambda: {
            "system":          "Oracle WMS",
            "downtime_minutes": random.randint(0, 45),
            "incidents":        random.randint(0, 2),
            "monitor":          "Datadog",
        },
        "source":       "Datadog",
        "logs_per_day": 1,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-009",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "warehouse_temperature_reading",
        "unit":         "celsius",
        "value_fn":     lambda: round(random.uniform(15.0, 28.0), 1),
        "metadata_fn":  lambda: {
            "sensor_id": random.choice(WH_SENSORS),
            "zone":      random.choice(ELOGIX_ZONES),
        },
        "source":       "IoT Sensor",
        "logs_per_day": 6,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-010",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "warehouse_humidity_reading",
        "unit":         "percent_rh",
        "value_fn":     lambda: round(random.uniform(30.0, 52.0), 1),
        "metadata_fn":  lambda: {
            "sensor_id": random.choice(WH_SENSORS),
            "zone":      random.choice(ELOGIX_ZONES),
        },
        "source":       "IoT Sensor",
        "logs_per_day": 6,
    },
    {
        "contract_id":  "c-elogix-001",
        "sla_id":       "sla-el-011",
        "vendor_id":    "VND-EL-001",
        "vendor_name":  "eLogix Logistics Pvt. Ltd.",
        "operation":    "shift_headcount_report",
        "unit":         "persons",
        "value_fn":     lambda: random.randint(14, 23),
        "metadata_fn":  lambda: {
            "shift":      random.choice(["morning", "evening"]),
            "department": random.choice(["inbound", "outbound", "inventory"]),
            "supervisor": f"SUP-{random.randint(10, 30)}",
        },
        "source":       "Kronos WFM",
        "logs_per_day": 2,
    },

    # ═══════════════════════════════════════════════
    # CISCO WSA  —  source systems: WMS, ServiceNow
    # ═══════════════════════════════════════════════

    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-001",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "hot_lot_goods_receipt",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(0.5, 3.5), 2),
        "metadata_fn":  lambda: {
            "shipment_id": shipment_id(),
            "sku":         random.choice(SKUS_CISCO),
            "hub":         random.choice(CISCO_HUBS),
            "priority":    "hot_lot",
            "asn_ref":     f"ASN-{random.randint(10000,99999)}",
        },
        "source":       "WMS",
        "logs_per_day": 3,
    },
    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-002",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "standard_goods_receipt",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(2.0, 11.0), 2),
        "metadata_fn":  lambda: {
            "shipment_id": shipment_id(),
            "sku":         random.choice(SKUS_CISCO),
            "hub":         random.choice(CISCO_HUBS),
            "priority":    "standard",
            "asn_ref":     f"ASN-{random.randint(10000,99999)}",
        },
        "source":       "WMS",
        "logs_per_day": 5,
    },
    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-003",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "damage_discrepancy_notification",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(1.0, 30.0), 2),
        "metadata_fn":  lambda: {
            "shipment_id":  shipment_id(),
            "sku":          random.choice(SKUS_CISCO),
            "hub":          random.choice(CISCO_HUBS),
            "incident_ref": f"INC-{random.randint(1000, 9999)}",
            "damage_type":  random.choice(["crushed_box", "missing_units", "wet_damage"]),
        },
        "source":       "ServiceNow",
        "logs_per_day": 2,
    },
    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-006",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "cycle_count",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(98.5, 100.0), 2),
        "metadata_fn":  lambda: {
            "hub":           random.choice(CISCO_HUBS),
            "sku":           random.choice(SKUS_CISCO),
            "high_security": random.choice([True, False]),
            "system_qty":    random.randint(50, 300),
            "counted_qty":   random.randint(48, 300),
        },
        "source":       "WMS",
        "logs_per_day": 1,
    },
    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-007",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "outbound_pull_to_ship",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(1.0, 6.0), 2),
        "metadata_fn":  lambda: {
            "order_id":    order_id(),
            "sku":         random.choice(SKUS_CISCO),
            "hub":         random.choice(CISCO_HUBS),
            "ems_provider": random.choice(["Foxconn", "Flextronics", "Jabil"]),
            "pallet_id":   pallet_id(),
        },
        "source":       "WMS",
        "logs_per_day": 6,
    },
    {
        "contract_id":  "c-cisco-001",
        "sla_id":       "sla-cs-008",
        "vendor_id":    "VND-CS-001",
        "vendor_name":  "Cisco Hub Operator",
        "operation":    "csc_acknowledgement",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(0.1, 2.5), 2),
        "metadata_fn":  lambda: {
            "ticket_id":  ticket_id(),
            "issue_type": random.choice(["missing_label", "qty_mismatch", "damaged_box", "late_asn"]),
            "raised_by":  random.choice(["Foxconn", "Flextronics", "Cisco_Ops"]),
        },
        "source":       "ServiceNow",
        "logs_per_day": 4,
    },

    # ═══════════════════════════════════════════════════════════
    # FRESHROUTE  —  source systems: TMS, IoT, WMS, ERP
    # ═══════════════════════════════════════════════════════════

    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-001",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "order_to_delivery",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(10.0, 32.0), 2),
        "metadata_fn":  lambda: {
            "order_id":   order_id(),
            "store_id":   random.choice(STORES),
            "vehicle_id": random.choice(VEHICLES),
            "sku":        random.choice(SKUS_FRESH),
        },
        "source":       "TMS",
        "logs_per_day": 8,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-002",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "goods_receipt_dc",
        "unit":         "hours",
        "value_fn":     lambda: round(random.uniform(1.0, 7.0), 2),
        "metadata_fn":  lambda: {
            "shipment_id": shipment_id(),
            "sku":         random.choice(SKUS_FRESH),
            "pallets":     random.randint(5, 40),
            "dc_location": "DC-BLR-01",
        },
        "source":       "WMS",
        "logs_per_day": 5,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-003",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "store_fill_rate_snapshot",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(94.0, 100.0), 2),
        "metadata_fn":  lambda: {
            "store_id":       random.choice(STORES),
            "skus_ordered":   random.randint(40, 100),
            "skus_delivered": random.randint(38, 100),
        },
        "source":       "ERP",
        "logs_per_day": 4,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-005",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "transit_damage_scan",
        "unit":         "percent",
        "value_fn":     lambda: round(random.uniform(0.0, 1.2), 3),
        "metadata_fn":  lambda: {
            "shipment_id":   shipment_id(),
            "vehicle_id":    random.choice(VEHICLES),
            "pallets_total": random.randint(10, 50),
            "pallets_damaged": random.randint(0, 3),
        },
        "source":       "WMS",
        "logs_per_day": 5,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-008",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "cold_chain_temperature_reading",
        "unit":         "celsius",
        "value_fn":     lambda: round(random.uniform(0.5, 12.0), 1),
        "metadata_fn":  lambda: {
            "vehicle_id": random.choice(VEHICLES),
            "sensor_id":  f"VH-SNS-{random.randint(1,6):02d}",
            "route_id":   f"RT-{random.randint(1,15):02d}",
        },
        "source":       "IoT Sensor",
        "logs_per_day": 8,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-009",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "shelf_life_check",
        "unit":         "days",
        "value_fn":     lambda: random.randint(28, 65),
        "metadata_fn":  lambda: {
            "store_id":  random.choice(STORES),
            "sku":       random.choice(SKUS_FRESH),
            "batch_id":  batch_id(),
            "mfg_date":  (datetime(2026, 6, 1) + timedelta(days=random.randint(0, 30))).strftime("%Y-%m-%d"),
        },
        "source":       "WMS",
        "logs_per_day": 3,
    },
    {
        "contract_id":  "c-freshroute-001",
        "sla_id":       "sla-fr-011",
        "vendor_id":    "VND-FR-001",
        "vendor_name":  "FreshRoute Logistics",
        "operation":    "oos_incident_report",
        "unit":         "incidents",
        "value_fn":     lambda: random.randint(0, 4),
        "metadata_fn":  lambda: {
            "store_id":  random.choice(STORES),
            "sku":       random.choice(SKUS_FRESH),
            "category":  random.choice(["dairy", "frozen", "fresh_produce"]),
        },
        "source":       "ERP",
        "logs_per_day": 4,
    },
]


# ──────────────────────────────────────────────────────────────
# TIMESTAMP HELPERS
# ──────────────────────────────────────────────────────────────

def spread_timestamps(date, count):
    """Spread `count` events across 6am–11pm with jitter."""
    step = 17.0 / count   # 17 operating hours
    times = []
    for i in range(count):
        h = 6.0 + step * i + random.uniform(-0.3, 0.3)
        h = max(6.0, min(22.9, h))
        dt = date.replace(
            hour=int(h),
            minute=int((h % 1) * 60),
            second=random.randint(0, 59),
            microsecond=0,
        )
        times.append(dt)
    return times


# ──────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────

COLUMNS = [
    "id", "contract_id", "sla_id", "vendor_id", "vendor_name",
    "event_time", "event_type",   # event_type = operation (DB column alias)
    "operation", "external_id",   # external_id extracted from metadata
    "actual_value", "actual_unit",
    "status", "metadata", "source", "ingested_at",
]


def _extract_external_id(meta: dict) -> str:
    """Extract a meaningful external reference ID from metadata."""
    for key in ("shipment_id", "order_id", "ticket_id", "batch_id"):
        if key in meta:
            return str(meta[key])
    vals = list(meta.values())
    return str(vals[0]) if vals else ""


def generate():
    rows = []
    current = START_DATE

    while current <= END_DATE:
        for lt in LOG_TYPES:
            timestamps = spread_timestamps(current, lt["logs_per_day"])
            for ts in timestamps:
                value = lt["value_fn"]()
                meta  = lt["metadata_fn"]()

                # cycle_count metadata has a nested lambda — resolve it
                if "counted_qty" in meta and callable(meta["counted_qty"]):
                    sq = meta.get("system_qty", 100)
                    meta["counted_qty"] = sq + random.randint(-8, 2)

                ext_id = _extract_external_id(meta)

                rows.append({
                    "id":           str(uuid.uuid4()),
                    "contract_id":  lt["contract_id"],
                    "sla_id":       lt["sla_id"],
                    "vendor_id":    lt["vendor_id"],
                    "vendor_name":  lt["vendor_name"],
                    "event_time":   ts.strftime("%Y-%m-%d %H:%M:%S"),
                    "event_type":   lt["operation"],  # DB alias for operation
                    "operation":    lt["operation"],
                    "external_id":  ext_id,
                    "actual_value": value,
                    "actual_unit":  lt["unit"],
                    "status":       "",          # filled by VendorGuard
                    "metadata":     json.dumps(meta),
                    "source":       lt["source"],
                    "ingested_at":  (ts + timedelta(seconds=random.randint(10, 120)))
                                    .strftime("%Y-%m-%d %H:%M:%S"),
                })

        current += timedelta(days=1)

    return rows


def main():
    print("Generating raw operational logs...")
    rows = generate()

    # — Stats —
    total = len(rows)
    by_vendor = {}
    by_op     = {}
    for r in rows:
        by_vendor.setdefault(r["vendor_name"], 0)
        by_vendor[r["vendor_name"]] += 1
        by_op.setdefault(r["operation"], 0)
        by_op[r["operation"]] += 1

    print(f"\n{'─'*55}")
    print(f"  Total rows     : {total:,}")
    print(f"  Date range     : {START_DATE.date()} → {END_DATE.date()}")
    print(f"  status column  : intentionally blank (set by VendorGuard)")
    print(f"{'─'*55}")
    for v, n in by_vendor.items():
        print(f"  {v:<35} {n:>5} rows")
    print(f"{'─'*55}")
    print(f"\n  Operations logged ({len(by_op)} types):")
    for op, n in sorted(by_op.items(), key=lambda x: -x[1]):
        print(f"    {op:<45} {n:>4}")
    print()

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Output → {OUTPUT_FILE}\n")


if __name__ == "__main__":
    main()