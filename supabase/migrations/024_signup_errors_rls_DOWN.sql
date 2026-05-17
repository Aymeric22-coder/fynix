-- Rollback migration 024
ALTER TABLE public.signup_errors DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.signup_errors IS
  'Logs des erreurs survenues dans fn_handle_new_user. Pas de RLS : reserve aux admins via service role.';
