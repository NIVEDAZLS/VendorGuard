"""
VendorGuard FastAPI backend.
Run: PYTHONUNBUFFERED=1 uvicorn backend.api.main:app --reload --port 8000
  or on Windows: set PYTHONUNBUFFERED=1 && uvicorn backend.api.main:app --reload --port 8000
"""

import logging
import sys
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routers import contracts, portfolio, breaches, disputes, audit, vendors, operations, exceptions

# ── logging setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
    force=True,
)
log = logging.getLogger("vendorguard")

app = FastAPI(title="VendorGuard API", version="1.0.0")

import os as _os
_ALLOWED_ORIGINS = [o.strip() for o in _os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3001,https://dev.d3t83ofq8dx3zk.amplifyapp.com"
).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vendors.router,   prefix="/api/vendors",   tags=["vendors"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(breaches.router,  prefix="/api/breaches",  tags=["breaches"])
app.include_router(disputes.router,  prefix="/api/disputes",  tags=["disputes"])
app.include_router(audit.router,      prefix="/api/audit",      tags=["audit"])
app.include_router(operations.router,  prefix="/api/operations",  tags=["operations"])
app.include_router(exceptions.router,  prefix="/api/exceptions",  tags=["exceptions"])


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    log.info("→ %s %s", request.method, request.url.path)
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    log.info("← %s %s  %d  (%.0f ms)", request.method, request.url.path, response.status_code, elapsed)
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "VendorGuard API"}
