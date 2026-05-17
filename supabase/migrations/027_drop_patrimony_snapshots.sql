-- =============================================================
-- Migration 027 — DROP TABLE patrimony_snapshots
-- =============================================================
--
-- Pre-requis (verifier AVANT d'appliquer en prod) :
--   1. Migration 026 (backfill) deja appliquee.
--   2. Code Sprint 2 deploye (plus aucun INSERT/SELECT vers
--      patrimony_snapshots) — verifie :
--          /api/dashboard       → wealth_snapshots
--          /api/snapshots       → proxy wealth_snapshots
--          Edge snapshot-daily  → 410 Gone (cron Supabase a desactiver)
--   3. Cron Supabase `snapshot-daily-cron` desactive manuellement
--      dans le dashboard : SELECT cron.unschedule('snapshot-daily-cron');
--      (sinon erreur a la prochaine execution car la table n'existe plus).
--
-- Verification que la table est vide cote applicatif :
--   SELECT COUNT(*) FROM patrimony_snapshots
--   WHERE created_at > (SELECT MAX(created_at) FROM wealth_snapshots);
--   → 0 attendu (sinon, des inserts post-backfill ont eu lieu, re-jouer 026)
--
-- Rollback : voir 027_drop_patrimony_snapshots_DOWN.sql
--           (recree la table mais SANS les donnees historiques).
-- =============================================================

DROP TABLE IF EXISTS public.patrimony_snapshots CASCADE;

-- Note : CASCADE supprime aussi les policies RLS associees declarees en
-- migration 001, ainsi que les triggers d'audit si presents.
