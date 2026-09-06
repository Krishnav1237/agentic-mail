-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Obligo Rebrand
-- Product rebrand from "IIL" to "Obligo". Updates the persisted comment on the
-- users table only — no schema changes, no data changes, no destructive
-- operations. Safe to re-run (COMMENT ON is idempotent by nature).
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE users IS
  'Obligo users table. trust_proxy is configured via TRUST_PROXY env var (default: 1 for Railway single-hop).';
