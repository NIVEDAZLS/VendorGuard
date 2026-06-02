"""
Agent 2 — Anomaly Investigator
Validates whether a detected SLA delay is a genuine breach using Amazon Nova Lite via AWS Bedrock.

Routing logic is applied in Python, NOT in the LLM.

Usage (standalone test):
    python backend/agents/agent2.py
"""

import json
import uuid
import re
from datetime import datetime

import boto3

from backend.utils.secrets import require, get
from backend.db.connection import DBConn

_MODEL_ID = "us.amazon.nova-lite-v1:0"

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


def _call_llm(candidate: dict) -> str:
    client = _get_client()
    payload = json.dumps(candidate, ensure_ascii=False, indent=2, default=str)
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [{"text": SYSTEM_PROMPT + "\n\nBREACH CANDIDATE:\n" + payload}],
            },
        ],
        "inferenceConfig": {
            "temperature": 0.2,
            "maxTokens":   2048,
        },
    })
    resp = client.invoke_model(modelId=_MODEL_ID, body=body, contentType="application/json")
    result = json.loads(resp["body"].read())
    return result["output"]["message"]["content"][0]["text"].strip()


def _clean_json(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    return raw.strip()


def validate_breach(candidate: dict) -> dict:
    """
    Validate a breach candidate.

    candidate keys:
        log_row              dict  — row from operational_logs
        sla_rule             dict  — matching sla_rules row
        delay_hours          float — how many hours over threshold
        estimated_penalty    float — pre-calculated penalty amount
        holiday_flag         bool  — True if the event date is a public holiday
        exception_submission dict | None — vendor's filed exception (if any)

    Returns the validated result dict (is_real_breach, confidence, reasoning, penalty_amount).
    Also writes to breaches / audit_log based on routing logic.
    """
    raw = _call_llm(candidate)
    cleaned = _clean_json(raw)

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Agent 2 returned invalid JSON.\nRaw: {raw}") from e

    is_breach  = bool(result.get("is_real_breach", False))
    confidence = int(result.get("confidence", 0))

    if confidence < 70:
        is_breach = False
        result["is_real_breach"] = False
        result["penalty_amount"] = 0

    _route_result(candidate, result, is_breach, confidence)
    return result


def _route_result(candidate: dict, result: dict, is_breach: bool, confidence: int) -> None:
    log_row   = candidate.get("log_row", {})
    sla_rule  = candidate.get("sla_rule", {})
    vendor_id = log_row.get("vendor_id", "")
    log_id    = log_row.get("id", "")
    rule_id   = sla_rule.get("id", "")

    with DBConn() as conn:
        cur = conn.cursor()
        breach_id = None

        if is_breach and confidence >= 70:
            breach_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO breaches (id, log_id, rule_id, vendor_id, actual_hours, delay_hours,
                    penalty_amount, dispute_status, confidence, reasoning, breached_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,NOW())
                """,
                (
                    breach_id, log_id, rule_id, vendor_id,
                    candidate.get("delay_hours", 0) + (sla_rule.get("threshold_hours") or 0),
                    candidate.get("delay_hours", 0),
                    result.get("penalty_amount", 0),
                    confidence,
                    result.get("reasoning", ""),
                ),
            )
            audit_status = "confirmed"
            print(f"[Agent2] CONFIRMED breach {breach_id} (confidence={confidence}%)")
        elif confidence < 70:
            audit_status = "needs_human_review"
            print(f"[Agent2] LOW CONFIDENCE ({confidence}%) — flagged for human review")
        else:
            audit_status = "false_alarm"
            print(f"[Agent2] FALSE ALARM (confidence={confidence}%)")

        audit_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO audit_log (id, vendor_id, breach_id, status, confidence, reasoning)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            (audit_id, vendor_id, breach_id, audit_status, confidence, result.get("reasoning", "")),
        )


if __name__ == "__main__":
    test_candidate = {
        "log_row": {
            "id": "test-log-001",
            "vendor_id": "VND-EL-001",
            "event_type": "goods_receipt",
            "external_id": "SHP-12345",
            "started_at": "2026-07-15 08:00:00",
            "completed_at": "2026-07-15 14:30:00",
        },
        "sla_rule": {
            "id": "test-rule-001",
            "metric_name": "Goods Receipt Processing",
            "threshold_hours": 4,
            "threshold_unit": "hours",
            "penalty_type": "per_unit",
            "penalty_value": 500,
            "penalty_cap": None,
            "exception_clauses": [
                "Delays due to port strikes or government restrictions are exempt.",
                "Public holidays under Indian labour law are excluded from calculation.",
            ],
            "contract_section": "Clause 2.1",
        },
        "delay_hours": 2.5,
        "estimated_penalty": 1250.0,
        "holiday_flag": False,
        "exception_submission": None,
    }

    print("Running Agent 2 test with eLogix goods receipt delay...")
    result = validate_breach(test_candidate)
    print("\nResult:")
    print(json.dumps(result, indent=2))
