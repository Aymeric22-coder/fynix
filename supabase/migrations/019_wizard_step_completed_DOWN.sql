-- =============================================================
-- Migration 019 DOWN — Retire wizard_step_completed
-- =============================================================

ALTER TABLE profiles
  DROP COLUMN IF EXISTS wizard_step_completed;
