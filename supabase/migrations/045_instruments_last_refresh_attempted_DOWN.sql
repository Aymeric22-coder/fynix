-- =============================================================
-- DOWN — Migration 045 — instruments.last_refresh_attempted_at
-- =============================================================
-- Retire la colonne ajoutee par 045. Pas de donnees critiques perdues :
-- ce champ ne sert qu'au diagnostic UI et n'alimente aucun calcul metier.
-- =============================================================

ALTER TABLE instruments
  DROP COLUMN IF EXISTS last_refresh_attempted_at;
