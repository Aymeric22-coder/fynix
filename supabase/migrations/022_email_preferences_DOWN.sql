-- =============================================================
-- Migration 022 DOWN — Retire les préférences email
-- =============================================================

DROP INDEX IF EXISTS idx_profiles_unsubscribe_token;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS email_monthly_report,
  DROP COLUMN IF EXISTS email_unsubscribe_token,
  DROP COLUMN IF EXISTS last_monthly_report_sent_at;
