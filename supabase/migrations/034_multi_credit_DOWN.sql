-- Rollback migration 034
DROP INDEX IF EXISTS idx_debts_one_principal_per_asset;
ALTER TABLE debts DROP COLUMN IF EXISTS loan_kind;
-- Recrée l'ancienne contrainte 1 crédit actif max par asset
CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_one_active_per_asset
  ON debts (asset_id)
  WHERE status = 'active';
