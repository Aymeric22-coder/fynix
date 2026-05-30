-- =============================================================
-- Migration 049 — Table life_events (CS5 phase 5a)
-- =============================================================
--
-- Capture des évènements de vie qui rythment la trajectoire patrimoniale :
-- retraite, capital exceptionnel (héritage / vente d'entreprise), achat
-- résidence principale, naissance. Ces évènements sont injectés dans le
-- moteur de projection FIRE via `buildLifeEventVectors` (cf. pattern β
-- décidé en cadrage CS5).
--
-- Architecture choisie : table dédiée 1-N sur profiles plutôt que JSONB
-- ou colonnes plates. Justification : cardinalité variable (un user peut
-- prévoir 2 naissances + 1 héritage), édition unitaire propre, alignée
-- sur le pattern `real_estate_properties`.
--
-- MVP — un seul Capital exceptionnel autorisé côté UI Step 10 (mais la
-- table le supporte nativement → extension future triviale).
--
-- Champs :
--   id              : PK auto
--   user_id         : FK profiles.id ON DELETE CASCADE (suit le reset profil)
--   type            : enum string ∈ LIFE_EVENT_TYPES (cf. lifeEventsConstants.ts)
--   is_active       : toggle utilisateur (off = ignoré par la projection)
--   occurrence_date : date YYYY-MM-01 (le jour est posé à 01 — granularité mois)
--   montant         : NUMERIC NULL — utilisé selon le type :
--                       retraite              → pension_mensuelle_estimee (€/mois) ou null (fallback 50 %)
--                       capital_exceptionnel  → montant_estime (€) — OBLIGATOIRE côté UI
--                       achat_rp              → prix_estime (€)
--                       naissance             → null (le coût mensuel est constant CS5)
--   label           : texte libre — utilisé pour capital_exceptionnel
--                     ("Héritage" / "Vente d'entreprise" / "Autre — texte libre")
--   meta            : JSONB payload spécifique au type. Cf. types/database.types.ts
--                     pour le schéma typed par type :
--                       retraite              → {}  (pension dans `montant`)
--                       capital_exceptionnel  → { preset: 'heritage' | 'vente_entreprise' | 'autre' }
--                       achat_rp              → { apport, mensualite, duree_credit_annees }
--                       naissance             → { nb_enfants }
--
-- RLS : standard pattern (user_id = auth.uid()).
-- Trigger updated_at : réutilise fn_update_updated_at() (cf. migration 003).
--
-- Rollback : voir 049_life_events_DOWN.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS life_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN (
    'retraite',
    'capital_exceptionnel',
    'achat_rp',
    'naissance'
  )),
  is_active       boolean NOT NULL DEFAULT true,
  occurrence_date date NOT NULL,
  montant         numeric NULL,
  label           text NULL,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS life_events_user_type_idx
  ON life_events(user_id, type);

ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "life_events_select_own" ON life_events;
CREATE POLICY "life_events_select_own"
  ON life_events FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "life_events_insert_own" ON life_events;
CREATE POLICY "life_events_insert_own"
  ON life_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "life_events_update_own" ON life_events;
CREATE POLICY "life_events_update_own"
  ON life_events FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "life_events_delete_own" ON life_events;
CREATE POLICY "life_events_delete_own"
  ON life_events FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_life_events_updated_at ON life_events;
CREATE TRIGGER trg_life_events_updated_at
  BEFORE UPDATE ON life_events
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE life_events IS
  'CS5 — Evenements de vie utilises pour ajuster la projection FIRE (retraite, capital exceptionnel, achat RP, naissance). Injecte dans projectionFIRE via buildLifeEventVectors (wrapper beta).';
