-- =============================================================
-- Migration 021 — Table signup_errors + trigger profil queryable
-- =============================================================
--
-- Avant : si fn_handle_new_user (trigger sur auth.users) echouait, on
-- emettait juste un RAISE WARNING. L'utilisateur etait cree sans profil,
-- et l'erreur disparaissait dans les logs Postgres sans etre queryable
-- depuis l'application.
--
-- Apres : on persiste chaque erreur dans signup_errors. Permet a un admin
-- de diagnostiquer et de retro-creer les profils manquants.
--
-- Rollback : voir 021_signup_errors_DOWN.sql
-- =============================================================

-- 1. Table de logs des erreurs au signup
--    Pas de RLS : table administrative, lecture/ecriture via service role.
--    Aucun user normal ne doit la lire (PII potentielle dans error_message).
CREATE TABLE signup_errors (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  error_message TEXT         NOT NULL,
  sqlstate      TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signup_errors_created_at ON signup_errors(created_at DESC);
CREATE INDEX idx_signup_errors_user_id    ON signup_errors(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE signup_errors IS
  'Logs des erreurs survenues dans fn_handle_new_user. Pas de RLS : reserve aux admins via service role.';

-- 2. Trigger fn_handle_new_user revu : insere dans signup_errors au lieu
--    de RAISE WARNING. Le SECURITY DEFINER + search_path = public assure
--    que l'insert reussit meme dans le contexte trigger sans auth.uid().
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Loggue l'erreur dans signup_errors (queryable) au lieu de RAISE WARNING.
  -- Ne bloque jamais la creation du compte : on retourne NEW et l'admin
  -- pourra retro-creer le profil via un INSERT cible.
  INSERT INTO public.signup_errors (user_id, error_message, sqlstate)
  VALUES (NEW.id, SQLERRM, SQLSTATE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Retro-fill : si des erreurs avaient ete loggees uniquement en
--    RAISE WARNING avant cette migration, elles sont perdues. On ne peut
--    pas les recuperer, mais on peut au moins detecter les users sans
--    profil et inserer un placeholder pour les visibiliser.
INSERT INTO public.signup_errors (user_id, error_message)
SELECT u.id, 'Profile missing detected at migration 021 — created retroactively'
FROM auth.users u
WHERE u.id NOT IN (SELECT id FROM public.profiles);

-- 4. Cree les profils manquants (best-effort, ne bloque pas si echec)
INSERT INTO public.profiles (id, display_name)
SELECT id, email FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
