-- =============================================================
-- Migration 041 — Événements ponctuels sur les biens immobiliers
-- =============================================================
-- Remplace la saisie mensuelle manuelle du suivi réel.
-- L'utilisateur ne saisit que ce qui SORT de la base (loyers/lots
-- + charges récurrentes + mensualités) — un événement = une
-- correction ou un fait ponctuel.
--
-- Types couverts : impayé, vacance, révision de loyer, charge
-- exceptionnelle, travaux imprévus, sinistre, autre.
--
-- Rollback : voir 041_property_events_DOWN.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS property_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES real_estate_properties(id) ON DELETE CASCADE,
  lot_id          UUID          REFERENCES real_estate_lots(id)       ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,

  -- Type d'événement
  kind            TEXT NOT NULL CHECK (kind IN (
    'rent_unpaid',
    'vacancy',
    'rent_revision',
    'exceptional_charge',
    'unplanned_works',
    'insurance_claim',
    'rent_paid_late',
    'other'
  )),

  -- Dates
  event_date      DATE NOT NULL,
  period_start    DATE,
  period_end      DATE,

  -- Impact financier (signé : negatif = perte, positif = gain).
  -- Pour rent_revision : nouveau loyer mensuel (montant absolu).
  -- Pour vacancy : peut être null (calculé depuis period_start/end).
  amount_eur      NUMERIC(10,2),

  -- Résolution
  is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_date   DATE,
  resolution_note TEXT,

  -- Méta
  label           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_events_property
  ON property_events(property_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_property_events_lot
  ON property_events(lot_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_property_events_kind
  ON property_events(property_id, kind);

ALTER TABLE property_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_events" ON property_events
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE property_events IS
  'Evenements ponctuels sur un bien immobilier (impayes, vacances, '
  'revisions de loyer, charges exceptionnelles, travaux imprevus, '
  'sinistres). Complete les donnees de base (lots + charges + credit) '
  'pour le calcul du suivi reel sans saisie mensuelle redondante.';
