"""
Contracts router — upload PDFs, extract SLA rules.
"""

import io
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Optional

import pdfplumber

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from backend.agents.agent1 import extract_sla_rules
from backend.db.connection import DBConn
from backend.utils.s3 import upload_file

log = logging.getLogger("vendorguard.contracts")
router = APIRouter()


def _serialise(d: dict) -> dict:
    """Convert datetime and Decimal values so FastAPI can JSON-encode them."""
    out = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out

LOCAL_RAW = Path(__file__).resolve().parents[3] / "local_storage" / "contracts" / "raw"
LOCAL_RAW.mkdir(parents=True, exist_ok=True)


class ContractUploadResponse(BaseModel):
    contract_id: str
    vendor_id: str
    file_name: str
    rules_extracted: int


def _run_extraction(contract_id: str, vendor_id: str, text: str) -> None:
    """Background task: run Agent 1, then persist extracted_text + update status."""
    try:
        rules = extract_sla_rules(text, vendor_id)
        log.info("[bg] Agent 1 complete — %d rule(s) for contract %s", len(rules), contract_id)
        with DBConn() as conn:
            conn.cursor().execute(
                "UPDATE contracts SET status='extracted', extracted_text=%s WHERE id=%s",
                (text, contract_id),
            )
    except Exception as exc:
        log.error("[bg] Agent 1 failed for contract %s: %s", contract_id, exc, exc_info=True)
        with DBConn() as conn:
            conn.cursor().execute(
                "UPDATE contracts SET status='uploaded' WHERE id=%s", (contract_id,)
            )


@router.post("/upload", response_model=ContractUploadResponse)
async def upload_contract(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    vendor_id: str = Form(...),
    vendor_name: str = Form(""),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    log.info("[1/4] Received upload — file=%s  vendor=%s  name=%s", file.filename, vendor_id, vendor_name or "(none)")

    content = await file.read()
    log.info("[1/4] File read — size=%d bytes", len(content))

    contract_id = str(uuid.uuid4())
    s3_key = f"contracts/raw/{vendor_id}_{contract_id}.pdf"

    # Save locally + S3
    local_path = LOCAL_RAW / f"{vendor_id}_{contract_id}.pdf"
    local_path.write_bytes(content)
    upload_file(local_path, s3_key)
    log.info("[2/4] PDF saved — path=%s", local_path.name)

    # Upsert vendor row so new vendors are always in the vendors table
    if vendor_name:
        with DBConn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO vendors (id, name, industry, contact_email, contact_name, relationship_owner)
                VALUES (%s, %s, 'Unknown', '', '', '')
                ON CONFLICT (id) DO UPDATE
                    SET name = EXCLUDED.name
                    WHERE vendors.name = '' OR vendors.name = 'Unknown'
                """,
                (vendor_id, vendor_name),
            )
        log.info("[2b/4] Vendor upsert — vendor_id=%s  name=%s", vendor_id, vendor_name)

    # Insert contract row with status='extracting'
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO contracts (id, vendor_id, file_name, s3_key, status) VALUES (%s,%s,%s,%s,'extracting')",
            (contract_id, vendor_id, file.filename, s3_key),
        )
    log.info("[3/4] Contract row inserted — contract_id=%s  status=extracting", contract_id)

    # Extract text from PDF (fast, local — not blocking Bedrock)
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        pages = len(pdf.pages)
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    log.info("[4/4] PDF text extracted — pages=%d  chars=%d — queuing Agent 1", pages, len(text))

    # Run Agent 1 in background — returns immediately; frontend polls for status
    background_tasks.add_task(_run_extraction, contract_id, vendor_id, text)

    return ContractUploadResponse(
        contract_id=contract_id,
        vendor_id=vendor_id,
        file_name=file.filename,
        rules_extracted=0,
    )


@router.get("/")
def list_contracts(vendor_id: Optional[str] = Query(None)):
    with DBConn() as conn:
        cur = conn.cursor()
        if vendor_id:
            cur.execute(
                """
                SELECT c.id, c.vendor_id, c.file_name, c.status, c.uploaded_at,
                       v.name AS vendor_name,
                       COUNT(sr.id) AS rule_count
                FROM contracts c
                LEFT JOIN vendors v ON v.id = c.vendor_id
                LEFT JOIN sla_rules sr ON sr.contract_id = c.id
                WHERE c.vendor_id = %s
                GROUP BY c.id, v.name
                ORDER BY c.uploaded_at DESC
                """,
                (vendor_id,),
            )
        else:
            cur.execute(
                """
                SELECT c.id, c.vendor_id, c.file_name, c.status, c.uploaded_at,
                       v.name AS vendor_name,
                       COUNT(sr.id) AS rule_count
                FROM contracts c
                LEFT JOIN vendors v ON v.id = c.vendor_id
                LEFT JOIN sla_rules sr ON sr.contract_id = c.id
                GROUP BY c.id, v.name
                ORDER BY c.uploaded_at DESC
                """
            )
        cols = [d[0] for d in cur.description]
        rows = [_serialise(dict(zip(cols, row))) for row in cur.fetchall()]
    return rows


@router.get("/{contract_id}")
def get_contract(contract_id: str):
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM contracts WHERE id = %s", (contract_id,))
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Contract not found")
        contract = _serialise(dict(zip(cols, row)))

        cur.execute("SELECT * FROM sla_rules WHERE contract_id = %s ORDER BY contract_section, created_at", (contract_id,))
        rcols = [d[0] for d in cur.description]
        rules = [_serialise(dict(zip(rcols, r))) for r in cur.fetchall()]

    return {"contract": contract, "sla_rules": rules}


@router.post("/rules/{rule_id}/approve")
def approve_rule(rule_id: str):
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE sla_rules SET status='approved' WHERE id=%s RETURNING id, contract_id",
            (rule_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Rule not found")
        contract_id = row[1]
        # If every rule for this contract is approved, mark the contract approved too
        if contract_id:
            cur.execute(
                "SELECT COUNT(*) FROM sla_rules WHERE contract_id=%s AND status != 'approved'",
                (contract_id,),
            )
            remaining = cur.fetchone()[0]
            if remaining == 0:
                cur.execute(
                    "UPDATE contracts SET status='approved' WHERE id=%s", (contract_id,)
                )
    return {"id": rule_id, "status": "approved"}


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, payload: dict):
    threshold = payload.get("threshold", {})
    threshold_hours = threshold.get("value")
    threshold_unit = threshold.get("unit")

    if threshold_hours is None and threshold_unit is None:
        raise HTTPException(400, "Nothing to update")

    with DBConn() as conn:
        cur = conn.cursor()
        if threshold_hours is not None and threshold_unit is not None:
            cur.execute(
                "UPDATE sla_rules SET threshold_hours=%s, threshold_unit=%s WHERE id=%s RETURNING id",
                (threshold_hours, threshold_unit, rule_id),
            )
        elif threshold_hours is not None:
            cur.execute(
                "UPDATE sla_rules SET threshold_hours=%s WHERE id=%s RETURNING id",
                (threshold_hours, rule_id),
            )
        else:
            cur.execute(
                "UPDATE sla_rules SET threshold_unit=%s WHERE id=%s RETURNING id",
                (threshold_unit, rule_id),
            )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Rule not found")
    return {"id": rule_id, "updated": True}


@router.get("/exception/{token}")
def submit_exception(token: str, reason: str, description: str = ""):
    """Vendor exception submission endpoint (linked from pre-breach warning email)."""
    import jwt as pyjwt
    from backend.utils.secrets import get
    from datetime import datetime

    secret = get("JWT_SECRET", "vendorguard-local-secret")
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(400, "Exception token has expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(400, "Invalid exception token")

    token_id = payload["token_id"]
    log_id = payload["log_id"]
    vendor_id = payload["vendor_id"]
    exc_id = str(uuid.uuid4())

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, used FROM exception_tokens WHERE id = %s", (token_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Token not found")
        if row[1]:
            raise HTTPException(400, "Token already used")

        cur.execute(
            "INSERT INTO exception_requests (id, token_id, vendor_id, reason, description) VALUES (%s,%s,%s,%s,%s)",
            (exc_id, token_id, vendor_id, reason, description),
        )
        cur.execute("UPDATE exception_tokens SET used = TRUE WHERE id = %s", (token_id,))

    return {"message": "Exception filed successfully", "exception_id": exc_id}
