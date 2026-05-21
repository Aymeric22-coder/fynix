-- =============================================================
-- Migration 039 — transactions.realized_pnl
-- =============================================================
-- Ajoute la colonne `realized_pnl` à la table `transactions`.
-- Cette colonne est écrite par `app/api/portfolio/positions/[id]/route.ts`
-- lors d'une vente, à partir du calcul effectué dans
-- `lib/portfolio/movements.ts` :
--     realized_pnl = (unitPrice − oldPru) × soldQty
-- où `oldPru` est le CUMP roulant (cf. correctif E2).
--
-- Contrainte d'intégrité : seules les transactions de type 'sale'
-- peuvent porter une valeur non nulle. Les achats et les dividendes
-- conservent `realized_pnl = NULL`.
--
-- Rollback : voir 039_transactions_realized_pnl_DOWN.sql
-- =============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(18,2) DEFAULT NULL;

COMMENT ON COLUMN transactions.realized_pnl IS
  'Plus-value réalisée nette en devise de référence au moment de la vente. '
  'Calculée par movements.ts : (unitPrice − oldPru) × soldQty. '
  'NULL pour les achats et les dividendes.';

-- Contrainte d'intégrité : seules les ventes peuvent avoir une valeur non nulle.
-- DO/EXCEPTION rend l'ajout idempotent même sans support de
-- `ADD CONSTRAINT IF NOT EXISTS` (PostgreSQL < 16).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_realized_pnl_sale_only'
       AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_realized_pnl_sale_only
      CHECK (realized_pnl IS NULL OR transaction_type = 'sale');
  END IF;
END
$$;
