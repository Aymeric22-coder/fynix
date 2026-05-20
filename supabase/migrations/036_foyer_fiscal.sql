-- =============================================================
-- Migration 036 — Contexte foyer fiscal (LMP detection + QF)
-- =============================================================
-- Ajoute les champs nécessaires à la détection automatique du statut
-- LMP (CGI art. 151 septies) :
--   1. Recettes meublées du foyer > 23 000 €/an
--   2. Recettes meublées > revenus professionnels du foyer
--
-- Les recettes meublées sont sommées côté code (cross-biens).
-- Seuls les revenus professionnels et le nombre de parts fiscales
-- doivent être saisis par l'utilisateur dans son profil.
--
-- Rollback : voir 036_foyer_fiscal_DOWN.sql
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS professional_income_eur NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foyer_fiscal_parts      NUMERIC(4,2)  DEFAULT 1.0;

COMMENT ON COLUMN profiles.professional_income_eur IS
  'Revenus professionnels annuels du foyer (salaires nets imposables, '
  'BNC, BIC pro, pensions). Hors revenus locatifs. Sert a detecter LMP.';
COMMENT ON COLUMN profiles.foyer_fiscal_parts IS
  'Nombre de parts fiscales du foyer (quotient familial).';
