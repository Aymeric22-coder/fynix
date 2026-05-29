-- =============================================================
-- Migration 046 — Benchmarks (indices de reference) — BNCH
-- =============================================================
-- Ajoute un flag is_benchmark sur instruments pour tracker des indices
-- de reference (MSCI World, S&P 500, CAC 40) reutilisant toute
-- l'infrastructure existante (instrument_prices, providers yahoo, cron).
--
-- Les benchmarks n'ont AUCUNE position : ils vivent uniquement dans
-- instruments + instrument_prices. Ils sont filtres des listes
-- utilisateur via is_benchmark = TRUE.
--
-- Proxies EUR-listed (zero conversion FX) :
--   MSCI World → EUNL.DE (iShares Core MSCI World UCITS, accumulant)
--   S&P 500    → SXR8.DE (iShares Core S&P 500 UCITS, accumulant)
--   CAC 40     → ^FCHI   (indice direct, EUR)
--
-- Rollback : voir 046_benchmarks_DOWN.sql
-- =============================================================

ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS is_benchmark BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN instruments.is_benchmark IS
  'TRUE = indice de reference (benchmark) tracke pour comparaison de '
  'performance, jamais detenu par un utilisateur. Filtre des listes '
  'utilisateur (dropdowns) et inclus dans le refresh cron via ce flag.';

-- Index partiel : le cron et build-from-db filtrent sur is_benchmark = TRUE.
CREATE INDEX IF NOT EXISTS idx_instruments_benchmark
  ON instruments (is_benchmark) WHERE is_benchmark = TRUE;

-- Seed des 3 benchmarks (UUID fixes → idempotent). Pas d'ISIN pour eviter
-- toute collision UNIQUE(isin) avec une position user sur le meme ETF ;
-- le ticker Yahoo suffit au fetch (getHistory / getQuote).
INSERT INTO instruments (id, name, ticker, isin, asset_class, currency, provider_id, data_source, is_benchmark)
VALUES
  ('be000000-0000-4000-8000-000000000001', 'MSCI World', 'EUNL.DE', NULL, 'etf',   'EUR', 'EUNL.DE', 'api', TRUE),
  ('be000000-0000-4000-8000-000000000002', 'S&P 500',    'SXR8.DE', NULL, 'etf',   'EUR', 'SXR8.DE', 'api', TRUE),
  ('be000000-0000-4000-8000-000000000003', 'CAC 40',     '^FCHI',   NULL, 'other', 'EUR', '^FCHI',   'api', TRUE)
ON CONFLICT (ticker) DO NOTHING;
