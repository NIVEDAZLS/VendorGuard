-- VendorGuard Database Schema
-- Run via: python backend/db/init_db.py

-- ─── Vendors ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    industry        TEXT,
    contact_email   TEXT,
    contact_name    TEXT,
    relationship_owner TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Contracts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    s3_key          TEXT,
    status          TEXT NOT NULL DEFAULT 'uploaded'
                    CHECK (status IN ('uploaded','extracting','extracted','approved')),
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SLA Rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_rules (
    id                  TEXT PRIMARY KEY,
    contract_id         TEXT REFERENCES contracts(id) ON DELETE CASCADE,
    vendor_id           TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    metric_name         TEXT NOT NULL,
    threshold_hours     NUMERIC,
    threshold_unit      TEXT DEFAULT 'hours',
    penalty_type        TEXT CHECK (penalty_type IN ('fixed','percentage','per_unit','none') OR penalty_type IS NULL),
    penalty_value       NUMERIC,
    penalty_cap         NUMERIC,
    exception_clauses   JSONB DEFAULT '[]',
    contract_section    TEXT,
    note                TEXT,
    status              TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Operational Logs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operational_logs (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    external_id     TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Breaches ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS breaches (
    id              TEXT PRIMARY KEY,
    log_id          TEXT REFERENCES operational_logs(id) ON DELETE SET NULL,
    rule_id         TEXT REFERENCES sla_rules(id) ON DELETE SET NULL,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    actual_hours    NUMERIC,
    delay_hours     NUMERIC,
    penalty_amount  NUMERIC DEFAULT 0,
    dispute_status  TEXT DEFAULT 'open'
                    CHECK (dispute_status IN ('open','pending_review','sent','paid','disputed','waived')),
    confidence      INTEGER CHECK (confidence BETWEEN 0 AND 100),
    reasoning       TEXT,
    breached_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit Log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT PRIMARY KEY,
    vendor_id       TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    breach_id       TEXT REFERENCES breaches(id) ON DELETE SET NULL,
    status          TEXT NOT NULL
                    CHECK (status IN ('confirmed','false_alarm','needs_human_review','exception_approved','dispute_sent')),
    confidence      INTEGER,
    reasoning       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Disputes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disputes (
    id              TEXT PRIMARY KEY,
    breach_id       TEXT REFERENCES breaches(id) ON DELETE CASCADE,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    email_subject   TEXT,
    email_body      TEXT,
    status          TEXT DEFAULT 'pending_review'
                    CHECK (status IN ('pending_review','approved','sent','rejected')),
    payment_status  TEXT DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid','paid','partial')),
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Exception Tokens ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exception_tokens (
    id              TEXT PRIMARY KEY,
    log_id          TEXT REFERENCES operational_logs(id) ON DELETE CASCADE,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    token_jwt       TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Exception Requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exception_requests (
    id              TEXT PRIMARY KEY,
    token_id        TEXT NOT NULL REFERENCES exception_tokens(id) ON DELETE CASCADE,
    vendor_id       TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    description     TEXT,
    submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oplogs_vendor_completed
    ON operational_logs (vendor_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_breaches_vendor_status
    ON breaches (vendor_id, dispute_status);

CREATE INDEX IF NOT EXISTS idx_disputes_status
    ON disputes (status);

CREATE INDEX IF NOT EXISTS idx_audit_vendor
    ON audit_log (vendor_id);
