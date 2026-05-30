-- =============================================================
-- Migration 048 — Auto-déclaration d'expertise sur les quiz (CS3)
-- =============================================================
--
-- Permet à l'utilisateur de cliquer « Je connais déjà — Expert » sur les
-- étapes 5 (Bourse), 6 (Crypto), 7 (Immo) du wizard, sans avoir à répondre
-- aux questions.
--
-- Pattern miroir de `enveloppes TEXT[]` : tableau Postgres, défaut '{}'.
-- Valeurs valides côté code : 'bourse' | 'crypto' | 'immo'.
--
-- Côté code :
--   - quiz_bourse / quiz_crypto / quiz_immo restent à leur sentinel
--     [-1,-1,-1,-1] (= "non répondu") quand l'utilisateur s'est auto-
--     déclaré expert. Cohérent avec le pattern existant.
--   - `experienceScore` (lib/profil/calculs.ts) boostera le pct du domaine
--     auto-déclaré à 70 % du niveau Expert (= 67 = round(96 × 0.7)).
--
-- Rollback : voir 048_quiz_self_declared_DOWN.sql
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS quiz_self_declared_domains TEXT[] DEFAULT '{}';

COMMENT ON COLUMN profiles.quiz_self_declared_domains IS
  'CS3 — Domaines de quiz auto-declares expert via le bouton "Je connais deja" du wizard (Step 5/6/7). Valeurs : ''bourse'' | ''crypto'' | ''immo''. Le sentinel ''-1'' reste pose sur quiz_X (cf. pattern existant).';
