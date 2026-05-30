-- =============================================================
-- Migration 049 — Rollback (DOWN)
-- =============================================================
--
-- Supprime la table life_events et tous ses objets associés (RLS, index,
-- trigger). Cascade ON DELETE CASCADE supprime aussi automatiquement les
-- références aux profiles supprimés mais la table life_events est l'enfant
-- ici donc la suppression brute est suffisante.
-- =============================================================

DROP TRIGGER IF EXISTS trg_life_events_updated_at ON life_events;
DROP POLICY  IF EXISTS "life_events_select_own"  ON life_events;
DROP POLICY  IF EXISTS "life_events_insert_own"  ON life_events;
DROP POLICY  IF EXISTS "life_events_update_own"  ON life_events;
DROP POLICY  IF EXISTS "life_events_delete_own"  ON life_events;
DROP INDEX   IF EXISTS life_events_user_type_idx;
DROP TABLE   IF EXISTS life_events;
