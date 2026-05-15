-- Rollback migration 014 — Desactive le provider JustETF.
-- On ne supprime pas la ligne pour conserver l'historique de fetch_logs.

UPDATE price_providers
SET    is_active  = FALSE,
       updated_at = NOW()
WHERE  code = 'justetf';
