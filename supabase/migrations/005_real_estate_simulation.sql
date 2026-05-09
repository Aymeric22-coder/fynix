-- =============================================================
-- Migration 005 — Module simulation immobilière (Phase 1)
-- =============================================================
--
-- Ajoute les paramètres nécessaires à la simulation/projection sur les biens
-- immobiliers et leurs crédits associés.
--
-- Tous les nouveaux champs sont :
--   - NULLABLE quand la valeur n'a de sens que dans un contexte précis
--   - avec DEFAULT pertinent quand un fallback raisonnable existe
--
-- Les biens et crédits existants ne sont JAMAIS cassés par cette migration :
--   - Aucune contrainte NOT NULL ajoutée sur des données existantes
--   - Aucun renommage / suppression
--   - L'ENUM `fiscal_regime` est déjà aligné avec les 7 régimes (migration 001)
--
-- Rollback : voir 005_real_estate_simulation_DOWN.sql
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- TYPES ENUMS
-- ─────────────────────────────────────────────────────────────

-- Traitement fiscal des frais d'acquisition (notaire + bancaires + garantie)
-- pour les régimes "réels" (sci_is, lmnp_reel, lmp). Ignoré pour les autres.
CREATE TYPE acquisition_fees_treatment AS ENUM (
  'expense_y1',   -- passés en charges année 1 (déficit reportable). Choix par défaut.
  'amortized'     -- intégrés au coût d'acquisition et amortis sur la durée du bâti.
);

-- Type d'amortissement du prêt. Phase 1 : seul 'constant' est calculé,
-- les autres valeurs sont acceptées pour évolutions futures (Phase 2+).
CREATE TYPE amortization_type AS ENUM (
  'constant',     -- échéances constantes (PMT classique)
  'linear',       -- amortissement linéaire (capital constant)
  'in_fine'       -- in fine (intérêts seulement, capital remboursé à la fin)
);


-- ─────────────────────────────────────────────────────────────
-- TABLE real_estate_properties
-- ─────────────────────────────────────────────────────────────
--
-- Ajoute les paramètres de simulation. Tous nullable / avec defaults.
--

ALTER TABLE real_estate_properties
  -- Indexations annuelles (en pourcentage, ex: 2.0 = 2%)
  ADD COLUMN rental_index_pct       NUMERIC(5,2)  NOT NULL DEFAULT 2.0,
  ADD COLUMN charges_index_pct      NUMERIC(5,2)  NOT NULL DEFAULT 2.0,
  ADD COLUMN property_index_pct     NUMERIC(5,2)  NOT NULL DEFAULT 1.0,

  -- Paramètres d'amortissement comptable (régimes réels)
  ADD COLUMN land_share_pct         NUMERIC(5,2)  NOT NULL DEFAULT 15.0,
  ADD COLUMN amort_building_years   INTEGER       NOT NULL DEFAULT 30
    CHECK (amort_building_years > 0 AND amort_building_years <= 50),
  ADD COLUMN amort_works_years      INTEGER       NOT NULL DEFAULT 15
    CHECK (amort_works_years > 0 AND amort_works_years <= 30),
  ADD COLUMN amort_furniture_years  INTEGER       NOT NULL DEFAULT 7
    CHECK (amort_furniture_years > 0 AND amort_furniture_years <= 15),

  -- Mobilier amortissable (LMNP / LMP). Distinct de works_amount.
  ADD COLUMN furniture_amount       NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (furniture_amount >= 0),

  -- Hypothèse de loyer total agrégé. NULL = fallback sur la somme des lots.
  ADD COLUMN assumed_total_rent     NUMERIC(18,2)
    CHECK (assumed_total_rent IS NULL OR assumed_total_rent >= 0),

  -- Hypothèses fiscales transverses
  ADD COLUMN gli_pct                NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN management_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN vacancy_months         NUMERIC(4,2)  NOT NULL DEFAULT 0
    CHECK (vacancy_months >= 0 AND vacancy_months <= 12),
  ADD COLUMN lmp_ssi_rate           NUMERIC(5,2)  NOT NULL DEFAULT 35.0
    CHECK (lmp_ssi_rate >= 0 AND lmp_ssi_rate <= 60),

  -- Traitement des frais d'acquisition (uniquement régimes réels)
  ADD COLUMN acquisition_fees_treatment acquisition_fees_treatment
    NOT NULL DEFAULT 'expense_y1',

  -- Abattement micro-BIC (50 % standard, 71 % meublé tourisme classé).
  -- Utilisé uniquement si fiscal_regime = 'lmnp_micro'.
  ADD COLUMN lmnp_micro_abattement_pct NUMERIC(5,2) NOT NULL DEFAULT 50
    CHECK (lmnp_micro_abattement_pct IN (50, 71));

COMMENT ON COLUMN real_estate_properties.assumed_total_rent IS
  'Override optionnel de la somme des lots.rent_amount. NULL = utiliser la somme des lots.';
COMMENT ON COLUMN real_estate_properties.furniture_amount IS
  'Montant du mobilier amortissable, distinct de works_amount. LMNP/LMP uniquement.';
COMMENT ON COLUMN real_estate_properties.lmp_ssi_rate IS
  'Taux indicatif des cotisations SSI (LMP). Variable selon situation, défaut 35 %.';
COMMENT ON COLUMN real_estate_properties.acquisition_fees_treatment IS
  'Traitement fiscal des frais d''acquisition. Pertinent pour sci_is, lmnp_reel, lmp uniquement.';


-- ─────────────────────────────────────────────────────────────
-- TABLE debts
-- ─────────────────────────────────────────────────────────────
--
-- L'essentiel des champs nécessaires existe déjà :
--   start_date, interest_rate, insurance_rate, duration_months, initial_amount
--
-- On ajoute uniquement les frais bancaires et le type d'amortissement.
--

ALTER TABLE debts
  ADD COLUMN bank_fees         NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (bank_fees >= 0),
  ADD COLUMN guarantee_fees    NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (guarantee_fees >= 0),
  ADD COLUMN amortization_type amortization_type NOT NULL DEFAULT 'constant';

COMMENT ON COLUMN debts.bank_fees IS
  'Frais de dossier bancaire payés à la souscription. Compte dans le coût total opération.';
COMMENT ON COLUMN debts.guarantee_fees IS
  'Frais de garantie (hypothèque, caution, PPD). Compte dans le coût total opération.';
COMMENT ON COLUMN debts.amortization_type IS
  'Type d''amortissement du prêt. Phase 1 : seul ''constant'' est calculé.';


-- ─────────────────────────────────────────────────────────────
-- VÉRIFICATION POST-MIGRATION (commentaires informatifs)
-- ─────────────────────────────────────────────────────────────
-- Pour vérifier après application :
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'real_estate_properties'
--     AND column_name IN (
--       'rental_index_pct','charges_index_pct','property_index_pct',
--       'land_share_pct','amort_building_years','amort_works_years',
--       'amort_furniture_years','furniture_amount','assumed_total_rent',
--       'gli_pct','management_pct','vacancy_months','lmp_ssi_rate',
--       'acquisition_fees_treatment','lmnp_micro_abattement_pct'
--     );
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'debts'
--     AND column_name IN ('bank_fees','guarantee_fees','amortization_type');
