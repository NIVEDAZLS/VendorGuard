"""
Agent 1 — Legal Architect
Extracts SLA rules from contract PDF text using Amazon Nova Lite via AWS Bedrock.

Three-pass strategy:
  Pass 1a — each overlapping chunk → standard single-threshold rules (EXTRACT_PROMPT)
  Pass 1b — same chunks → tiered/compound/cap/credit-band rules (EXTRACT_TIERED_PROMPT)
  Pass 2  — consolidate all candidates: deduplicate without merging tiers
  Pass 3  — gap check: re-read full contract vs current rule list, add anything missed

Storage (always both):
  (a) local_storage/sla-json/{vendor_id}_slas.json   (write_local_json — always)
  (b) S3 via put_json (no-op locally, real S3 on EC2 when USE_LOCAL_STORAGE=false)
  (c) PostgreSQL sla_rules table

Usage (standalone test):
    python backend/agents/agent1.py
"""

import json
import uuid
import re
import boto3

from backend.utils.secrets import require, get
from backend.utils.s3 import put_json, write_local_json
from backend.db.connection import DBConn

_MODEL_ID = "us.amazon.nova-lite-v1:0"

# ── chunking ──────────────────────────────────────────────────────────────────
_CHUNK_CHARS = 12_000
_OVERLAP_CHARS = 1_500
_MAX_GAPCHECK_CHARS = 80_000

REQUIRED_FIELDS = {
    "metric_name", "threshold_value", "penalty_type",
    "penalty_value", "penalty_cap", "exception_clauses",
    "contract_section", "threshold_unit", "note",
}

# ── prompts ───────────────────────────────────────────────────────────────────

EXTRACT_PROMPT = """You are a legal contract analyst specialising in vendor SLA agreements.
Read the CONTRACT SECTION provided and identify every standard SLA commitment,
threshold, and penalty clause.

This pass is for PLAIN rules only (single threshold → single penalty).
Do NOT process escalating tiers, credit bands, sub-penalty breakdowns, or
aggregate liability caps — those are handled separately.

Return ONLY a valid JSON array with NO prose, NO markdown code fences, NO explanation.
Each object MUST contain exactly these keys:

  - metric_name       (string): short descriptive name of the SLA metric
  - threshold_value   (number | null): the numeric threshold exactly as stated in the contract.
                       Always extract the actual number. Examples:
                         "< 0.5%" → 0.5
                         "within 4 hours" → 4
                         "30 consecutive minutes" → 30
                         "3 consecutive months" → 3
                       Only use null if absolutely no numeric threshold exists in the clause.
  - threshold_unit    (string): the unit of the threshold. Use the most precise value from:
                       "hours", "business_hours", "days", "months", "percent",
                       "incidents", "minutes", "pallets", "occurrences", "INR"
                       Use the literal unit from the contract if none of the above fit.
  - penalty_type      (string): exactly one of:
                         "fixed"      — a flat currency amount per breach event
                         "percentage" — a % of invoice/contract/shipment value
                         "per_unit"   — an amount multiplied by a count (hours, units, incidents)
  - penalty_value     (number | null): the penalty amount or rate as a plain number.
                         "percentage" type: store the % as a decimal (2.5% → 2.5)
                         "fixed" type: store the rupee amount (₹2,000 → 2000)
                         "per_unit": store the per-unit rate
  - penalty_cap       (number | null): maximum penalty ceiling, null if none stated
  - exception_clauses (array of strings): verbatim text of every exception condition. [] if none.
  - contract_section  (string): clause/section number exactly as printed (e.g. "3.3", "5.1")
  - note              (string | null): only if a threshold is genuinely ambiguous or absent.
                       Otherwise null.

CRITICAL RULES:
- NEVER hallucinate thresholds. If no numeric threshold is stated, set threshold_value to null.
- Always use threshold_unit to carry the unit; do not encode units inside threshold_value.
- Do not include any text outside the JSON array.
- If no plain SLA rules exist in this section, return [].
"""

EXTRACT_TIERED_PROMPT = """You are a legal contract analyst specialising in vendor SLA agreements.
Read the CONTRACT SECTION provided and identify ONLY these special clause types:

1. ESCALATING PENALTY TIERS — penalties that increase at different thresholds.
   (e.g. "1st incident: ₹2,000; 2nd: ₹4,000; 3rd+: ₹6,000")
   Produce ONE separate JSON object per tier.

2. SERVICE CREDIT BANDS — % credits applied based on monthly performance ranges.
   (e.g. "98-98.9% SLA: 2.5% credit; 97-97.9%: 5% credit")
   Produce ONE separate JSON object per band.

3. SUB-PENALTIES WITHIN ONE SECTION — one numbered section with multiple distinct
   penalty obligations listed as (a), (b), (c) sub-items.
   (e.g. Section 5.3 separately penalising perishables spoilage, customer refunds, theft)
   Produce ONE separate JSON object per sub-penalty.

Do NOT extract aggregate liability caps, termination triggers, or security deposit
encashment clauses — those are not monitorable operational metrics.

Return ONLY a valid JSON array with NO prose, NO markdown code fences, NO explanation.
Each object MUST contain exactly these keys:

  - metric_name       (string): descriptive name including the tier/band/sub-type.
                       For tiers append "— Tier N" (e.g. "OOS Incidents — Tier 1").
                       For sub-penalties append the sub-type (e.g. "Damage Recovery — Perishables Spoilage").
                       For service credits append the band (e.g. "Monthly Service Credit — Band 1").
  - threshold_value   (number | null): lower bound of this tier/band as a plain number.
                       For tiers: the incident/occurrence count triggering this tier.
                       For credit bands: the lower % boundary of the performance range.
                       null only if no numeric lower bound exists.
  - threshold_unit    (string): same allowed values as the primary extraction pass.
  - penalty_type      (string): "fixed", "percentage", or "per_unit"
  - penalty_value     (number | null): penalty for this specific tier/band/sub-penalty
  - penalty_cap       (number | null): aggregate cap if stated, null otherwise
  - exception_clauses (array of strings): verbatim exception text. [] if none.
  - contract_section  (string): section number exactly as printed
  - tier_index        (integer | null): sequential tier number within the same section
                       (1 for first tier/band, 2 for second, etc.). null if not tiered.
  - note              (string | null): brief description of what this tier/band represents.
                       Mandatory for tiered and banded rules to preserve context.

CRITICAL RULES:
- Only process the three special clause types listed above. Ignore plain single-threshold rules.
- For escalating tiers sharing the same contract_section, each MUST have a different tier_index.
  NEVER merge them into one object.
- If no special clauses exist in this section, return [].
- Return nothing outside the JSON array.
"""

CONSOLIDATE_PROMPT = """You are a legal contract analyst. You have been given a JSON array of SLA
rule candidates extracted from overlapping sections of the same vendor contract.

Your job:
1. Remove EXACT duplicates — objects where metric_name, contract_section, threshold_value,
   AND penalty_value are all identical. Keep the copy with the most populated fields.

2. Merge FRAGMENTS — where a rule appears twice with the same metric_name and contract_section
   but one copy has null fields the other fills in. Merge into one complete object.

3. NEVER merge two rules that have different tier_index values, even if they share the same
   contract_section. Escalating tiers are separate rules.

4. NEVER merge two rules with different metric_name suffixes (e.g. "— Perishables Spoilage"
   vs "— Customer Refund"), even if they share the same contract_section.

5. NEVER merge a tiered rule with a plain rule from the same section.

6. Ensure every object has all required fields. Fill null where genuinely absent. Do NOT invent.

7. Do NOT add rules not present in the input.

Return ONLY a valid JSON array with NO prose, NO markdown code fences, NO explanation.

Required keys per object:
  metric_name, threshold_value, threshold_unit, penalty_type, penalty_value,
  penalty_cap, exception_clauses, contract_section, tier_index, note.

If the input already has no duplicates or fragments, return it unchanged.
"""

GAP_CHECK_PROMPT = """You are a legal contract analyst performing a completeness audit.

You will be given:
  CONTRACT_TEXT: the full text of a vendor contract
  EXTRACTED_RULES: a JSON array of SLA rules already extracted

Your task: identify enforceable clauses in the contract NOT adequately represented
in EXTRACTED_RULES.

A clause is NOT represented if:
  - No object in EXTRACTED_RULES has the matching contract_section AND a meaningful metric_name, OR
  - The contract states multiple distinct penalties in one section but EXTRACTED_RULES has only
    one object for that section (sub-penalties missing), OR
  - The contract states escalating tiers but EXTRACTED_RULES has only one tier for that section.

Return ONLY a valid JSON array of MISSING rules using the same schema as EXTRACTED_RULES.
Required keys:
  metric_name, threshold_value, threshold_unit, penalty_type, penalty_value,
  penalty_cap, exception_clauses, contract_section, tier_index, note.

CRITICAL RULES:
- If all enforceable clauses are already represented, return [].
- Do NOT re-return rules already in EXTRACTED_RULES.
- Do NOT hallucinate clauses not present in the contract text.
- Populate note with a brief rationale explaining why this clause was missed.
- Return nothing outside the JSON array.
"""

METADATA_PROMPT = """You are a legal contract analyst. Read the CONTRACT SECTION and extract
contract-level financial and governance metadata ONLY — not operational SLA rules.

Extract ONLY these items if present:
  - Aggregate liability cap (e.g. "total penalties shall not exceed 20% of annual contract value")
  - Annual contract value
  - Termination-for-cause triggers (e.g. "SLA below 95% for 3 consecutive months")
  - Security deposit / performance bond encashment triggers

Return a single JSON object (not an array) with these keys — use null if not found:
{
  "annual_contract_value":           <number | null>,
  "annual_contract_value_currency":  <"INR" | "USD" | null>,
  "max_aggregate_penalty_percent":   <number | null>,
  "max_aggregate_penalty_amount":    <number | null>,
  "aggregate_period_months":         <number | null>,
  "termination_triggers":            [<string>, ...],
  "security_deposit_triggers":       [<string>, ...]
}

Return ONLY the JSON object with NO prose, NO markdown, NO explanation.
If none of the above exist in this section, return {"annual_contract_value": null,
"annual_contract_value_currency": null, "max_aggregate_penalty_percent": null,
"max_aggregate_penalty_amount": null, "aggregate_period_months": null,
"termination_triggers": [], "security_deposit_triggers": []}.
"""

# Metric names that are never matchable by operational logs — filter before DB insert
_NON_MONITORABLE_KEYWORDS = (
    "aggregate liability",
    "liability cap",
    "termination",
    "insolvency",
    "bankruptcy",
    "security deposit",
    "performance bond",
    "subleasing",
    "material breach",
    "force majeure",
    "certifications",
    "insurance",
)


def _is_monitorable(rule: dict) -> bool:
    """Return False for rules that can never be matched by an operational log event."""
    metric = (rule.get("metric_name") or "").lower()
    if any(kw in metric for kw in _NON_MONITORABLE_KEYWORDS):
        return False
    # Rules with no time-based threshold and no tier_index are likely non-operational
    unit = (rule.get("threshold_unit") or "").lower()
    has_time = unit in {"hours", "business_hours", "days", "minutes", "days_hours"}
    has_tier = rule.get("tier_index") is not None
    has_threshold = rule.get("threshold_value") is not None
    if not has_time and not has_tier and not has_threshold:
        return False
    return True


STRICT_SUFFIX = "\nPrevious attempt failed validation. Be extra strict: return ONLY the raw JSON array."


# ── LLM call ──────────────────────────────────────────────────────────────────

def _get_client():
    return boto3.client(
        "bedrock-runtime",
        region_name="us-east-1",
        aws_access_key_id=require("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=require("AWS_SECRET_ACCESS_KEY"),
    )


def _call_llm(system_prompt: str, user_content: str, max_tokens: int = 8192) -> str:
    client = _get_client()
    body = json.dumps({
        "messages": [
            {"role": "user", "content": [{"text": system_prompt + "\n\n" + user_content}]},
        ],
        "inferenceConfig": {
            "temperature": 0.1,
            "maxTokens": max_tokens,
        },
    })
    resp = client.invoke_model(modelId=_MODEL_ID, body=body, contentType="application/json")
    result = json.loads(resp["body"].read())
    return result["output"]["message"]["content"][0]["text"].strip()


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_chunks(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_CHARS
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - _OVERLAP_CHARS
    return chunks


def _clean_json(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    return raw.strip()


def _validate(rules: list[dict]) -> list[str]:
    errors = []
    for i, rule in enumerate(rules):
        effective_keys = set(rule.keys())
        # Accept old key name for backward compat with any callers using threshold_hours
        if "threshold_hours" in effective_keys:
            effective_keys.add("threshold_value")
        missing = REQUIRED_FIELDS - effective_keys
        if missing:
            errors.append(f"Rule[{i}] missing fields: {missing}")
    return errors


def _parse_rules(raw: str, label: str) -> list[dict]:
    cleaned = _clean_json(raw)
    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        print(f"[Agent1] {label}: invalid JSON — skipping. Snippet: {raw[:200]}")
        return []
    if not isinstance(result, list):
        print(f"[Agent1] {label}: expected list, got {type(result).__name__} — skipping.")
        return []
    return result


# ── pass 1a: standard per-chunk extraction ────────────────────────────────────

def _extract_chunk(chunk_text: str, chunk_label: str) -> list[dict]:
    for attempt, prompt in enumerate([EXTRACT_PROMPT, EXTRACT_PROMPT + STRICT_SUFFIX], start=1):
        raw = _call_llm(prompt, "CONTRACT SECTION:\n" + chunk_text)
        rules = _parse_rules(raw, chunk_label)
        if rules or attempt == 2:
            return rules
    return []


# ── pass 1b: tiered/compound per-chunk extraction ─────────────────────────────

def _extract_tiered_chunk(chunk_text: str, chunk_label: str) -> list[dict]:
    for attempt, prompt in enumerate(
        [EXTRACT_TIERED_PROMPT, EXTRACT_TIERED_PROMPT + STRICT_SUFFIX], start=1
    ):
        raw = _call_llm(prompt, "CONTRACT SECTION:\n" + chunk_text)
        rules = _parse_rules(raw, f"{chunk_label}[tiered]")
        if rules or attempt == 2:
            return rules
    return []


# ── pass 2: consolidation ─────────────────────────────────────────────────────

def _tier_aware_dedup(rules: list[dict]) -> list[dict]:
    """Fallback dedup that preserves tiers within the same section."""
    seen: dict[tuple, dict] = {}
    for rule in rules:
        section = (rule.get("contract_section") or "").strip().lower()
        tier = rule.get("tier_index")
        metric = (rule.get("metric_name") or "").strip().lower()
        # Strip "— tier N" / "— band N" suffix to get a stable base key for dedup
        metric_base = re.sub(
            r"\s*[—\-]\s*(tier|band|sub)\s*\d+.*$", "", metric, flags=re.IGNORECASE
        )

        key = (section or str(uuid.uuid4()), tier, metric_base)

        if key not in seen:
            seen[key] = rule
        else:
            old_score = sum(1 for v in seen[key].values() if v is not None and v != [] and v != "")
            new_score = sum(1 for v in rule.values() if v is not None and v != [] and v != "")
            if new_score > old_score:
                seen[key] = rule
    return list(seen.values())


def _consolidate(candidates: list[dict]) -> list[dict]:
    if not candidates:
        return []

    payload = json.dumps(candidates, ensure_ascii=False, indent=2, default=str)
    print(f"[Agent1] Pass 2 — consolidating {len(candidates)} candidates …")

    for attempt, prompt in enumerate([CONSOLIDATE_PROMPT, CONSOLIDATE_PROMPT + STRICT_SUFFIX], start=1):
        raw = _call_llm(prompt, "CANDIDATE RULES:\n" + payload, max_tokens=8192)
        rules = _parse_rules(raw, f"consolidate attempt {attempt}")
        errors = _validate(rules)
        if not errors:
            print(f"[Agent1] Pass 2 produced {len(rules)} rule(s)")
            return rules
        print(f"[Agent1] Pass 2 validation errors: {errors}")
        if attempt == 2:
            print("[Agent1] Falling back to tier-aware dedup")
            return _tier_aware_dedup(candidates)

    return _tier_aware_dedup(candidates)


# ── pass 3: gap check ─────────────────────────────────────────────────────────

def _gap_check(pdf_text: str, current_rules: list[dict]) -> list[dict]:
    if not current_rules:
        return []

    truncated = pdf_text[:_MAX_GAPCHECK_CHARS]
    if len(pdf_text) > _MAX_GAPCHECK_CHARS:
        print(f"[Agent1] Pass 3 — contract truncated to {_MAX_GAPCHECK_CHARS:,} chars for gap check")

    rules_json = json.dumps(current_rules, ensure_ascii=False, indent=2, default=str)
    user_content = (
        "CONTRACT_TEXT:\n" + truncated +
        "\n\n---\n\nEXTRACTED_RULES:\n" + rules_json
    )

    print(f"[Agent1] Pass 3 — gap check against {len(current_rules)} current rule(s) …")

    for attempt, prompt in enumerate(
        [GAP_CHECK_PROMPT, GAP_CHECK_PROMPT + STRICT_SUFFIX], start=1
    ):
        raw = _call_llm(prompt, user_content, max_tokens=4096)
        missing = _parse_rules(raw, f"gap_check attempt {attempt}")
        errors = _validate(missing)
        if not errors:
            print(f"[Agent1] Pass 3 found {len(missing)} missing rule(s)")
            return missing
        print(f"[Agent1] Pass 3 validation errors: {errors}")
        if attempt == 2:
            print("[Agent1] Pass 3 returning empty list after 2 failed attempts")
            return []

    return []


# ── metadata extraction (caps, termination triggers) ─────────────────────────

def _extract_metadata(pdf_text: str) -> dict:
    """Single pass over full contract text to extract contract-level metadata."""
    truncated = pdf_text[:_MAX_GAPCHECK_CHARS]
    raw = _call_llm(METADATA_PROMPT, "CONTRACT SECTION:\n" + truncated, max_tokens=1024)
    cleaned = _clean_json(raw)
    try:
        meta = json.loads(cleaned)
        if not isinstance(meta, dict):
            return {}
        return meta
    except json.JSONDecodeError:
        print(f"[Agent1] Metadata extraction returned invalid JSON — skipping")
        return {}


# ── storage ───────────────────────────────────────────────────────────────────

_KNOWN_UNITS = {
    "hours", "business_hours", "days", "months", "percent",
    "incidents", "minutes", "pallets", "occurrences", "inr",
}


def _normalise_unit(unit: str | None) -> str:
    if not unit:
        return "hours"
    return unit.strip().lower()


_VALID_PENALTY_TYPES = {"fixed", "percentage", "per_unit", "none"}


def _normalise_penalty_type(pt: str | None) -> str | None:
    """Map LLM output to a DB-safe penalty_type. Returns None when absent."""
    if not pt:
        return None
    pt = pt.strip().lower()
    if pt in _VALID_PENALTY_TYPES:
        return pt
    # common LLM synonyms
    if pt in ("percent", "percentage_of_value", "pct"):
        return "percentage"
    if pt in ("flat", "flat_fee", "lump_sum", "rupees"):
        return "fixed"
    if pt in ("per_event", "per_occurrence", "per_incident", "per_hour", "per_unit_rate"):
        return "per_unit"
    # unknown — store as None rather than crash
    return None


def _insert_rules(rules: list[dict], vendor_id: str, contract_id: str | None) -> None:
    monitorable = [r for r in rules if _is_monitorable(r)]
    skipped = len(rules) - len(monitorable)
    if skipped:
        print(f"[Agent1] Filtered {skipped} non-monitorable rule(s) before DB insert")
    with DBConn() as conn:
        cur = conn.cursor()
        for rule in monitorable:
            # Accept both new key (threshold_value) and old key (threshold_hours)
            threshold_val = (
                rule.get("threshold_value")
                if "threshold_value" in rule
                else rule.get("threshold_hours")
            )

            # Encode tier_index into note so it survives the DB round-trip
            note = rule.get("note")
            tier_index = rule.get("tier_index")
            if tier_index is not None:
                tier_label = f"Tier {tier_index}"
                note = f"{tier_label} — {note}" if note else tier_label

            penalty_type = _normalise_penalty_type(rule.get("penalty_type"))

            cur.execute(
                """
                INSERT INTO sla_rules (
                    id, contract_id, vendor_id, metric_name, threshold_hours,
                    threshold_unit, penalty_type, penalty_value, penalty_cap,
                    exception_clauses, contract_section, note, status
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    str(uuid.uuid4()),
                    contract_id,
                    vendor_id,
                    rule["metric_name"],
                    threshold_val,
                    _normalise_unit(rule.get("threshold_unit")),
                    penalty_type,
                    rule.get("penalty_value"),
                    rule.get("penalty_cap"),
                    json.dumps(rule.get("exception_clauses", [])),
                    rule.get("contract_section"),
                    note,
                    "draft",
                ),
            )
    print(f"[Agent1] Inserted {len(monitorable)} SLA rules for vendor {vendor_id}")


def _resolve_contract_id(vendor_id: str) -> str | None:
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM contracts WHERE vendor_id = %s ORDER BY uploaded_at DESC LIMIT 1",
            (vendor_id,),
        )
        row = cur.fetchone()
        return row[0] if row else None


# ── public API ────────────────────────────────────────────────────────────────

def extract_sla_rules(pdf_text: str, vendor_id: str) -> list[dict]:
    """
    Three-pass SLA extraction. Saves results to local JSON, S3, and PostgreSQL.
    """
    chunks = _make_chunks(pdf_text)
    print(f"[Agent1] Vendor {vendor_id}: {len(chunks)} chunk(s) from {len(pdf_text):,} chars")

    # Pass 1: standard + tiered extraction per chunk
    candidates: list[dict] = []
    for i, chunk in enumerate(chunks, start=1):
        label = f"chunk {i}/{len(chunks)}"
        print(f"[Agent1] Pass 1a — {label} ({len(chunk):,} chars)")
        standard = _extract_chunk(chunk, label)
        print(f"[Agent1]   → {len(standard)} standard candidate(s)")

        print(f"[Agent1] Pass 1b — {label} (tiered/compound)")
        tiered = _extract_tiered_chunk(chunk, label)
        print(f"[Agent1]   → {len(tiered)} tiered candidate(s)")

        candidates.extend(standard)
        candidates.extend(tiered)

    print(f"[Agent1] Pass 1 total candidates: {len(candidates)}")

    # Pass 2: consolidate
    rules = _consolidate(candidates)

    # Pass 3: gap check — find anything missed
    missing = _gap_check(pdf_text, rules)
    if missing:
        rules.extend(missing)
        # Dedup one more time in case Pass 3 returned anything already present
        rules = _tier_aware_dedup(rules)
        print(f"[Agent1] After Pass 3: {len(rules)} total rule(s)")

    if not rules:
        print(f"[Agent1] No SLA rules extracted for vendor {vendor_id}")

    # Extract contract-level metadata (caps, termination triggers) — single pass
    metadata = _extract_metadata(pdf_text)
    if metadata:
        print(f"[Agent1] Metadata: cap={metadata.get('max_aggregate_penalty_percent')}% "
              f"of {metadata.get('annual_contract_value')} {metadata.get('annual_contract_value_currency')}")

    # Storage: (a) local JSON always, (b) S3/put_json, (c) PostgreSQL
    # JSON file contains both monitorable rules AND contract metadata
    s3_key = f"sla-json/{vendor_id}_slas.json"
    payload = {"rules": rules, "contract_metadata": metadata}

    local_dest = write_local_json(payload, s3_key)
    print(f"[Agent1] Saved {len(rules)} rules + metadata → local {local_dest.name}")

    put_json(payload, s3_key)
    print(f"[Agent1] put_json complete → {s3_key}")

    if rules:
        contract_id = _resolve_contract_id(vendor_id)
        _insert_rules(rules, vendor_id, contract_id)

    return rules


# ── standalone test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pdfplumber
    from pathlib import Path

    pdf_dir = Path(__file__).resolve().parents[2] / "local_storage" / "contracts" / "raw"
    pdf_files = list(pdf_dir.glob("*.pdf"))

    if not pdf_files:
        print("No PDFs found in local_storage/contracts/raw/ — place contract PDFs there first.")
    else:
        for pdf_path in pdf_files:
            print(f"\n{'='*60}")
            print(f"Extracting from: {pdf_path.name}")
            print('='*60)
            with pdfplumber.open(pdf_path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)

            fname = pdf_path.stem.upper()
            # Use the vendor ID prefix already embedded in the filename (VND-FRE-XXXX → VND-FRE-XXXX)
            vid = "_".join(pdf_path.stem.split("_")[:1]) if "_" in pdf_path.stem else f"VND-{pdf_path.stem[:8].upper()}"

            rules = extract_sla_rules(text, vid)
            print(f"\nExtracted {len(rules)} rules for vendor {vid}")
            for r in rules:
                tier = f" [Tier {r.get('tier_index')}]" if r.get("tier_index") else ""
                print(f"  §{r.get('contract_section','?')} {r.get('metric_name','?')}{tier} — {r.get('penalty_type')} {r.get('penalty_value')}")
