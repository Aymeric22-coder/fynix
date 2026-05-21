-- =============================================================
-- DOWN — Migration 039 — transactions.realized_pnl
-- =============================================================
-- Rollback de l'ajout de la colonne `realized_pnl` sur `transactions`.
-- =============================================================

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_realized_pnl_sale_only;

ALTER TABLE transactions
  DROP COLUMN IF EXISTS realized_pnl;
