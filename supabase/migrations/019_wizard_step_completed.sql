-- =============================================================
-- Migration 019 — Suivi de l'étape courante du wizard profil
-- =============================================================
--
-- Permet de proposer "Reprendre le questionnaire à l'étape X" quand
-- l'utilisateur a abandonné en cours de route, plutôt que de le forcer
-- à recommencer du début.
--
-- Sémantique : `wizard_step_completed` = numéro de la DERNIÈRE étape
-- complétée avec succès (0..8). Vaut 0 par défaut (jamais commencé).
-- Vaut 8 quand le wizard est terminé (souvent corrélé avec
-- profile_completed_at NOT NULL, mais pas strictement requis : on peut
-- imaginer un user qui valide l'étape 8 puis veut revenir éditer).
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wizard_step_completed INTEGER NOT NULL DEFAULT 0
    CHECK (wizard_step_completed >= 0 AND wizard_step_completed <= 8);

COMMENT ON COLUMN profiles.wizard_step_completed IS
  'Derniere etape (0..8) completee dans le wizard. 0 = jamais commence, 8 = wizard termine. Utilise pour proposer "Reprendre a l etape X".';
