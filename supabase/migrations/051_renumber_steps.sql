-- =============================================================
-- Migration 051 — Renumérotation des step IDs (refactor post-CS10)
-- =============================================================
--
-- Renumérote les step IDs pour qu'ils suivent l'ordre VISUEL du wizard.
-- Élimine la friction « Step 9 = Fiscalité affichée en 4e position » qui
-- s'était installée à cause des ajouts en queue (CS1 ajoutait Step 9 en
-- fin pour préserver wizard_step_completed, CS5 ajoutait Step 10 idem).
--
-- Mapping ID ancien → nouveau :
--   1  → 1   (Identité, inchangé)
--   2  → 2   (Revenus, inchangé)
--   3  → 3   (Charges, inchangé)
--   4  → 5   (Capacité d'investissement, décale)
--   5  → 6   (Quiz Bourse)
--   6  → 7   (Quiz Crypto)
--   7  → 8   (Quiz Immo)
--   8  → 9   (Risque + FIRE)
--   9  → 4   (Ta fiscalité, anciennement en fin)
--   10 → 10  (Projets de vie, inchangé)
--
-- Les valeurs 0 (sentinel "rien fait") et 10 (sentinel "wizard terminé")
-- sont inchangées. Seules 4..9 sont remappées.
--
-- Atomicité : BEGIN ... COMMIT. Si l'UPDATE échoue mid-way, rollback
-- automatique → aucune ligne remappée partiellement.
--
-- Côté code : routing.ts, calculs.ts, wizardValidation.ts, chaptersConstants.ts
-- ont été mis à jour dans le même commit pour utiliser les nouveaux IDs.
-- ALL_STEPS redevient le range naturel [1..10].
--
-- Rollback : voir 051_renumber_steps_DOWN.sql (CASE inverse).
-- =============================================================

BEGIN;

UPDATE profiles
   SET wizard_step_completed = CASE wizard_step_completed
     WHEN 4 THEN 5
     WHEN 5 THEN 6
     WHEN 6 THEN 7
     WHEN 7 THEN 8
     WHEN 8 THEN 9
     WHEN 9 THEN 4
     ELSE wizard_step_completed
   END
 WHERE wizard_step_completed BETWEEN 4 AND 9;

COMMIT;
