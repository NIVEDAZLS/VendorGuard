"""
Agent 3 — Corporate Diplomat
Drafts a formal dispute email for a confirmed breach using Amazon Nova Lite via AWS Bedrock.

Fetches everything it needs from DB and local storage using only breach_id.

Usage (standalone test):
    python backend/agents/agent3.py
"""

import json
import uuid
import re
from pathlib import Path

import boto3

from backend.utils.secrets import require, get
from backend.utils.s3 import get_json
from backend.utils.email import send_email
from backend.utils.email_helpers import vendor_email
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

SYSTEM_PROMPT = """You are a corporate compliance officer drafting a formal vendor dispute email for an Indian company.

If vendor_exception_reason is provided, the vendor filed an exception claim. You must address it directly and explain
why it does not absolve them of the breach under the contract terms. Cite the specific exception_clauses from the
contract that do NOT cover their stated reason.

If vendor_exception_reason is NOT provided, draft a standard breach notice.

Write the email in flowing paragraphs (no section headers), covering:
1. Notice of SLA breach — formally notify the vendor
2. Contract reference — cite the exact contract_section provided (never invent clause numbers)
3. Facts — order ID, actual performance, SLA threshold, delay hours
4. Exception assessment (ONLY if vendor_exception_reason is present) — acknowledge their reason, then clearly
   explain why it does not qualify under the contract exception clauses
5. Penalty calculation — use ONLY the penalty_amount provided, show the calculation
6. Payment instruction — request payment within 7 business days
7. Professional close — firm, factual, not hostile

RULES:
- Cite ONLY the contract_section value provided — never invent or guess clause numbers.
- Use ONLY the penalty_amount from the breach record — never recalculate.
- ALL monetary amounts MUST be in Indian Rupees. Write as ₹X,XX,XXX (Indian number format) — NEVER use $ or USD.
- Return plain text ONLY — no subject line in the body, no markdown, no headers.
- Do NOT include any exception portal links or URLs.
"""


def _call_llm(context: dict) -> str:
    client = _get_client()
    payload = json.dumps(context, ensure_ascii=False, indent=2, default=str)
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [{"text": SYSTEM_PROMPT + "\n\nBREACH CONTEXT:\n" + payload}],
            },
        ],
        "inferenceConfig": {
            "temperature": 0.3,
            "maxTokens":   4096,
        },
    })
    resp = client.invoke_model(modelId=_MODEL_ID, body=body, contentType="application/json")
    result = json.loads(resp["body"].read())
    return result["output"]["message"]["content"][0]["text"].strip()


def draft_dispute_email(breach_id: str) -> str:
    """
    Draft a formal dispute email for the given breach.
    Fetches all context from DB + local storage.
    Saves draft to disputes table and sends notification to finance manager.
    Returns the drafted email body.
    """
    with DBConn() as conn:
        cur = conn.cursor()

        cur.execute("SELECT * FROM breaches WHERE id = %s", (breach_id,))
        cols = [d[0] for d in cur.description]
        row  = cur.fetchone()
        if not row:
            raise ValueError(f"Breach {breach_id} not found")
        breach = dict(zip(cols, row))

        cur.execute("SELECT * FROM vendors WHERE id = %s", (breach["vendor_id"],))
        vcols = [d[0] for d in cur.description]
        vrow  = cur.fetchone()
        vendor = dict(zip(vcols, vrow)) if vrow else {}

        rule = {}
        if breach.get("rule_id"):
            cur.execute("SELECT * FROM sla_rules WHERE id = %s", (breach["rule_id"],))
            rcols = [d[0] for d in cur.description]
            rrow  = cur.fetchone()
            if rrow:
                rule = dict(zip(rcols, rrow))

        log_row = {}
        if breach.get("log_id"):
            cur.execute("SELECT * FROM operational_logs WHERE id = %s", (breach["log_id"],))
            lcols = [d[0] for d in cur.description]
            lrow  = cur.fetchone()
            if lrow:
                log_row = dict(zip(lcols, lrow))

        # Fetch vendor exception reason if filed (via exception_tokens linked to this log)
        exception_submission = {}
        if breach.get("log_id"):
            cur.execute(
                """
                SELECT er.reason, er.description, er.submitted_at
                FROM exception_requests er
                JOIN exception_tokens et ON et.id = er.token_id
                WHERE et.log_id = %s
                ORDER BY er.submitted_at DESC
                LIMIT 1
                """,
                (breach["log_id"],),
            )
            erow = cur.fetchone()
            if erow:
                exception_submission = {
                    "reason": erow[0],
                    "description": erow[1],
                    "submitted_at": str(erow[2]),
                }

    sla_json_rules = []
    try:
        raw_json = get_json(f"sla-json/{breach['vendor_id']}_slas.json")
        # JSON may be the new {"rules": [...], "contract_metadata": {...}} format or old list format
        sla_json_rules = raw_json.get("rules", raw_json) if isinstance(raw_json, dict) else raw_json
    except Exception:
        pass

    matching_clause = next(
        (r for r in sla_json_rules if r.get("contract_section") == rule.get("contract_section")),
        None,
    )

    context = {
        "breach_id":                breach_id,
        "vendor_name":              vendor.get("name", "Vendor"),
        "vendor_contact_email":     vendor.get("contact_email", ""),
        "contract_id":              rule.get("contract_id", ""),
        "contract_section":         rule.get("contract_section", "N/A"),
        "metric_name":              rule.get("metric_name", ""),
        "threshold_hours":          rule.get("threshold_hours"),
        "threshold_unit":           rule.get("threshold_unit", "hours"),
        "actual_hours":             breach.get("actual_hours"),
        "delay_hours":              breach.get("delay_hours"),
        "penalty_amount":           breach.get("penalty_amount", 0),
        "penalty_type":             rule.get("penalty_type"),
        "penalty_value":            rule.get("penalty_value"),
        "penalty_cap":              rule.get("penalty_cap"),
        "order_id":                 log_row.get("external_id", "N/A"),
        "breach_date":              str(breach.get("breached_at", "")),
        "exception_clauses":        matching_clause.get("exception_clauses") if matching_clause else [],
        # Vendor exception — present only if vendor responded to pre-breach warning
        "vendor_exception_reason":  exception_submission.get("reason", ""),
        "vendor_exception_details": exception_submission.get("description", ""),
        "vendor_exception_filed_at":exception_submission.get("submitted_at", ""),
    }

    email_body = _call_llm(context)
    subject = (
        f"SLA Breach Notice — {context['order_id']} | "
        f"Penalty Claim ₹{breach.get('penalty_amount', 0):,.0f}"
    )

    dispute_id = str(uuid.uuid4())
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO disputes (id, breach_id, vendor_id, email_subject, email_body, status)
            VALUES (%s, %s, %s, %s, %s, 'pending_review')
            ON CONFLICT DO NOTHING
            """,
            (dispute_id, breach_id, breach["vendor_id"], subject, email_body),
        )
    print(f"[Agent3] Dispute draft saved — dispute_id={dispute_id}")

    # Draft is saved to DB — admin reviews and sends from the app.
    # No email sent here to avoid vendor receiving draft before admin approves.

    return email_body


if __name__ == "__main__":
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM breaches LIMIT 1")
        row = cur.fetchone()

    if not row:
        print("No breaches in DB. Run seed_logs.py and breach_detection.py first.")
    else:
        bid = row[0]
        print(f"Drafting dispute email for breach {bid}...")
        body = draft_dispute_email(bid)
        print("\n--- DRAFT EMAIL ---")
        print(body)



