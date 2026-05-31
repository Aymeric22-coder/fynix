-- =============================================================
-- Migration 051 — Rollback (DOWN)
-- =============================================================
--
-- Inverse exact du mapping de 051_renumber_steps.sql :
--   1  → 1  (inchangé)
--   2  → 2  (inchangé)
--   3  → 3  (inchangé)
--   4  → 9  (Fiscalité reprend l'ancien ID de fin)
--   5  → 4  (Capacité d'investissement)
--   6  → 5  (Quiz Bourse)
--   7  → 6  (Quiz Crypto)
--   8  → 7  (Quiz Immo)
--   9  → 8  (Risque + FIRE)
--   10 → 10 (inchangé)
-- =============================================================

BEGIN;

UPDATE profiles
   SET wizard_step_completed = CASE wizard_step_completed
     WHEN 4 THEN 9
     WHEN 5 THEN 4
     WHEN 6 THEN 5
     WHEN 7 THEN 6
     WHEN 8 THEN 7
     WHEN 9 THEN 8
     ELSE wizard_step_completed
   END
 WHERE wizard_step_completed BETWEEN 4 AND 9;

COMMIT;
