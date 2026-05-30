-- =============================================================
-- Migration 047 — Étendre wizard_step_completed à 9 (CS1)
-- =============================================================
--
-- CS1 ajoute une étape 9 « Ta fiscalité » au wizard profil (capture de
-- tmi_rate). On élargit la contrainte CHECK de la colonne
-- wizard_step_completed (créée en migration 019) pour accepter la
-- nouvelle valeur max = 9.
--
-- Rétro-compatibilité :
--   - Profils existants avec wizard_step_completed ∈ [0..8] : conservés
--     tels quels. La migration n'altère AUCUNE donnée.
--   - Profils déjà « terminés » (profile_completed_at NOT NULL) avec
--     wizard_step_completed=8 : restent considérés terminés côté UI
--     (le bandeau de reprise n'apparaît pas — guard `!isComplete`).
--   - La nouvelle étape 9 est SKIPPABLE → un profil pré-CS1 reste
--     parfaitement utilisable sans re-passer dans le wizard.
--
-- Rollback : voir 047_wizard_step_9_DOWN.sql
-- =============================================================

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_wizard_step_completed_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_wizard_step_completed_check
  CHECK (wizard_step_completed >= 0 AND wizard_step_completed <= 9);

COMMENT ON COLUMN profiles.wizard_step_completed IS
  'Derniere etape (0..9) completee dans le wizard. 0 = jamais commence, 9 = wizard termine. Utilise pour proposer "Reprendre a l etape X". CS1 a etendu la borne max de 8 a 9 (ajout etape Fiscalite).';
