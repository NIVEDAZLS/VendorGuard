"""
Fix contracts stuck in 'extracting' status:
- If they have rules in sla_rules -> mark as 'extracted'
- If they have zero rules -> mark as 'uploaded' so user can retry
"""
import psycopg2

conn = psycopg2.connect(
    host="genai-db.cpwqa0q8emda.ap-south-1.rds.amazonaws.com",
    port=5432, dbname="postgres", user="postgres", password="genaivendorguard",
)
conn.autocommit = False
cur = conn.cursor()

cur.execute("""
    SELECT c.id, c.file_name, COUNT(sr.id) AS rule_count
    FROM contracts c
    LEFT JOIN sla_rules sr ON sr.contract_id = c.id
    WHERE c.status = 'extracting'
    GROUP BY c.id, c.file_name
""")
stuck = cur.fetchall()
print(f"Found {len(stuck)} stuck contract(s)")

for cid, fname, rule_count in stuck:
    if rule_count > 0:
        cur.execute("UPDATE contracts SET status='extracted' WHERE id=%s", (cid,))
        print(f"  -> {fname}: {rule_count} rules found -> set to 'extracted'")
    else:
        cur.execute("UPDATE contracts SET status='uploaded' WHERE id=%s", (cid,))
        print(f"  -> {fname}: 0 rules -> reset to 'uploaded' (can retry upload)")

conn.commit()
conn.close()
print("Done.")
