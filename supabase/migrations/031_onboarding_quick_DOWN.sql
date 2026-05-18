-- Migration 031 DOWN — retire les colonnes d'onboarding rapide.
ALTER TABLE profiles
  DROP COLUMN IF EXISTS onboarding_quick_done,
  DROP COLUMN IF EXISTS onboarding_quick_data;
