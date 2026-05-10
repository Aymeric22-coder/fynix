-- =============================================================
-- Migration 007 — Portefeuille universel (Phase E)
-- =============================================================
--
-- Crée l'infrastructure de données pour le module "Portefeuille"
-- qui unifie actions/ETF/crypto/SCPI/matières premières.
--
-- Nouveaux objets :
--   1. ENUM  asset_class     — classification universelle des instruments
--   2. ENUM  position_status — état d'une position (active/closed/pending)
--   3. TABLE instruments     — catalogue partagé des titres (ticker, ISIN…)
--   4. TABLE positions       — holdings utilisateur (lié à instruments)
--   5. TABLE instrument_prices — historique de prix (append-only)
--   6. TABLE price_providers — configuration des fournisseurs de cotations
--   7. ALTER transactions    — liens position_id, instrument_id, quantity…
--
-- Types existants réutilisés (définis en migration 001) :
--   currency_code, confidence_level, data_source
--
-- Rollback : voir 007_portefeuille_DOWN.sql
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. EXTENSIONS REQUISES
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- requis pour idx_instruments_name_trgm


-- ─────────────────────────────────────────────────────────────
-- 1. NOUVEAUX ENUMS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE asset_class AS ENUM (
  'equity',           -- action cotée
  'etf',              -- ETF / tracker
  'fund',             -- OPCVM / fonds actif
  'crypto',           -- cryptomonnaie
  'scpi',             -- SCPI
  'reit',             -- REIT (foncière cotée étrangère)
  'bond',             -- obligation
  'metal',            -- métaux précieux (or, argent…)
  'private_equity',   -- PE / capital-investissement
  'crowdfunding',     -- crowdfunding immobilier ou entreprise
  'private_debt',     -- dette privée
  'structured',       -- produit structuré
  'opci',             -- OPCI
  'siic',             -- SIIC (foncière cotée française)
  'derivative',       -- produit dérivé
  'defi',             -- DeFi / staking / liquidity pool
  'other'             -- autre
);

CREATE TYPE position_status AS ENUM (
  'active',   -- position ouverte
  'closed',   -- position soldée
  'pending'   -- ordre en attente de règlement
);


-- ─────────────────────────────────────────────────────────────
-- 2. TABLE instruments
--    Catalogue partagé entre utilisateurs. Pas de user_id.
--    Un instrument = un titre identifiable par ticker ou ISIN.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE instruments (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT        NOT NULL,
  ticker          TEXT,                             -- ex: "IWDA", "BTC-EUR", "CW8"
  isin            TEXT,                             -- ex: "IE00B4L5Y983"
  asset_class     asset_class NOT NULL,
  asset_subclass  TEXT,                             -- précision libre (ex: "small_cap", "growth")
  currency        currency_code NOT NULL DEFAULT 'EUR',
  sector          TEXT,                             -- GICS / libre (ex: "Technology")
  geography       TEXT,                             -- ex: "World", "USA", "Europe"
  provider_id     TEXT,                             -- identifiant chez le fournisseur de données
  data_source     data_source NOT NULL DEFAULT 'manual',
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un ticker ou un ISIN est unique dans le catalogue
  -- (NULL autorisé sur les deux, plusieurs NULL ne violent pas l'unicité)
  UNIQUE (ticker),
  UNIQUE (isin)
);

CREATE INDEX idx_instruments_asset_class ON instruments(asset_class);
CREATE INDEX idx_instruments_ticker      ON instruments(ticker) WHERE ticker IS NOT NULL;
CREATE INDEX idx_instruments_isin        ON instruments(isin)   WHERE isin   IS NOT NULL;
CREATE INDEX idx_instruments_name_trgm   ON instruments USING gin(name gin_trgm_ops);


-- ─────────────────────────────────────────────────────────────
-- 3. TABLE positions
--    Holdings utilisateur. 1 ligne = 1 instrument dans 1 enveloppe.
--    Le PRU (average_price) est mis à jour à chaque BUY côté backend.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE positions (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_id   UUID            NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  envelope_id     UUID            REFERENCES financial_envelopes(id) ON DELETE SET NULL,
  quantity        NUMERIC(24,8)   NOT NULL DEFAULT 0   CHECK (quantity >= 0),
  average_price   NUMERIC(18,6)   NOT NULL DEFAULT 0   CHECK (average_price >= 0),
  currency        currency_code   NOT NULL DEFAULT 'EUR',
  broker          TEXT,                                 -- courtier (redondant avec envelope mais utile sans enveloppe)
  acquisition_date DATE,                               -- date du premier achat
  status          position_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  metadata        JSONB           NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_positions_user_id       ON positions(user_id);
CREATE INDEX idx_positions_instrument_id ON positions(instrument_id);
CREATE INDEX idx_positions_user_status   ON positions(user_id, status);
CREATE INDEX idx_positions_envelope_id   ON positions(envelope_id) WHERE envelope_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. TABLE instrument_prices
--    Historique de prix par instrument (append-only, jamais mis à jour).
--    Source de vérité pour la valorisation temps réel et les graphiques.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE instrument_prices (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument_id   UUID            NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  price           NUMERIC(24,8)   NOT NULL    CHECK (price >= 0),
  currency        currency_code   NOT NULL,
  priced_at       TIMESTAMPTZ     NOT NULL,
  source          TEXT            NOT NULL DEFAULT 'manual',  -- 'yahoo','coingecko','manual'…
  confidence      confidence_level NOT NULL DEFAULT 'medium',
  metadata        JSONB           NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  -- Pas d'updated_at : append-only
  UNIQUE (instrument_id, priced_at, source)
);

CREATE INDEX idx_instrument_prices_lookup
  ON instrument_prices(instrument_id, priced_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. TABLE price_providers
--    Configuration dynamique des fournisseurs de cotations.
--    Supporte une chaîne de fallback (priority ASC = plus prioritaire).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE price_providers (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                  TEXT          NOT NULL UNIQUE,       -- identifiant interne ('yahoo','coingecko'…)
  display_name          TEXT          NOT NULL,
  api_key_env           TEXT,                                -- nom de la variable d'env (ex: 'COINGECKO_API_KEY')
  is_active             BOOLEAN       NOT NULL DEFAULT FALSE, -- désactivé par défaut, à activer en prod
  priority              INTEGER       NOT NULL DEFAULT 100,   -- 1 = premier appelé
  supported_classes     asset_class[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER,
  base_url              TEXT,
  notes                 TEXT,
  metadata              JSONB         NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed : 4 fournisseurs pré-configurés (tous inactifs — à activer selon les clés API dispo)
INSERT INTO price_providers
  (code, display_name, api_key_env, priority, supported_classes, rate_limit_per_minute, base_url)
VALUES
  ('yahoo',       'Yahoo Finance',  NULL,                    10, ARRAY['equity','etf','fund','reit','bond']::asset_class[],          100, 'https://query1.finance.yahoo.com'),
  ('coingecko',   'CoinGecko',      'COINGECKO_API_KEY',     20, ARRAY['crypto']::asset_class[],                                       30, 'https://api.coingecko.com/api/v3'),
  ('alphavantage','Alpha Vantage',  'ALPHAVANTAGE_API_KEY',  30, ARRAY['equity','etf','crypto','metal']::asset_class[],                 5, 'https://www.alphavantage.co/query'),
  ('twelvedata',  'TwelveData',     'TWELVEDATA_API_KEY',    40, ARRAY['equity','etf','fund','crypto','bond']::asset_class[],           8, 'https://api.twelvedata.com');


-- ─────────────────────────────────────────────────────────────
-- 6. ALTER TABLE transactions
--    Ajoute les colonnes portfolio-native (nullable — rétrocompat).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN position_id   UUID           REFERENCES positions(id)   ON DELETE SET NULL,
  ADD COLUMN instrument_id UUID           REFERENCES instruments(id) ON DELETE SET NULL,
  ADD COLUMN quantity      NUMERIC(24,8),                             -- nb de parts échangées
  ADD COLUMN unit_price    NUMERIC(24,8),                             -- prix unitaire à l'exécution
  ADD COLUMN fees          NUMERIC(18,2)  NOT NULL DEFAULT 0;         -- frais de courtage / spread


-- ─────────────────────────────────────────────────────────────
-- 7. RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────

-- instruments : lecture publique pour tous les authentifiés (catalogue partagé)
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instruments_read_authenticated"
  ON instruments FOR SELECT TO authenticated USING (TRUE);

-- positions : propriétaire uniquement
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions_owner_all"
  ON positions FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- instrument_prices : lecture publique
ALTER TABLE instrument_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instrument_prices_read_authenticated"
  ON instrument_prices FOR SELECT TO authenticated USING (TRUE);

-- price_providers : lecture publique
ALTER TABLE price_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_providers_read_authenticated"
  ON price_providers FOR SELECT TO authenticated USING (TRUE);
