-- =============================================================
-- FYNIX — Migration 004 : Grants manquants sur les tables publiques
-- Le rôle "authenticated" (utilisateurs connectés) doit avoir
-- les droits CRUD sur toutes les tables du schéma public.
-- =============================================================

-- Droits complets pour les utilisateurs connectés
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Droits complets pour le service role (Edge Functions, crons)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Lecture seule pour le rôle anonyme (tables partagées)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON price_history TO anon;
GRANT SELECT ON market_price_cache TO anon;
GRANT SELECT ON fx_rates TO anon;

-- S'assurer que les futures tables héritent aussi des droits
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
