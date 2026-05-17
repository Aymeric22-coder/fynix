-- =============================================================
-- Migration 025 — Table import_history (dedup imports CSV)
-- =============================================================
--
-- Probleme : avant cette migration, un double clic sur le bouton
-- "Importer" du modal CSV recreait l'integralite des positions :
-- quantite doublee, PRU recalcule a chaque round, donc data corrompue.
--
-- Solution : on calcule un SHA-256 du contenu du fichier et on stocke
-- (user_id, file_hash) dans import_history. La route /api/portfolio/import
-- consulte cette table avant d'inserer et retourne 409 si le hash a deja
-- ete vu pour ce user.
--
-- Rollback : voir 025_import_history_DOWN.sql
-- =============================================================

CREATE TABLE public.import_history (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_hash    TEXT         NOT NULL,
  imported_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  row_count    INTEGER      NOT NULL DEFAULT 0,
  broker_hint  TEXT,
  UNIQUE (user_id, file_hash)
);

CREATE INDEX idx_import_history_user_date
  ON public.import_history (user_id, imported_at DESC);

ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_history_own_select ON public.import_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY import_history_own_insert ON public.import_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY import_history_own_delete ON public.import_history
  FOR DELETE USING (user_id = auth.uid());

COMMENT ON TABLE public.import_history IS
  'Hashes SHA-256 des fichiers CSV importes par utilisateur. Empeche les imports dupliques.';
