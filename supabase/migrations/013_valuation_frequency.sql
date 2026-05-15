-- =============================================================
-- Migration 013 — Fréquence de valorisation par instrument
-- =============================================================
--
-- Permet de différencier les actifs selon leur cadence de cotation/valorisation
-- réelle, indispensable pour les fonds non cotés, supports AV, SCPI valorisées
-- trimestriellement, etc.
--
-- Sans cette colonne, le moteur de valorisation considère TOUT prix > 24h
-- comme "stale" — ce qui n'a pas de sens pour un fonds AV qui ne publie
-- qu'une valeur mensuelle.
--
-- Valeurs :
--   - daily     : cotation quotidienne (ETF, action, crypto)
--   - weekly    : cotation hebdomadaire
--   - monthly   : valeur mensuelle (fonds AV typiques, supports pilotés)
--   - quarterly : valeur trimestrielle (certaines SCPI, OPCI)
--   - manual    : saisie manuelle sans rythme imposé (fonds rares,
--                 private equity, crowdfunding immobilier...)
--
-- Conservatif : DEFAULT 'daily' pour ne rien casser sur les instruments
-- existants (tous traités quotidiennement jusqu'ici).
-- =============================================================

CREATE TYPE valuation_frequency AS ENUM (
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'manual'
);

ALTER TABLE instruments
  ADD COLUMN valuation_frequency valuation_frequency NOT NULL DEFAULT 'daily';
