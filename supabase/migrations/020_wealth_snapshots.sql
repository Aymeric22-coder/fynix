-- =============================================================
-- Migration 020 — Snapshots quotidiens du patrimoine GLOBAL
-- =============================================================
--
-- Different de `portfolio_snapshots` (migration 011) qui ne couvre
-- QUE le portefeuille financier (positions + instruments). Ici on
-- capture la photo du PATRIMOINE COMPLET — financier + immo + cash
-- + dettes — pour tracer la trajectoire vers FIRE.
--
-- Contraintes :
--   - 1 snapshot par utilisateur par jour (UPSERT sur user_id+date)
--   - Append-only par jour : si plusieurs visites le meme jour, le
--     dernier UPSERT ecrase la ligne (le snapshot le plus recent
--     reflete l'etat de fin de journee).
--
-- Alimente par l'API POST /api/analyse/snapshot, appelee en
-- fire-and-forget cote client a chaque fetch reussi de
-- /api/analyse/patrimoine. Pas de cron necessaire : si l'utilisateur
-- consulte son analyse, le snapshot du jour est cree automatiquement.
--
-- Rollback : voir 020_wealth_snapshots_DOWN.sql
-- =============================================================

CREATE TABLE wealth_snapshots (
  id                       UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date            DATE         NOT NULL,

  -- Valeurs agregees (devise reference EUR)
  patrimoine_brut          NUMERIC(18,2) NOT NULL DEFAULT 0,
  patrimoine_net           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_portefeuille       NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_immo               NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_cash               NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_dettes             NUMERIC(18,2) NOT NULL DEFAULT 0,
  revenu_passif_mensuel    NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Progression FIRE en % du patrimoine net vs cible (revenu × 12 × 25).
  -- NULL si l'utilisateur n'a pas defini de cible.
  progression_fire_pct     NUMERIC(8,4),

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_wealth_snapshot_daily UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_wealth_snapshots_user_date
  ON wealth_snapshots(user_id, snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────
-- RLS : proprietaire only (lecture + ecriture)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE wealth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wealth_snapshots_owner_all"
  ON wealth_snapshots FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE wealth_snapshots IS
  'Photo quotidienne du patrimoine global (financier + immo + cash + dettes). Alimente par /api/analyse/snapshot en fire-and-forget a chaque fetch /api/analyse/patrimoine.';
