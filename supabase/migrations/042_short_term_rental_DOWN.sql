-- Rollback migration 042

-- 1. Restaure le CHECK property_events.kind initial (sans courte duree)
ALTER TABLE property_events
  DROP CONSTRAINT IF EXISTS property_events_kind_check;

ALTER TABLE property_events
  ADD CONSTRAINT property_events_kind_check
    CHECK (kind IN (
      'rent_unpaid',
      'vacancy',
      'rent_revision',
      'exceptional_charge',
      'unplanned_works',
      'insurance_claim',
      'rent_paid_late',
      'other'
    ));

-- 2. Drop des colonnes courte duree sur real_estate_lots
ALTER TABLE real_estate_lots
  DROP COLUMN IF EXISTS seasonality_coefficients,
  DROP COLUMN IF EXISTS tourism_classification,
  DROP COLUMN IF EXISTS linen_cost_per_stay,
  DROP COLUMN IF EXISTS cleaning_cost_per_stay,
  DROP COLUMN IF EXISTS concierge_fee_pct,
  DROP COLUMN IF EXISTS platform_direct_mix_pct,
  DROP COLUMN IF EXISTS platform_booking_mix_pct,
  DROP COLUMN IF EXISTS platform_airbnb_mix_pct,
  DROP COLUMN IF EXISTS platform_other_pct,
  DROP COLUMN IF EXISTS platform_booking_pct,
  DROP COLUMN IF EXISTS platform_airbnb_pct,
  DROP COLUMN IF EXISTS avg_stay_nights,
  DROP COLUMN IF EXISTS cleaning_fee_per_stay,
  DROP COLUMN IF EXISTS occupancy_rate_pct,
  DROP COLUMN IF EXISTS nightly_rate_high,
  DROP COLUMN IF EXISTS nightly_rate_mid,
  DROP COLUMN IF EXISTS nightly_rate_low,
  DROP COLUMN IF EXISTS rental_type;
