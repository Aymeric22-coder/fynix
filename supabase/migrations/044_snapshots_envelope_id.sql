-- =============================================================
-- Migration 044 — portfolio_snapshots.envelope_id
-- =============================================================
-- Ajoute le support des snapshots PAR ENVELOPPE au-dessus des
-- snapshots globaux existants. Permet le calcul TWR / MWR par
-- enveloppe (PEA, CTO, AV, PER...) sans casser le pipeline global.
--
-- Coexistence :
--   - envelope_id IS NULL     -> snapshot global du portefeuille entier
--                               (comportement historique, inchange)
--   - envelope_id IS NOT NULL -> snapshot d'une enveloppe specifique
--   Les deux peuvent exister pour la meme date.
--
-- Idempotence (upsert ON CONFLICT) : on utilise une contrainte UNIQUE
-- NULLS NOT DISTINCT (Postgres 15+) sur (user_id, snapshot_date,
-- envelope_id). Cette syntaxe traite les NULL comme egales, donc :
--   - empeche 2 snapshots globaux (NULL) le meme jour
--   - empeche 2 snapshots pour la meme enveloppe le meme jour
--   - et — contrairement aux index uniques partiels — permet a
--     ON CONFLICT (user_id, snapshot_date, envelope_id) de matcher
--     sans clause WHERE explicite (que Supabase JS ne sait pas passer).
--
-- ON DELETE SET NULL : preserve l'historique des snapshots si une
-- enveloppe est supprimee (le snapshot devient un snapshot orphelin
-- mais reste consultable).
--
-- Rollback : voir 044_snapshots_envelope_id_DOWN.sql
-- =============================================================

ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS envelope_id UUID
    REFERENCES financial_envelopes(id) ON DELETE SET NULL
    DEFAULT NULL;

COMMENT ON COLUMN portfolio_snapshots.envelope_id IS
  'NULL = snapshot global du portefeuille entier (comportement historique). '
  'Non-NULL = snapshot d''une enveloppe specifique (PEA, CTO, AV...). '
  'Les deux coexistent pour la meme date. ON DELETE SET NULL pour preserver '
  'l''historique si l''enveloppe est supprimee.';

-- Drop de l'ancienne contrainte (user_id, snapshot_date) seule : elle est
-- desormais trop laxe (autoriserait un global + un par-enveloppe a clasher).
ALTER TABLE portfolio_snapshots
  DROP CONSTRAINT IF EXISTS uq_portfolio_snapshot_daily;

-- Contrainte unique sur (user_id, snapshot_date, envelope_id) avec
-- NULLS NOT DISTINCT : 1 ligne maximum par utilisateur, par jour, par
-- (enveloppe OU global). Compatible avec ON CONFLICT sans WHERE.
-- DO/EXCEPTION rend l'ajout idempotent : sur une DB ou la migration
-- a deja ete partiellement appliquee, on n'echoue pas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_portfolio_snapshot_daily_with_envelope'
       AND conrelid = 'portfolio_snapshots'::regclass
  ) THEN
    ALTER TABLE portfolio_snapshots
      ADD CONSTRAINT uq_portfolio_snapshot_daily_with_envelope
      UNIQUE NULLS NOT DISTINCT (user_id, snapshot_date, envelope_id);
  END IF;
END
$$;

-- Index de requete : lecture des snapshots d'une enveloppe dans le temps
-- (utilise pour le calcul TWR par enveloppe a l'etape 3).
CREATE INDEX IF NOT EXISTS idx_snapshots_envelope_date
  ON portfolio_snapshots (user_id, envelope_id, snapshot_date);
