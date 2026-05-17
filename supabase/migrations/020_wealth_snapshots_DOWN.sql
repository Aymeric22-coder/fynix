-- =============================================================
-- Migration 020 DOWN — Retire la table wealth_snapshots
-- =============================================================

DROP POLICY IF EXISTS "wealth_snapshots_owner_all" ON wealth_snapshots;
DROP INDEX IF EXISTS idx_wealth_snapshots_user_date;
DROP TABLE IF EXISTS wealth_snapshots;
