-- Rollback migration 043
ALTER TABLE real_estate_properties
  DROP COLUMN IF EXISTS geocoded_at,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS latitude;
