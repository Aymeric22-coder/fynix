-- Rollback migration 013
ALTER TABLE instruments DROP COLUMN IF EXISTS valuation_frequency;
DROP TYPE IF EXISTS valuation_frequency;
