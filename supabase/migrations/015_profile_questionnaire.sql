-- =============================================================
-- Migration 015 — Questionnaire de profil investisseur
-- =============================================================
--
-- Enrichit la table `profiles` existante (creee en migration 001)
-- avec les champs du questionnaire d'onboarding en 8 etapes :
-- situation, revenus, charges, capacite d'investissement, 3 quiz
-- (bourse / crypto / immo), questions de risque, objectif FIRE.
--
-- Pas de table separee : on garde toute la connaissance du user dans
-- profiles. Les colonnes sont nullable pour preserver les profiles
-- existants. Le sentinel `profile_completed_at` indique si le
-- questionnaire est rempli (NULL = jamais soumis, sinon ts).
--
-- Les enveloppes et les reponses des quiz sont des tableaux Postgres :
--   - enveloppes : TEXT[]    (ex : ['PEA','Assurance-vie','PER'])
--   - quiz_*     : INTEGER[] (index de la reponse choisie dans la liste
--                             d'options definie cote application)
--
-- RLS : la table `profiles` a deja ses policies depuis migration 003
-- (id = auth.uid()). Aucune nouvelle policy a creer.
-- =============================================================

ALTER TABLE profiles
  -- Etape 1 : Situation personnelle
  ADD COLUMN IF NOT EXISTS prenom               TEXT,
  ADD COLUMN IF NOT EXISTS age                  INTEGER     CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  ADD COLUMN IF NOT EXISTS situation_familiale  TEXT,
  ADD COLUMN IF NOT EXISTS enfants              TEXT,   -- "0" .. "4+"
  ADD COLUMN IF NOT EXISTS statut_pro           TEXT,

  -- Etape 2 : Revenus
  ADD COLUMN IF NOT EXISTS revenu_mensuel       NUMERIC(12,2) CHECK (revenu_mensuel       IS NULL OR revenu_mensuel       >= 0),
  ADD COLUMN IF NOT EXISTS revenu_conjoint      NUMERIC(12,2) CHECK (revenu_conjoint      IS NULL OR revenu_conjoint      >= 0),
  ADD COLUMN IF NOT EXISTS autres_revenus       NUMERIC(12,2) CHECK (autres_revenus       IS NULL OR autres_revenus       >= 0),
  ADD COLUMN IF NOT EXISTS stabilite_revenus    TEXT,

  -- Etape 3 : Charges & depenses
  ADD COLUMN IF NOT EXISTS loyer                NUMERIC(12,2) CHECK (loyer                IS NULL OR loyer                >= 0),
  ADD COLUMN IF NOT EXISTS autres_credits       NUMERIC(12,2) CHECK (autres_credits       IS NULL OR autres_credits       >= 0),
  ADD COLUMN IF NOT EXISTS charges_fixes        NUMERIC(12,2) CHECK (charges_fixes        IS NULL OR charges_fixes        >= 0),
  ADD COLUMN IF NOT EXISTS depenses_courantes   NUMERIC(12,2) CHECK (depenses_courantes   IS NULL OR depenses_courantes   >= 0),

  -- Etape 4 : Capacite d'investissement
  ADD COLUMN IF NOT EXISTS epargne_mensuelle    NUMERIC(12,2) CHECK (epargne_mensuelle    IS NULL OR epargne_mensuelle    >= 0),
  ADD COLUMN IF NOT EXISTS invest_mensuel       NUMERIC(12,2) CHECK (invest_mensuel       IS NULL OR invest_mensuel       >= 0),
  ADD COLUMN IF NOT EXISTS enveloppes           TEXT[]        DEFAULT '{}',

  -- Etapes 5/6/7 : Quiz (index des reponses)
  ADD COLUMN IF NOT EXISTS quiz_bourse          INTEGER[]     DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quiz_crypto          INTEGER[]     DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quiz_immo            INTEGER[]     DEFAULT '{}',

  -- Etape 8 : Risque & FIRE
  ADD COLUMN IF NOT EXISTS risk_1               TEXT,
  ADD COLUMN IF NOT EXISTS risk_2               TEXT,
  ADD COLUMN IF NOT EXISTS risk_3               TEXT,
  ADD COLUMN IF NOT EXISTS risk_4               TEXT,
  ADD COLUMN IF NOT EXISTS fire_type            TEXT,
  ADD COLUMN IF NOT EXISTS revenu_passif_cible  NUMERIC(12,2) CHECK (revenu_passif_cible  IS NULL OR revenu_passif_cible  >= 0),
  ADD COLUMN IF NOT EXISTS age_cible            INTEGER       CHECK (age_cible            IS NULL OR (age_cible >= 0 AND age_cible <= 120)),
  ADD COLUMN IF NOT EXISTS priorite             TEXT,

  -- Sentinel : indique si le questionnaire a ete soumis au moins une fois
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.profile_completed_at IS
  'Timestamp de la premiere soumission complete du questionnaire. NULL = jamais rempli, donc on affiche le wizard. Mis a jour a chaque soumission.';
