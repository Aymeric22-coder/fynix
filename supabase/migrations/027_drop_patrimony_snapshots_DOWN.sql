-- =============================================================
-- Rollback migration 027 — Recree patrimony_snapshots (vide)
-- =============================================================
-- ATTENTION : ne restaure PAS les donnees historiques. Si tu rejoues
-- 027 puis ce DOWN, tu perds tout. Le seul moyen de revenir en arriere
-- avec les donnees est de restaurer un backup Supabase.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.patrimony_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date         DATE          NOT NULL,
  total_gross_value     NUMERIC(18,2) NOT NULL,
  total_debt            NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_net_value       NUMERIC(18,2) NOT NULL,
  real_estate_value     NUMERIC(18,2) NOT NULL DEFAULT 0,
  scpi_value            NUMERIC(18,2) NOT NULL DEFAULT 0,
  financial_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_value            NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_value           NUMERIC(18,2) NOT NULL DEFAULT 0,
  monthly_cashflow      NUMERIC(18,2),
  confidence_score      NUMERIC(5,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_date
  ON public.patrimony_snapshots (user_id, snapshot_date DESC);

ALTER TABLE public.patrimony_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_data" ON public.patrimony_snapshots
  FOR ALL TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
