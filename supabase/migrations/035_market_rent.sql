-- =============================================================
-- Migration 035 — Loyer de marché par lot
-- =============================================================
--
-- Permet de saisir un loyer de marché estimé pour chaque lot
-- locatif. La logique d'insight détecte les biens sous-loués et
-- remonte une alerte ("manque à gagner annuel").
--
-- Rollback : voir 035_market_rent_DOWN.sql
-- =============================================================

ALTER TABLE real_estate_lots
  ADD COLUMN IF NOT EXISTS market_rent NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS market_rent_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN real_estate_lots.market_rent IS
  'Loyer de marche estime (HC mensuel). Saisie manuelle ou estimation externe.';
COMMENT ON COLUMN real_estate_lots.market_rent_updated_at IS
  'Date de derniere mise a jour de l estimation de marche.';
