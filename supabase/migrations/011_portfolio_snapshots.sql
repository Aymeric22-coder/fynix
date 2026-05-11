-- =============================================================
-- Migration 011 — Snapshots historiques du portefeuille
-- =============================================================
--
-- Permet de stocker une photo quotidienne (ou plus frequente) de la
-- valorisation du portefeuille, pour reconstruire la courbe d'evolution
-- et calculer les indicateurs de performance dans le temps (TWR, MWR,
-- drawdown, volatilite).
--
-- Contraintes :
--   - 1 snapshot par utilisateur par jour (UNIQUE user_id+date).
--   - Si plusieurs refresh dans la meme journee, le dernier l'emporte
--     (UPSERT cote backend).
--   - Allocation par classe stockee en JSONB pour flexibilite (les classes
--     peuvent evoluer sans changer le schema).
--
-- Append-only : on ne supprime jamais une ligne. Pour "corriger" un snapshot,
-- on fait un UPSERT qui ecrase la ligne du jour.
--
-- Rollback : voir 011_portfolio_snapshots_DOWN.sql
-- =============================================================

CREATE TABLE portfolio_snapshots (
  id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date       DATE            NOT NULL,
  snapshot_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  -- Agregats principaux (devise de reference)
  total_market_value  NUMERIC(18,2)   NOT NULL DEFAULT 0,
  total_cost_basis    NUMERIC(18,2)   NOT NULL DEFAULT 0,
  total_pnl           NUMERIC(18,2)   NOT NULL DEFAULT 0,
  total_pnl_pct       NUMERIC(8,4),
  -- Comptage
  positions_count     INTEGER         NOT NULL DEFAULT 0,
  valued_count        INTEGER         NOT NULL DEFAULT 0,
  -- Repartition par classe d'actif (JSONB : { "etf": 1234.56, "crypto": 567.89, ... })
  allocation_by_class JSONB           NOT NULL DEFAULT '{}',
  -- Repartition par enveloppe (JSONB : { "<envelope_id>": valeur, "null": valeur })
  allocation_by_envelope JSONB        NOT NULL DEFAULT '{}',
  reference_currency  currency_code   NOT NULL DEFAULT 'EUR',
  -- Source du snapshot : 'cron', 'manual', 'refresh' (auto apres refresh prix)
  source              TEXT            NOT NULL DEFAULT 'manual',
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_portfolio_snapshot_daily UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_portfolio_snapshots_user_date
  ON portfolio_snapshots(user_id, snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────
-- RLS : proprietaire only (lecture + ecriture)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_snapshots_owner_all"
  ON portfolio_snapshots FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
