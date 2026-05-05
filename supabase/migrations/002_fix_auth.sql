-- =============================================================
-- FYNIX — Migration 002 : Correction auth trigger + table profiles
-- À exécuter dans Supabase SQL Editor si la migration 001 a échoué
-- partiellement et que l'erreur "relation profiles does not exist" apparaît.
-- =============================================================

-- 1. Désactiver temporairement le trigger cassé pour ne pas bloquer
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

-- 2. Créer (ou recréer) la table profiles
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        TEXT,
  reference_currency  TEXT        NOT NULL DEFAULT 'EUR',
  tmi_rate            NUMERIC(5,2),
  fiscal_situation    TEXT CHECK (fiscal_situation IN ('single','married','pacs','divorced','widowed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS sur profiles (au cas où elle vient d'être créée)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'user_own_data'
  ) THEN
    CREATE POLICY "user_own_data" ON profiles
      FOR ALL USING (id = auth.uid());
  END IF;
END;
$$;

-- 4. Trigger updated_at sur profiles (au cas où)
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- 5. Recréer fn_handle_new_user proprement (SECURITY DEFINER pour écrire dans profiles)
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;   -- idempotent : ne plante pas si profil existe déjà
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Recréer le trigger sur auth.users
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

-- 7. Rétro-remplir les profils des utilisateurs déjà créés (si besoin)
INSERT INTO public.profiles (id, display_name)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
