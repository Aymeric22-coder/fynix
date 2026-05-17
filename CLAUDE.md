# CLAUDE.md — Fynix

> App de pilotage patrimonial + FIRE (FR). Analyse multi-classes (bourse, ETF, crypto, SCPI, immo physique, cash) avec scores d'intelligence, projection FIRE et benchmarks MSCI.

## Stack technique

- **Next.js 15** App Router (Server + Client Components, `'use client'` directive)
- **TypeScript** strict (`noUncheckedIndexedAccess` activé)
- **Tailwind CSS** v4 (tokens via `@theme` dans `app/globals.css`)
- **Supabase** auth + PostgreSQL (RLS par utilisateur)
- **Recharts** pour les graphiques (PieChart, AreaChart stacked, BarChart)
- **yahoo-finance2** (CSRF auto) + **OpenFIGI** (gratuit, 25 req/min) pour l'enrichissement
- **Vitest 4.1.5** — 491+ tests, lancés via `npx vitest run`
- Déploiement automatique **Vercel** depuis `master` GitHub

## Structure des dossiers

```
app/
  (auth)/            login, signup
  (app)/             pages authentifiées (layout avec Sidebar)
    dashboard/
    profil/          questionnaire investisseur en 8 étapes
    portefeuille/    section unifiée actions/ETF/crypto/SCPI
    analyse/         dashboard 6 onglets (Global, Portef, Immo, Cash, Scores, Recos)
    immobilier/
    cash/
    transactions/
    dca/
    parametres/
  api/               Next.js Route Handlers (withAuth helper)

components/
  ui/                briques bas niveau (Button, Modal, Field, Tabs, Badge…)
  shared/            sidebar, page-header
  forms/             add-position-form, add-envelope-form
  charts/            donut-chart générique
  portfolio/         add-price-modal, position-row-actions, price-history-chart
  profil/            questionnaire 8 étapes + carte synthèse
  analyse/           dashboard analyse
    tabs/            6 wrappers d'onglets (GlobalAnalyse, CashAnalyse…)
      portefeuille/  6 sous-onglets par classe (BourseAnalyse, ETFAnalyse…)

lib/
  supabase/          createServerClient, createServiceClient
  utils/             api helpers (withAuth, ok, err), format (formatCurrency, cn)
  providers/
    market-data/     yahoo, fx (Frankfurter API)
    fx/              getFxRate, toEur
  portfolio/         providers (yahoo, openfigi, boursorama, justetf, coingecko),
                     orchestrator, freshness, categories, movements
  profil/            calculs.ts (scoring + 8 étapes)
  analyse/           cœur métier de l'analyse :
                     - isinEnricher, isinBatch, yahooQuoteSummary
                     - etfCompositions (29 ETFs), expandETF
                     - sectorMapping, geoMapping
                     - benchmarks (MSCI ACWI/World/patrimoine)
                     - aggregateur (point d'entrée getPatrimoineComplet)
                     - scores (5 scores), projectionFIRE, recommandations
                     - immoCalculs, subsetAnalyse, diversification
  real-estate/       amortization, portfolio, calculs

hooks/               use-form, use-user-profile, use-patrimoine-analyse

types/
  database.types.ts  miroir du schéma Supabase
  analyse.ts         types métier (PatrimoineComplet, Score, AcquisitionFuture…)

supabase/migrations/ 16 migrations versionnées (avec DOWN)
```

## Design system

- **Palette emerald** définie dans `app/globals.css` via `@theme` :
  - `--color-bg` `#080808` · `--color-surface` `#111111` · `--color-surface-2` `#181818`
  - `--color-border` `#222222` · `--color-border-2` `#2a2a2a`
  - `--color-primary` `#f4f4f5` · `--color-secondary` `#71717a` · `--color-muted` `#3f3f46`
  - `--color-accent` `#10b981` (emerald) · `--color-danger` `#ef4444` · `--color-warning` `#f59e0b`
- **Police Geist Sans + Geist Mono** (chargées via `next/font/google` dans `app/layout.tsx`)
- **Or `#E8B84B`** utilisé UNIQUEMENT pour distinguer la classe « Immobilier » dans le donut de répartition (pas un accent global)
- **Classes utilitaires custom** : `.card`, `.financial-value` (mono + tabular-nums), `.positive`, `.negative`, `.skeleton`
- Composants UI réutilisables systématiquement, jamais de styles inline ad-hoc

## Tables Supabase principales

| Table | Rôle |
|---|---|
| `profiles` | identité + questionnaire investisseur (28 colonnes enrichies en migration 015) |
| `instruments` | référentiel global (name, ticker, isin, asset_class, currency, sector, geography, valuation_frequency) — UNIQUE sur isin |
| `positions` | actifs financiers détenus (quantity, average_price, currency, envelope_id, broker, acquisition_date) |
| `instrument_prices` | prix append-only (instrument_id, price, currency, priced_at, source, confidence) |
| `real_estate_properties` | biens immobiliers (address, purchase_price, fiscal_regime, gli_pct, management_pct) |
| `real_estate_lots` | loyers par lot d'un bien (rent_amount, charges_amount, status) |
| `property_charges` | charges annuelles par bien (taxe_fonciere, insurance, condo_fees, maintenance…) |
| `debts` | crédits immobiliers (capital_remaining, monthly_payment, interest_rate) |
| `cash_accounts` | livrets / compte courant (account_type, balance, currency, bank_name) |
| `financial_envelopes` | PEA / AV / CTO / PER / Livret A… |
| `transactions` | flux financiers (purchase, sale, dividend) |
| `fx_rates` | cache taux de change (base/quote/date) |
| `price_providers` | config des providers (yahoo, justetf, boursorama, coingecko, openfigi) |
| `isin_cache` | cache global ISIN → métadonnées (TTL 24h) — partagé entre users |

**RLS** : chaque utilisateur ne voit que ses propres lignes (`user_id = auth.uid()` ou `id = auth.uid()` pour `profiles`). `isin_cache` est en lecture/écriture libre pour les `authenticated` (cache mutualisé).

## Logique d'analyse — flux

1. `lib/analyse/aggregateur.ts > getPatrimoineComplet(userId)` est le point d'entrée
2. Charge en parallèle : positions enrichies (FX + cache ISIN), biens immo, cash, profile
3. Calcule : répartitions (classes/sectorielle/géo), scores (5 scores), projection FIRE, recommandations
4. Tout est exposé via `GET /api/analyse/patrimoine` (consommé par le hook `usePatrimoineAnalyse`)

**Référence benchmarks** (PHASE 10) : pas de répartition fictive équipondérée, on compare au **MSCI ACWI** (géo) / **MSCI World** (sectoriel) / `BENCHMARK_CLASSES_PATRIMOINE` (classes 20/20/35/10/5/10).

**Expansion ETF** : chaque position ETF est décomposée en micro-expositions secteurs+zones via `lib/analyse/etfCompositions.ts` (29 ETFs mappés). Les ETF non mappés sont signalés et exclus du calcul de fiabilité.

## Conventions de code

- **Ne JAMAIS partir de zéro** : toujours auditer l'existant (Grep / Explore agent) avant de créer
- **Vérifier les migrations Supabase** avant de créer une table ou ajouter une colonne
- **Toujours ajouter un fichier DOWN** pour chaque migration (`MIG_DOWN.sql`)
- **Logique métier dans `lib/`, pas dans les composants** — les .tsx ne font que de l'affichage et de la composition
- **Helpers purs et testables** : 491 tests Vitest couvrent toute la logique
- **Pas d'API payante** : OpenFIGI (free), Yahoo Finance (free), CoinGecko (free), Frankfurter (free FX)
- **Pas de duplication entre sections** : `/portefeuille` affiche les positions, `/analyse` apporte uniquement l'analyse complémentaire
- **Pas de `Global` zone** dans la géo : crypto/métaux sont **exclus** des analyses sectorielle/géo (ce ne sont pas des secteurs ni des pays)
- **Le wizard de profil n'est pas obligatoire** : tout fonctionne avec des données partielles, on affiche « Données insuffisantes » plutôt que de planter
- **Commits en français** avec préfixe Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `data:`)
- **Cache mémoire client** des données analyse : 30 s seulement (était 5 min, raccourci pour éviter les bugs « ça n'a pas pris le déploiement »)

## Variables d'environnement (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (côté serveur pour FX cache)
- `OPENFIGI_API_KEY` (optionnel — 25 req/min sans clé, 250 avec)
- `MARKET_PRICE_TTL_SECONDS` (optionnel, défaut 900)
- `FX_RATE_TTL_SECONDS` (optionnel, défaut 3600)

## Process

- **Tests** : `npx vitest run` (~7 s, 491 tests)
- **Typecheck** : `npx tsc --noEmit` (silencieux si OK)
- **Migrations** : appliquer via Supabase Studio (SQL Editor) — `supabase db push` si CLI configurée
- **Refresh prix manuel** : bouton « Actualiser les prix » dans `/analyse` ou via `POST /api/analyse/refresh`
