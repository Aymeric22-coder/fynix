-- =============================================================
-- Migration 052 — Rollback (DOWN)
-- =============================================================
--
-- Recrée les 2 colonnes droppées avec leurs définitions originales
-- (cf. migrations 015 pour invest_mensuel et 001 pour fiscal_situation).
-- Les données historiques sont PERDUES après DROP — rollback restaure
-- la structure, pas le contenu.
-- =============================================================

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invest_mensuel NUMERIC(12,2)
    CHECK (invest_mensuel IS NULL OR invest_mensuel >= 0);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fiscal_situation TEXT
    CHECK (fiscal_situation IN ('single','married','pacs','divorced','widowed'));

COMMIT;
