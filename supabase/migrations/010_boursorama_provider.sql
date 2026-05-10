-- =============================================================
-- Migration 010 — Provider Boursorama (priorite 5, actif)
-- =============================================================
--
-- Ajoute Boursorama dans price_providers pour les actifs Euronext
-- / fonds francais que Yahoo ne couvre pas (notamment ETF Amundi
-- PEA, Lyxor, etc.).
--
-- Priorite 5 = appele AVANT Yahoo (priorite 10) pour les classes
-- supportees. Si Boursorama n'a pas le titre, la chaine de fallback
-- continue vers Yahoo, AlphaVantage, etc.
--
-- Activation immediate : pas de cle API requise, pas de rate limit
-- prohibitif sur usage personnel.
-- =============================================================

INSERT INTO price_providers (
  code, display_name, priority, supported_classes,
  rate_limit_per_minute, base_url, is_active
)
VALUES (
  'boursorama',
  'Boursorama',
  5,
  ARRAY['equity','etf','fund','reit','siic','opci','bond']::asset_class[],
  60,
  'https://www.boursorama.com',
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  is_active            = EXCLUDED.is_active,
  priority             = EXCLUDED.priority,
  supported_classes    = EXCLUDED.supported_classes,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
  base_url             = EXCLUDED.base_url,
  display_name         = EXCLUDED.display_name,
  updated_at           = NOW();
