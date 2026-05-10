-- =============================================================
-- Migration 007 DOWN — Rollback Portefeuille universel
-- =============================================================
-- ATTENTION : supprime toutes les données de positions/instruments.
-- À n'exécuter qu'en développement ou en cas de rollback critique.
-- =============================================================

-- 6. Revert ALTER TABLE transactions
ALTER TABLE transactions
  DROP COLUMN IF EXISTS fees,
  DROP COLUMN IF EXISTS unit_price,
  DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS instrument_id,
  DROP COLUMN IF EXISTS position_id;

-- 5. DROP price_providers
DROP TABLE IF EXISTS price_providers;

-- 4. DROP instrument_prices
DROP TABLE IF EXISTS instrument_prices;

-- 3. DROP positions
DROP TABLE IF EXISTS positions;

-- 2. DROP instruments
DROP TABLE IF EXISTS instruments;

-- 1. DROP new ENUMs
DROP TYPE IF EXISTS position_status;
DROP TYPE IF EXISTS asset_class;
