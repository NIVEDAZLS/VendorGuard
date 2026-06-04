# build_lambda.ps1 — Package VendorGuard backend into lambda_package.zip
# Run from repo root:  .\infra\build_lambda.ps1

$ErrorActionPreference = "Stop"

$RepoRoot  = (Get-Item "$PSScriptRoot\..").FullName
$BuildDir  = "$RepoRoot\.lambda_build"
$OutZip    = "$RepoRoot\infra\lambda_package.zip"

Write-Host "==> Cleaning build dir"
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
New-Item -ItemType Directory -Path $BuildDir | Out-Null

Write-Host "==> Installing Python dependencies"
python -m pip install `
    --quiet `
    --target $BuildDir `
    --requirement "$RepoRoot\requirements-lambda.txt"

Write-Host "==> Installing psycopg2 (Linux x86_64 build for Lambda)"
python -m pip install `
    --quiet `
    --target $BuildDir `
    --platform manylinux2014_x86_64 `
    --python-version 3.12 `
    --only-binary=:all: `
    --upgrade `
    "psycopg2-binary>=2.9.9"

Write-Host "==> Copying backend source"
Copy-Item -Recurse -Force "$RepoRoot\backend" "$BuildDir\backend"
Copy-Item -Recurse -Force "$RepoRoot\scripts" "$BuildDir\scripts"

# operation_logs_genrator.py lives in repo root
if (Test-Path "$RepoRoot\operation_logs_genrator.py") {
    Copy-Item "$RepoRoot\operation_logs_genrator.py" "$BuildDir\"
}

# Remove __pycache__ to keep zip small
Get-ChildItem -Recurse -Filter "__pycache__" -Directory $BuildDir |
    Remove-Item -Recurse -Force
Get-ChildItem -Recurse -Filter "*.pyc" $BuildDir |
    Remove-Item -Force

Write-Host "==> Creating zip → $OutZip"
if (Test-Path $OutZip) { Remove-Item $OutZip }
Compress-Archive -Path "$BuildDir\*" -DestinationPath $OutZip

$SizeMB = [math]::Round((Get-Item $OutZip).Length / 1MB, 1)
Write-Host "==> Done. Package size: ${SizeMB} MB → $OutZip"
Write-Host ""
Write-Host "Next: cd infra && terraform init && terraform apply"
