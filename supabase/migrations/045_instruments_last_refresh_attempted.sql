-- =============================================================
-- Migration 045 — instruments.last_refresh_attempted_at
-- =============================================================
-- Ajoute un horodatage de la derniere TENTATIVE de refresh des prix
-- (succes, skip ou echec — toute traversee de la boucle de fetch).
--
-- Distinction importante :
--   - `instrument_prices.priced_at` = date de validite MARCHE du prix
--     (par exemple latestQuoteDate retourne par JustETF, qui peut etre
--     ancien pour un ETF synthetique a NAV lente)
--   - `instruments.last_refresh_attempted_at` = preuve de vie technique
--     du cron, mise a jour a chaque passage meme si le provider renvoie
--     un prix ancien ou si aucun prix n'est ecrit (no-op via ON CONFLICT).
--
-- Permet a l'UI de distinguer "prix vieux car marche ne bouge pas"
-- (priced_at ancien + last_refresh_attempted_at recent) de "prix vieux
-- car cron casse" (les deux anciens).
--
-- Retrocompatible : DEFAULT NULL, les anciens instruments resteront a NULL
-- jusqu'au prochain refresh.
--
-- Rollback : voir 045_instruments_last_refresh_attempted_DOWN.sql
-- =============================================================

ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS last_refresh_attempted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN instruments.last_refresh_attempted_at IS
  'Horodatage de la derniere tentative de refresh de prix (succes, skip ou echec). '
  'Distinct de instrument_prices.priced_at qui est la date de validite marche du prix. '
  'Mis a jour par lib/portfolio/refresh-prices.ts pour chaque instrument traverse '
  'par la boucle de fetch (cron quotidien ou refresh manuel).';
