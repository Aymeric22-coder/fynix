-- =============================================================
-- Migration 023 DOWN — Retire la table email_logs
-- =============================================================

DROP POLICY IF EXISTS "email_logs_select_own" ON email_logs;
DROP INDEX IF EXISTS idx_email_logs_type;
DROP INDEX IF EXISTS idx_email_logs_user_sent;
DROP TABLE IF EXISTS email_logs;
