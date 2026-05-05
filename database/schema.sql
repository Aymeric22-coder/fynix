-- =============================================================================
-- FYNIX — Schéma de base de données complet
-- Version : 1.0.0 | Phase MVP
-- Moteur   : PostgreSQL (Supabase)
-- Règle    : APPEND-ONLY sur valuations. Jamais de DELETE logique direct.
--            Toutes les suppressions passent par soft-delete (is_active, status).
-- =============================================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- recherche full-text light

-- =============================================================================
-- 0. ENUM TYPES (clarté + contrainte DB native)
-- =============================================================================

CREATE TYPE asset_type_enum AS ENUM (
  'real_estate', 'scpi', 'stock', 'etf', 'crypto', 'gold', 'cash', 'other'
);

CREATE TYPE confidence_level_enum AS ENUM ('high', 'medium', 'low');

CREATE TYPE data_source_enum AS ENUM ('manual', 'api', 'dvf', 'estimation', 'snapshot');

CREATE TYPE transaction_type_enum AS ENUM (
  'buy', 'sell', 'rent_income', 'dividend', 'interest',
  'loan_repayment', 'deposit', 'withdrawal', 'fee',
  'tax', 'transfer', 'dca_execution', 'capital_gain', 'other'
);

CREATE TYPE transaction_status_enum AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TYPE frequency_enum AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual');

CREATE TYPE fiscal_regime_enum AS ENUM (
  'nu', 'lmnp_micro', 'lmnp_reel', 'lmp', 'sci_ir', 'sci_is'
);

CREATE TYPE property_type_enum AS ENUM (
  'apartment', 'house', 'garage', 'building', 'land', 'other'
);

CREATE TYPE rental_status_enum AS ENUM ('rented', 'vacant', 'works', 'owner_occupied');

CREATE TYPE envelope_type_enum AS ENUM (
  'pea', 'cto', 'assurance_vie', 'pea_pme', 'per', 'wallet_crypto', 'other'
);

CREATE TYPE loan_type_enum AS ENUM ('mortgage', 'consumer', 'bridge', 'other');

CREATE TYPE deferred_type_enum AS ENUM ('none', 'partial', 'total');

CREATE TYPE dca_status_enum AS ENUM ('active', 'paused', 'completed', 'cancelled');

CREATE TYPE dca_occurrence_status_enum AS ENUM ('pending', 'validated', 'skipped', 'cancelled');

CREATE TYPE alert_type_enum AS ENUM (
  'overexposure_sector', 'overexposure_geo', 'allocation_drift',
  'yield_drop', 'vacancy_duration', 'dca_pending', 'loan_rate', 'custom'
);

CREATE TYPE audit_action_enum AS ENUM ('INSERT', 'UPDATE', 'SOFT_DELETE', 'CANCEL', 'RESTORE');

-- =============================================================================
-- 1. PROFILS UTILISATEURS
-- =============================================================================

CREATE TABLE profiles (
  id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT,
  reference_currency  VARCHAR(3)  NOT NULL DEFAULT 'EUR',
  -- Fiscalité
  tmi_rate            DECIMAL(5,2)              -- 0 / 11 / 30 / 41 / 45
                        CHECK (tmi_rate IN (0, 11, 30, 41, 45)),
  fiscal_situation    TEXT        DEFAULT 'single'
                        CHECK (fiscal_situation IN ('single', 'married', 'pacs', 'divorced', 'widowed')),
  fiscal_parts        DECIMAL(4,2) DEFAULT 1.0,
  is_lmp              BOOLEAN     DEFAULT false,  -- statut LMP (seuil 23k€)
  -- Préférences UI
  default_view        TEXT        DEFAULT 'synthetic'
                        CHECK (default_view IN ('synthetic', 'advanced')),
  -- Timestamps
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Paramètres utilisateur, configuration fiscale et préférences UI.';
COMMENT ON COLUMN profiles.tmi_rate IS 'Tranche marginale d''imposition en pourcentage entier.';

-- =============================================================================
-- 2. TAUX DE CHANGE (FX)
-- =============================================================================

CREATE TABLE fx_rates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency   VARCHAR(3)  NOT NULL,
  target_currency VARCHAR(3)  NOT NULL,
  rate            DECIMAL(20,8) NOT NULL CHECK (rate > 0),
  rate_date       DATE        NOT NULL,
  source          TEXT        DEFAULT 'ECB'
                    CHECK (source IN ('ECB', 'manual', 'fallback')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_fx_rate_daily UNIQUE (base_currency, target_currency, rate_date)
);

COMMENT ON TABLE fx_rates IS 'Historique des taux de change. Source principale : Frankfurter.app (BCE).';

-- =============================================================================
-- 3. ACTIFS — TABLE GÉNÉRIQUE (master record)
-- =============================================================================

CREATE TABLE assets (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name              TEXT              NOT NULL,
  asset_type        asset_type_enum   NOT NULL,
  currency          VARCHAR(3)        DEFAULT 'EUR',
  purchase_date     DATE,
  -- La valeur actuelle est TOUJOURS lue depuis asset_valuations (dernière entrée)
  -- Ce champ est un cache dénormalisé pour les KPIs rapides
  cached_value      DECIMAL(20,2),
  cached_value_at   TIMESTAMPTZ,
  is_active         BOOLEAN           DEFAULT true,
  notes             TEXT,
  -- Fiabilité de la donnée
  data_source       data_source_enum  DEFAULT 'manual',
  confidence_level  confidence_level_enum DEFAULT 'medium',
  last_updated_at   TIMESTAMPTZ       DEFAULT NOW(),
  created_at        TIMESTAMPTZ       DEFAULT NOW(),
  updated_at        TIMESTAMPTZ       DEFAULT NOW()
);

COMMENT ON TABLE assets IS 'Table maître de tous les actifs. Chaque type a une table d''extension dédiée.';
COMMENT ON COLUMN assets.cached_value IS 'Cache de la dernière valorisation. Ne jamais utiliser comme source de vérité — lire asset_valuations.';

-- =============================================================================
-- 4. ENVELOPPES FINANCIÈRES
-- =============================================================================

CREATE TABLE financial_envelopes (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  envelope_type   envelope_type_enum  NOT NULL,
  broker_name     TEXT                NOT NULL,  -- 'Trade Republic', 'Lynxea', 'Lucya Cardif'...
  account_name    TEXT                NOT NULL,  -- label libre utilisateur
  account_number  TEXT,                          -- référence interne (optionnel)
  currency        VARCHAR(3)          DEFAULT 'EUR',
  opening_date    DATE,
  is_active       BOOLEAN             DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ         DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         DEFAULT NOW()
);

COMMENT ON TABLE financial_envelopes IS 'PEA, CTO, AV, Wallet... Un utilisateur peut avoir plusieurs CTO/AV mais un seul PEA actif.';

-- Contrainte réglementaire : 1 seul PEA actif par utilisateur
CREATE UNIQUE INDEX idx_one_active_pea_per_user
  ON financial_envelopes(user_id)
  WHERE envelope_type = 'pea' AND is_active = true;

-- =============================================================================
-- 5. CRÉDITS & DETTES
-- =============================================================================

CREATE TABLE loans (
  id                      UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset_id                UUID              REFERENCES assets(id) ON DELETE SET NULL,
  loan_name               TEXT              NOT NULL,
  lender                  TEXT,
  loan_type               loan_type_enum    DEFAULT 'mortgage',
  -- Caractéristiques financières
  principal_amount        DECIMAL(20,2)     NOT NULL CHECK (principal_amount > 0),
  outstanding_capital     DECIMAL(20,2),    -- CRD, calculé dynamiquement mais mis en cache
  interest_rate           DECIMAL(8,6)      NOT NULL CHECK (interest_rate >= 0),  -- taux annuel
  insurance_rate          DECIMAL(8,6)      DEFAULT 0 CHECK (insurance_rate >= 0), -- taux annuel assurance
  duration_months         INTEGER           NOT NULL CHECK (duration_months > 0),
  start_date              DATE              NOT NULL,
  -- Différé
  deferred_type           deferred_type_enum DEFAULT 'none',
  deferred_months         INTEGER           DEFAULT 0 CHECK (deferred_months >= 0),
  -- Mensualités (calculées par le moteur d'amortissement backend)
  monthly_payment         DECIMAL(20,2),    -- hors assurance
  monthly_insurance       DECIMAL(20,2)     DEFAULT 0,
  -- Frais remboursement anticipé
  early_repayment_fee_rate DECIMAL(8,6)     DEFAULT 0,
  -- Statut
  status                  TEXT              DEFAULT 'active'
                            CHECK (status IN ('active', 'closed', 'defaulted')),
  closed_at               DATE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ       DEFAULT NOW(),
  updated_at              TIMESTAMPTZ       DEFAULT NOW()
);

COMMENT ON TABLE loans IS 'Crédits immobiliers et autres dettes. Le tableau d''amortissement est calculé dynamiquement côté backend, pas stocké ligne par ligne.';
COMMENT ON COLUMN loans.interest_rate IS 'Taux annuel nominal en décimal (ex : 0.035 pour 3.5%).';

-- =============================================================================
-- 6. EXTENSIONS D'ACTIFS — IMMOBILIER PHYSIQUE
-- =============================================================================

CREATE TABLE real_estate_assets (
  id                    UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              UUID                  NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  property_type         property_type_enum    NOT NULL,
  -- Adresse
  address_street        TEXT,
  address_city          TEXT,
  address_zip           VARCHAR(10),
  address_country       VARCHAR(3)            DEFAULT 'FRA',
  -- Caractéristiques physiques
  surface_m2            DECIMAL(10,2),
  rooms_count           INTEGER,
  construction_year     INTEGER,
  dpe_rating            CHAR(1)               CHECK (dpe_rating IN ('A','B','C','D','E','F','G')),
  -- Coûts d'acquisition
  purchase_fees         DECIMAL(20,2)         DEFAULT 0,  -- frais de notaire
  renovation_cost       DECIMAL(20,2)         DEFAULT 0,  -- travaux initiaux
  -- Fiscalité
  fiscal_regime         fiscal_regime_enum,
  -- DVF (données de valeurs foncières — Etalab)
  dvf_reference_value   DECIMAL(20,2),
  dvf_price_per_m2      DECIMAL(20,2),
  dvf_last_checked_at   TIMESTAMPTZ,
  dvf_sample_size       INTEGER,              -- nb de transactions DVF utilisées
  -- Structure
  is_building           BOOLEAN               DEFAULT false,  -- immeuble de rapport (multi-lots)
  created_at            TIMESTAMPTZ           DEFAULT NOW(),
  updated_at            TIMESTAMPTZ           DEFAULT NOW(),

  CONSTRAINT uq_real_estate_asset UNIQUE (asset_id)
);

-- =============================================================================
-- 7. LOTS (UNITÉS D'UN IMMEUBLE)
-- =============================================================================

CREATE TABLE real_estate_units (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID                NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  unit_name         TEXT                NOT NULL,  -- "Appt T3 1er", "Garage A"
  unit_type         TEXT
                      CHECK (unit_type IN ('apartment', 'house', 'garage', 'commercial', 'parking', 'storage', 'other')),
  surface_m2        DECIMAL(10,2),
  -- Situation locative
  current_rent      DECIMAL(20,2)       DEFAULT 0,      -- loyer charges exclues
  charges_tenant    DECIMAL(20,2)       DEFAULT 0,      -- charges récupérables
  rental_status     rental_status_enum  DEFAULT 'vacant',
  tenant_since      DATE,
  lease_end_date    DATE,
  lease_type        TEXT
                      CHECK (lease_type IN ('nu', 'meuble', 'commercial', 'colocation', 'saisonnier')),
  -- Données fiscales spécifiques au lot (hérité du bien si null)
  fiscal_regime     fiscal_regime_enum,
  created_at        TIMESTAMPTZ         DEFAULT NOW(),
  updated_at        TIMESTAMPTZ         DEFAULT NOW()
);

COMMENT ON TABLE real_estate_units IS 'Lots d''un immeuble de rapport. Pour un bien avec un seul lot, une entrée unique est créée automatiquement.';

-- =============================================================================
-- 8. CHARGES IMMOBILIÈRES RÉCURRENTES
-- =============================================================================

CREATE TABLE real_estate_charges (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  unit_id       UUID        REFERENCES real_estate_units(id) ON DELETE CASCADE,  -- null = charge du bien entier
  charge_type   TEXT        NOT NULL
                  CHECK (charge_type IN (
                    'taxe_fonciere', 'insurance', 'accounting', 'cfe',
                    'copropriete', 'management_fee', 'maintenance', 'electricity',
                    'internet', 'water', 'other'
                  )),
  label         TEXT        NOT NULL,
  amount        DECIMAL(20,2) NOT NULL CHECK (amount >= 0),
  frequency     frequency_enum NOT NULL,
  start_date    DATE,
  end_date      DATE,
  is_active     BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 9. EXTENSION SCPI
-- =============================================================================

CREATE TABLE scpi_assets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  envelope_id           UUID        REFERENCES financial_envelopes(id) ON DELETE SET NULL,
  -- Identification
  scpi_name             TEXT        NOT NULL,
  scpi_manager          TEXT,       -- société de gestion (ex: Corum, Primonial...)
  isin                  VARCHAR(12),
  -- Détention
  shares_count          DECIMAL(14,4) NOT NULL CHECK (shares_count > 0),
  subscription_price    DECIMAL(20,4) NOT NULL CHECK (subscription_price > 0),  -- PRU
  current_withdrawal_price DECIMAL(20,4),   -- prix de retrait actuel (saisie manuelle)
  withdrawal_price_date DATE,
  holding_type          TEXT        DEFAULT 'direct'
                          CHECK (holding_type IN ('direct', 'assurance_vie', 'pea_pme')),
  -- Caractéristiques
  official_distribution_rate DECIMAL(7,4),  -- TDVM officiel en %
  geography             TEXT,       -- 'france', 'europe', 'diversifie', 'international'
  sector                TEXT,       -- 'bureaux', 'commerce', 'sante', 'logistique', 'residentiel'
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_scpi_asset UNIQUE (asset_id)
);

-- =============================================================================
-- 10. POSITIONS FINANCIÈRES (BOURSE / CRYPTO / OR)
-- =============================================================================

CREATE TABLE financial_holdings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  envelope_id       UUID        NOT NULL REFERENCES financial_envelopes(id) ON DELETE CASCADE,
  asset_id          UUID        REFERENCES assets(id) ON DELETE SET NULL,
  -- Identification du titre
  ticker            TEXT,
  isin              VARCHAR(12),
  asset_name        TEXT        NOT NULL,
  asset_subtype     TEXT
                      CHECK (asset_subtype IN ('stock', 'etf', 'bond', 'crypto', 'gold', 'reit', 'other')),
  -- Position
  quantity          DECIMAL(20,8) NOT NULL DEFAULT 0,
  average_buy_price DECIMAL(20,8) NOT NULL DEFAULT 0,  -- PRU
  currency          VARCHAR(3)  DEFAULT 'EUR',
  -- Prix de marché (cache — source de vérité = API)
  last_price        DECIMAL(20,8),
  last_price_at     TIMESTAMPTZ,
  price_source      data_source_enum DEFAULT 'manual',
  -- Statut
  is_active         BOOLEAN     DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE financial_holdings IS 'Positions par titre et par enveloppe. Le PRU est recalculé à chaque transaction BUY.';

-- =============================================================================
-- 11. COMPTES CASH & ÉPARGNE
-- =============================================================================

CREATE TABLE cash_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  account_type    TEXT        NOT NULL
                    CHECK (account_type IN (
                      'livret_a', 'ldds', 'lep', 'livret_jeune',
                      'compte_courant', 'compte_terme', 'other'
                    )),
  bank_name       TEXT,
  account_number  TEXT,
  current_balance DECIMAL(20,2) DEFAULT 0,
  interest_rate   DECIMAL(8,6)  DEFAULT 0 CHECK (interest_rate >= 0),  -- taux annuel
  ceiling         DECIMAL(20,2),  -- plafond réglementaire (ex: 22950 pour Livret A)
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT uq_cash_account_asset UNIQUE (asset_id)
);

-- =============================================================================
-- 12. HISTORIQUE DES VALORISATIONS (TIME-SERIES — APPEND ONLY)
-- =============================================================================

CREATE TABLE asset_valuations (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID                  NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id             UUID                  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  valuation_date      DATE                  NOT NULL,
  value               DECIMAL(20,2)         NOT NULL CHECK (value >= 0),
  currency            VARCHAR(3)            DEFAULT 'EUR',
  value_eur           DECIMAL(20,2),        -- valeur convertie en EUR à la date
  fx_rate_used        DECIMAL(20,8),        -- taux de change appliqué
  valuation_method    data_source_enum      DEFAULT 'manual',
  confidence_level    confidence_level_enum DEFAULT 'medium',
  notes               TEXT,
  created_at          TIMESTAMPTZ           DEFAULT NOW()
  -- PAS de updated_at : cette table est APPEND-ONLY
  -- Pour corriger une valeur : insérer une nouvelle ligne avec la date corrigée
);

COMMENT ON TABLE asset_valuations IS 'Historique des valorisations. APPEND-ONLY : aucune mise à jour, aucune suppression. Pour corriger : insérer une nouvelle ligne.';

-- Vue pratique : dernière valorisation par actif
CREATE VIEW asset_latest_valuations AS
  SELECT DISTINCT ON (asset_id)
    asset_id,
    value,
    value_eur,
    currency,
    valuation_date,
    valuation_method,
    confidence_level
  FROM asset_valuations
  ORDER BY asset_id, valuation_date DESC, created_at DESC;

-- =============================================================================
-- 13. SNAPSHOTS PATRIMONIAUX (quotidiens)
-- =============================================================================

CREATE TABLE portfolio_snapshots (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_date       DATE          NOT NULL,
  -- Valeurs agrégées
  total_gross_value   DECIMAL(20,2) NOT NULL,  -- somme des actifs
  total_debt          DECIMAL(20,2) DEFAULT 0,  -- somme CRD des crédits
  total_net_value     DECIMAL(20,2) NOT NULL,   -- brut - dettes
  -- Détail par classe (dénormalisé pour les graphiques)
  value_real_estate   DECIMAL(20,2) DEFAULT 0,
  value_scpi          DECIMAL(20,2) DEFAULT 0,
  value_stocks        DECIMAL(20,2) DEFAULT 0,
  value_crypto        DECIMAL(20,2) DEFAULT 0,
  value_gold          DECIMAL(20,2) DEFAULT 0,
  value_cash          DECIMAL(20,2) DEFAULT 0,
  value_other         DECIMAL(20,2) DEFAULT 0,
  -- Cash-flow mensuel estimé
  monthly_cashflow    DECIMAL(20,2),
  -- Allocation en % (JSONB pour flexibilité)
  allocation_pct      JSONB,        -- {real_estate: 45.2, stocks: 30.1, ...}
  currency            VARCHAR(3)    DEFAULT 'EUR',
  snapshot_source     TEXT          DEFAULT 'auto'
                        CHECK (snapshot_source IN ('auto', 'manual')),
  created_at          TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT uq_portfolio_snapshot_daily UNIQUE (user_id, snapshot_date)
);

COMMENT ON TABLE portfolio_snapshots IS 'Snapshot quotidien du patrimoine agrégé. Généré par Edge Function Supabase chaque nuit. Permet l''affichage du graphique d''évolution sans recalcul coûteux.';

-- =============================================================================
-- 14. PLANS DCA (PLANIFICATION)
-- =============================================================================

CREATE TABLE dca_plans (
  id                      UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  envelope_id             UUID              NOT NULL REFERENCES financial_envelopes(id) ON DELETE CASCADE,
  asset_id                UUID              REFERENCES assets(id) ON DELETE SET NULL,
  -- Cible
  ticker                  TEXT,
  isin                    VARCHAR(12),
  asset_name              TEXT              NOT NULL,
  -- Paramètres
  amount_per_occurrence   DECIMAL(20,2)     NOT NULL CHECK (amount_per_occurrence > 0),
  currency                VARCHAR(3)        DEFAULT 'EUR',
  frequency               frequency_enum    NOT NULL,
  start_date              DATE              NOT NULL,
  end_date                DATE,             -- NULL = indéfini
  -- Jour d'exécution
  day_of_month            INTEGER           CHECK (day_of_month BETWEEN 1 AND 28),
  day_of_week             INTEGER           CHECK (day_of_week BETWEEN 0 AND 6),
  -- Comportement
  status                  dca_status_enum   DEFAULT 'active',
  auto_validate           BOOLEAN           DEFAULT false,  -- FALSE = validation manuelle obligatoire
  -- Tolérance d'écart de prix (%)
  price_tolerance_pct     DECIMAL(5,2)      DEFAULT 5.0,
  notes                   TEXT,
  created_at              TIMESTAMPTZ       DEFAULT NOW(),
  updated_at              TIMESTAMPTZ       DEFAULT NOW()
);

COMMENT ON TABLE dca_plans IS 'Planification des investissements programmés. La génération des occurrences est séparée de leur exécution.';

-- =============================================================================
-- 15. OCCURRENCES DCA (EXÉCUTION — séparée de la planification)
-- =============================================================================

CREATE TABLE dca_occurrences (
  id                UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  dca_plan_id       UUID                      NOT NULL REFERENCES dca_plans(id) ON DELETE CASCADE,
  user_id           UUID                      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Planifié
  scheduled_date    DATE                      NOT NULL,
  planned_amount    DECIMAL(20,2)             NOT NULL,
  planned_price     DECIMAL(20,8),            -- prix estimé à la génération
  -- Exécuté (rempli lors de la validation)
  actual_date       DATE,
  actual_amount     DECIMAL(20,2),
  actual_price      DECIMAL(20,8),            -- prix réel d'exécution
  shares_acquired   DECIMAL(20,8),
  -- Écart
  price_deviation_pct DECIMAL(8,4),           -- (actual - planned) / planned * 100
  -- Statut
  status            dca_occurrence_status_enum DEFAULT 'pending',
  validation_note   TEXT,
  validated_at      TIMESTAMPTZ,
  -- Lien transaction (ajouté après INSERT via ALTER — voir fin de fichier)
  transaction_id    UUID,                     -- FK ajoutée plus bas
  created_at        TIMESTAMPTZ               DEFAULT NOW(),
  updated_at        TIMESTAMPTZ               DEFAULT NOW(),

  CONSTRAINT uq_dca_occurrence_plan_date UNIQUE (dca_plan_id, scheduled_date)
);

-- =============================================================================
-- 16. TRANSACTIONS (REGISTRE CENTRAL — SOURCE DE VÉRITÉ)
-- =============================================================================

CREATE TABLE transactions (
  id                    UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID                      NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type      transaction_type_enum     NOT NULL,
  -- Liaisons optionnelles (polyvalent selon le type)
  asset_id              UUID                      REFERENCES assets(id) ON DELETE SET NULL,
  loan_id               UUID                      REFERENCES loans(id) ON DELETE SET NULL,
  envelope_id           UUID                      REFERENCES financial_envelopes(id) ON DELETE SET NULL,
  unit_id               UUID                      REFERENCES real_estate_units(id) ON DELETE SET NULL,
  holding_id            UUID                      REFERENCES financial_holdings(id) ON DELETE SET NULL,
  dca_occurrence_id     UUID                      REFERENCES dca_occurrences(id) ON DELETE SET NULL,
  -- Montant
  amount                DECIMAL(20,8)             NOT NULL,      -- montant dans la devise de la transaction
  currency              VARCHAR(3)                DEFAULT 'EUR',
  amount_eur            DECIMAL(20,8),             -- converti en EUR à la date (calculé)
  fx_rate               DECIMAL(20,8),             -- taux appliqué
  -- Pour les achats/ventes de titres
  quantity              DECIMAL(20,8),             -- nb d'unités / parts / actions
  unit_price            DECIMAL(20,8),             -- prix unitaire
  fees                  DECIMAL(20,4)             DEFAULT 0,      -- frais de courtage
  -- Dates
  transaction_date      DATE                      NOT NULL,
  value_date            DATE,                      -- date de valeur effective
  -- Description
  label                 TEXT                      NOT NULL,
  notes                 TEXT,
  -- Statut et annulation logique
  status                transaction_status_enum   DEFAULT 'confirmed',
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          UUID                      REFERENCES profiles(id),
  cancelled_reason      TEXT,
  cancellation_transaction_id UUID               REFERENCES transactions(id),  -- transaction d'inversion
  -- Traçabilité
  data_source           data_source_enum          DEFAULT 'manual',
  external_reference    TEXT,                      -- référence avis d'opéré, relevé...
  created_at            TIMESTAMPTZ               DEFAULT NOW(),
  updated_at            TIMESTAMPTZ               DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Registre central de tous les flux financiers. Source de vérité pour le calcul des performances. Une annulation crée une transaction miroir (montant négatif) + mise à jour status=cancelled.';
COMMENT ON COLUMN transactions.cancellation_transaction_id IS 'Référence vers la transaction d''annulation (montant inverse). L''annulation ne supprime jamais de données.';

-- FK circulaire résolue après création des deux tables
ALTER TABLE dca_occurrences
  ADD CONSTRAINT fk_dca_occurrence_transaction
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;

-- =============================================================================
-- 17. HISTORIQUE DES DIVIDENDES SCPI
-- =============================================================================

CREATE TABLE scpi_dividends (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id  UUID          REFERENCES transactions(id) ON DELETE SET NULL,
  period_year     INTEGER       NOT NULL,
  period_quarter  INTEGER       CHECK (period_quarter BETWEEN 1 AND 4),
  amount_per_share DECIMAL(20,6) NOT NULL,
  total_amount    DECIMAL(20,2) NOT NULL,
  payment_date    DATE          NOT NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

COMMENT ON TABLE scpi_dividends IS 'Historique des dividendes SCPI. Toujours liés à une transaction de type ''dividend''.';

-- =============================================================================
-- 18. LOGS D'AUDIT
-- =============================================================================

CREATE TABLE audit_logs (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  table_name      TEXT              NOT NULL,
  record_id       UUID              NOT NULL,
  action          audit_action_enum NOT NULL,
  old_values      JSONB,
  new_values      JSONB,
  changed_fields  TEXT[],
  session_info    JSONB,            -- {ip, user_agent, app_version}
  created_at      TIMESTAMPTZ       DEFAULT NOW()
  -- JAMAIS de UPDATE ni DELETE sur audit_logs
);

COMMENT ON TABLE audit_logs IS 'Traçabilité complète. APPEND-ONLY. Peuplé par triggers PostgreSQL sur les tables métier.';

-- =============================================================================
-- 19. RÈGLES D'ALERTE
-- =============================================================================

CREATE TABLE alert_rules (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID              NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type      alert_type_enum   NOT NULL,
  asset_id        UUID              REFERENCES assets(id) ON DELETE CASCADE,  -- null = règle globale
  label           TEXT              NOT NULL,
  threshold       DECIMAL(20,4),
  threshold_unit  TEXT,             -- '%', 'EUR', 'days', 'months'
  is_active       BOOLEAN           DEFAULT true,
  created_at      TIMESTAMPTZ       DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       DEFAULT NOW()
);

-- =============================================================================
-- 20. INSTANCES D'ALERTE DÉCLENCHÉES
-- =============================================================================

CREATE TABLE alert_instances (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id   UUID          NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  triggered_at    TIMESTAMPTZ   DEFAULT NOW(),
  trigger_value   DECIMAL(20,4),
  message         TEXT          NOT NULL,
  is_read         BOOLEAN       DEFAULT false,
  is_dismissed    BOOLEAN       DEFAULT false,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- =============================================================================
-- INDEX — PERFORMANCE CRITIQUE
-- =============================================================================

-- Actifs
CREATE INDEX idx_assets_user_type     ON assets(user_id, asset_type) WHERE is_active = true;
CREATE INDEX idx_assets_user_active   ON assets(user_id) WHERE is_active = true;

-- Valorisations (time-series — requêtes fréquentes)
CREATE INDEX idx_valuations_asset_date    ON asset_valuations(asset_id, valuation_date DESC);
CREATE INDEX idx_valuations_user_date     ON asset_valuations(user_id, valuation_date DESC);

-- Transactions (requêtes analytics)
CREATE INDEX idx_tx_user_date         ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_tx_asset_date        ON transactions(asset_id, transaction_date) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_tx_status            ON transactions(user_id, status) WHERE status != 'cancelled';
CREATE INDEX idx_tx_type_user         ON transactions(user_id, transaction_type, transaction_date DESC);

-- Snapshots
CREATE INDEX idx_snapshots_user_date  ON portfolio_snapshots(user_id, snapshot_date DESC);

-- FX rates
CREATE INDEX idx_fx_currencies_date   ON fx_rates(base_currency, target_currency, rate_date DESC);

-- DCA
CREATE INDEX idx_dca_plan_user        ON dca_plans(user_id, status) WHERE status = 'active';
CREATE INDEX idx_dca_occ_plan_status  ON dca_occurrences(dca_plan_id, status, scheduled_date);
CREATE INDEX idx_dca_occ_pending      ON dca_occurrences(user_id, scheduled_date) WHERE status = 'pending';

-- Immobilier
CREATE INDEX idx_re_units_asset       ON real_estate_units(asset_id, rental_status);
CREATE INDEX idx_re_charges_asset     ON real_estate_charges(asset_id) WHERE is_active = true;

-- Enveloppes
CREATE INDEX idx_envelopes_user_type  ON financial_envelopes(user_id, envelope_type) WHERE is_active = true;

-- Holdings
CREATE INDEX idx_holdings_envelope    ON financial_holdings(envelope_id) WHERE is_active = true;
CREATE INDEX idx_holdings_ticker      ON financial_holdings(user_id, ticker) WHERE ticker IS NOT NULL;

-- Audit
CREATE INDEX idx_audit_record         ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_user_date      ON audit_logs(user_id, created_at DESC);

-- Alertes
CREATE INDEX idx_alert_instances_unread ON alert_instances(user_id, is_read) WHERE is_read = false;

-- Recherche full-text sur les actifs
CREATE INDEX idx_assets_name_trgm     ON assets USING gin(name gin_trgm_ops);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Activation RLS sur toutes les tables
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_envelopes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_estate_charges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scpi_assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_holdings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_valuations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_occurrences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scpi_dividends       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_instances      ENABLE ROW LEVEL SECURITY;

-- ---- Policies : profils ----
CREATE POLICY "profiles_own"      ON profiles
  FOR ALL USING (id = auth.uid());

-- ---- Policies : fx_rates (lecture publique — pas de données personnelles) ----
CREATE POLICY "fx_rates_read_all" ON fx_rates
  FOR SELECT USING (true);
CREATE POLICY "fx_rates_insert_service" ON fx_rates
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ---- Policies génériques owner-only (réutilisable via template) ----
-- assets
CREATE POLICY "assets_own" ON assets
  FOR ALL USING (user_id = auth.uid());

-- financial_envelopes
CREATE POLICY "envelopes_own" ON financial_envelopes
  FOR ALL USING (user_id = auth.uid());

-- loans
CREATE POLICY "loans_own" ON loans
  FOR ALL USING (user_id = auth.uid());

-- real_estate_assets (via assets.user_id)
CREATE POLICY "re_assets_own" ON real_estate_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM assets WHERE id = real_estate_assets.asset_id AND user_id = auth.uid())
  );

-- real_estate_units (via assets.user_id)
CREATE POLICY "re_units_own" ON real_estate_units
  FOR ALL USING (
    EXISTS (SELECT 1 FROM assets WHERE id = real_estate_units.asset_id AND user_id = auth.uid())
  );

-- real_estate_charges (via assets.user_id)
CREATE POLICY "re_charges_own" ON real_estate_charges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM assets WHERE id = real_estate_charges.asset_id AND user_id = auth.uid())
  );

-- scpi_assets (via assets.user_id)
CREATE POLICY "scpi_own" ON scpi_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM assets WHERE id = scpi_assets.asset_id AND user_id = auth.uid())
  );

-- financial_holdings
CREATE POLICY "holdings_own" ON financial_holdings
  FOR ALL USING (user_id = auth.uid());

-- cash_accounts (via assets.user_id)
CREATE POLICY "cash_own" ON cash_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM assets WHERE id = cash_accounts.asset_id AND user_id = auth.uid())
  );

-- asset_valuations
CREATE POLICY "valuations_own" ON asset_valuations
  FOR ALL USING (user_id = auth.uid());
-- Pas de UPDATE/DELETE permis même pour l'owner (APPEND-ONLY)
CREATE POLICY "valuations_no_update" ON asset_valuations
  FOR UPDATE USING (false);
CREATE POLICY "valuations_no_delete" ON asset_valuations
  FOR DELETE USING (false);

-- portfolio_snapshots
CREATE POLICY "snapshots_own" ON portfolio_snapshots
  FOR ALL USING (user_id = auth.uid());

-- dca_plans
CREATE POLICY "dca_plans_own" ON dca_plans
  FOR ALL USING (user_id = auth.uid());

-- dca_occurrences
CREATE POLICY "dca_occurrences_own" ON dca_occurrences
  FOR ALL USING (user_id = auth.uid());

-- transactions
CREATE POLICY "transactions_own" ON transactions
  FOR ALL USING (user_id = auth.uid());
-- Pas de DELETE direct sur les transactions (annulation logique uniquement)
CREATE POLICY "transactions_no_delete" ON transactions
  FOR DELETE USING (false);

-- scpi_dividends
CREATE POLICY "scpi_dividends_own" ON scpi_dividends
  FOR ALL USING (user_id = auth.uid());

-- audit_logs (lecture seule pour l'owner)
CREATE POLICY "audit_read_own" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "audit_no_delete" ON audit_logs
  FOR DELETE USING (false);
CREATE POLICY "audit_no_update" ON audit_logs
  FOR UPDATE USING (false);

-- alert_rules
CREATE POLICY "alert_rules_own" ON alert_rules
  FOR ALL USING (user_id = auth.uid());

-- alert_instances
CREATE POLICY "alert_instances_own" ON alert_instances
  FOR ALL USING (user_id = auth.uid());

-- =============================================================================
-- TRIGGERS — AUDIT AUTOMATIQUE
-- =============================================================================

-- Fonction générique d'audit
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_changed    TEXT[];
  v_action     audit_action_enum;
  v_user_id    UUID;
BEGIN
  -- Récupération du user_id selon l'opération
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  -- Détermination de l'action
  IF TG_OP = 'INSERT' THEN
    v_action     := 'INSERT';
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action     := 'UPDATE';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    -- Champs modifiés
    SELECT array_agg(key)
    INTO v_changed
    FROM jsonb_each(v_old_values) old_row
    WHERE old_row.value IS DISTINCT FROM (v_new_values -> old_row.key);
  ELSIF TG_OP = 'DELETE' THEN
    v_action     := 'SOFT_DELETE';
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  END IF;

  INSERT INTO audit_logs (user_id, table_name, record_id, action, old_values, new_values, changed_fields)
  VALUES (
    v_user_id,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_old_values,
    v_new_values,
    v_changed
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Application des triggers d'audit sur les tables critiques
CREATE TRIGGER tg_audit_assets
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER tg_audit_transactions
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER tg_audit_loans
  AFTER INSERT OR UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER tg_audit_dca_plans
  AFTER INSERT OR UPDATE ON dca_plans
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- =============================================================================
-- TRIGGER — updated_at automatique
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Application sur toutes les tables avec updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles', 'assets', 'financial_envelopes', 'loans',
    'real_estate_assets', 'real_estate_units', 'real_estate_charges',
    'scpi_assets', 'financial_holdings', 'cash_accounts',
    'dca_plans', 'dca_occurrences', 'transactions',
    'alert_rules'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER tg_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- TRIGGER — Cache valeur actuelle des actifs (asset_valuations → assets)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_update_asset_cached_value()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE assets
  SET
    cached_value    = NEW.value_eur,
    cached_value_at = NEW.created_at,
    last_updated_at = NOW()
  WHERE id = NEW.asset_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_asset_cached_value
  AFTER INSERT ON asset_valuations
  FOR EACH ROW EXECUTE FUNCTION fn_update_asset_cached_value();

-- =============================================================================
-- DONNÉES DE RÉFÉRENCE — Plafonds réglementaires
-- =============================================================================

-- Table des plafonds réglementaires (lecture seule pour tous)
CREATE TABLE regulatory_ceilings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type    TEXT        NOT NULL UNIQUE,
  ceiling_eur     DECIMAL(20,2) NOT NULL,
  interest_rate   DECIMAL(8,6),  -- taux officiel actuel
  effective_date  DATE        NOT NULL,
  notes           TEXT
);

ALTER TABLE regulatory_ceilings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ceilings_read_all" ON regulatory_ceilings FOR SELECT USING (true);

INSERT INTO regulatory_ceilings (account_type, ceiling_eur, interest_rate, effective_date, notes) VALUES
  ('livret_a',     22950.00, 0.025, '2023-08-01', 'Plafond Livret A — 22 950 € hors capitalisation'),
  ('ldds',          12000.00, 0.025, '2023-08-01', 'Livret Développement Durable et Solidaire'),
  ('lep',           10000.00, 0.040, '2024-02-01', 'Livret Épargne Populaire — sous conditions ressources'),
  ('livret_jeune',   1600.00, 0.030, '2023-08-01', 'Livret Jeune — 12-25 ans');

-- =============================================================================
-- FIN DU SCHÉMA
-- =============================================================================
