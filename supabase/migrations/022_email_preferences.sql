-- =============================================================
-- Migration 022 — Préférences email + token unsubscribe
-- =============================================================
--
-- Ajoute 3 colonnes sur profiles pour piloter l'envoi du rapport
-- mensuel par email :
--   - email_monthly_report           : opt-in (défaut true)
--   - email_unsubscribe_token        : token public pour le lien
--                                       de désinscription (UUID)
--   - last_monthly_report_sent_at    : date du dernier envoi
--
-- Le token unsubscribe est utilisé dans un lien public du type :
--   /api/email/unsubscribe?token=<uuid>
-- Pas besoin d'authentification : la connaissance du token suffit
-- (un attaquant aurait besoin d'intercepter l'email pour le récupérer).
-- Régénéré à chaque resubscribe pour invalider les anciens liens.
--
-- Rollback : voir 022_email_preferences_DOWN.sql
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_monthly_report        BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_unsubscribe_token     TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS last_monthly_report_sent_at TIMESTAMPTZ;

-- Index pour la lookup du token unsubscribe (route publique → doit être rapide)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token
  ON profiles (email_unsubscribe_token);

COMMENT ON COLUMN profiles.email_monthly_report IS
  'Opt-in pour le rapport patrimonial mensuel par email. Désactivé via le lien unsubscribe ou depuis /parametres.';

COMMENT ON COLUMN profiles.email_unsubscribe_token IS
  'Token unique utilisé dans le lien public de désinscription email. Régénéré à chaque resubscribe.';

COMMENT ON COLUMN profiles.last_monthly_report_sent_at IS
  'Date du dernier rapport mensuel envoyé avec succès. NULL = jamais envoyé. Utilisé par la cron pour éviter les doublons.';
