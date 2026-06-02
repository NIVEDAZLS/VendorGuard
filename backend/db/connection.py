"""
Database connection pool.

Local: reads credentials from .env.local via python-dotenv.
EC2:   swap the load_dotenv block below with:
       import boto3, json
       secret = boto3.client('secretsmanager').get_secret_value(SecretId='vendorguard/db')
       creds  = json.loads(secret['SecretString'])
       and use creds['host'], creds['dbname'], etc.
"""

import os
from pathlib import Path
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

# ── Local dev: load .env.local from repo root ─────────────────────────────
_env_file = Path(__file__).resolve().parents[2] / ".env.local"
load_dotenv(_env_file)

_pool: pool.SimpleConnectionPool | None = None


def _get_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            host=os.environ["DB_HOST"],
            port=int(os.environ.get("DB_PORT", 5432)),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
        )
    return _pool


def get_conn() -> psycopg2.extensions.connection:
    return _get_pool().getconn()


def release_conn(conn: psycopg2.extensions.connection) -> None:
    _get_pool().putconn(conn)


class DBConn:
    """Context manager: auto-commits and releases connection."""

    def __enter__(self) -> psycopg2.extensions.connection:
        self._conn = get_conn()
        return self._conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        release_conn(self._conn)
        return False
