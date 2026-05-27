-- =============================================================
-- DOWN — Migration 044 — portfolio_snapshots.envelope_id
-- =============================================================
-- ATTENTION : si l'etape 2 a deja insere des snapshots par enveloppe,
-- ce rollback va :
--   1) Supprimer la colonne envelope_id et tous les snapshots
--      par-enveloppe deviendront indistinguables des globaux.
--   2) La recreation de uq_portfolio_snapshot_daily ECHOUERA tant
--      qu'il existe plusieurs lignes (user_id, snapshot_date) — ce
--      qui sera precisement le cas. Il faut donc d'abord nettoyer :
--          DELETE FROM portfolio_snapshots WHERE envelope_id IS NOT NULL;
--      avant d'appliquer ce rollback.
-- =============================================================

-- Index de requete
DROP INDEX IF EXISTS idx_snapshots_envelope_date;

-- Contrainte unique avec envelope_id (NULLS NOT DISTINCT) introduite par 044
ALTER TABLE portfolio_snapshots
  DROP CONSTRAINT IF EXISTS uq_portfolio_snapshot_daily_with_envelope;

-- Colonne envelope_id (et sa FK financial_envelopes via ON DELETE SET NULL)
ALTER TABLE portfolio_snapshots
  DROP COLUMN IF EXISTS envelope_id;

-- Restoration de la contrainte UNIQUE historique
ALTER TABLE portfolio_snapshots
  ADD CONSTRAINT uq_portfolio_snapshot_daily
  UNIQUE (user_id, snapshot_date);
