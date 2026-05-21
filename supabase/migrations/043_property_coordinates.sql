-- =============================================================
-- Migration 043 — Coordonnees lat/lng des biens immobiliers
-- =============================================================
--
-- Ajoute 3 colonnes a real_estate_properties pour le geocodage :
--   - latitude (NUMERIC 10,7) : ~1 cm de precision
--   - longitude (NUMERIC 10,7)
--   - geocoded_at (TIMESTAMPTZ) : date du dernier geocodage reussi
--
-- Utilise par /immobilier (vue carte) pour positionner les marqueurs
-- via Leaflet. Geocodage via api-adresse.data.gouv.fr (gratuit, sans cle).
--
-- Toutes les colonnes nullable — retrocompatible : les biens existants
-- sont automatiquement geocodes a la volee lors du premier chargement
-- de la vue carte (et le resultat cache en DB).
--
-- Rollback : voir 043_property_coordinates_DOWN.sql
-- =============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS latitude    NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude   NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN real_estate_properties.latitude IS
  'Latitude geocodee via api-adresse.data.gouv.fr. Null si geocodage echoue ou pas encore tente.';
COMMENT ON COLUMN real_estate_properties.longitude IS
  'Longitude geocodee. Null si geocodage echoue ou pas encore tente.';
COMMENT ON COLUMN real_estate_properties.geocoded_at IS
  'Date du dernier geocodage reussi. Permet de re-geocoder periodiquement si l adresse change.';
