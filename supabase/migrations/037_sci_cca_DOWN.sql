-- Rollback migration 037
ALTER TABLE real_estate_properties DROP COLUMN IF EXISTS cca_amount;
