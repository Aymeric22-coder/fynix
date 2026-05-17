-- Rollback migration 017 — Supprime la table future_acquisitions.
-- ATTENTION : destructive — supprime toutes les acquisitions simulees.

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS future_acquisitions;

DROP TRIGGER IF EXISTS trg_future_acquisitions_updated_at ON future_acquisitions;
DROP FUNCTION IF EXISTS set_future_acquisitions_updated_at();

DROP TABLE IF EXISTS future_acquisitions;
