"""
One-time migration: reconcile vendor_id values across vendors, contracts, and sla_rules tables.

For the three demo vendors, canonical IDs are:
  eLogix Logistics Pvt. Ltd.            → VND-EL-001
  FreshRoute Logistics & Distribution   → VND-FR-001
  Cisco (Hub Operator)                  → VND-CS-001

Any row in contracts or sla_rules pointing to a non-canonical vendor_id that
matches one of those names is updated to the canonical ID.

Prints a reconciliation table before and after so you can verify.

Usage:
    python scripts/migrate_vendor_names.py
    python scripts/migrate_vendor_names.py --dry-run
"""

import argparse
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env.local")


CANONICAL_MAP = {
    "elogix":     "VND-EL-001",
    "freshroute": "VND-FR-001",
    "cisco":      "VND-CS-001",
}


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def canonical_id_for(vendor_name: str) -> str | None:
    name_lower = vendor_name.lower()
    for keyword, canon_id in CANONICAL_MAP.items():
        if keyword in name_lower:
            return canon_id
    return None


def print_table(rows: list[dict], title: str):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")
    fmt = "{:<20} {:<35} {:>8} {:>8}"
    print(fmt.format("vendor_id", "vendor_name", "rules", "logs"))
    print("-" * 70)
    for r in rows:
        print(fmt.format(r["id"][:20], r["name"][:35], r["rule_count"], r["log_count"]))
    print()


def fetch_summary(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                v.id,
                v.name,
                (SELECT COUNT(*) FROM sla_rules sr WHERE sr.vendor_id = v.id) AS rule_count,
                (SELECT COUNT(*) FROM operational_logs ol WHERE ol.vendor_id = v.id) AS log_count
            FROM vendors v
            ORDER BY v.name
            """
        )
        return [dict(r) for r in cur.fetchall()]


def main():
    parser = argparse.ArgumentParser(description="Reconcile vendor IDs")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without making changes")
    args = parser.parse_args()

    conn = get_conn()

    before = fetch_summary(conn)
    print_table(before, "BEFORE: Vendor ID Reconciliation")

    # Find all vendor rows that have a canonical name but wrong ID
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM vendors")
        all_vendors = [dict(r) for r in cur.fetchall()]

    migrations: list[tuple[str, str, str]] = []  # (wrong_id, canonical_id, name)
    for v in all_vendors:
        canon = canonical_id_for(v["name"])
        if canon and v["id"] != canon:
            migrations.append((v["id"], canon, v["name"]))

    if not migrations:
        print("No vendor ID mismatches found. Nothing to migrate.")
        conn.close()
        return

    print(f"Found {len(migrations)} vendor(s) to reconcile:")
    for wrong_id, canon_id, name in migrations:
        print(f"  '{name}': {wrong_id} → {canon_id}")

    if args.dry_run:
        print("\n[dry-run] No changes made.")
        conn.close()
        return

    with conn.cursor() as cur:
        for wrong_id, canon_id, name in migrations:
            # Ensure canonical vendor row exists (insert if missing)
            cur.execute(
                """
                INSERT INTO vendors (id, name, industry, contact_email, contact_name, relationship_owner)
                SELECT %s, name, industry, contact_email, contact_name, relationship_owner
                FROM vendors WHERE id = %s
                ON CONFLICT (id) DO NOTHING
                """,
                (canon_id, wrong_id),
            )

            # Migrate sla_rules
            cur.execute(
                "UPDATE sla_rules SET vendor_id = %s WHERE vendor_id = %s",
                (canon_id, wrong_id),
            )
            print(f"  [sla_rules] {wrong_id} → {canon_id}: {cur.rowcount} rows updated")

            # Migrate contracts
            cur.execute(
                "UPDATE contracts SET vendor_id = %s WHERE vendor_id = %s",
                (canon_id, wrong_id),
            )
            print(f"  [contracts] {wrong_id} → {canon_id}: {cur.rowcount} rows updated")

            # Do NOT touch operational_logs — already seeded with canonical IDs

            # Remove the old non-canonical vendor row (cascade or manual)
            cur.execute("DELETE FROM vendors WHERE id = %s", (wrong_id,))
            print(f"  [vendors]   Removed stale vendor row {wrong_id}")

    conn.commit()

    after = fetch_summary(conn)
    print_table(after, "AFTER: Vendor ID Reconciliation")

    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()
