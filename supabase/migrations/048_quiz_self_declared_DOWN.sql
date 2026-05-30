-- =============================================================
-- DOWN — Migration 048 — Suppression auto-déclaration expertise
-- =============================================================

ALTER TABLE profiles
  DROP COLUMN IF EXISTS quiz_self_declared_domains;
