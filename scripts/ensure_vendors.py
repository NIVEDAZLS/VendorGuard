"""
Ensure the three seed vendors used by seed_logs.py exist in the DB.
Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).
"""
import os
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

VENDORS = [
    {
        "id": "VND-EL-001",
        "name": "eLogix Logistics Pvt. Ltd.",
        "industry": "Logistics",
        "contact_email": "nivethitha.jm@ganitinc.com",
        "contact_name": "Nivethitha J M",
        "relationship_owner": "Neha Sharma",
    },
    {
        "id": "VND-CS-001",
        "name": "Cisco Hub Operator",
        "industry": "SaaS/Tech",
        "contact_email": "nivethitha.jm@ganitinc.com",
        "contact_name": "Nivethitha J M",
        "relationship_owner": "Neha Sharma",
    },
    {
        "id": "VND-FR-001",
        "name": "FreshRoute Logistics",
        "industry": "Logistics",
        "contact_email": "nivethitha.jm@ganitinc.com",
        "contact_name": "Nivethitha J M",
        "relationship_owner": "Neha Sharma",
    },
]

conn = psycopg2.connect(
    host=os.environ["DB_HOST"],
    port=int(os.environ.get("DB_PORT", 5432)),
    dbname=os.environ["DB_NAME"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
)

with conn.cursor() as cur:
    for v in VENDORS:
        cur.execute("SELECT id FROM vendors WHERE id = %s", (v["id"],))
        exists = cur.fetchone()
        if exists:
            print(f"  already exists: {v['id']} ({v['name']})")
        else:
            cur.execute(
                """INSERT INTO vendors (id, name, industry, contact_email, contact_name, relationship_owner)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (v["id"], v["name"], v["industry"], v["contact_email"], v["contact_name"], v["relationship_owner"]),
            )
            print(f"  inserted: {v['id']} ({v['name']})")

conn.commit()
conn.close()
print("Done.")
