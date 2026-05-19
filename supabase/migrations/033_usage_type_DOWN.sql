-- Rollback migration 033
ALTER TABLE real_estate_properties DROP COLUMN IF EXISTS usage_type;
