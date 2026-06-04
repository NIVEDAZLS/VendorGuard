"""
Agent 2 — Anomaly Investigator
Validates whether a detected SLA delay is a genuine breach using Amazon Nova Lite via AWS Bedrock.

LangGraph state machine with 4 nodes:
  classify     → Python-only routing: clear_breach / ambiguous / no_breach
  llm_validate → Bedrock call (only for ambiguous cases)
  save         → writes breach + audit_log to DB
  skip         → writes audit_log only (no breach row) for no_breach / low-confidence

Graph edges:
  classify ──(clear_breach)──► save
  classify ──(ambiguous)─────► llm_validate ──► save
  classify ──(no_breach)─────► skip
  llm_validate ──(low_conf)──► skip

Usage (standalone test):
    python backend/agents/agent2.py
"""

import json
import uuid
import re
from datetime import datetime
from typing import TypedDict, Optional

import boto3
from langgraph.graph import StateGraph, END

from backend.utils.secrets import require, get
from backend.utils.s3 import get_json
from backend.db.connection import DBConn

_MODEL_ID = "us.amazon.nova-lite-v1:0"

# ── State ─────────────────────────────────────────────────────────────────────

class Agent2State(TypedDict):
    candidate:      dict            # full input passed to validate_breach()
    breach_type:    str             # "clear_breach" | "ambiguous" | "no_breach"
    llm_result:     Optional[dict]  # parsed Bedrock response (None until llm_validate runs)
    is_breach:      bool
    confidence:     int
    reasoning:      str
    penalty_amount: float
    saved:          bool

# ── Bedrock client ────────────────────────────────────────────────────────────

def _get_client():
    # us.* inference profiles only exist in us-east-1
    return boto3.client(
        "bedrock-runtime",
        region_name="us-east-1",
        aws_access_key_id=require("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=require("AWS_SECRET_ACCESS_KEY"),
    )

SYSTEM_PROMPT = """You are a meticulous SLA compliance analyst.
You will be given details about a potential SLA breach. Your job is to determine if it is a genuine breach.

Reason step by step through:
1. Does the delay actually exceed the SLA threshold?
2. Do any exception clauses in the SLA rule apply to this situation?
3. If an exception submission exists, does the vendor's reason plausibly match an exception clause?
4. Is there any other mitigating factor (e.g. force majeure, public holiday)?

Return ONLY a valid JSON object with NO prose, NO markdown, NO explanation:
{
  "is_real_breach": <boolean>,
  "confidence": <integer 0-100>,
  "reasoning": "<plain English paragraph explaining your conclusion>",
  "penalty_amount": <number>
}

CRITICAL RULES:
- NEVER set is_real_breach to true if confidence is below 70.
- If confidence < 70, set is_real_breach to false and explain uncertainty in reasoning.
- penalty_amount must equal the estimated_penalty from the input if is_real_breach is true, else 0.
- Return nothing outside the JSON object.
"""


def _call_llm(candidate: dict) -> dict:
    client = _get_client()
    payload = json.dumps(candidate, ensure_ascii=False, indent=2, default=str)
    body = json.dumps({
        "messages": [{
            "role": "user",
            "content": [{"text": SYSTEM_PROMPT + "\n\nBREACH CANDIDATE:\n" + payload}],
        }],
        "inferenceConfig": {"temperature": 0.2, "maxTokens": 2048},
    })
    resp   = client.invoke_model(modelId=_MODEL_ID, body=body, contentType="application/json")
    raw    = json.loads(resp["body"].read())["output"]["message"]["content"][0]["text"].strip()
    clean  = re.sub(r"^```(?:json)?\s*", "", raw)
    clean  = re.sub(r"\s*```$", "", clean).strip()
    return json.loads(clean)

# ── Node 1 — classify ─────────────────────────────────────────────────────────

def classify_node(state: Agent2State) -> Agent2State:
    """
    Pure Python routing — no LLM call.
    clear_breach  → delay > threshold, no exceptions, high confidence expected
    ambiguous     → exception submitted, holiday flag, or borderline delay
    no_breach     → delay_hours <= 0
    """
    candidate  = state["candidate"]
    delay_h    = float(candidate.get("delay_hours", 0))
    holiday    = bool(candidate.get("holiday_flag", False))
    exception  = candidate.get("exception_submission")

    if delay_h <= 0:
        breach_type = "no_breach"
    elif holiday or exception:
        breach_type = "ambiguous"
    else:
        breach_type = "clear_breach"

    return {**state, "breach_type": breach_type}

# ── Node 2 — llm_validate ─────────────────────────────────────────────────────

def llm_validate_node(state: Agent2State) -> Agent2State:
    """Calls Bedrock. Only reached for ambiguous cases."""
    result     = _call_llm(state["candidate"])
    confidence = int(result.get("confidence", 0))
    is_breach  = bool(result.get("is_real_breach", False)) and confidence >= 70

    if confidence < 70:
        result["is_real_breach"]  = False
        result["penalty_amount"]  = 0

    return {
        **state,
        "llm_result":     result,
        "is_breach":      is_breach,
        "confidence":     confidence,
        "reasoning":      result.get("reasoning", ""),
        "penalty_amount": float(result.get("penalty_amount", 0)),
    }

def _get_aggregate_cap(vendor_id: str) -> float | None:
    """Read max_aggregate_penalty_amount from contract metadata JSON, if available."""
    try:
        raw = get_json(f"sla-json/{vendor_id}_slas.json")
        meta = raw.get("contract_metadata", {}) if isinstance(raw, dict) else {}
        cap_amount = meta.get("max_aggregate_penalty_amount")
        cap_pct    = meta.get("max_aggregate_penalty_percent")
        acv        = meta.get("annual_contract_value")
        if cap_amount:
            return float(cap_amount)
        if cap_pct and acv:
            return float(acv) * float(cap_pct) / 100
    except Exception:
        pass
    return None


def _running_penalty_total(vendor_id: str, period_months: int = 12) -> float:
    """Sum of penalty_amount for confirmed breaches in the rolling period."""
    try:
        with DBConn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT COALESCE(SUM(penalty_amount), 0)
                FROM breaches
                WHERE vendor_id = %s
                  AND dispute_status != 'waived'
                  AND breached_at >= NOW() - INTERVAL '%s months'
                """,
                (vendor_id, period_months),
            )
            return float(cur.fetchone()[0])
    except Exception:
        return 0.0


# ── Node 3 — save (confirmed breach) ─────────────────────────────────────────

def save_node(state: Agent2State) -> Agent2State:
    """Inserts a breach row + audit_log row, capped by aggregate liability limit."""
    candidate  = state["candidate"]
    log_row    = candidate.get("log_row", {})
    sla_rule   = candidate.get("sla_rule", {})
    vendor_id  = log_row.get("vendor_id", "")
    log_id     = log_row.get("id", "")
    rule_id    = sla_rule.get("id", "")
    confidence = state["confidence"]
    reasoning  = state["reasoning"]

    # For clear_breach path the LLM was skipped — use estimated penalty directly
    penalty = state["penalty_amount"] or float(candidate.get("estimated_penalty", 0))

    # Apply aggregate cap if contract metadata defines one
    cap = _get_aggregate_cap(vendor_id)
    if cap is not None:
        running = _running_penalty_total(vendor_id)
        headroom = max(0.0, cap - running)
        if headroom <= 0:
            reasoning += f" [Penalty capped at 0 — aggregate limit of {cap:,.0f} already reached]"
            penalty = 0.0
        elif penalty > headroom:
            reasoning += f" [Penalty reduced from {penalty:,.0f} to {headroom:,.0f} — aggregate cap applied]"
            penalty = headroom

    with DBConn() as conn:
        cur = conn.cursor()
        breach_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO breaches (id, log_id, rule_id, vendor_id, actual_hours, delay_hours,
                penalty_amount, dispute_status, confidence, reasoning, breached_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,NOW())
            """,
            (
                breach_id, log_id, rule_id, vendor_id,
                float(candidate.get("delay_hours", 0)) + float(sla_rule.get("threshold_hours") or 0),
                float(candidate.get("delay_hours", 0)),
                penalty, confidence, reasoning,
            ),
        )
        cur.execute(
            "INSERT INTO audit_log (id, vendor_id, breach_id, status, confidence, reasoning) VALUES (%s,%s,%s,%s,%s,%s)",
            (str(uuid.uuid4()), vendor_id, breach_id, "confirmed", confidence, reasoning),
        )

    print(f"[Agent2] CONFIRMED breach {breach_id} (confidence={confidence}%)")

    # Auto-draft dispute email immediately
    try:
        from backend.agents.agent3 import draft_dispute_email
        draft_dispute_email(breach_id)
        print(f"[Agent2] Dispute email auto-drafted for breach {breach_id[:8]}")
    except Exception as e:
        print(f"[Agent2] Auto-draft failed for breach {breach_id[:8]}: {e}")

    return {**state, "saved": True}

# ── Node 4 — skip (no breach / low confidence) ───────────────────────────────

def skip_node(state: Agent2State) -> Agent2State:
    """Writes audit_log only — no breach row."""
    candidate = state["candidate"]
    log_row   = candidate.get("log_row", {})
    vendor_id = log_row.get("vendor_id", "")
    confidence = state["confidence"]
    reasoning  = state["reasoning"]

    if state["breach_type"] == "no_breach":
        audit_status = "false_alarm"
        print(f"[Agent2] NO BREACH — delay_hours <= 0")
    else:
        audit_status = "needs_human_review" if confidence < 70 else "false_alarm"
        print(f"[Agent2] {'LOW CONFIDENCE' if confidence < 70 else 'FALSE ALARM'} (confidence={confidence}%)")

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_log (id, vendor_id, breach_id, status, confidence, reasoning) VALUES (%s,%s,%s,%s,%s,%s)",
            (str(uuid.uuid4()), vendor_id, None, audit_status, confidence, reasoning),
        )

    return {**state, "saved": True}

# ── Conditional routing ───────────────────────────────────────────────────────

def route_after_classify(state: Agent2State) -> str:
    return state["breach_type"]  # "clear_breach" | "ambiguous" | "no_breach"

def route_after_llm(state: Agent2State) -> str:
    return "save" if state["is_breach"] else "skip"

# ── Build graph ───────────────────────────────────────────────────────────────

def _build_graph():
    g = StateGraph(Agent2State)

    g.add_node("classify",     classify_node)
    g.add_node("llm_validate", llm_validate_node)
    g.add_node("save",         save_node)
    g.add_node("skip",         skip_node)

    g.set_entry_point("classify")

    g.add_conditional_edges("classify", route_after_classify, {
        "clear_breach": "save",
        "ambiguous":    "llm_validate",
        "no_breach":    "skip",
    })
    g.add_conditional_edges("llm_validate", route_after_llm, {
        "save": "save",
        "skip": "skip",
    })
    g.add_edge("save", END)
    g.add_edge("skip", END)

    return g.compile()

_graph = _build_graph()

# ── Public API (same signature as before — callers unchanged) ─────────────────

def validate_breach(candidate: dict) -> dict:
    """
    Validate a breach candidate. Drop-in replacement for the old validate_breach().

    candidate keys:
        log_row              dict  — row from operational_logs
        sla_rule             dict  — matching sla_rules row
        delay_hours          float — how many hours over threshold
        estimated_penalty    float — pre-calculated penalty amount
        holiday_flag         bool  — True if the event date is a public holiday
        exception_submission dict | None — vendor's filed exception (if any)

    Returns the validated result dict (is_real_breach, confidence, reasoning, penalty_amount).
    """
    initial: Agent2State = {
        "candidate":      candidate,
        "breach_type":    "",
        "llm_result":     None,
        "is_breach":      False,
        "confidence":     95,   # default for clear_breach path (no LLM)
        "reasoning":      "Delay exceeded threshold with no exceptions or holidays.",
        "penalty_amount": float(candidate.get("estimated_penalty", 0)),
        "saved":          False,
    }
    final = _graph.invoke(initial)
    return {
        "is_real_breach":  final["is_breach"],
        "confidence":      final["confidence"],
        "reasoning":       final["reasoning"],
        "penalty_amount":  final["penalty_amount"],
    }


if __name__ == "__main__":
    test_candidate = {
        "log_row": {
            "id":           "test-log-001",
            "vendor_id":    "VND-EL-001",
            "event_type":   "goods_receipt",
            "external_id":  "SHP-12345",
            "started_at":   "2026-07-15 08:00:00",
            "completed_at": "2026-07-15 14:30:00",
        },
        "sla_rule": {
            "id":               "test-rule-001",
            "metric_name":      "Goods Receipt Processing",
            "threshold_hours":  4,
            "threshold_unit":   "hours",
            "penalty_type":     "per_unit",
            "penalty_value":    500,
            "penalty_cap":      None,
            "exception_clauses": [
                "Delays due to port strikes or government restrictions are exempt.",
                "Public holidays under Indian labour law are excluded from calculation.",
            ],
            "contract_section": "Clause 2.1",
        },
        "delay_hours":        2.5,
        "estimated_penalty":  1250.0,
        "holiday_flag":       False,
        "exception_submission": None,
    }

    print("Running Agent 2 (LangGraph) test — eLogix goods receipt delay...")
    result = validate_breach(test_candidate)
    print("\nResult:")
    print(json.dumps(result, indent=2))
