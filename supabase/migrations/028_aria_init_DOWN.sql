-- =============================================================
-- Migration 028 DOWN — Rollback ARIA Phase 1
-- =============================================================
-- Supprime les 4 tables ARIA. L'ordre respecte les FK
-- (aria_feedback -> aria_messages -> aria_conversations).
-- =============================================================

DROP TABLE IF EXISTS public.aria_feedback;
DROP TABLE IF EXISTS public.aria_messages;
DROP TABLE IF EXISTS public.aria_conversations;
DROP TABLE IF EXISTS public.user_activity_log;
