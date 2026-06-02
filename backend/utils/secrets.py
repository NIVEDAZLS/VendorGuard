"""
Secrets loader.

Local dev: reads from .env.local via python-dotenv.
EC2:       replace the load_dotenv block below with AWS Secrets Manager calls.
           See backend/docs/deployment.md for the EC2 migration guide.
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
