-- =============================================================================
-- DOWN Migration 056 — RPC d'édition / suppression atomique de transactions
-- =============================================================================
drop function if exists public.apply_transaction_mutation(
  uuid, uuid, text, uuid, numeric, numeric, jsonb, jsonb
);
