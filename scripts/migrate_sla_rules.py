"""
One-time migration: fix sla_rules table constraints.
  1. Drop the old penalty_type CHECK (did not allow null)
  2. Add new CHECK that allows null and 'none'
  3. Drop NOT NULL on contract_id
  4. Add status column (draft/approved/rejected)
"""
import psycopg2

conn = psycopg2.connect(
    host="genai-db.cpwqa0q8emda.ap-south-1.rds.amazonaws.com",
    port=5432,
    dbname="postgres",
    user="postgres",
    password="genaivendorguard",
)
conn.autocommit = False
cur = conn.cursor()

cur.execute("ALTER TABLE sla_rules DROP CONSTRAINT IF EXISTS sla_rules_penalty_type_check")
print("1. Dropped old penalty_type constraint")

cur.execute(
    "ALTER TABLE sla_rules ADD CONSTRAINT sla_rules_penalty_type_check "
    "CHECK (penalty_type IS NULL OR penalty_type IN ('fixed','percentage','per_unit','none'))"
)
print("2. Added new penalty_type constraint (null allowed)")

cur.execute("ALTER TABLE sla_rules ALTER COLUMN contract_id DROP NOT NULL")
print("3. Dropped NOT NULL on contract_id")

cur.execute(
    "ALTER TABLE sla_rules ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' "
    "CHECK (status IN ('draft','approved','rejected'))"
)
print("4. Added status column")

conn.commit()
conn.close()
print("All migrations applied successfully.")
