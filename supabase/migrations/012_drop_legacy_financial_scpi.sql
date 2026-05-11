-- =============================================================
-- Migration 012 — Suppression definitive des sections legacy
--   /financier (financial_assets) et /scpi (scpi_assets, scpi_dividends)
-- =============================================================
--
-- Contexte : la section "Portefeuille" (migration 007) unifie toutes les
-- classes d'actifs financiers via `positions` + `instruments`. Les anciennes
-- tables `financial_assets`, `scpi_assets`, `scpi_dividends` font doublon
-- et leur donnees sont jetables (confirme par l'utilisateur).
--
-- Conserve : `financial_envelopes` (encore utilise par /portefeuille pour
-- rattacher une position a une enveloppe fiscale).
--
-- Cleanup en cascade :
--   - DROP TABLE scpi_dividends (FK -> scpi_assets)
--   - DROP TABLE scpi_assets    (FK -> assets)
--   - DROP TABLE financial_assets (FK -> assets, financial_envelopes)
--   - DELETE FROM assets WHERE asset_type IN ('scpi','stock','etf','crypto','gold')
--     pour supprimer les "master records" desormais orphelins.
--     CASCADE auto vers asset_valuations (FK ON DELETE CASCADE) et
--     SET NULL sur transactions.asset_id / dca_plans.asset_id.
--
-- ENUM `asset_type` : on garde les valeurs 'scpi','stock','etf','crypto','gold'
-- en place (rien ne casse, juste plus utilisees). Pas de DROP TYPE / ALTER TYPE
-- pour eviter les complications avec les usages historiques.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. DROP des tables d'extension (ordre : enfants d'abord)
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS scpi_dividends;
DROP TABLE IF EXISTS scpi_assets;
DROP TABLE IF EXISTS financial_assets;

-- ─────────────────────────────────────────────────────────────
-- 2. Suppression des assets orphelins (anciens master records)
-- ─────────────────────────────────────────────────────────────

DELETE FROM assets
 WHERE asset_type IN ('scpi','stock','etf','crypto','gold');
