-- Migration 031 — Suppression des tables `dca_plans` et `dca_occurrences`.
--
-- Ces tables existaient depuis la migration 001 mais la feature DCA n'a
-- jamais été activée côté UI. Plus aucune ligne de code TypeScript ne
-- les référence (cf. nettoyage `types/database.types.ts`, AUDIT_FIXES
-- BLOC 6). On supprime pour éviter la dette technique et clarifier
-- le schéma.
--
-- CASCADE : retire automatiquement policies RLS, triggers d'audit et
-- index liés (idx_dca_plans_user, idx_dca_occur_plan, idx_dca_occur_status).
--
-- Idempotent.

DROP TABLE IF EXISTS public.dca_occurrences CASCADE;
DROP TABLE IF EXISTS public.dca_plans      CASCADE;
