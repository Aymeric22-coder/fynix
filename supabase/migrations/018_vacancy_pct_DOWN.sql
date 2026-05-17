-- Rollback migration 018 — Supprime vacancy_pct sur real_estate_properties.
-- ATTENTION : destructive — les taux de vacance saisis seront perdus.

ALTER TABLE real_estate_properties
  DROP COLUMN IF EXISTS vacancy_pct;
