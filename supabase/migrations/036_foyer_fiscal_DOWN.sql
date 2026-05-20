-- Rollback migration 036
ALTER TABLE profiles
  DROP COLUMN IF EXISTS professional_income_eur,
  DROP COLUMN IF EXISTS foyer_fiscal_parts;
