-- =============================================================================
-- FIRECORE — Migration 054 : Masquage personnalisé des alertes & recos (V2.2-BIS)
-- =============================================================================
-- Les alertes et recommandations du Dashboard ne respectent pas l'autonomie
-- de l'utilisateur lorsqu'elles persistent malgré une décision assumée
-- (« je suis pro crypto, oui je sur-expose volontairement »).
--
-- Cette table stocke, pour chaque utilisateur, les `alert_signature` qu'il
-- a explicitement masqués, avec :
--   - une raison choisie parmi un set fermé (`reason_code`)
--   - une note libre optionnelle (`reason_note`)
--   - une date d'expiration (`expires_at NULL` = définitif)
--
-- Le pipeline Dashboard (lib/analyse/dashboard-pipeline/calc.ts) charge ces
-- masquages dans `loadDashboardInputs` puis filtre les alertes et actions
-- du mois dont la `signature` correspond à un masquage actif
-- (`expires_at IS NULL OR expires_at > now()`).
--
-- Le `reason_code` est laissé en TEXT plutôt qu'en ENUM pour permettre
-- l'évolution du set sans migration de schéma (côté UI, la liste reste
-- fermée à 5 valeurs — cf. components/dashboard/dismiss-alert-modal.tsx).
-- =============================================================================

CREATE TABLE user_alert_dismissals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Signature stable de l'alerte / reco masquée. Ex :
  --   'over_exposure_immo_net'
  --   'over_exposure_crypto'
  --   'concentration_position:<positionId>'  -- per position
  --   'cash_dormant_6m'
  --   'reco:rebalance-classes'
  --   'reco:invest-cash-dormant'
  --   'reco:fiscal-<oppId>'
  alert_signature text NOT NULL,
  -- Raison choisie parmi un set fermé côté UI (cf. modal).
  reason_code     text NOT NULL CHECK (reason_code IN (
                    'strategie_personnelle',
                    'temporaire',
                    'pro_specialiste',
                    'reco_irrealiste',
                    'autre'
                  )),
  reason_note     text,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  -- NULL = masquage définitif. Sinon date de réveil automatique
  -- (typiquement now() + 6 mois pour le bouton « Masquer 6 mois »).
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 1 seul masquage actif par couple (user, signature) — au prochain
  -- masquage, on UPDATE plutôt que d'empiler les lignes.
  UNIQUE (user_id, alert_signature)
);

-- Index principal : lookup par (user_id, signature). On ne met PAS de
-- prédicat partiel sur `expires_at > now()` car PostgreSQL exige une
-- expression IMMUTABLE dans WHERE d'index (now() est volatile). Le
-- filtrage temporel est appliqué côté pipeline au moment de la lecture.
CREATE INDEX idx_user_alert_dismissals_user
  ON user_alert_dismissals (user_id, alert_signature);

-- Trigger updated_at (réutilise la fonction globale si elle existe ;
-- sinon on en crée une locale).
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

CREATE TRIGGER trg_user_alert_dismissals_updated_at
  BEFORE UPDATE ON user_alert_dismissals
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- =============================================================================
-- RLS — chaque utilisateur ne voit que ses propres masquages
-- =============================================================================
ALTER TABLE user_alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select" ON user_alert_dismissals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert" ON user_alert_dismissals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update" ON user_alert_dismissals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_delete" ON user_alert_dismissals
  FOR DELETE USING (auth.uid() = user_id);
