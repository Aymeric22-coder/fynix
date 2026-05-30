-- =============================================================
-- Migration 050 — Rollback (DOWN)
-- =============================================================

-- Reset des profils déjà à 10 (les ramener à 9 pour respecter le CHECK).
UPDATE profiles
   SET wizard_step_completed = 9
 WHERE wizard_step_completed = 10;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_wizard_step_completed_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_wizard_step_completed_check
  CHECK (wizard_step_completed >= 0 AND wizard_step_completed <= 9);

ALTER TABLE profiles
  DROP COLUMN IF EXISTS proprietaire_rp_status;
