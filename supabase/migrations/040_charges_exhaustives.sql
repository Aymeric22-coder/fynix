-- =============================================================
-- Migration 040 — Charges immobilières exhaustives
-- =============================================================
-- Ajoute les colonnes manquantes pour couvrir TOUTES les charges
-- standards d'un bien immobilier français. Toutes les colonnes
-- sont nullables avec defaut 0 — rétrocompatible avec l'existant.
--
-- Conventions :
--   - Montants : NUMERIC(10,2) DEFAULT 0
--   - Pourcentages : NUMERIC(5,2) DEFAULT 0
--   - GLI et frais agence : 2 colonnes (eur + pct) — l'UI utilise
--     l'une OU l'autre, le calcul résout à la consommation.
--
-- Rollback : voir 040_charges_exhaustives_DOWN.sql
-- =============================================================

ALTER TABLE property_charges
  -- Taxes locales
  ADD COLUMN IF NOT EXISTS taxe_habitation        NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxe_logements_vacants NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teom                   NUMERIC(10,2) DEFAULT 0,

  -- Assurances (insurance déjà = PNO, conservé)
  ADD COLUMN IF NOT EXISTS insurance_gli_eur      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_gli_pct      NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_mrh          NUMERIC(10,2) DEFAULT 0,

  -- Copropriété (condo_fees déjà = courantes, conservé)
  ADD COLUMN IF NOT EXISTS condo_fees_works       NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condo_special_fund     NUMERIC(10,2) DEFAULT 0,

  -- Gestion locative
  ADD COLUMN IF NOT EXISTS management_agency_eur  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_agency_pct  NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_airbnb_pct  NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_booking_pct NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_cleaning    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_concierge   NUMERIC(10,2) DEFAULT 0,

  -- Travaux & entretien (maintenance déjà = routine, conservé)
  ADD COLUMN IF NOT EXISTS maintenance_major      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repairs_provision      NUMERIC(10,2) DEFAULT 0,

  -- Charges professionnelles (accountant déjà existant)
  ADD COLUMN IF NOT EXISTS legal_fees             NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diagnostics_fees       NUMERIC(10,2) DEFAULT 0,

  -- Abonnements
  ADD COLUMN IF NOT EXISTS utilities_internet     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utilities_electricity  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utilities_water        NUMERIC(10,2) DEFAULT 0,

  -- Note libre liée a "other"
  ADD COLUMN IF NOT EXISTS other_note             TEXT;

COMMENT ON COLUMN property_charges.insurance_gli_eur IS
  'Garantie Loyers Impayes — montant fixe annuel. Exclusif avec insurance_gli_pct.';
COMMENT ON COLUMN property_charges.insurance_gli_pct IS
  'GLI exprimee en % des loyers annuels (typiquement 2,5 a 4 %). '
  'Exclusif avec insurance_gli_eur — si > 0, prevaut sur le montant fixe.';
COMMENT ON COLUMN property_charges.management_agency_pct IS
  'Frais de gestion locative en % des loyers HC (typiquement 6 a 10 %).';
