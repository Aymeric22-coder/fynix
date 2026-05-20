-- =============================================================
-- Migration 037 — Compte courant d'associé SCI
-- =============================================================
-- Ajoute le montant des avances en compte courant d'associé (CCA).
-- Le remboursement de CCA est fiscalement neutre (pas d'imposition)
-- — utilisé par computeDividendDistribution pour comparer aux
-- options PFU/barème.
--
-- Rollback : voir 037_sci_cca_DOWN.sql
-- =============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS cca_amount NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN real_estate_properties.cca_amount IS
  'Comptes courants d associes SCI (avances) — leur remboursement '
  'est fiscalement neutre (CGI art. 200 A).';
