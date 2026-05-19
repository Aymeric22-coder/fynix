-- Rollback migration 035
ALTER TABLE real_estate_lots
  DROP COLUMN IF EXISTS market_rent,
  DROP COLUMN IF EXISTS market_rent_updated_at;
