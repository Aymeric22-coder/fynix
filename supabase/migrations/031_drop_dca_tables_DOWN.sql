-- DOWN migration 031 — recrée des tables `dca_plans` / `dca_occurrences`
-- minimalistes (squelette permettant le rollback du schéma sans casser).
-- Note : les données ne sont PAS restaurées (feature jamais activée,
-- aucune donnée n'existait en prod).

CREATE TABLE IF NOT EXISTS public.dca_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id    uuid,
  envelope_id uuid,
  name        text,
  ticker      text,
  amount_per_period numeric,
  currency    text,
  frequency   text,
  start_date  date,
  end_date    date,
  is_active   boolean DEFAULT true,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dca_occurrences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dca_plan_id     uuid REFERENCES public.dca_plans(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date  date,
  planned_amount  numeric,
  actual_amount   numeric,
  actual_price    numeric,
  actual_quantity numeric,
  status          text DEFAULT 'pending',
  validated_at    timestamptz,
  transaction_id  uuid,
  deviation_note  text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.dca_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_occurrences ENABLE ROW LEVEL SECURITY;
