-- =============================================================
-- Rollback migration 033 — supprime l'index unique partiel
-- sur transactions.external_ref.
-- =============================================================
DROP INDEX IF EXISTS public.idx_transactions_user_external_ref_unique;
