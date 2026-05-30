-- =============================================================
-- Migration 050 — Wizard Step 10 « Projets de vie » (CS5)
-- =============================================================
--
-- CS5 ajoute une étape 10 au wizard profil pour capturer les évènements
-- de vie (cf. table life_events, migration 049). On élargit la contrainte
-- CHECK de wizard_step_completed pour accepter 10, et on ajoute la colonne
-- `proprietaire_rp_status` qui pilote l'affichage du sous-bloc Achat RP
-- dans Step10.
--
-- Pattern miroir de 047_wizard_step_9.sql.
--
-- Rétro-compatibilité :
--   - Profils existants avec wizard_step_completed ∈ [0..9] : conservés.
--   - Profils déjà « terminés » (profile_completed_at NOT NULL) avec
--     wizard_step_completed=9 : restent considérés terminés côté UI.
--   - La nouvelle étape 10 est SKIPPABLE → un profil pré-CS5 reste
--     parfaitement utilisable sans repasser dans le wizard.
--   - `proprietaire_rp_status` NULL par défaut → bloc Achat RP affiché
--     en mode "question initiale" pour les profils pré-CS5.
--
-- Rollback : voir 050_wizard_step_10_DOWN.sql
-- =============================================================

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_wizard_step_completed_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_wizard_step_completed_check
  CHECK (wizard_step_completed >= 0 AND wizard_step_completed <= 10);

COMMENT ON COLUMN profiles.wizard_step_completed IS
  'Derniere etape (0..10) completee dans le wizard. 0 = jamais commence, 10 = wizard termine. CS5 a etendu la borne max de 9 a 10 (ajout etape Projets de vie).';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS proprietaire_rp_status text NULL
  CHECK (proprietaire_rp_status IS NULL OR proprietaire_rp_status IN (
    'oui_actuel',
    'non_prevu',
    'non_pas_prevu'
  ));

COMMENT ON COLUMN profiles.proprietaire_rp_status IS
  'CS5 — Statut proprietaire de la residence principale. NULL = pas encore repondu. oui_actuel = deja proprietaire (bloc Achat RP masque). non_prevu = pas proprietaire mais achat prevu (bloc Achat RP affiche). non_pas_prevu = pas proprietaire et pas d achat prevu (bloc masque).';
