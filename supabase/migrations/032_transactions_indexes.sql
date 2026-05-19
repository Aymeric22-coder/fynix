-- Migration 032 — index manquants sur la table `transactions`.
--
-- Contexte (audit D12) : la table `transactions` (migration 001) avait des
-- index sur (user_id, executed_at), asset_id, debt_id et type. Or depuis la
-- migration 007 (portefeuille universel), les colonnes `position_id` et
-- `instrument_id` sont les principaux discriminants pour les requêtes du
-- portefeuille, et aucune n'avait d'index → scans séquentiels coûteux.
--
-- Idempotent (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_transactions_position_id
  ON public.transactions (position_id)
  WHERE position_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_instrument_id
  ON public.transactions (instrument_id)
  WHERE instrument_id IS NOT NULL;

-- Index composite user + date pour les listings paginés (déjà couvert par
-- idx_txn_user_time = (user_id, executed_at DESC), mais on l'aligne sur le
-- format demandé par l'audit pour rester explicite).
-- Pas de doublon : seulement créé si idx_txn_user_time est absent.
-- (idx_txn_user_time existe depuis 001, on évite ici la duplication.)

ANALYZE public.transactions;
