"""
Breach Detection Job — Python-first, LLM as escalation only.

Flow per log:
  1. Match log event_type → SLA rule (Python)
  2. Compute actual duration and delay (Python)
  3. Apply exception / holiday check (Python)
  4. If clear breach (delay > threshold × grace): INSERT breach directly, no LLM
  5. If ambiguous (delay within grace zone or exception filed): call Agent 2 (Bedrock)
  6. If within SLA: skip

Grace zone = 10% of threshold (e.g. 4h SLA → ambiguous if delay 0–0.4h, clear breach if > 0.4h)

Run manually:
    python backend/jobs/breach_detection.py
    python backend/jobs/breach_detection.py --hours 720 --limit 2000

Cron (hourly): 0 * * * * python /path/to/backend/jobs/breach_detection.py
"""

import argparse
import json
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
import sys
import os

import psycopg2.extras

from backend.db.connection import DBConn
from backend.utils.calendar import is_holiday

LOCK_FILE = Path("/tmp/breach_detection.lock")
DEFAULT_LOOKBACK_HOURS = 24 * 60  # 60 days — covers all seeded data on first run
GRACE_FACTOR = 0.10               # 10% grace zone → escalate to LLM

# Maps operational_logs.event_type → keywords to match sla_rules.metric_name
EVENT_TYPE_MAP: dict[str, list[str]] = {
    # eLogix
    "goods_receipt":                   ["goods receipt", "gr"],
    "gr_accuracy_scan":                ["accuracy", "gr accuracy"],
    "order_fulfillment":               ["order fulfillment", "fulfillment"],
    "cycle_count":                     ["cycle count", "inventory"],
    "wms_uptime_snapshot":             ["uptime", "wms"],
    "warehouse_temperature_reading":   ["temperature", "cold chain"],
    "warehouse_humidity_reading":      ["humidity"],
    "shift_headcount_report":          ["headcount", "staffing"],
    # Cisco
    "hot_lot_goods_receipt":           ["goods receipt", "hot lot"],
    "standard_goods_receipt":          ["goods receipt", "standard"],
    "damage_discrepancy_notification": ["damage", "discrepancy"],
    "outbound_pull_to_ship":           ["outbound", "pull to ship"],
    "csc_acknowledgement":             ["acknowledgement", "response"],
    # FreshRoute
    "order_to_delivery":               ["order-to-delivery", "order to delivery", "delivery cycle"],
    "order_to_delivery_cycle":         ["order-to-delivery", "order to delivery", "delivery cycle"],
    "goods_receipt_dc":                ["goods receipt", "dc", "distribution"],
    "goods_receipt_to_dc":             ["goods receipt", "dc", "distribution"],
    "store_fill_rate_snapshot":        ["fill rate", "service level", "sla compliance"],
    "store_fill_rate":                 ["fill rate", "store fill", "sla compliance"],
    "transit_damage_scan":             ["damage in transit", "transit damage", "damage"],
    "damage_in_transit_rate":          ["damage in transit", "transit damage", "damage"],
    "cold_chain_temperature_reading":  ["temperature", "cold chain"],
    "temperature_variance":            ["temperature", "temperature variance"],
    "shelf_life_check":                ["shelf life", "expiry", "perishables shelf"],
    "perishables_shelf_life":          ["shelf life", "expiry", "perishables"],
    "oos_incident_report":             ["out-of-stock", "oos", "oos incidents"],
    "out_of_stock_oos_on_sku":         ["out-of-stock", "oos", "oos on sku"],
    "sla_compliance":                  ["sla compliance", "compliance"],
    "physical_inventory_discrepancies":["inventory", "discrepancies", "physical inventory"],
    "capacity_and_surge_management":   ["capacity", "surge", "capacity management"],
    "sunday_&_holiday_delivery_failure":["sunday", "holiday delivery", "delivery failure"],
    "invoice_&_delivery_note_accuracy":["invoice", "delivery note", "accuracy"],
}


def _match_rule(event_type: str, vendor_rules: list[dict]) -> dict | None:
    keywords = EVENT_TYPE_MAP.get(event_type, [event_type.replace("_", " ")])
    et_lower = event_type.lower().replace("_", " ")
    best: dict | None = None
    best_score = 0
    for rule in vendor_rules:
        metric = (rule.get("metric_name") or "").lower()
        score = sum(2 for kw in keywords if kw.lower() in metric)
        if et_lower in metric or metric in et_lower:
            score += 1
        if score > best_score:
            best_score = score
            best = rule
    return best if best_score > 0 else None


def _to_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _calc_penalty(rule: dict, delay_hours: float) -> float:
    penalty_type = rule.get("penalty_type") or "fixed"
    penalty_value = _to_float(rule.get("penalty_value"))
    penalty_cap = _to_float(rule.get("penalty_cap")) if rule.get("penalty_cap") else None

    if penalty_type == "per_unit":
        amount = penalty_value * delay_hours
    elif penalty_type == "percentage":
        amount = 0.0  # need invoice amount — not available
    else:
        amount = penalty_value

    if penalty_cap:
        amount = min(amount, penalty_cap)
    return round(amount, 2)


def _save_breach(log: dict, rule: dict, delay_hours: float, penalty: float,
                 confidence: int, reasoning: str, conn) -> str:
    breach_id = str(uuid.uuid4())
    threshold = _to_float(rule.get("threshold_hours"))
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO breaches
                (id, log_id, rule_id, vendor_id, actual_hours, delay_hours,
                 penalty_amount, dispute_status, confidence, reasoning, breached_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,NOW())
            ON CONFLICT DO NOTHING
            """,
            (
                breach_id, log["id"], rule["id"], log["vendor_id"],
                round(threshold + delay_hours, 2),
                round(delay_hours, 2),
                penalty,
                confidence,
                reasoning,
            ),
        )
        audit_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO audit_log (id, vendor_id, breach_id, status, confidence, reasoning)
            VALUES (%s,%s,%s,'confirmed',%s,%s)
            """,
            (audit_id, log["vendor_id"], breach_id, confidence, reasoning),
        )
    return breach_id


def _check_lock():
    if LOCK_FILE.exists():
        print("[breach_detection] Lock file exists — skipping.")
        sys.exit(0)


def _create_lock():
    LOCK_FILE.write_text(str(os.getpid()))


def _release_lock():
    if LOCK_FILE.exists():
        LOCK_FILE.unlink()


def run(lookback_hours: int = DEFAULT_LOOKBACK_HOURS, limit: int = 5000):
    _check_lock()
    _create_lock()
    try:
        _run_job(lookback_hours, limit)
    finally:
        _release_lock()


def _run_job(lookback_hours: int, limit: int):
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=lookback_hours)

    with DBConn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT ol.*
            FROM operational_logs ol
            WHERE ol.completed_at IS NOT NULL
              AND ol.completed_at >= %s
              AND ol.id NOT IN (
                  SELECT DISTINCT log_id FROM breaches WHERE log_id IS NOT NULL
              )
            ORDER BY ol.completed_at DESC
            LIMIT %s
            """,
            (since, limit),
        )
        logs = cur.fetchall()

        cur.execute(
            """SELECT * FROM sla_rules
               WHERE threshold_hours IS NOT NULL
                 AND threshold_unit IN ('hours', 'minutes', 'days_hours')
                 AND status IN ('approved','draft')"""
        )
        all_rules = cur.fetchall()

    rules_by_vendor: dict[str, list[dict]] = {}
    for r in all_rules:
        rules_by_vendor.setdefault(r["vendor_id"], []).append(dict(r))

    print(f"[breach_detection] {len(logs)} unchecked logs | {len(all_rules)} SLA rules")

    confirmed = 0
    llm_escalated = 0
    skipped = 0
    within_sla = 0

    for log in logs:
        log = dict(log)
        vendor_id = log["vendor_id"]
        event_type = log["event_type"]

        rule = _match_rule(event_type, rules_by_vendor.get(vendor_id, []))
        if not rule:
            skipped += 1
            continue

        threshold = _to_float(rule.get("threshold_hours"))
        if threshold <= 0:
            skipped += 1
            continue

        started = log["started_at"]
        completed = log["completed_at"]
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=timezone.utc)

        actual_hours = (completed - started).total_seconds() / 3600
        delay_hours = actual_hours - threshold

        if delay_hours <= 0:
            within_sla += 1
            continue

        # Check exception or holiday
        holiday_flag = is_holiday(started.date(), "IN")
        exception_submission = None
        with DBConn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """
                SELECT er.* FROM exception_requests er
                JOIN exception_tokens et ON et.id = er.token_id
                WHERE et.log_id = %s ORDER BY er.submitted_at DESC LIMIT 1
                """,
                (log["id"],),
            )
            exc_row = cur.fetchone()
            if exc_row:
                exception_submission = dict(exc_row)

        grace = threshold * GRACE_FACTOR
        has_exception = bool(exception_submission) or holiday_flag
        ambiguous = delay_hours <= grace or has_exception

        penalty = _calc_penalty(rule, delay_hours)
        ts = datetime.now().strftime("%H:%M:%S")

        if ambiguous:
            # ── Escalate to Agent 2 (Bedrock LLM) ────────────────────────────
            try:
                from backend.agents.agent2 import validate_breach
                candidate = {
                    "log_row": log,
                    "sla_rule": rule,
                    "delay_hours": round(delay_hours, 2),
                    "estimated_penalty": penalty,
                    "holiday_flag": holiday_flag,
                    "exception_submission": exception_submission,
                }
                result = validate_breach(candidate)  # also writes breach to DB internally
                is_breach = result.get("is_real_breach", False)
                confidence = result.get("confidence", 0)
                llm_escalated += 1
                if is_breach and confidence >= 70:
                    confirmed += 1
                status = "LLM-BREACH" if (is_breach and confidence >= 70) else "LLM-OK"
                print(
                    f"[{ts}] [{status}] {vendor_id} | {event_type} | {log.get('external_id','?')}"
                    f" | delay={delay_hours:.1f}h | conf={confidence}%"
                )
            except Exception as e:
                print(f"[breach_detection] LLM error log={log['id']}: {e}")
        else:
            # ── Deterministic breach — no LLM needed ──────────────────────────
            reasoning = (
                f"Deterministic breach: {event_type} took {actual_hours:.1f}h against "
                f"{threshold:.1f}h SLA (delay={delay_hours:.1f}h, grace={grace:.2f}h). "
                f"No exception filed. Holiday: {holiday_flag}."
            )
            with DBConn() as conn:
                breach_id = _save_breach(log, rule, delay_hours, penalty,
                                         confidence=95, reasoning=reasoning, conn=conn)
            confirmed += 1
            print(
                f"[{ts}] [BREACH] {vendor_id} | {event_type} | {log.get('external_id','?')}"
                f" | delay={delay_hours:.1f}h | penalty=INR{penalty:,.0f} | id={breach_id[:8]}"
            )
            # Auto-draft dispute email immediately after breach is confirmed
            try:
                from backend.agents.agent3 import draft_dispute_email
                draft_dispute_email(breach_id)
                print(f"[{ts}] [DRAFT] Dispute email auto-drafted for breach {breach_id[:8]}")
            except Exception as e:
                print(f"[breach_detection] Auto-draft failed for breach {breach_id[:8]}: {e}")

    # Mark ~40% of 'sent' disputes older than 6 hours as paid
    # disputes.payment_status = 'paid' + breaches.dispute_status = 'paid'
    paid_count = 0
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id, d.breach_id FROM disputes d
            WHERE d.status = 'sent'
              AND d.payment_status = 'unpaid'
              AND d.sent_at < NOW() - INTERVAL '6 hours'
            ORDER BY d.sent_at ASC
            """
        )
        sent_disputes = cur.fetchall()
        import random as _random
        rng = _random.Random()
        for dispute_id, breach_id in sent_disputes:
            if rng.random() < 0.40:
                cur.execute("UPDATE disputes SET payment_status='paid' WHERE id=%s", (dispute_id,))
                cur.execute("UPDATE breaches SET dispute_status='paid' WHERE id=%s", (breach_id,))
                paid_count += 1

    print(
        f"\n[breach_detection] Done — "
        f"Confirmed: {confirmed} | LLM escalated: {llm_escalated} | "
        f"Within SLA: {within_sla} | Skipped (no rule): {skipped} | "
        f"Disputes marked paid: {paid_count}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=DEFAULT_LOOKBACK_HOURS,
                        help="Look-back window in hours (default: 60 days)")
    parser.add_argument("--limit", type=int, default=5000,
                        help="Max logs to process per run (default: 5000)")
    args = parser.parse_args()
    run(lookback_hours=args.hours, limit=args.limit)
