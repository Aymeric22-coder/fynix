-- Rollback migration 016 — Supprime le cache global ISIN.
DROP TABLE IF EXISTS isin_cache CASCADE;
