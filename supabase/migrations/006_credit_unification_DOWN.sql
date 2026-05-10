-- =============================================================
-- Rollback de la migration 006 — Unification crédit / immobilier
-- =============================================================
--
-- À exécuter UNIQUEMENT pour revenir à l'état pré-006.
-- Toutes les valeurs des nouveaux champs seront perdues.
-- La table debt_amortization sera recréée vide.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Recréer debt_amortization (structure migration 001)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS debt_amortization (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id             UUID          NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_number       INTEGER       NOT NULL,
  payment_date        DATE          NOT NULL,
  payment_total       NUMERIC(18,2) NOT NULL,
  payment_capital     NUMERIC(18,2) NOT NULL,
  payment_interest    NUMERIC(18,2) NOT NULL,
  payment_insurance   NUMERIC(18,2) NOT NULL DEFAULT 0,
  capital_remaining   NUMERIC(18,2) NOT NULL,
  is_deferred         BOOLEAN       NOT NULL DEFAULT FALSE,
  UNIQUE (debt_id, period_number)
);

ALTER TABLE debt_amortization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own debt amortization"
  ON debt_amortization FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own debt amortization"
  ON debt_amortization FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own debt amortization"
  ON debt_amortization FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own debt amortization"
  ON debt_amortization FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 2. Retirer la contrainte UNIQUE sur asset_id
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_debts_one_active_per_asset;


-- ─────────────────────────────────────────────────────────────
-- 3. Restaurer asset_id nullable + FK SET NULL
-- ─────────────────────────────────────────────────────────────

ALTER TABLE debts
  DROP CONSTRAINT IF EXISTS debts_asset_id_fkey;

ALTER TABLE debts
  ALTER COLUMN asset_id DROP NOT NULL;

ALTER TABLE debts
  ADD CONSTRAINT debts_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. Supprimer les colonnes ajoutées
-- ─────────────────────────────────────────────────────────────

ALTER TABLE debts
  DROP COLUMN IF EXISTS guarantee_type,
  DROP COLUMN IF EXISTS insurance_quotite,
  DROP COLUMN IF EXISTS insurance_base;


-- ─────────────────────────────────────────────────────────────
-- 5. Drop des ENUMs (après les colonnes qui les utilisent)
-- ─────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS guarantee_type;
DROP TYPE IF EXISTS insurance_base;


-- ─────────────────────────────────────────────────────────────
-- VÉRIFICATION POST-ROLLBACK
-- ─────────────────────────────────────────────────────────────
--   SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debt_amortization');
--   -- doit renvoyer true
--
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_name = 'debts' AND column_name = 'asset_id';
--   -- doit renvoyer 'YES'
