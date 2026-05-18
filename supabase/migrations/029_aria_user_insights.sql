-- =============================================================
-- Migration 029 — ARIA Phase 4 : insights utilisateur persistants
-- =============================================================
--
-- Stocke les insights extraits par ARIA en fin de conversation
-- (preoccupations, objectifs, preferences). Ces insights sont
-- ensuite injectes dans le system prompt aux conversations suivantes
-- pour que ARIA "se souvienne" du contexte de l'utilisateur.
--
-- Exemples :
--   insight_type=preoccupation, insight="Stresse sur la securite financiere"
--   insight_type=objectif,      insight="Vise un FIRE 'lean' a 50 ans"
--   insight_type=preference,    insight="Prefere les ETF ESG"
--
-- confidence (0..1) : pondere la fiabilite de l'insight. Decroit
-- avec le temps si non re-confirme. last_confirmed_at = derniere fois
-- que ARIA a re-detecte cet insight dans une conversation.
--
-- RLS owner-only.
--
-- Rollback : voir 029_aria_user_insights_DOWN.sql
-- =============================================================

CREATE TABLE public.aria_user_insights (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type       TEXT         NOT NULL CHECK (insight_type IN ('preoccupation', 'objectif', 'preference')),
  insight            TEXT         NOT NULL,
  confidence         REAL         NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  last_confirmed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aria_user_insights_user_recent
  ON public.aria_user_insights (user_id, last_confirmed_at DESC);

-- On evite les doublons exacts (meme user + meme insight_type + meme insight)
CREATE UNIQUE INDEX uq_aria_user_insights_user_text
  ON public.aria_user_insights (user_id, insight_type, lower(insight));

ALTER TABLE public.aria_user_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY aria_user_insights_owner_all
  ON public.aria_user_insights FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.aria_user_insights IS
  'Insights persistants (preoccupations / objectifs / preferences) detectes par ARIA en fin de conversation. Injectes dans le system prompt aux sessions futures.';
