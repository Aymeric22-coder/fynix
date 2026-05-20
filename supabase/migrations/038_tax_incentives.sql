-- =============================================================
-- Migration 038 — Dispositifs fiscaux incitatifs
-- =============================================================
-- Table 1-N : un bien peut avoir 1 (ou 0) dispositif actif.
-- Couvre Pinel/Pinel+, Denormandie, Malraux, MH, Loc'Avantages,
-- Censi-Bouvard. Les colonnes spécifiques sont nullables et
-- utilisées selon le `kind`.
--
-- Rollback : voir 038_tax_incentives_DOWN.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS property_tax_incentives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES real_estate_properties(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN (
                    'pinel', 'pinel_plus', 'denormandie',
                    'malraux', 'monuments_historiques',
                    'loc_avantages', 'censi_bouvard'
                  )),

  -- Pinel / Pinel+ / Denormandie
  duration_years     INT CHECK (duration_years IN (6, 9, 12)),
  zone               TEXT CHECK (zone IS NULL OR zone IN ('A_bis','A','B1','B2','C')),
  start_year         INT,
  rent_cap_monthly   NUMERIC(10,2),
  is_pinel_plus      BOOLEAN DEFAULT FALSE,

  -- Denormandie spécifique
  works_amount       NUMERIC(12,2),

  -- Malraux / MH
  classification     TEXT,
  occupancy          TEXT,
  works_start_year   INT,
  works_end_year     INT,
  conservation_end_year INT,
  reduction_rate_pct NUMERIC(5,2),

  -- Loc'Avantages
  convention_type    TEXT CHECK (convention_type IS NULL OR convention_type IN ('loc1','loc2','loc3')),
  convention_start   DATE,
  convention_end     DATE,
  market_rent_annual NUMERIC(12,2),

  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_incentives_property
  ON property_tax_incentives(property_id);

-- 1 seul dispositif actif par bien (l'UI peut historiser plus tard)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_incentives_one_per_property
  ON property_tax_incentives(property_id);

ALTER TABLE property_tax_incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_data" ON property_tax_incentives
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE property_tax_incentives IS
  'Dispositifs de defiscalisation lies aux biens (Pinel, Denormandie, '
  'Malraux, Monuments Historiques, Loc Avantages, Censi-Bouvard).';
