-- =============================================================
-- Migration 053 — Rollback (DOWN)
-- =============================================================
--
-- Supprime la colonne objectifs_axes. Les profils retombent sur priorite
-- legacy (conservée en DB). Les donnees JSONB sont PERDUES.
-- =============================================================

ALTER TABLE profiles DROP COLUMN IF EXISTS objectifs_axes;
