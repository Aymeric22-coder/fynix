-- =============================================================
-- FYNIX — Migration 003 : Correction RLS profiles + trigger robuste
-- Cause racine : la politique "FOR ALL USING (id = auth.uid())"
-- bloque l'INSERT du trigger car auth.uid() est NULL pendant
-- la création d'un utilisateur (pas encore authentifié).
-- =============================================================

-- 1. Recréer fn_update_updated_at au cas où elle manque
CREATE OR REPLACE FUNCTION public.fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Corriger les politiques RLS de profiles
--    La politique ALL bloque les INSERTs du trigger (auth.uid() = NULL à ce moment)
DROP POLICY IF EXISTS "user_own_data" ON public.profiles;

-- SELECT / UPDATE / DELETE : uniquement ses propres données
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (id = auth.uid());

-- INSERT : autorisé sans restriction auth.uid()
-- (le trigger insère au moment où l'utilisateur n'est pas encore "connecté")
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- 3. Recréer le trigger avec gestion d'exception (ne bloque JAMAIS la création)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

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
  -- Loggue l'erreur sans jamais bloquer la création du compte
  RAISE WARNING '[fn_handle_new_user] Erreur: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user();

-- 4. Rétro-remplir les profils des utilisateurs déjà créés sans profil
INSERT INTO public.profiles (id, display_name)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
