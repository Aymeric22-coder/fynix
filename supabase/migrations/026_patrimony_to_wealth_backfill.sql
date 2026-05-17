-- =============================================================
-- Migration 026 — Backfill patrimony_snapshots → wealth_snapshots
-- =============================================================
--
-- Avant : la table legacy `patrimony_snapshots` (migration 001) cohabitait
-- avec `wealth_snapshots` (migration 020) qui contient les memes infos
-- agregees. Le dashboard et l'Edge Function cron tournaient encore sur
-- l'ancienne table.
--
-- Apres : on copie l'historique des `patrimony_snapshots` vers
-- `wealth_snapshots` AVANT de supprimer la table (migration 027).
-- Idempotent : ON CONFLICT (user_id, snapshot_date) DO NOTHING.
--
-- Mapping :
--   total_gross_value   → patrimoine_brut
--   total_net_value     → patrimoine_net
--   total_debt          → total_dettes
--   real_estate_value   → total_immo
--   financial_value     → total_portefeuille
--   cash_value          → total_cash
--
-- Donnees PERDUES (non present dans wealth_snapshots) :
--   - monthly_cashflow  : recalcule par /api/analyse/snapshot a la
--                         prochaine visite — pas critique.
--   - confidence_score  : recalcule a la volee dans /api/dashboard
--                         depuis assets.confidence — deja le cas avant.
--   - scpi_value, other_value, notes : usage marginal, abandonne.
--
-- Rollback : voir 026_patrimony_to_wealth_backfill_DOWN.sql
-- =============================================================

INSERT INTO public.wealth_snapshots (
  user_id,
  snapshot_date,
  patrimoine_brut,
  patrimoine_net,
  total_portefeuille,
  total_immo,
  total_cash,
  total_dettes,
  revenu_passif_mensuel,
  progression_fire_pct,
  created_at
)
SELECT
  ps.user_id,
  ps.snapshot_date,
  COALESCE(ps.total_gross_value, 0),
  COALESCE(ps.total_net_value,   0),
  COALESCE(ps.financial_value,   0),
  COALESCE(ps.real_estate_value, 0) + COALESCE(ps.scpi_value, 0),
  COALESCE(ps.cash_value,        0),
  COALESCE(ps.total_debt,        0),
  -- revenu_passif_mensuel : pas de mapping direct, on stocke 0.
  -- Sera recalcule a la prochaine visite (POST /api/analyse/snapshot).
  0,
  -- progression_fire_pct : idem, recalculee.
  NULL,
  ps.created_at
FROM public.patrimony_snapshots ps
WHERE ps.user_id IS NOT NULL
ON CONFLICT (user_id, snapshot_date) DO NOTHING;

-- Verification post-migration (info, ne plante pas) :
-- SELECT
--   (SELECT COUNT(*) FROM patrimony_snapshots) AS legacy_count,
--   (SELECT COUNT(*) FROM wealth_snapshots)    AS new_count;

COMMENT ON TABLE public.wealth_snapshots IS
  'Photo quotidienne du patrimoine global (financier + immo + cash + dettes). Alimente par /api/analyse/snapshot. Backfill historique depuis patrimony_snapshots fait en migration 026.';
