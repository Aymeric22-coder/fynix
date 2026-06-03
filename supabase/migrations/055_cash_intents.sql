-- =============================================================================
-- FIRECORE — Migration 055 : Cash volontaire (intentions déclarées) (V1.2)
-- =============================================================================
-- Permet à l'utilisateur de déclarer qu'une portion de son cash est mise de
-- côté pour un projet précis (apport immobilier, achat planifié, voyage…).
--
-- Conséquence métier : ce cash « volontaire » est SOUSTRAIT du `totalCash`
-- pour les règles d'alerte « sur-liquidité » :
--   - `recommandations.ts > cash-excessif`  (> 20 % du brut)
--   - `lib/analyse/dashboard-pipeline/calc.ts` cash > 30 % net 6 mois
-- Le matelas effectif = max(0, totalCash - Σ intents actives) ferme le faux
-- positif P5 décrit dans `auditcash.md` § 7.
--
-- Une intention « active » a `target_date IS NULL` OU `target_date >= today`.
-- Les expirées sont simplement filtrées côté application (cf. helper
-- `lib/cash/intents.ts > getIntentsActives`) — pas d'archivage formel en V1.2.
--
-- Le rattachement à un `cash_account` est OPTIONNEL : l'utilisateur peut
-- déclarer une intention « globale » (Q1 du brief V1.2). Si on supprime le
-- compte associé, on ne perd PAS l'intention : `ON DELETE SET NULL`.
-- =============================================================================

CREATE TYPE cash_intent_motif AS ENUM (
  'apport_immo',
  'achat_planifie',
  'voyage',
  'precaution_assumee',
  'autre'
);

CREATE TABLE cash_intents (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid               NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULLABLE : intention globale (pas rattachée à un compte précis).
  cash_account_id uuid               REFERENCES cash_accounts(id) ON DELETE SET NULL,
  montant         NUMERIC(18,2)      NOT NULL CHECK (montant > 0),
  motif           cash_intent_motif  NOT NULL,
  -- Précision libre (≤ 280 char, contrainte appliquée côté API zod).
  motif_libre     text,
  -- Date cible optionnelle. NULL = sans deadline. Une intention dont la
  -- target_date est dans le passé est filtrée par `getIntentsActives`.
  target_date     date,
  created_at      timestamptz        NOT NULL DEFAULT now(),
  updated_at      timestamptz        NOT NULL DEFAULT now()
);

-- Index lookup principaux : liste par utilisateur + jointure sur compte.
CREATE INDEX idx_cash_intents_user_id
  ON cash_intents (user_id);
CREATE INDEX idx_cash_intents_cash_account_id
  ON cash_intents (cash_account_id);

-- Trigger updated_at — réutilise la fonction globale `fn_update_updated_at`
-- déjà installée par 001_initial_schema (créée défensivement par 054 si elle
-- manquait). On garde la même garde au cas où.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_update_updated_at'
  ) THEN
    CREATE FUNCTION fn_update_updated_at() RETURNS trigger AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER trg_cash_intents_updated_at
  BEFORE UPDATE ON cash_intents
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- =============================================================================
-- RLS — chaque utilisateur ne voit que ses propres intentions
-- =============================================================================
ALTER TABLE cash_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select" ON cash_intents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert" ON cash_intents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update" ON cash_intents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_delete" ON cash_intents
  FOR DELETE USING (auth.uid() = user_id);
