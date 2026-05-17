-- =============================================================
-- Migration 021 DOWN — Restaure le trigger fn_handle_new_user
-- a sa version RAISE WARNING + retire signup_errors
-- =============================================================

-- 1. Restaure le trigger version migration 003 (RAISE WARNING)
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
  RAISE WARNING '[fn_handle_new_user] Erreur: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Drop la table signup_errors
DROP INDEX IF EXISTS idx_signup_errors_user_id;
DROP INDEX IF EXISTS idx_signup_errors_created_at;
DROP TABLE IF EXISTS signup_errors;
