-- =============================================================================
-- FIRECORE — Migration 031 : Onboarding 60 secondes
-- =============================================================================
-- Ajoute deux colonnes à `profiles` pour tracer l'onboarding rapide :
--   - onboarding_quick_done : sentinel booléen (false = pas encore passé
--     par l'onboarding 60s, true = au moins une saisie via /bienvenue).
--   - onboarding_quick_data : JSON contenant les 3 inputs saisis
--     (age, patrimoineActuel, revenuMensuelNet) pour pré-remplir le
--     wizard /profil si l'utilisateur choisit ensuite d'affiner.
--
-- Note : la consigne du brief indiquait numéro 028, mais 028 (aria_init),
-- 029 (aria_user_insights), 030 (recos_done) sont déjà occupés.
-- On utilise donc 031.
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_quick_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_quick_data jsonb;
