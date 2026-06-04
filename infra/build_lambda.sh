#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build_lambda.sh  —  Package VendorGuard backend into lambda_package.zip
#
# Run from the repo root:
#   bash infra/build_lambda.sh
#
# Output:  infra/lambda_package.zip  (referenced by lambdas.tf)
#
# Requirements:
#   - Python 3.12 on PATH  (or adjust PYTHON below)
#   - pip
#   - zip
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PYTHON="${PYTHON:-python3.12}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$REPO_ROOT/.lambda_build"
OUT_ZIP="$REPO_ROOT/infra/lambda_package.zip"

echo "==> Cleaning build dir"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Installing dependencies into build dir"
"$PYTHON" -m pip install \
  --quiet \
  --target "$BUILD_DIR" \
  --requirement "$REPO_ROOT/requirements-lambda.txt"

echo "==> Copying source code"
# Copy backend package (skip __pycache__ and .pyc)
rsync -a --exclude='__pycache__' --exclude='*.pyc' \
  "$REPO_ROOT/backend/" "$BUILD_DIR/backend/"

# Copy scripts needed by seed_logs handler
rsync -a --exclude='__pycache__' --exclude='*.pyc' \
  "$REPO_ROOT/scripts/" "$BUILD_DIR/scripts/"

# Copy operation_logs_genrator (imported by cron_generate_logs)
if [ -f "$REPO_ROOT/operation_logs_genrator.py" ]; then
  cp "$REPO_ROOT/operation_logs_genrator.py" "$BUILD_DIR/"
fi

echo "==> Creating zip  →  $OUT_ZIP"
rm -f "$OUT_ZIP"
(cd "$BUILD_DIR" && zip -r "$OUT_ZIP" . --quiet)

SIZE_MB=$(du -sh "$OUT_ZIP" | cut -f1)
echo "==> Done. Package size: $SIZE_MB  →  $OUT_ZIP"
echo ""
echo "Next steps:"
echo "  cd infra"
echo "  terraform init"
echo "  terraform apply -var='jwt_secret=YOUR_JWT_SECRET' \\"
echo "                  -var='smtp_host=smtp.gmail.com' \\"
echo "                  -var='smtp_user=you@gmail.com' \\"
echo "                  -var='smtp_password=app_password' \\"
echo "                  -var='app_base_url=https://your-app.vercel.app'"
