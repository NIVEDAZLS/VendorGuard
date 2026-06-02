"""
S3 utility — upload, download, read JSON.

When USE_LOCAL_STORAGE=true (default for local dev) all operations
read/write from local_storage/ instead of hitting real AWS S3.

EC2: set USE_LOCAL_STORAGE=false and ensure AWS credentials are configured.
"""

import os
import json
import shutil
from pathlib import Path
from typing import Any

from backend.utils.secrets import get

_LOCAL = get("USE_LOCAL_STORAGE", "true").lower() == "true"
_LOCAL_ROOT = Path(__file__).resolve().parents[2] / "local_storage"


def _local_path(s3_key: str) -> Path:
    p = _LOCAL_ROOT / s3_key
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def upload_file(local_path: str | Path, s3_key: str) -> str:
    """Upload a file. Returns the s3_key (or local path) it was stored at."""
    if _LOCAL:
        dest = _local_path(s3_key)
        if Path(local_path).resolve() != dest.resolve():
            shutil.copy2(str(local_path), dest)
        return s3_key

    # EC2 path
    import boto3
    bucket = get("S3_BUCKET_NAME", "")
    boto3.client("s3").upload_file(str(local_path), bucket, s3_key)
    return s3_key


def download_file(s3_key: str, dest_path: str | Path | None = None) -> Path:
    """Download a file. Returns local Path."""
    if _LOCAL:
        src = _local_path(s3_key)
        if dest_path:
            dest = Path(dest_path)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            return dest
        return src

    import boto3, tempfile
    bucket = get("S3_BUCKET_NAME", "")
    if dest_path is None:
        suffix = Path(s3_key).suffix
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        dest_path = tmp.name
    boto3.client("s3").download_file(bucket, s3_key, str(dest_path))
    return Path(str(dest_path))


def get_json(s3_key: str) -> Any:
    """Read and parse a JSON file from storage."""
    path = download_file(s3_key)
    return json.loads(path.read_text(encoding="utf-8"))


def put_json(data: Any, s3_key: str) -> str:
    """Serialize data to JSON and upload. Returns s3_key."""
    if _LOCAL:
        dest = _local_path(s3_key)
        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return s3_key

    import boto3, json as _json
    bucket = get("S3_BUCKET_NAME", "")
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=_json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    return s3_key


def write_local_json(data: Any, s3_key: str) -> Path:
    """Always write JSON to local_storage regardless of USE_LOCAL_STORAGE flag.
    Ensures a local copy exists even when real S3 is active on EC2."""
    dest = _local_path(s3_key)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return dest
