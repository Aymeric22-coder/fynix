-- =============================================================
-- DOWN — Migration 046 — Benchmarks
-- =============================================================
-- Supprime les 3 benchmarks seedes + leurs prix, l'index et la colonne.
-- =============================================================

-- Prix des benchmarks (instrument_prices CASCADE non garanti → on nettoie).
DELETE FROM instrument_prices
  WHERE instrument_id IN (
    'be000000-0000-4000-8000-000000000001',
    'be000000-0000-4000-8000-000000000002',
    'be000000-0000-4000-8000-000000000003'
  );

DELETE FROM instruments
  WHERE id IN (
    'be000000-0000-4000-8000-000000000001',
    'be000000-0000-4000-8000-000000000002',
    'be000000-0000-4000-8000-000000000003'
  );

DROP INDEX IF EXISTS idx_instruments_benchmark;

ALTER TABLE instruments
  DROP COLUMN IF EXISTS is_benchmark;
