-- =============================================================
-- Migration 052 — DROP COLUMN colonnes mortes (consolidation 1)
-- =============================================================
--
-- Supprime 2 colonnes de `profiles` qui sont mortes en aval depuis
-- plusieurs chantiers et dont l'audit consolidation 1 confirme
-- l'absence totale de lecture côté code :
--
--   - `invest_mensuel`     : retiré du wizard en QW1. Aucune lecture
--                            applicative depuis. Colonne préservée
--                            « au cas où ». Confirmé mort par grep.
--   - `fiscal_situation`   : retiré de /parametres en CS1. Aucune
--                            lecture applicative (le fallback existait
--                            mais n'a jamais été branché). Confirmé mort.
--
-- ATTENTION — Les 2 autres colonnes mentionnées dans les audits
-- (`professional_income_eur`, `foyer_fiscal_parts`) sont CONSERVÉES :
--   - `professional_income_eur` est encore lue par `app/(app)/immobilier/page.tsx`.
--   - `foyer_fiscal_parts` est encore lue par `lib/portfolio/tax-estimate.ts`
--     pour l'abattement AV couple.
--
-- Atomicité : BEGIN ... COMMIT. Si l'un des DROP échoue, rollback.
-- Sécurité : `DROP COLUMN IF EXISTS` pour idempotence.
--
-- Rollback : voir 052_drop_dead_columns_DOWN.sql.
-- =============================================================

BEGIN;

ALTER TABLE profiles DROP COLUMN IF EXISTS invest_mensuel;
ALTER TABLE profiles DROP COLUMN IF EXISTS fiscal_situation;

COMMIT;
