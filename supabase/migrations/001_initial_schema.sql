-- =============================================================
-- FYNIX — Migration 001 : Schéma initial complet
-- Version   : 1.0.0
-- Date      : 2026-05-03
-- Scope     : MVP Phase 1
-- =============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================
-- SECTION 1 : ENUMS
-- =============================================================

CREATE TYPE asset_type AS ENUM (
  'real_estate',
  'scpi',
  'stock',
  'etf',
  'crypto',
  'gold',
  'cash',
  'other'
);

CREATE TYPE asset_status AS ENUM (
  'active',
  'sold',
  'closed'
);

CREATE TYPE transaction_type AS ENUM (
  'purchase',       -- achat d'actif
  'sale',           -- vente d'actif
  'rent_income',    -- loyer encaissé
  'dividend',       -- dividende (actions, SCPI)
  'interest',       -- intérêt (livret, compte)
  'loan_payment',   -- remboursement de crédit
  'deposit',        -- apport de capital
  'withdrawal',     -- retrait de capital
  'fee',            -- frais (gestion, courtage)
  'tax',            -- impôt payé
  'transfer'        -- transfert entre comptes internes
);

CREATE TYPE debt_type AS ENUM (
  'mortgage',       -- crédit immobilier
  'consumer',       -- crédit à la consommation
  'professional'    -- crédit professionnel
);

CREATE TYPE debt_status AS ENUM (
  'active',
  'paid_off',
  'restructured'
);

CREATE TYPE deferral_type AS ENUM (
  'none',           -- pas de différé
  'partial',        -- différé partiel (intérêts seulement)
  'total'           -- différé total (aucun paiement)
);

CREATE TYPE envelope_type AS ENUM (
  'pea',
  'cto',
  'assurance_vie',
  'per',
  'wallet_crypto',
  'other'
);

CREATE TYPE holding_mode AS ENUM (
  'direct',
  'assurance_vie',
  'sci',
  'other'
);

CREATE TYPE lot_status AS ENUM (
  'rented',
  'vacant',
  'owner_occupied',
  'works'
);

CREATE TYPE fiscal_regime AS ENUM (
  'lmnp_reel',
  'lmnp_micro',
  'lmp',
  'sci_is',
  'sci_ir',
  'foncier_nu',
  'foncier_micro'
);

CREATE TYPE data_source AS ENUM (
  'manual',
  'api',
  'estimation',
  'import'
);

CREATE TYPE confidence_level AS ENUM (
  'high',
  'medium',
  'low'
);

CREATE TYPE currency_code AS ENUM (
  'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'BTC', 'ETH'
);


-- =============================================================
-- SECTION 2 : PROFIL UTILISATEUR
-- =============================================================

-- Étend auth.users de Supabase. Créé automatiquement à l'inscription.
CREATE TABLE profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        TEXT,
  reference_currency  currency_code NOT NULL DEFAULT 'EUR',
  tmi_rate            NUMERIC(5,2),   -- Tranche Marginale d'Imposition en %
  fiscal_situation    TEXT CHECK (fiscal_situation IN ('single','married','pacs','divorced','widowed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================
-- SECTION 3 : ASSETS (table centrale générique)
-- =============================================================

-- Toutes les classes d'actifs partagent cette table racine.
-- Les attributs spécifiques vivent dans les tables dédiées (real_estate_properties, etc.).
-- current_value est dénormalisé pour les requêtes dashboard rapides.
CREATE TABLE assets (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  asset_type          asset_type    NOT NULL,
  status              asset_status  NOT NULL DEFAULT 'active',
  currency            currency_code NOT NULL DEFAULT 'EUR',
  acquisition_date    DATE,
  acquisition_price   NUMERIC(18,2),        -- coût total d'acquisition (prix + frais)
  current_value       NUMERIC(18,2),        -- valorisation actuelle (dénormalisé)
  notes               TEXT,
  data_source         data_source   NOT NULL DEFAULT 'manual',
  confidence          confidence_level NOT NULL DEFAULT 'medium',
  last_valued_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- =============================================================
-- SECTION 4 : TRANSACTIONS (journal universel — append-only)
-- =============================================================

-- Table centrale de tous les flux financiers. Jamais modifiée, jamais supprimée.
-- amount : positif = entrée de cash, négatif = sortie de cash.
-- Lien optionnel vers asset ET/OU debt.
CREATE TABLE transactions (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id            UUID              REFERENCES assets(id) ON DELETE SET NULL,
  debt_id             UUID,             -- FK vers debts définie après création de la table
  transaction_type    transaction_type  NOT NULL,
  amount              NUMERIC(18,2)     NOT NULL,
  currency            currency_code     NOT NULL DEFAULT 'EUR',
  fx_rate_to_ref      NUMERIC(18,6)     NOT NULL DEFAULT 1.0,   -- taux vers EUR au moment de la transaction
  executed_at         TIMESTAMPTZ       NOT NULL,
  value_date          DATE,             -- date de valeur comptable (peut différer de executed_at)
  label               TEXT,
  notes               TEXT,
  data_source         data_source       NOT NULL DEFAULT 'manual',
  external_ref        TEXT,             -- référence externe (numéro virement, ID ordre courtier)
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
  -- Pas d'updated_at : append-only par conception
);


-- =============================================================
-- SECTION 5 : DETTES & CRÉDITS
-- =============================================================

CREATE TABLE debts (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id            UUID          REFERENCES assets(id) ON DELETE SET NULL,
  name                TEXT          NOT NULL,
  debt_type           debt_type     NOT NULL DEFAULT 'mortgage',
  status              debt_status   NOT NULL DEFAULT 'active',
  lender              TEXT,
  initial_amount      NUMERIC(18,2) NOT NULL,
  currency            currency_code NOT NULL DEFAULT 'EUR',
  interest_rate       NUMERIC(7,4)  NOT NULL,   -- taux nominal annuel en %
  insurance_rate      NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- taux assurance annuel en %
  duration_months     INTEGER       NOT NULL,
  start_date          DATE          NOT NULL,
  deferral_type       deferral_type NOT NULL DEFAULT 'none',
  deferral_months     INTEGER       NOT NULL DEFAULT 0,
  monthly_payment     NUMERIC(18,2),            -- mensualité hors assurance (calculée)
  capital_remaining   NUMERIC(18,2),            -- capital restant dû (mis à jour par trigger ou calcul)
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- FK transactions → debts (ajoutée après création des deux tables)
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_debt
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE SET NULL;

-- Tableau d'amortissement généré programmatiquement côté backend.
-- Recalculé si les paramètres du crédit changent.
CREATE TABLE debt_amortization (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id             UUID          NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_number       INTEGER       NOT NULL,    -- numéro de la mensualité (1-based)
  payment_date        DATE          NOT NULL,
  payment_total       NUMERIC(18,2) NOT NULL,    -- mensualité totale (capital + intérêts + assurance)
  payment_capital     NUMERIC(18,2) NOT NULL,
  payment_interest    NUMERIC(18,2) NOT NULL,
  payment_insurance   NUMERIC(18,2) NOT NULL DEFAULT 0,
  capital_remaining   NUMERIC(18,2) NOT NULL,    -- capital restant après cette mensualité
  is_deferred         BOOLEAN       NOT NULL DEFAULT FALSE,
  UNIQUE (debt_id, period_number)
);


-- =============================================================
-- SECTION 6 : IMMOBILIER PHYSIQUE
-- =============================================================

-- Données physiques et administratives du bien. Lié à assets (1-to-1).
CREATE TABLE real_estate_properties (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id            UUID          NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_type       TEXT          NOT NULL CHECK (property_type IN (
                        'apartment','house','garage','building','land','commercial','other'
                      )),
  address_line1       TEXT,
  address_city        TEXT,
  address_zip         TEXT,
  address_country     TEXT          NOT NULL DEFAULT 'FR',
  surface_m2          NUMERIC(10,2),
  land_surface_m2     NUMERIC(10,2),
  construction_year   INTEGER,
  dpe_class           CHAR(1)       CHECK (dpe_class IN ('A','B','C','D','E','F','G')),
  purchase_price      NUMERIC(18,2),            -- prix net vendeur
  purchase_fees       NUMERIC(18,2)             NOT NULL DEFAULT 0,  -- frais notaire
  works_amount        NUMERIC(18,2)             NOT NULL DEFAULT 0,  -- travaux réalisés
  fiscal_regime       fiscal_regime,
  is_multi_lot        BOOLEAN       NOT NULL DEFAULT FALSE,          -- immeuble avec plusieurs lots
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Lots locatifs d'un bien (appartements dans un immeuble, garages, etc.)
CREATE TABLE real_estate_lots (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID        NOT NULL REFERENCES real_estate_properties(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,    -- ex: "Appt T3 2ème étage"
  lot_type            TEXT        CHECK (lot_type IN ('apartment','garage','parking','commercial','storage','other')),
  surface_m2          NUMERIC(10,2),
  status              lot_status  NOT NULL DEFAULT 'vacant',
  rent_amount         NUMERIC(18,2),           -- loyer HC mensuel
  charges_amount      NUMERIC(18,2)            NOT NULL DEFAULT 0,   -- charges locataire (provisions)
  tenant_name         TEXT,
  lease_start_date    DATE,
  lease_end_date      DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historique des estimations de valeur (append-only, jamais écrasé)
CREATE TABLE property_valuations (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID              NOT NULL REFERENCES real_estate_properties(id) ON DELETE CASCADE,
  user_id             UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valuation_date      DATE              NOT NULL,
  value               NUMERIC(18,2)     NOT NULL,
  price_per_m2        NUMERIC(10,2),             -- calculé ou saisi
  source              data_source       NOT NULL DEFAULT 'manual',
  confidence          confidence_level  NOT NULL DEFAULT 'medium',
  notes               TEXT,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
  -- Pas d'updated_at : historique immuable
);

-- Charges annuelles par bien (une ligne par bien par année)
CREATE TABLE property_charges (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID          NOT NULL REFERENCES real_estate_properties(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year                INTEGER       NOT NULL,
  taxe_fonciere       NUMERIC(18,2) NOT NULL DEFAULT 0,
  insurance           NUMERIC(18,2) NOT NULL DEFAULT 0,
  accountant          NUMERIC(18,2) NOT NULL DEFAULT 0,  -- expert-comptable
  cfe                 NUMERIC(18,2) NOT NULL DEFAULT 0,  -- cotisation foncière des entreprises
  condo_fees          NUMERIC(18,2) NOT NULL DEFAULT 0,  -- charges copropriété
  maintenance         NUMERIC(18,2) NOT NULL DEFAULT 0,  -- entretien / réparations
  other               NUMERIC(18,2) NOT NULL DEFAULT 0,
  vacancy_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- taux de vacance estimé en %
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, year)
);


-- =============================================================
-- SECTION 7 : SCPI
-- =============================================================

CREATE TABLE scpi_assets (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id              UUID          NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scpi_name             TEXT          NOT NULL,
  scpi_code             TEXT,                     -- code AMF ou identifiant interne
  holding_mode          holding_mode  NOT NULL DEFAULT 'direct',
  envelope_name         TEXT,                     -- nom du contrat AV si détention via AV
  nb_shares             NUMERIC(18,4) NOT NULL DEFAULT 0,
  subscription_price    NUMERIC(18,2),            -- PRU (prix de revient unitaire moyen)
  current_share_price   NUMERIC(18,2),            -- valeur de part actuelle (DVM)
  withdrawal_price      NUMERIC(18,2),            -- prix de retrait (peut être inférieur à la valeur)
  distribution_rate     NUMERIC(7,4),             -- taux de distribution annuel en % (TDVM)
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Historique des dividendes SCPI (append-only)
CREATE TABLE scpi_dividends (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  scpi_asset_id       UUID          NOT NULL REFERENCES scpi_assets(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_date        DATE          NOT NULL,
  amount              NUMERIC(18,2) NOT NULL,   -- montant total brut reçu
  per_share           NUMERIC(18,6),             -- montant par part
  nb_shares_at_date   NUMERIC(18,4),             -- nb parts détenues à la date de paiement
  fiscal_year         INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- =============================================================
-- SECTION 8 : ACTIFS FINANCIERS (actions, ETF, crypto, or)
-- =============================================================

-- Enveloppes fiscales et comptes courtiers
CREATE TABLE financial_envelopes (
  id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT            NOT NULL,    -- ex: "PEA Boursorama", "Ledger Nano X"
  envelope_type       envelope_type   NOT NULL,
  broker              TEXT,                        -- ex: "Trade Republic", "Lynxea Spirit", "Lucya Cardif"
  currency            currency_code   NOT NULL DEFAULT 'EUR',
  opening_date        DATE,
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Lignes de portefeuille dans une enveloppe
CREATE TABLE financial_assets (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id            UUID              NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  user_id             UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope_id         UUID              REFERENCES financial_envelopes(id) ON DELETE SET NULL,
  ticker              TEXT,                         -- ex: "AAPL", "BTC-USD", "ETH-EUR"
  isin                TEXT,                         -- code ISIN (actions, ETF)
  name                TEXT              NOT NULL,
  quantity            NUMERIC(18,8)     NOT NULL DEFAULT 0,   -- 8 décimales pour crypto
  average_price       NUMERIC(18,6)     NOT NULL DEFAULT 0,   -- PRU en devise de l'actif
  current_price       NUMERIC(18,6),                          -- dernier prix connu
  current_price_at    TIMESTAMPTZ,                            -- horodatage du dernier prix
  currency            currency_code     NOT NULL DEFAULT 'EUR',
  data_source         data_source       NOT NULL DEFAULT 'api',
  confidence          confidence_level  NOT NULL DEFAULT 'medium',
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Historique de prix (cache persistant — shared entre utilisateurs)
CREATE TABLE price_history (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker              TEXT              NOT NULL,
  price_date          DATE              NOT NULL,
  close_price         NUMERIC(18,6)     NOT NULL,
  open_price          NUMERIC(18,6),
  high_price          NUMERIC(18,6),
  low_price           NUMERIC(18,6),
  volume              NUMERIC(24,2),
  currency            currency_code     NOT NULL DEFAULT 'USD',
  source              data_source       NOT NULL DEFAULT 'api',
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, price_date)
);

-- Cache des prix temps réel avec TTL (géré par Edge Function)
CREATE TABLE market_price_cache (
  ticker              TEXT              PRIMARY KEY,
  price               NUMERIC(18,6)     NOT NULL,
  currency            currency_code     NOT NULL DEFAULT 'USD',
  change_24h          NUMERIC(8,4),               -- variation % sur 24h
  market_cap          NUMERIC(24,2),
  source              TEXT              NOT NULL DEFAULT 'yahoo',
  fetched_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ       NOT NULL   -- TTL : 15 min cours / 24h histo
);


-- =============================================================
-- SECTION 9 : CASH & ÉPARGNE
-- =============================================================

CREATE TABLE cash_accounts (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id            UUID          NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type        TEXT          NOT NULL CHECK (account_type IN (
                        'livret_a','ldds','lep','livret_jeune','pel','cel',
                        'compte_courant','compte_epargne','other'
                      )),
  bank_name           TEXT,
  interest_rate       NUMERIC(7,4)  NOT NULL DEFAULT 0,   -- taux en vigueur en %
  balance             NUMERIC(18,2) NOT NULL DEFAULT 0,   -- solde actuel (dénormalisé)
  balance_date        DATE,                               -- date du dernier relevé
  currency            currency_code NOT NULL DEFAULT 'EUR',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Historique des soldes (append-only, permet reconstruction timeline)
CREATE TABLE cash_balance_history (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_account_id     UUID          NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_date        DATE          NOT NULL,
  balance             NUMERIC(18,2) NOT NULL,
  source              data_source   NOT NULL DEFAULT 'manual',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (cash_account_id, balance_date)
);


-- =============================================================
-- SECTION 10 : TAUX DE CHANGE FX
-- =============================================================

-- Historique partagé des taux de change (source : frankfurter.app)
CREATE TABLE fx_rates (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency       currency_code NOT NULL,
  quote_currency      currency_code NOT NULL,
  rate_date           DATE          NOT NULL,
  rate                NUMERIC(18,8) NOT NULL,
  source              TEXT          NOT NULL DEFAULT 'frankfurter',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (base_currency, quote_currency, rate_date)
);


-- =============================================================
-- SECTION 11 : SNAPSHOTS PATRIMONIAUX (time-series journalière)
-- =============================================================

-- Une photo par jour du patrimoine complet. Générée automatiquement (Edge Function cron).
-- Permet la reconstruction de la courbe d'évolution sans recalcul.
CREATE TABLE patrimony_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date         DATE          NOT NULL,
  total_gross_value     NUMERIC(18,2) NOT NULL,   -- Σ valorisations actifs
  total_debt            NUMERIC(18,2) NOT NULL DEFAULT 0,  -- Σ capitaux restants dus
  total_net_value       NUMERIC(18,2) NOT NULL,   -- brut - dettes
  real_estate_value     NUMERIC(18,2) NOT NULL DEFAULT 0,
  scpi_value            NUMERIC(18,2) NOT NULL DEFAULT 0,
  financial_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_value            NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_value           NUMERIC(18,2) NOT NULL DEFAULT 0,
  monthly_cashflow      NUMERIC(18,2),             -- cash-flow mensuel estimé à cette date
  confidence_score      NUMERIC(5,2),              -- % du patrimoine avec confidence = 'high'
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);


-- =============================================================
-- SECTION 12 : DCA (Dollar-Cost Averaging)
-- =============================================================

-- Plans DCA : paramétrage de la stratégie d'investissement régulier
CREATE TABLE dca_plans (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id            UUID          REFERENCES assets(id) ON DELETE SET NULL,
  envelope_id         UUID          REFERENCES financial_envelopes(id) ON DELETE SET NULL,
  name                TEXT          NOT NULL,
  ticker              TEXT          NOT NULL,
  amount_per_period   NUMERIC(18,2) NOT NULL,
  currency            currency_code NOT NULL DEFAULT 'EUR',
  frequency           TEXT          NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly')),
  start_date          DATE          NOT NULL,
  end_date            DATE,                         -- NULL = sans fin
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Occurrences individuelles générées par le plan DCA.
-- Séparation stricte planification / exécution.
-- La validation est MANUELLE : l'utilisateur confirme chaque achat réel.
CREATE TABLE dca_occurrences (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  dca_plan_id         UUID          NOT NULL REFERENCES dca_plans(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date      DATE          NOT NULL,
  planned_amount      NUMERIC(18,2) NOT NULL,
  actual_amount       NUMERIC(18,2),               -- montant réellement investi (peut différer)
  actual_price        NUMERIC(18,6),               -- prix unitaire au moment de l'achat
  actual_quantity     NUMERIC(18,8),               -- quantité achetée
  status              TEXT          NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','validated','skipped','cancelled')),
  validated_at        TIMESTAMPTZ,
  transaction_id      UUID          REFERENCES transactions(id) ON DELETE SET NULL,
  deviation_note      TEXT,                         -- explication si montant/date différents du plan
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- =============================================================
-- SECTION 13 : AUDIT LOG (traçabilité complète)
-- =============================================================

-- Toutes les modifications sur les tables critiques sont loguées ici.
-- Permet rollback applicatif et audit de conformité.
CREATE TABLE audit_log (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name          TEXT          NOT NULL,
  record_id           UUID          NOT NULL,
  action              TEXT          NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data            JSONB,
  new_data            JSONB,
  changed_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  ip_address          INET
);


-- =============================================================
-- SECTION 14 : INDEX
-- =============================================================

-- Assets
CREATE INDEX idx_assets_user_id       ON assets (user_id);
CREATE INDEX idx_assets_user_type     ON assets (user_id, asset_type);
CREATE INDEX idx_assets_user_status   ON assets (user_id, status);

-- Transactions (requêtes temporelles fréquentes)
CREATE INDEX idx_txn_user_time        ON transactions (user_id, executed_at DESC);
CREATE INDEX idx_txn_asset            ON transactions (asset_id);
CREATE INDEX idx_txn_debt             ON transactions (debt_id);
CREATE INDEX idx_txn_type             ON transactions (user_id, transaction_type);

-- Debts
CREATE INDEX idx_debts_user           ON debts (user_id);
CREATE INDEX idx_debts_asset          ON debts (asset_id);
CREATE INDEX idx_amort_debt           ON debt_amortization (debt_id, period_number);

-- Real Estate
CREATE INDEX idx_re_prop_user         ON real_estate_properties (user_id);
CREATE INDEX idx_re_prop_asset        ON real_estate_properties (asset_id);
CREATE INDEX idx_re_lots_property     ON real_estate_lots (property_id);
CREATE INDEX idx_re_lots_user         ON real_estate_lots (user_id);
CREATE INDEX idx_valuations_prop_date ON property_valuations (property_id, valuation_date DESC);
CREATE INDEX idx_charges_prop_year    ON property_charges (property_id, year DESC);

-- SCPI
CREATE INDEX idx_scpi_user            ON scpi_assets (user_id);
CREATE INDEX idx_scpi_dividends_asset ON scpi_dividends (scpi_asset_id, payment_date DESC);

-- Financial
CREATE INDEX idx_envelopes_user       ON financial_envelopes (user_id);
CREATE INDEX idx_fin_assets_user      ON financial_assets (user_id);
CREATE INDEX idx_fin_assets_envelope  ON financial_assets (envelope_id);
CREATE INDEX idx_fin_assets_ticker    ON financial_assets (ticker);
CREATE INDEX idx_price_hist_ticker    ON price_history (ticker, price_date DESC);
CREATE INDEX idx_cache_expires        ON market_price_cache (expires_at);

-- Cash
CREATE INDEX idx_cash_user            ON cash_accounts (user_id);
CREATE INDEX idx_cash_bal_hist        ON cash_balance_history (cash_account_id, balance_date DESC);

-- FX
CREATE INDEX idx_fx_lookup            ON fx_rates (base_currency, quote_currency, rate_date DESC);

-- Snapshots (dashboard principal)
CREATE INDEX idx_snapshots_user_date  ON patrimony_snapshots (user_id, snapshot_date DESC);

-- DCA
CREATE INDEX idx_dca_plans_user       ON dca_plans (user_id, is_active);
CREATE INDEX idx_dca_occur_plan       ON dca_occurrences (dca_plan_id, scheduled_date);
CREATE INDEX idx_dca_occur_status     ON dca_occurrences (user_id, status, scheduled_date);

-- Audit
CREATE INDEX idx_audit_user_table     ON audit_log (user_id, table_name, changed_at DESC);
CREATE INDEX idx_audit_record         ON audit_log (table_name, record_id, changed_at DESC);


-- =============================================================
-- SECTION 15 : TRIGGERS
-- =============================================================

-- Fonction générique pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Application sur toutes les tables mutables
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_debts_updated_at
  BEFORE UPDATE ON debts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_re_properties_updated_at
  BEFORE UPDATE ON real_estate_properties FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_re_lots_updated_at
  BEFORE UPDATE ON real_estate_lots FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_property_charges_updated_at
  BEFORE UPDATE ON property_charges FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_scpi_assets_updated_at
  BEFORE UPDATE ON scpi_assets FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_fin_envelopes_updated_at
  BEFORE UPDATE ON financial_envelopes FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_fin_assets_updated_at
  BEFORE UPDATE ON financial_assets FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_cash_accounts_updated_at
  BEFORE UPDATE ON cash_accounts FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_dca_plans_updated_at
  BEFORE UPDATE ON dca_plans FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_dca_occur_updated_at
  BEFORE UPDATE ON dca_occurrences FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();


-- Création automatique du profil lors de l'inscription
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();


-- Fonction d'audit générique
CREATE OR REPLACE FUNCTION fn_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, new_data)
    VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW));

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data)
    VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Application audit sur les tables critiques
CREATE TRIGGER audit_assets
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TRIGGER audit_transactions
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TRIGGER audit_debts
  AFTER INSERT OR UPDATE OR DELETE ON debts
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TRIGGER audit_re_properties
  AFTER INSERT OR UPDATE OR DELETE ON real_estate_properties
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TRIGGER audit_dca_occurrences
  AFTER UPDATE ON dca_occurrences
  FOR EACH ROW EXECUTE FUNCTION fn_audit();


-- =============================================================
-- SECTION 16 : ROW LEVEL SECURITY (RLS)
-- =============================================================

-- Activation RLS sur toutes les tables utilisateur
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_amortization      ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate_lots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_valuations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_charges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scpi_assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scpi_dividends         ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_envelopes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_assets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_balance_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimony_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_occurrences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;

-- Tables partagées (pas de user_id, accès lecture pour tous les authentifiés)
ALTER TABLE price_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_price_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates               ENABLE ROW LEVEL SECURITY;

-- Politique standard : chaque utilisateur accède uniquement à ses données
CREATE POLICY "user_own_data" ON profiles
  FOR ALL USING (id = auth.uid());

CREATE POLICY "user_own_data" ON assets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON transactions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON debts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON debt_amortization
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON real_estate_properties
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON real_estate_lots
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON property_valuations
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON property_charges
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON scpi_assets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON scpi_dividends
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON financial_envelopes
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON financial_assets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON cash_accounts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON cash_balance_history
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON patrimony_snapshots
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON dca_plans
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "user_own_data" ON dca_occurrences
  FOR ALL USING (user_id = auth.uid());

-- Audit : lecture seule pour le propriétaire
CREATE POLICY "user_read_own_audit" ON audit_log
  FOR SELECT USING (user_id = auth.uid());

-- Tables partagées : lecture pour tous les utilisateurs authentifiés
CREATE POLICY "authenticated_read" ON price_history
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "authenticated_read" ON market_price_cache
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "authenticated_read" ON fx_rates
  FOR SELECT TO authenticated USING (TRUE);

-- Écriture sur les tables partagées réservée au rôle service (Edge Functions)
CREATE POLICY "service_write" ON price_history
  FOR INSERT TO service_role WITH CHECK (TRUE);

CREATE POLICY "service_all" ON market_price_cache
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_write" ON fx_rates
  FOR INSERT TO service_role WITH CHECK (TRUE);
