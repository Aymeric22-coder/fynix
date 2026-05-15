-- =============================================================
-- Migration 016 — Cache global d'enrichissement ISIN
-- =============================================================
--
-- Cache mutualisé entre tous les utilisateurs. Permet d'éviter de
-- rappeler OpenFIGI / Yahoo Finance pour chaque chargement de page :
-- on stocke par ISIN les métadonnées sectorielles et géographiques.
--
-- Différence avec la table `instruments` :
--   - `instruments` est lié au portefeuille de l'utilisateur (un row par
--     instrument détenu, avec ses caractéristiques propres).
--   - `isin_cache` est un référentiel global, pré-rempli au fil de l'eau
--     par le module Analyse, partageable entre users (un Bourso et un
--     Boursorama qui détiennent BNPP partagent le même cache).
--
-- TTL 24h : `cache_expires_at` pilote le re-fetch. Au-delà, le service
-- d'enrichissement re-récupère les données fraîches.
--
-- RLS : lecture libre pour tous les users authentifiés (les données
-- sectorielles ne sont pas confidentielles), écriture libre aussi
-- (n'importe quel user peut alimenter le cache lors de ses analyses).
-- =============================================================

CREATE TABLE IF NOT EXISTS isin_cache (
  isin             TEXT PRIMARY KEY,
  symbol           TEXT,
  name             TEXT,
  asset_type       TEXT,                -- 'stock','etf','crypto','bond','scpi','unknown'
  sector           TEXT,                -- libellé Yahoo brut, traduction côté app
  industry         TEXT,                -- sous-secteur précis
  country          TEXT,                -- code ISO ou libellé Yahoo brut
  currency         TEXT,
  exchange         TEXT,
  current_price    NUMERIC(18,6),
  raw_data         JSONB,               -- payload complet pour usage futur
  cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Index pour lookup rapide des entrées non expirées
CREATE INDEX IF NOT EXISTS idx_isin_cache_expires ON isin_cache (cache_expires_at);

ALTER TABLE isin_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "isin_cache_select" ON isin_cache
    FOR SELECT TO authenticated USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "isin_cache_insert" ON isin_cache
    FOR INSERT TO authenticated WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "isin_cache_update" ON isin_cache
    FOR UPDATE TO authenticated USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE isin_cache IS
  'Cache global ISIN -> métadonnées (secteur, pays, etc.) alimenté par OpenFIGI + Yahoo Finance. TTL 24h.';
