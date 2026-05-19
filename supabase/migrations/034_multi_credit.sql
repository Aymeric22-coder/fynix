-- =============================================================
-- Migration 034 — Multi-crédit par bien immobilier
-- =============================================================
--
-- L'index UNIQUE posé en migration 006 empêchait d'avoir plusieurs
-- crédits actifs sur un même asset. Or il est fréquent qu'un
-- investisseur cumule : prêt principal amortissable + PTZ + prêt
-- travaux. Cette contrainte faussait toutes les projections.
--
-- - Drop de l'index unique partiel
-- - Ajout d'une colonne `loan_kind` (TEXT enum) pour distinguer
--   le type de crédit. Défaut 'principal' pour rétro-compat.
--
-- Rollback : voir 034_multi_credit_DOWN.sql
-- =============================================================

DROP INDEX IF EXISTS idx_debts_one_active_per_asset;

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS loan_kind TEXT NOT NULL DEFAULT 'principal'
  CHECK (loan_kind IN (
    'principal',
    'ptz',
    'travaux',
    'pel',
    'action_logement',
    'relais',
    'in_fine',
    'autre'
  ));

COMMENT ON COLUMN debts.loan_kind IS
  'Type de prêt (principal / PTZ / travaux / PEL / Action Logement / '
  'relais / in fine / autre). Permet de distinguer plusieurs crédits '
  'actifs sur un même bien.';

-- Optionnel : un seul prêt principal actif par bien (les autres types
-- restent libres). Évite les doubles saisies par erreur sans bloquer
-- les cumuls légitimes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_one_principal_per_asset
  ON debts (asset_id)
  WHERE status = 'active' AND loan_kind = 'principal';
