-- =============================================================
-- Migration 033 — Ajout du type d'usage sur les biens immobiliers
-- =============================================================
--
-- Permet de distinguer résidence principale / secondaire /
-- investissement locatif (longue ou courte durée) / usage mixte.
-- Le calque UI s'adapte selon la valeur (masquage loyers RP, etc.).
--
-- Tous les biens existants reçoivent par défaut 'long_term_rental'
-- (comportement actuel de la projection).
--
-- Rollback : voir 033_usage_type_DOWN.sql
-- =============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS usage_type TEXT NOT NULL DEFAULT 'long_term_rental'
  CHECK (usage_type IN (
    'primary_residence',
    'secondary_residence',
    'long_term_rental',
    'short_term_rental',
    'mixed_use'
  ));

COMMENT ON COLUMN real_estate_properties.usage_type IS
  'primary_residence=RP, secondary_residence=résidence secondaire, '
  'long_term_rental=locatif longue durée, short_term_rental=saisonnier/Airbnb, '
  'mixed_use=usage mixte.';
