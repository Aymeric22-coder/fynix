-- =============================================================
-- Migration 023 — Logs d'envoi emails
-- =============================================================
--
-- Trace chaque tentative d'envoi (rapport mensuel pour démarrer,
-- extensible à d'autres types). Permet :
--   - de diagnostiquer les échecs d'envoi (mail invalide, quota...)
--   - de montrer à l'utilisateur l'historique de ses emails
--   - d'éviter les doublons (couplé avec last_monthly_report_sent_at)
--
-- RLS : lecture par le propriétaire uniquement (user_id = auth.uid()).
-- Pas de policy INSERT : seul le service_role (Edge Function +
-- API server-side) peut écrire, ce qui évite tout abus côté client.
--
-- Rollback : voir 023_email_logs_DOWN.sql
-- =============================================================

CREATE TABLE email_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type    TEXT         NOT NULL DEFAULT 'monthly_report',
  sent_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  success       BOOLEAN      NOT NULL,
  error_message TEXT,
  /** ID Resend (utile pour suivre la délivrabilité côté provider). */
  message_id    TEXT
);

CREATE INDEX idx_email_logs_user_sent
  ON email_logs(user_id, sent_at DESC);

CREATE INDEX idx_email_logs_type
  ON email_logs(email_type, sent_at DESC);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_logs_select_own"
  ON email_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Pas de policy INSERT/UPDATE/DELETE → seul le service_role peut écrire.

COMMENT ON TABLE email_logs IS
  'Logs d''envoi des emails (rapport mensuel, etc.). Écriture réservée au service_role.';
