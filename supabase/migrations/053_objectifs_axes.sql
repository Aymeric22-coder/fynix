-- =============================================================
-- Migration 053 — Boussole d'objectifs 4 axes (CS4)
-- =============================================================
--
-- Remplace le mono-axe `priorite` (4 valeurs : equilibre, transmission,
-- securite_famille, independance) par 4 axes pondérés 0-100 :
--   - rendement     : revenu passif + valorisation
--   - securite      : coussin + assurance + stabilité famille
--   - optimisation  : défisc + enveloppes (TMI, PEA, AV, PER)
--   - transmission  : succession, donation, démembrement, clause AV
--
-- Stockage JSONB : pattern miroir `life_events.meta`, `onboarding_quick_data`,
-- `priorites_secondaires` futur. Flexible (5e axe possible sans migration),
-- pas de gain perf à perdre en colonnes plates (1 lecture, jamais filtré
-- par SQL côté code).
--
-- Schéma JSON validé côté TypeScript via Zod (lib/profil/objectifsConstants.ts) :
--   { rendement: 0..100, securite: 0..100, optimisation: 0..100, transmission: 0..100 }
--
-- IMPORTANT — `priorite` est CONSERVÉE en DB (legacy QW1 pattern) :
--   - Aucune écriture nouvelle dessus depuis CS4.
--   - Le moteur lit `objectifs_axes` en priorité, fallback `priorite` legacy
--     pour les profils non encore migrés.
--   - Suppression différée (migration future après confirmation 0 lecteur).
--
-- Défaut NULL : signal "pas encore migré CS4". Bandeau /profil propose
-- la conversion (cf. migration data L8 dans le même commit).
--
-- Rollback : voir 053_objectifs_axes_DOWN.sql.
-- =============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS objectifs_axes JSONB DEFAULT NULL;

COMMENT ON COLUMN profiles.objectifs_axes IS
  'CS4 — Boussole d objectifs 4 axes (rendement, securite, optimisation, transmission) valeurs 0..100. NULL = pas encore migre. Schema valide cote code via Zod.';
