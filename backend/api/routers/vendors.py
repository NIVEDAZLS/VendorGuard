"""
Vendors router — CRUD for vendor records.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.connection import DBConn

router = APIRouter()


class VendorCreate(BaseModel):
    name: str
    industry: str
    contact_email: str
    contact_name: str
    relationship_owner: str


class VendorPatch(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    relationship_owner: Optional[str] = None


def _row_to_dict(cols, row):
    return dict(zip(cols, row))


@router.get("/")
def list_vendors():
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vendors ORDER BY name")
        cols = [d[0] for d in cur.description]
        return [_row_to_dict(cols, r) for r in cur.fetchall()]


@router.get("/{vendor_id}")
def get_vendor(vendor_id: str):
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vendors WHERE id = %s", (vendor_id,))
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendor not found")
        return _row_to_dict(cols, row)


@router.post("/", status_code=201)
def create_vendor(body: VendorCreate):
    vendor_id = f"VND-{body.name[:3].upper()}-{str(uuid.uuid4())[:4].upper()}"
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO vendors (id, name, industry, contact_email, contact_name, relationship_owner)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (vendor_id, body.name, body.industry, body.contact_email, body.contact_name, body.relationship_owner),
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
    return _row_to_dict(cols, row)


@router.patch("/{vendor_id}")
def update_vendor(vendor_id: str, body: VendorPatch):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [vendor_id]

    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE vendors SET {set_clause} WHERE id = %s RETURNING *",
            values,
        )
        cols = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendor not found")
    return _row_to_dict(cols, row)


@router.delete("/{vendor_id}", status_code=204)
def delete_vendor(vendor_id: str):
    with DBConn() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM vendors WHERE id = %s", (vendor_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Vendor not found")
