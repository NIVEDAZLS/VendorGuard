"""
Secrets loader.

Local dev: reads from .env.local via python-dotenv.
EC2:       replace the load_dotenv block below with AWS Secrets Manager calls.

EC2 code path (commented out):
    import boto3, json
    _sm = boto3.client('secretsmanager', region_name=os.environ.get('AWS_REGION','ap-south-1'))
    def _load_secret(name: str) -> dict:
        raw = _sm.get_secret_value(SecretId=name)
        return json.loads(raw['SecretString'])
    _db   = _load_secret('vendorguard/db')
    _apis = _load_secret('vendorguard/api-keys')
    os.environ.setdefault('DB_HOST',         _db['host'])
    os.environ.setdefault('DB_NAME',         _db['dbname'])
    os.environ.setdefault('DB_USER',         _db['username'])
    os.environ.setdefault('DB_PASSWORD',     _db['password'])
    os.environ.setdefault('GEMINI_API_KEY',  _apis['gemini_api_key'])
    os.environ.setdefault('JWT_SECRET',      _apis['jwt_secret'])
"""

import os
from pathlib import Path
from dotenv import load_dotenv

_env = Path(__file__).resolve().parents[2] / ".env.local"
load_dotenv(_env, override=False)


def get(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def require(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        raise EnvironmentError(f"Required env var '{key}' is not set. Add it to .env.local")
    return val
