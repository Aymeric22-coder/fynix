-- =============================================================
-- Migration 024 — RLS sur signup_errors
-- =============================================================
--
-- Avant : signup_errors n'avait pas RLS active. Combine avec le
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated de la
-- migration 004, n'importe quel utilisateur authentifie pouvait
-- SELECT * FROM signup_errors et lire les error_message des autres
-- utilisateurs (PII potentielle : email, display_name dans SQLERRM).
--
-- Apres : RLS activee, aucune policy SELECT pour authenticated.
-- Seul service_role (qui bypasse RLS) peut lire. Le trigger
-- fn_handle_new_user est SECURITY DEFINER et continue donc d'inserer
-- normalement.
--
-- Rollback : voir 024_signup_errors_rls_DOWN.sql
-- =============================================================

ALTER TABLE public.signup_errors ENABLE ROW LEVEL SECURITY;

-- Aucune policy creee : default deny pour tous les roles. Le
-- service_role bypasse RLS de toute facon, et le trigger
-- SECURITY DEFINER s'execute avec les droits du owner (postgres).

COMMENT ON TABLE public.signup_errors IS
  'Logs des erreurs survenues dans fn_handle_new_user. RLS active sans policy : reserve aux admins via service role uniquement.';
