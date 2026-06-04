"""
Lambda handler — vg-pre-breach
Triggered by EventBridge every 15 minutes.

Scans in-progress logs at ≥80% SLA elapsed → sends warning email + magic link.
Credentials from AWS SSM Parameter Store (free tier).
"""

import json
import os

import boto3


def _load_ssm():
    region = os.environ.get("VG_AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "ap-south-1")
    ssm = boto3.client("ssm", region_name=region)
    prefix = os.environ.get("SSM_PREFIX", "/vendorguard")
    names = [
        f"{prefix}/db_host",
        f"{prefix}/db_port",
        f"{prefix}/db_name",
        f"{prefix}/db_user",
        f"{prefix}/db_password",
    ]
    resp = ssm.get_parameters(Names=names, WithDecryption=True)
    params = {p["Name"].split("/")[-1]: p["Value"] for p in resp["Parameters"]}
    os.environ["DB_HOST"]     = params["db_host"]
    os.environ["DB_PORT"]     = params.get("db_port", "5432")
    os.environ["DB_NAME"]     = params["db_name"]
    os.environ["DB_USER"]     = params["db_user"]
    os.environ["DB_PASSWORD"] = params["db_password"]


_load_ssm()

from backend.jobs.pre_breach import _run_job  # noqa: E402


def handler(event, context):
    try:
        _run_job()
        return {"status": "ok"}
    except Exception as exc:
        print(f"[pre_breach lambda] ERROR: {exc}")
        raise
