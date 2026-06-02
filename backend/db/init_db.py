"""
Run once to create all tables.
Usage: python backend/db/init_db.py
"""

import os
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

SCHEMA_FILE = Path(__file__).parent / "schema.sql"


def main():
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )

    try:
        with conn.cursor() as cur:
            print("Creating tables...")
            cur.execute(SCHEMA_FILE.read_text())

        conn.commit()
        print("✓ Database initialised — tables created, no seed data.")
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
