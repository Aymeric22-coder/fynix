-- =============================================================
-- Migration 028 — ARIA : assistant patrimonial IA (Phase 1)
-- =============================================================
--
-- Tables introduites par cette migration :
--
--   1. user_activity_log   — journal chronologique des actions
--                            utilisateur (ajout position, modif credit,
--                            import CSV...) pour donner a ARIA une
--                            memoire courte des evenements recents.
--
--   2. aria_conversations  — fil de discussion entre l'utilisateur et
--                            ARIA. 1 row par conversation (regroupe
--                            plusieurs messages).
--
--   3. aria_messages       — messages user/assistant + tool_use /
--                            tool_result + ui_context.
--
--   4. aria_feedback       — note +1 / -1 par message ARIA, avec
--                            raison optionnelle (utilisee pour
--                            ameliorer le prompt + dashboard admin).
--
-- RLS : owner-only sur les 4 tables (auth.uid() = user_id).
--
-- Rollback : voir 028_aria_init_DOWN.sql
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. user_activity_log
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.user_activity_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL,          -- 'ajout_position', 'modif_credit', 'import_csv'...
  description TEXT         NOT NULL,          -- 'Ajout de 5 LVMH a 720 EUR'
  metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_activity_log_user_date
  ON public.user_activity_log (user_id, created_at DESC);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_activity_log_owner_select
  ON public.user_activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_activity_log_owner_insert
  ON public.user_activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_activity_log_owner_delete
  ON public.user_activity_log FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_activity_log IS
  'Journal chronologique des actions utilisateur — alimente la memoire courte d''ARIA.';

-- ─────────────────────────────────────────────────────────────
-- 2. aria_conversations
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.aria_conversations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT,                                       -- genere par Claude apres quelques messages
  summary         TEXT,                                       -- resume long-terme (Phase 4)
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  archived        BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_aria_conversations_user_recent
  ON public.aria_conversations (user_id, last_message_at DESC);

ALTER TABLE public.aria_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY aria_conversations_owner_all
  ON public.aria_conversations FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.aria_conversations IS
  'Fil de conversations entre l''utilisateur et ARIA — 1 row par conversation.';

-- ─────────────────────────────────────────────────────────────
-- 3. aria_messages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.aria_messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES public.aria_conversations(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT         NOT NULL,
  tool_calls      JSONB,                                      -- blocs tool_use de Claude (Phase 3)
  tool_results    JSONB,                                      -- resultats des executions de tools
  ui_context      JSONB,                                      -- { section, page_url } au moment du message
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aria_messages_conversation
  ON public.aria_messages (conversation_id, created_at);

ALTER TABLE public.aria_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY aria_messages_owner_all
  ON public.aria_messages FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.aria_messages IS
  'Messages d''une conversation ARIA (role user|assistant) avec tool_calls et tool_results.';

-- ─────────────────────────────────────────────────────────────
-- 4. aria_feedback
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.aria_feedback (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID         NOT NULL REFERENCES public.aria_messages(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      SMALLINT     NOT NULL CHECK (rating IN (-1, 1)),
  reason      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aria_feedback_user_date
  ON public.aria_feedback (user_id, created_at DESC);

-- Un feedback par utilisateur par message (overwrite via upsert plutot que doublons)
CREATE UNIQUE INDEX uq_aria_feedback_user_message
  ON public.aria_feedback (user_id, message_id);

ALTER TABLE public.aria_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY aria_feedback_owner_all
  ON public.aria_feedback FOR ALL TO authenticated
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.aria_feedback IS
  'Note +1 / -1 par message ARIA, avec raison optionnelle. Alimente le dashboard admin Phase 5.';
