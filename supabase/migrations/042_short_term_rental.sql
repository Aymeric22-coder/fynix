-- =============================================================
-- Migration 042 — Location courte duree (Airbnb / Booking)
-- =============================================================
--
-- Etend real_estate_lots pour couvrir la location saisonniere :
--   - tarification multi-saison
--   - taux d'occupation et duree moyenne de sejour
--   - frais menage refactures vs a charge
--   - commissions plateformes (Airbnb / Booking / direct)
--   - charges operationnelles (menage, linge, conciergerie)
--   - classement touristique (Atout France) — pilote l'abattement micro-BIC
--   - saisonnalite mensuelle (JSON sur le lot)
--
-- Etend aussi property_events pour les evenements specifiques :
--   - booking_cancellation, platform_payout, guest_damage,
--     platform_dispute, seasonal_closure
--
-- Toutes les colonnes nullable / avec DEFAULT — retrocompatible :
-- les biens existants restent en location longue duree par defaut.
--
-- Rollback : voir 042_short_term_rental_DOWN.sql
-- =============================================================

-- -------------------------------------------------------------
-- 1. Extension real_estate_lots
-- -------------------------------------------------------------

ALTER TABLE real_estate_lots
  ADD COLUMN IF NOT EXISTS rental_type TEXT NOT NULL DEFAULT 'long_term'
    CHECK (rental_type IN ('long_term', 'short_term', 'mixed')),

  -- Tarification courte duree
  ADD COLUMN IF NOT EXISTS nightly_rate_low   NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS nightly_rate_mid   NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS nightly_rate_high  NUMERIC(8,2),

  -- Occupation annuelle globale (0-100)
  ADD COLUMN IF NOT EXISTS occupancy_rate_pct NUMERIC(5,2) DEFAULT 70
    CHECK (occupancy_rate_pct IS NULL
           OR (occupancy_rate_pct >= 0 AND occupancy_rate_pct <= 100)),

  -- Frais par sejour
  ADD COLUMN IF NOT EXISTS cleaning_fee_per_stay  NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_stay_nights        NUMERIC(5,1) DEFAULT 3
    CHECK (avg_stay_nights IS NULL OR avg_stay_nights > 0),

  -- Commissions plateformes (% du CA)
  ADD COLUMN IF NOT EXISTS platform_airbnb_pct    NUMERIC(5,2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS platform_booking_pct   NUMERIC(5,2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS platform_other_pct     NUMERIC(5,2) DEFAULT 0,

  -- Repartition des reservations entre Airbnb / Booking / direct
  -- (en %, doit totaliser 100)
  ADD COLUMN IF NOT EXISTS platform_airbnb_mix_pct  NUMERIC(5,2) DEFAULT 60,
  ADD COLUMN IF NOT EXISTS platform_booking_mix_pct NUMERIC(5,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS platform_direct_mix_pct  NUMERIC(5,2) DEFAULT 10,

  -- Charges operationnelles a charge du proprietaire
  ADD COLUMN IF NOT EXISTS concierge_fee_pct       NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleaning_cost_per_stay  NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_cost_per_stay     NUMERIC(8,2) DEFAULT 0,

  -- Classement touristique (Atout France) — pilote l'abattement LF 2025
  ADD COLUMN IF NOT EXISTS tourism_classification TEXT
    CHECK (tourism_classification IS NULL OR tourism_classification IN (
      'non_classe',
      'classe_1_2',
      'classe_3_4_5',
      'chambre_hotes'
    )),

  -- Saisonnalite mensuelle : JSON { "1": {"occupancyRatePct": 40, "nightlyRate": 45, "blockedDays": 0}, ... }
  ADD COLUMN IF NOT EXISTS seasonality_coefficients JSONB;

COMMENT ON COLUMN real_estate_lots.rental_type IS
  'Type de location : long_term (par defaut, retrocompat), short_term (Airbnb/Booking), mixed (les deux).';
COMMENT ON COLUMN real_estate_lots.nightly_rate_low IS
  'Tarif nuit basse saison. Combine avec les coefficients de saisonnalite pour le calcul.';
COMMENT ON COLUMN real_estate_lots.occupancy_rate_pct IS
  'Taux d''occupation annuel moyen (0-100). Base des calculs de revenus courte duree.';
COMMENT ON COLUMN real_estate_lots.tourism_classification IS
  'Classement officiel Atout France — pilote l''abattement micro-BIC LF 2025 (30/50/71 %).';
COMMENT ON COLUMN real_estate_lots.seasonality_coefficients IS
  'Saisonnalite mensuelle (JSONB). Cles "1".."12", valeurs {occupancyRatePct, nightlyRate?, blockedDays?}.';
COMMENT ON COLUMN real_estate_lots.platform_airbnb_mix_pct IS
  'Part du chiffre d''affaires passant par Airbnb (0-100). Doit totaliser 100 avec booking_mix + direct_mix.';

-- -------------------------------------------------------------
-- 2. Extension property_events.kind pour les evenements courte duree
-- -------------------------------------------------------------

ALTER TABLE property_events
  DROP CONSTRAINT IF EXISTS property_events_kind_check;

ALTER TABLE property_events
  ADD CONSTRAINT property_events_kind_check
    CHECK (kind IN (
      -- Longue duree (existants)
      'rent_unpaid',
      'vacancy',
      'rent_revision',
      'exceptional_charge',
      'unplanned_works',
      'insurance_claim',
      'rent_paid_late',
      'other',
      -- Courte duree (nouveaux)
      'booking_cancellation',
      'platform_payout',
      'guest_damage',
      'platform_dispute',
      'seasonal_closure'
    ));

COMMENT ON CONSTRAINT property_events_kind_check ON property_events IS
  'Types d evenements supportes — inclut depuis mig 042 les evenements specifiques courte duree.';
