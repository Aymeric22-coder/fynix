-- =============================================================
-- Migration 009 — Policy INSERT sur instrument_prices
-- =============================================================
--
-- La migration 007 a cree une policy SELECT sur instrument_prices
-- (lecture authentifiee), mais pas d'INSERT. Resultat : impossible
-- de saisir un prix manuel depuis le formulaire d'ajout/edition
-- de position.
--
-- Le prix est append-only et global (catalogue partage). On autorise
-- donc les users authentifies a inserer un prix. Le confidence='manual'
-- permet a la valorisation de distinguer un prix saisi manuellement
-- d'un prix issu d'un provider de marche.
-- =============================================================

CREATE POLICY "instrument_prices_insert_authenticated"
  ON instrument_prices FOR INSERT TO authenticated
  WITH CHECK (TRUE);
