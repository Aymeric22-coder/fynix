-- Rollback de la migration 054 (V2.2-BIS — masquage des alertes / recos).
DROP TRIGGER IF EXISTS trg_user_alert_dismissals_updated_at ON user_alert_dismissals;
DROP TABLE IF EXISTS user_alert_dismissals;
-- Note : on ne droppe pas fn_update_updated_at(), elle est partagée avec d'autres tables.
