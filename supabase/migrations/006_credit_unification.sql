-- =============================================================
-- Migration 006 — Unification crédit / immobilier (Phase 3)
-- =============================================================
--
-- Refactoring : la section "Dettes" est fusionnée dans la section
-- "Immobilier". Désormais, chaque crédit est OBLIGATOIREMENT rattaché
-- à un asset immobilier (1 crédit max par asset).
--
-- Changements :
--   1. Ajoute 3 colonnes à `debts` : insurance_base, insurance_quotite,
--      guarantee_type (champs UX manquants pour décrire correctement
--      l'assurance emprunteur et la garantie).
--   2. Rend `asset_id` NOT NULL et FK CASCADE (avant : SET NULL nullable).
--   3. Pose un index UNIQUE partiel sur asset_id (1 crédit actif max par bien).
--   4. Supprime la table `debt_amortization` (calcul désormais à la volée,
--      jamais persisté — cf. spec "aucune valeur dérivée stockée").
--   5. Conserve les colonnes cache `monthly_payment` et `capital_remaining`
--      qui restent recalculées à chaque write (perfs dashboard / snapshots).
--
-- Pré-requis : aucune dette existante (validé avec l'utilisateur).
--
-- Rollback : voir 006_credit_unification_DOWN.sql
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- TYPES ENUMS
-- ─────────────────────────────────────────────────────────────

-- Base de calcul de l'assurance emprunteur :
--   capital_initial    = % * capital initial (mensualité fixe)
--   capital_remaining  = % * CRD (mensualité dégressive)
CREATE TYPE insurance_base AS ENUM (
  'capital_initial',
  'capital_remaining'
);

-- Type de garantie du prêt
CREATE TYPE guarantee_type AS ENUM (
  'hypotheque',     -- hypothèque conventionnelle
  'caution',        -- caution organisme (Crédit Logement, CAMCA, etc.)
  'ppd',            -- Privilège du Prêteur de Deniers
  'autre'
);


-- ─────────────────────────────────────────────────────────────
-- TABLE debts — enrichissement
-- ─────────────────────────────────────────────────────────────

ALTER TABLE debts
  -- Base de calcul assurance (défaut : capital_initial = pratique la plus courante)
  ADD COLUMN insurance_base insurance_base NOT NULL DEFAULT 'capital_initial',

  -- Quotité d'assurance en % (100 = couverture totale par tête, peut être > 100 si plusieurs assurés)
  ADD COLUMN insurance_quotite NUMERIC(5,2) NOT NULL DEFAULT 100
    CHECK (insurance_quotite >= 0 AND insurance_quotite <= 200),

  -- Type de garantie
  ADD COLUMN guarantee_type guarantee_type NOT NULL DEFAULT 'caution';

COMMENT ON COLUMN debts.insurance_base IS
  'Base de calcul mensuelle de l''assurance emprunteur. capital_initial = mensualité fixe ; capital_remaining = dégressive.';
COMMENT ON COLUMN debts.insurance_quotite IS
  'Quotité d''assurance en %. 100 par défaut (couverture totale par tête).';
COMMENT ON COLUMN debts.guarantee_type IS
  'Type de garantie : hypotheque / caution (organisme) / ppd / autre.';


-- ─────────────────────────────────────────────────────────────
-- TABLE debts — contrainte 1 crédit max par asset
-- ─────────────────────────────────────────────────────────────
--
-- Avant : asset_id nullable, FK SET NULL → permet dettes orphelines.
-- Après : asset_id NOT NULL, FK CASCADE → un crédit appartient à un bien.
--
-- Pré-condition : aucune dette en base (validé). Si dettes existaient
-- sans asset_id, ce ALTER échouerait.
--

ALTER TABLE debts
  ALTER COLUMN asset_id SET NOT NULL;

-- Remplace l'ancienne FK SET NULL par CASCADE
ALTER TABLE debts
  DROP CONSTRAINT IF EXISTS debts_asset_id_fkey;

ALTER TABLE debts
  ADD CONSTRAINT debts_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;

-- Un seul crédit ACTIF max par asset (statut paid_off / restructured non comptés)
CREATE UNIQUE INDEX idx_debts_one_active_per_asset
  ON debts (asset_id)
  WHERE status = 'active';


-- ─────────────────────────────────────────────────────────────
-- TABLE debt_amortization — suppression
-- ─────────────────────────────────────────────────────────────
--
-- Calcul à la volée désormais (lib/real-estate/amortization.ts).
-- Plus aucune persistance des rows mensuelles.
--

DROP TABLE IF EXISTS debt_amortization CASCADE;


-- ─────────────────────────────────────────────────────────────
-- VÉRIFICATION POST-MIGRATION
-- ─────────────────────────────────────────────────────────────
-- Pour vérifier après application :
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'debts'
--     AND column_name IN ('insurance_base','insurance_quotite','guarantee_type','asset_id');
--
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'debts' AND indexname = 'idx_debts_one_active_per_asset';
--
--   SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debt_amortization');
--   -- doit renvoyer false
