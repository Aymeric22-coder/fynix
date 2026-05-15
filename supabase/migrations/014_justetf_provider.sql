-- =============================================================
-- Migration 014 — Provider JustETF (priorite 3, actif)
-- =============================================================
--
-- Source primaire pour les ETF cotes en Europe. Endpoint JSON public
-- justetf.com/api/etfs/{ISIN}/quote, pas de cle API.
--
-- Priorite 3 = appele AVANT Boursorama (5) et Yahoo (10) pour la
-- classe 'etf'. JustETF est plus fiable que les deux autres pour les
-- ETF UCITS car il consolide par ISIN (pas de suffixe d'exchange a
-- gerer) et fournit le prix dans la devise demandee.
--
-- Couvre uniquement 'etf'. Pour les autres classes, la chaine continue
-- vers Boursorama puis Yahoo.
-- =============================================================

INSERT INTO price_providers (
  code, display_name, priority, supported_classes,
  rate_limit_per_minute, base_url, is_active
)
VALUES (
  'justetf',
  'JustETF',
  3,
  ARRAY['etf']::asset_class[],
  60,
  'https://www.justetf.com',
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  is_active             = EXCLUDED.is_active,
  priority              = EXCLUDED.priority,
  supported_classes     = EXCLUDED.supported_classes,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
  base_url              = EXCLUDED.base_url,
  display_name          = EXCLUDED.display_name,
  updated_at            = NOW();
