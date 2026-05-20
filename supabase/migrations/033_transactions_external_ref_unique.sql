-- =============================================================
-- Migration 033 — Index unique partiel sur transactions.external_ref
-- =============================================================
--
-- Objectif (E5) : permettre la deduplication idempotente des
-- transactions importees depuis un CSV broker.
--
-- La colonne `external_ref` (TEXT, nullable) existe deja depuis la
-- migration 001. Cette migration ajoute uniquement l'index unique
-- partiel qui garantit qu'une meme transaction (memes champs cle)
-- ne peut etre inseree qu'une seule fois par utilisateur.
--
-- Cle deterministe cote application : SHA-256 hex sur
--   user_id | instrument_id | executed_at | quantity | unit_price | transaction_type
-- => insertions repetees d'un meme CSV (ou avec exclusions
--    differentes lors d'un re-import) ne dupliquent plus les lignes.
--
-- L'index est PARTIEL (WHERE external_ref IS NOT NULL) :
--   - Les transactions creees manuellement (ajout de position via
--     /api/portfolio/positions, vente via edition d'une position,
--     dividende saisi manuellement plus tard...) ont external_ref
--     a NULL et ne sont pas contraintes par cet index.
--   - Seules les transactions issues de l'import CSV (qui posent
--     un external_ref non null) sont dedupliquees.
--
-- Idempotent (IF NOT EXISTS).
--
-- NOTE D'HISTORIQUE : cette migration a ete appliquee directement
-- en prod (Supabase Studio) au moment du ship d'E5, sans creation
-- de fichier dans le repo. Ce commit regularise la situation pour
-- qu'un futur reset / clone reapplique la meme structure.
--
-- Rollback : voir 033_transactions_external_ref_unique_DOWN.sql
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_external_ref_unique
  ON public.transactions (user_id, external_ref)
  WHERE external_ref IS NOT NULL;

ANALYZE public.transactions;
