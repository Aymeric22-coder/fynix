-- =============================================================
-- Rollback de la migration 005 — Module simulation immobilière
-- =============================================================
--
-- À exécuter UNIQUEMENT pour revenir à l'état pré-005.
-- Toutes les valeurs des nouveaux champs seront perdues.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- TABLE debts
-- ─────────────────────────────────────────────────────────────

-- Restore NOT NULL sur les colonnes relâchées en 005
-- Attention : échoue si des lignes ont ces champs à NULL au moment du rollback.
ALTER TABLE debts
  ALTER COLUMN interest_rate   SET NOT NULL,
  ALTER COLUMN duration_months SET NOT NULL,
  ALTER COLUMN start_date      SET NOT NULL;

ALTER TABLE debts
  DROP COLUMN IF EXISTS amortization_type,
  DROP COLUMN IF EXISTS guarantee_fees,
  DROP COLUMN IF EXISTS bank_fees;


-- ─────────────────────────────────────────────────────────────
-- TABLE real_estate_properties
-- ─────────────────────────────────────────────────────────────

ALTER TABLE real_estate_properties
  DROP COLUMN IF EXISTS lmnp_micro_abattement_pct,
  DROP COLUMN IF EXISTS acquisition_fees_treatment,
  DROP COLUMN IF EXISTS lmp_ssi_rate,
  DROP COLUMN IF EXISTS vacancy_months,
  DROP COLUMN IF EXISTS management_pct,
  DROP COLUMN IF EXISTS gli_pct,
  DROP COLUMN IF EXISTS assumed_total_rent,
  DROP COLUMN IF EXISTS furniture_amount,
  DROP COLUMN IF EXISTS amort_furniture_years,
  DROP COLUMN IF EXISTS amort_works_years,
  DROP COLUMN IF EXISTS amort_building_years,
  DROP COLUMN IF EXISTS land_share_pct,
  DROP COLUMN IF EXISTS property_index_pct,
  DROP COLUMN IF EXISTS charges_index_pct,
  DROP COLUMN IF EXISTS rental_index_pct;


-- ─────────────────────────────────────────────────────────────
-- TYPES ENUMS
-- ─────────────────────────────────────────────────────────────
-- Ne pas DROP avant les colonnes (FK implicite des ENUM).

DROP TYPE IF EXISTS amortization_type;
DROP TYPE IF EXISTS acquisition_fees_treatment;


-- ─────────────────────────────────────────────────────────────
-- VÉRIFICATION POST-ROLLBACK
-- ─────────────────────────────────────────────────────────────
-- Pour vérifier que les colonnes ont bien été supprimées :
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'real_estate_properties'
--     AND column_name = 'rental_index_pct';
--   -- (doit renvoyer 0 lignes)
