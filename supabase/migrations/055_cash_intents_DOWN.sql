-- =============================================================================
-- FIRECORE — Migration 055 DOWN : rollback cash_intents
-- =============================================================================
-- Restaure l'état pré-V1.2 : suppression de la table et de l'enum dédié.
-- La fonction `fn_update_updated_at` est conservée — elle est partagée par
-- toutes les tables avec `updated_at` du schéma initial.

DROP TRIGGER  IF EXISTS trg_cash_intents_updated_at ON cash_intents;
DROP TABLE    IF EXISTS cash_intents;
DROP TYPE     IF EXISTS cash_intent_motif;
