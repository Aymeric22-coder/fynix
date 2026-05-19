-- DOWN migration 032 — supprime les index ajoutés.

DROP INDEX IF EXISTS public.idx_transactions_position_id;
DROP INDEX IF EXISTS public.idx_transactions_instrument_id;
