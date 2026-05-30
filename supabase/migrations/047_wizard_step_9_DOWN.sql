-- =============================================================
-- DOWN — Migration 047 — Restore wizard_step_completed CHECK <= 8
-- =============================================================
--
-- ⚠️  Avant de rollback : tous les profils avec
-- wizard_step_completed=9 doivent être ramenés à 8 sinon le CHECK
-- restauré rejette la donnée existante.
--
--   UPDATE profiles SET wizard_step_completed = 8
--   WHERE wizard_step_completed = 9;
--
-- (Sémantique : on considère qu'un profil arrivé à l'étape 9
-- post-CS1 est équivalent à un profil arrivé à l'étape 8 pré-CS1.)
-- =============================================================

UPDATE profiles SET wizard_step_completed = 8 WHERE wizard_step_completed = 9;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_wizard_step_completed_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_wizard_step_completed_check
  CHECK (wizard_step_completed >= 0 AND wizard_step_completed <= 8);

COMMENT ON COLUMN profiles.wizard_step_completed IS
  'Derniere etape (0..8) completee dans le wizard. 0 = jamais commence, 8 = wizard termine. Utilise pour proposer "Reprendre a l etape X".';
