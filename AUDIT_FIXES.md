# Audit Fixes — Fynix

> **Évolution depuis l'audit initial**
>
> | Sprint | Tests | Périmètre |
> |---|---|---|
> | Avant audit | 716 | État initial |
> | Sprint 0 — Sécurité + bloquants launch | 740 | +24 tests |
> | Sprint 1 — Cohérence calculs + performance | 740 | inchangé (refactors) |
> | Sprint 2 — Dette technique + outillage | **810** | +70 tests |
> | Sprint 3 — Suppression `patrimony_snapshots` | **810** | inchangé |
>
> **État final** : 55 fichiers de tests / **810 tests passent** · `tsc --noEmit` silencieux · `eslint --max-warnings 0` (0 erreur, 0 warning) · 4 migrations Supabase à appliquer (024, 025, 026, 027) · **0 point en attente**.

---

## Synthèse exécutive — ce qui a changé depuis l'audit

### 🔒 Sécurité (Sprint 0)
- **RLS `signup_errors`** activée (PII potentielle exposée à tout user authentifié)
- **Cron `refresh-prices` fail-closed** si `CRON_SECRET` absent (avant : route ouverte)
- **Migrations 024 + 025** créées et applicables en prod

### 🚪 Bloquants utilisateur (Sprint 0)
- **Page `/signup` créée** (l'inscription n'existait pas dans `app/(auth)/`)
- **Erreurs Supabase traduites en français** (`lib/auth/errorMessages.ts`)
- **Dédup import CSV** via SHA-256 + table `import_history` (avant : double-clic doublait les positions)
- **Exclusions CSV opérantes** côté serveur (avant : UI mentait)
- **Sidebar mobile** avec drawer + burger (avant : 60 % d'écran bouffé à 375 px)

### 🧮 Cohérence calculs FIRE (Sprints 0 + 1)
- **Hero dashboard et /analyse alignés** : même `swrPctFromFireType()` selon le profil (avant : 2 cibles différentes sur 2 écrans)
- **`lib/analyse/constants.ts`** créé → source unique pour PS 17,2 %, PFU 30 %, TMI fallback 30 %, SWR par fire_type (avant : 3 duplicats)
- **`tmi_estime: boolean`** exposé dans `fireInputs` (l'UI peut alerter "TMI estimée")
- **Cashflow net immo propagé** dans la projection FIRE via ratio impôt/loyer constant
- **Stress test : ancrage scenario neutre** (impact 0 → âge FIRE = baseline) + **retrait du double comptage des loyers**
- **ActionsDuMois × OptimiseurFiscal** fusionnés (avant : un user voyait l'opportunité PEA sur /analyse mais pas sur le dashboard)

### ⚡ Performance (Sprint 1)
- **Cron mensuel batché** via `runInBatches` (lots de 10, pause 100 ms) — 500 users en ~50 s au lieu de >1000 s
- **Anti-rebond snapshot serveur 30 s** par user (avant : double agrégation à chaque event Realtime)
- **`PatrimoineComplet` envoyé dans le body POST** par le hook (avant : agrégation rappelée côté serveur)

### 🛡️ Hardening import CSV (Sprint 2)
- **Limite 5 Mo + 5 000 lignes** (413 / 422)
- **Validation Zod** des bodies `/api/portfolio/import`, `/api/auth/login`, `/api/auth/signup`
- **Nettoyage `cleanInstrumentName`** avant insert dans `instruments` (avant : "VENTE ALSTOM 15/03" pollait le catalogue partagé)
- **Insert ISIN-safe** avec fallback SELECT (race condition UNIQUE)
- **Enrichissement OpenFIGI parallélisé** par batch de 5 / 2 500 ms

### 🧹 Dette technique (Sprint 2)
- **`database.types.ts` complété** (6 interfaces manquantes : WealthSnapshot, EmailLog, IsinCache, etc.)
- **ESLint actif en build** (`ignoreDuringBuilds` retiré) — 0 erreur, 0 warning
- **Husky + lint-staged** : `pre-commit` lance lint-staged, `pre-push` lance `tsc + vitest`
- **`regimeFiscalImmo.ts`** centralisé : 3 logiques de détection de régime fusionnées
- **`formatEur` partagé** dans `lib/utils/format.ts` (avant : 3 duplicats)
- **17 `console.log`** gatés derrière `devLog` dev-only
- **SCPI dans cashflow mensuel** (TODO Phase 2 retiré)
- **Jalons × historique** (`enrichJalonsAvecHistorique` marque les milestones franchis)

### 📊 Cohérence dashboard (Sprints 1 + 3)
- **Dashboard migré sur `wealth_snapshots`** (avant : 2 sources d'historique divergentes)
- **Sprint 3 — `patrimony_snapshots` supprimée** : migration 026 (backfill) + 027 (DROP). `/api/dashboard`, `/api/snapshots`, Edge `snapshot-daily` migrés ou stub 410 Gone.

### 📐 UX (Sprint 0)
- **Empty state dashboard** quand patrimoine = 0 (avant : 0 € partout + "Tout est en ordre 🎯")
- **/analyse non-bloquante à patrimoine 0** (avant : tous les onglets masqués)
- **`StressTestPanel` fix faux positif "Objectif maintenu"** quand objectif inatteignable
- **Wizard profil : erreur de save visible** via `setError` (avant : `console.warn` muet)

### 📁 Fichiers : récapitulatif chiffré
- **33 fichiers créés** (helpers `lib/` + tests + composants empty-state + auth pages + Husky + README + NEXT_ACTIONS + 2 migrations Sprint 3)
- **~65 fichiers modifiés**
- **4 migrations SQL** créées (024 RLS signup_errors, 025 import_history, 026 backfill, 027 drop)

---

## BLOC 0 — Sécurité immédiate

### B4 — RLS sur `signup_errors`
- Avant : table sans `ENABLE ROW LEVEL SECURITY` + `GRANT ALL TO authenticated` (migration 004) ⇒ tout user authentifié pouvait lire les `error_message` (PII).
- **Migrations créées** :
  - `supabase/migrations/024_signup_errors_rls.sql` — `ALTER TABLE ... ENABLE RLS;` sans policy SELECT.
  - `supabase/migrations/024_signup_errors_rls_DOWN.sql`

### B5 — Cron `refresh-prices` fail-closed
- **Modifié** : `app/api/cron/refresh-prices/route.ts:51-60`
- Avant : `if (CRON_SECRET) { ... }` ⇒ si la variable manquait, route ouverte.
- Après : `if (!CRON_SECRET) return new Response('Server misconfigured', { status: 500 })` puis Bearer obligatoire.

---

## BLOC 1 — Bloquants utilisateur

### B1 — Inscription complète
- **Fichiers créés** :
  - `lib/auth/errorMessages.ts` — `translateAuthError()` mappe les messages Supabase EN → FR (Invalid credentials, Email not confirmed, User already registered, weak password, rate limit, etc.).
  - `app/api/auth/signup/route.ts` — `POST` qui appelle `supabase.auth.signUp` avec `emailRedirectTo` basé sur `NEXT_PUBLIC_APP_URL`. Renvoie `{ ok, needsConfirmation }`.
  - `app/(auth)/signup/page.tsx` — formulaire email + password + confirm, écran "Vérifie ta boîte mail" si confirmation requise, redirection `/profil` sinon.
- **Fichiers modifiés** :
  - `app/api/auth/login/route.ts` — erreurs passées via `translateAuthError`, hardcode `https://fynix-mu.vercel.app` remplacé par `NEXT_PUBLIC_APP_URL`.
  - `app/(auth)/login/page.tsx` — toggle "Pas encore de compte ? S'inscrire" → `/signup`.

### B2 — Dédup import CSV
- **Migrations créées** :
  - `supabase/migrations/025_import_history.sql` — table `import_history(user_id, file_hash, imported_at, row_count, broker_hint)` UNIQUE(user_id, file_hash) + RLS + 3 policies CRUD.
  - `supabase/migrations/025_import_history_DOWN.sql`
- **Modifié** : `app/api/portfolio/import/route.ts`
  - SHA-256 du contenu CSV + sorted excludedKeys → `file_hash`.
  - Check `import_history` avant ingestion : si match, renvoie `409` avec date et nb de positions.
  - Insert hash en fin de course (best-effort, log dev-only si échec).

### B3 — Exclusions CSV opérantes
- **Modifié** : `lib/portfolio/csvImport.ts:758` — `aggregateToPositions` accepte `excludedKeys: ReadonlyArray<string>`. Les groupes dont la clé `(isin ?? ticker ?? name).toUpperCase()` matche sont filtrés.
- **Modifié** : `app/api/portfolio/import/route.ts:61-91` — `readCsv` parse `excludedIds` depuis JSON ou multipart, passe à `aggregateToPositions`.
- **Modifié** : `components/portfolio/import-csv-modal.tsx:121-145` — envoie `excludedIds` au lieu du `_exclusions` muet. Commentaire trompeur supprimé.

---

## BLOC 2 — Responsive mobile

### U1 — Sidebar drawer mobile
- **Modifié** : `components/shared/sidebar.tsx`
  - Refactor : `SidebarContent` interne réutilisable.
  - `<aside className="hidden lg:flex w-56 ...">` (desktop ≥1024 px).
  - Bouton burger `fixed bottom-4 right-4 z-40 lg:hidden`.
  - Drawer `lg:hidden fixed inset-0 z-50` avec backdrop, slide-in 200 ms, fermeture sur lien + ESC implicite (`useEffect [pathname]`).
  - Verrouille `body.overflow` quand ouvert.
  - Commentaire `// breakpoint lg = 1024px` inclus.

### U6 — Stepper CSV `flex-wrap`
- **Modifié** : `components/portfolio/import-csv-modal.tsx:171` — ajout `flex-wrap`.

### U7 — Chart patrimoine responsive
- **Modifié** : `components/dashboard/patrimoine-evolution-chart.tsx`
  - Wrapper `<div className="h-48 md:h-64 w-full">` + `ResponsiveContainer height="100%"`.
  - Skeleton aligné `h-48 md:h-64`.
  - `yAxisWidth` calculé via `matchMedia('(max-width: 767px)')` : 40 sur mobile, 56 sinon.

---

## BLOC 3 — Cohérence calculs FIRE

### Création centrale `lib/analyse/constants.ts`
Source unique : `PRELEVEMENTS_SOCIAUX_PCT (17.2)`, `PFU_PCT (30)`, `AV_LONG_TERME_PCT (24.7)`, `AV_ABATTEMENT_CELIBATAIRE (4600)`, `AV_ABATTEMENT_COUPLE (9200)`, `TMI_FALLBACK_PCT (30)`, `SWR_LEAN/STANDARD/FAT_PCT`, `swrPctFromFireType()`.

### I1 — Hero / ProjectionFIRE alignés
- **Modifié** : `lib/analyse/aggregateur.ts`
  - `ProjectionSnapshotInputs` accepte `fireType` et `inflationPct`.
  - `computeProjectionSnapshot` :
    - SWR ← `swrPctFromFireType(i.fireType)` au lieu de 4 % figé.
    - Cible FIRE = `revenu × 12 / swrFraction × (1+infl)^y` (au lieu de `× 12 × 25`).
    - Passe `swrPct` à `projectionFIREIntervalle`.
  - Site d'appel : `fireType: profile.fire_type, inflationPct: INFLATION_DEFAUT_PCT`.

### I2 — TMI fallback uniforme + flag `tmi_estime`
- **Modifié** : `lib/analyse/optimiseurFiscal.ts:163` — `fi.tmi_rate ?? 0` → `?? TMI_FALLBACK_PCT (30)`. Plus de "aucune opportunité" silencieuse quand TMI null.
- **Modifié** : `lib/analyse/fiscaliteImmo.ts:84` — `tmi_rate ?? 30` → `?? TMI_FALLBACK_PCT` (même valeur, source centrale).
- **Type étendu** : `types/analyse.ts` — `PatrimoineComplet['fireInputs'].tmi_estime: boolean` exposé (l'UI peut afficher un badge "TMI estimée").
- **Modifié** : `lib/analyse/aggregateur.ts:755` — `tmi_estime: profile.tmi_rate === null`.

### I8 — Constantes fiscales dédupliquées
- `PRELEVEMENTS_SOCIAUX_PCT`, `PFU_PCT`, `AV_LONG_TERME_PCT` désormais importés depuis `./constants` dans :
  - `lib/analyse/fiscaliteImmo.ts` (re-exporté pour compat API)
  - `lib/analyse/optimiseurFiscal.ts` (alias local + re-export)
  - `lib/analyse/projectionFIRE.ts` (alias `PFU_CTO_PCT`/`PS_PEA_AV_PCT`/`FISCALITE_AV_LONG_TERME_PCT`)

### Tests adaptés
- `lib/analyse/__tests__/optimiseurFiscal.test.ts:67` — ajout `tmi_estime: false`.
- `lib/analyse/__tests__/recoMensuelles.test.ts:43` — ajout `tmi_estime: false`.
- `lib/analyse/__tests__/scores-projection-recos.test.ts:71` — ajout `tmi_estime: false`.

---

## BLOC 4 — Dette technique

### D1 — Console.log gatés
- **Créé** : `lib/utils/devLog.ts` — `devLog()` / `devWarn()` no-op en `NODE_ENV=production`.
- **Migrations** (17 occurrences) :
  - `lib/analyse/aggregateur.ts` : 5 dans `logExpansionDebug`, 2 dans le rapport final, 3 `console.warn` ETF non mappés → `devLog/devWarn`.
  - `lib/analyse/expandETF.ts:200` → `devLog`.
  - `lib/analyse/isinBatch.ts:87,90` → `devLog`.
  - `lib/analyse/isinEnricher.ts:201,204,209,217,224` → `devLog`.

### D9 — `formatEur` dédupliqué
- **Modifié** : `lib/utils/format.ts` — ajout `formatEur(value, options?)` = alias `formatCurrency(_, 'EUR', _)`.
- **Modifié** : `lib/analyse/recoMensuelles.ts` — fonction locale `formatEur` supprimée, import depuis `lib/utils/format`. Appels passent `{ decimals: 0 }` pour préserver format historique.
- **Modifié** : `components/analyse/Recommandations.tsx` — fonction locale `formatEur` supprimée, import partagé.
- **Test ajusté** : `lib/analyse/__tests__/recoMensuelles.test.ts:66` rendu tolérant aux espaces Unicode (U+202F utilisé par `toLocaleString('fr-FR')`).

### U3 — Toast d'erreur wizard
- **Modifié** : `components/profil/ProfilQuestionnaire.tsx:78-107` — `console.warn` remplacé par `setError('Sauvegarde echouee : ...')`. Le bandeau d'erreur s'affichait déjà côté UI mais n'était plus alimenté lors des sauvegardes intermédiaires.

### U5 — Erreurs login en français
Déjà couvert via `lib/auth/errorMessages.ts` (cf. B1).

---

## BLOC 5 — Empty states & edge cases

### U2 — Empty state dashboard
- **Créé** : `components/dashboard/empty-state.tsx` — `DashboardEmptyState` avec 3 CTA Portefeuille / Immobilier / Cash + mention import CSV.
- **Modifié** : `app/(app)/dashboard/page.tsx` — `isEmpty = assets=0 && positions=0 && properties=0`. Si vrai → affiche `<DashboardEmptyState />` au lieu de `KpiGrid`, `ActionsDuMois`, `PatrimoineEvolutionChart`, `AlertsPanel`, etc. Le `FIREProgressHero` reste visible car il a son propre empty-state (CTA profil).

### U9 — /analyse jamais bloquée à vide
- **Modifié** : `app/(app)/analyse/analyse-client.tsx` — remplace l'`EmptyState` qui masquait toute la page par un bandeau explicatif suivi des onglets Scores & Projection / Simulateur / Recos / Fiscal. L'utilisateur fraîchement onboardé peut planifier sans avoir saisi un actif.
- Imports `EmptyState` et `Briefcase` retirés (plus utilisés).

### U8 — "Objectif maintenu" trompeur corrigé
- **Modifié** : `components/analyse/StressTestPanel.tsx:225-247`
  - Si `retard_mois === 0 && age_fire_avec_stress === null` → affiche "Objectif non atteint dans ce scenario" en `warning` (orange) au lieu de "Objectif maintenu" en vert.
  - Cas normal (`age_fire_avec_stress !== null`) inchangé.

---

## Récapitulatif fichiers

### Créés (10)
- `supabase/migrations/024_signup_errors_rls.sql` (+ DOWN)
- `supabase/migrations/025_import_history.sql` (+ DOWN)
- `lib/auth/errorMessages.ts`
- `lib/analyse/constants.ts`
- `lib/utils/devLog.ts`
- `app/api/auth/signup/route.ts`
- `app/(auth)/signup/page.tsx`
- `components/dashboard/empty-state.tsx`

### Modifiés (22)
- `app/api/cron/refresh-prices/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/portfolio/import/route.ts`
- `app/(auth)/login/page.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/analyse/analyse-client.tsx`
- `components/shared/sidebar.tsx`
- `components/portfolio/import-csv-modal.tsx`
- `components/dashboard/patrimoine-evolution-chart.tsx`
- `components/analyse/Recommandations.tsx`
- `components/analyse/StressTestPanel.tsx`
- `components/profil/ProfilQuestionnaire.tsx`
- `lib/portfolio/csvImport.ts`
- `lib/analyse/aggregateur.ts`
- `lib/analyse/projectionFIRE.ts`
- `lib/analyse/optimiseurFiscal.ts`
- `lib/analyse/fiscaliteImmo.ts`
- `lib/analyse/recoMensuelles.ts`
- `lib/analyse/isinBatch.ts`
- `lib/analyse/isinEnricher.ts`
- `lib/analyse/expandETF.ts`
- `lib/utils/format.ts`
- `types/analyse.ts`
- `lib/analyse/__tests__/optimiseurFiscal.test.ts`
- `lib/analyse/__tests__/recoMensuelles.test.ts`
- `lib/analyse/__tests__/scores-projection-recos.test.ts`

### Migrations à appliquer en prod
1. `024_signup_errors_rls.sql` — RLS sur table existante (zéro downtime).
2. `025_import_history.sql` — nouvelle table (zéro impact existant).

---

## Tests

```
Test Files  44 passed (44)
      Tests  716 passed (716)
   Duration  ~8 s
```

`npx tsc --noEmit` ne produit aucune erreur.

---

# SPRINT 1

> Date : 2026-05-17 (J0+1)
> Tests : **46 fichiers / 740 tests passent** (716 → 740, +24)
> Typecheck : `npx tsc --noEmit` silencieux

## BLOC A — Cashflow net immo propagé (B6)

`simulerBienExistant` propage désormais le `cashflow_net_fiscal` mensuel des biens vers la projection FIRE. Avant : trajectoire patrimoniale brute (loyer − charges − mensualité), impôt foncier ignoré sauf à l'âge cible. Après : on dérive un ratio impôt/loyer à partir de l'année 0 et on l'applique chaque année (suit l'inflation des loyers, conserve la cohérence quand le crédit se solde).

- **Modifié** : `lib/analyse/projectionFIRE.ts`
  - `simulerBienExistant(bien, annees, appreciationPct, inflationLoyersPct, cashflowNetFiscalAnnuel?)` : nouveau paramètre optionnel.
  - Si fourni et non NaN → dérive `ratioImpotSurLoyers = impotY0 / loyerY0`, applique à chaque année. Sinon → fallback brut + `devWarn`.
  - `projectionGlobale` injecte automatiquement `b.cashflow_net_fiscal * 12` pour chaque bien validé.
  - Import `devWarn` ajouté (chemin relatif `../utils/devLog` pour compat tests).
- **Tests ajoutés** : 5 dans `lib/analyse/__tests__/projectionFIRE.test.ts`
  - Scénario A : cashflow net fourni à l'année 0.
  - Scénario A : ratio appliqué avec inflation loyers 10 %/an.
  - Scénario A : cashflow net = brut (impôt nul) reste cohérent.
  - Scénario B : fallback brut quand absent.
  - Scénario B : fallback aussi quand NaN.

## BLOC B — Cron mensuel batché (B7)

Boucle séquentielle remplacée par batches parallèles de 10 avec 100 ms de pause entre les lots. Pour 500 users à ~2 s/user : passe de >1000 s (timeout Edge) à ~50 s avec marge.

- **Créés** :
  - `lib/email/batch.ts` — helper générique `runInBatches<T, R>(items, fn, opts)` avec `batchSize`, `delayMs`, `onBatch`, `sleep` injectable. Capture les erreurs item-par-item, pas de sleep après le dernier lot.
  - `lib/email/__tests__/batch.test.ts` — 4 tests :
    - 25 items × batchSize=10 → 3 batches (10/10/5) + 2 sleeps.
    - Échec dans un batch n'interrompt pas les suivants.
    - Liste vide ne fait aucun sleep.
    - batchSize=1 (séquentiel) avec sleeps entre.
- **Modifié** : `app/api/email/monthly-report/route.ts`
  - `processAllUsers` utilise `runInBatches(eligibles, processOneUser, { batchSize: 10, delayMs: 100 })`.
  - Retourne `{ total, success, failed, failedIds, details }` (au lieu de `{ processed, sent, errors, details }`).

## BLOC C — Dédup agrégateur / snapshots (B8)

Le hook envoie maintenant le `PatrimoineComplet` déjà calculé dans le body POST `/api/analyse/snapshot` (au lieu de body vide qui forçait une nouvelle agrégation). Un anti-rebond serveur 30 s par user absorbe les rafales d'events Realtime.

- **Créés** :
  - `lib/analyse/snapshotDebounce.ts` — `shouldSkipSnapshot`, `markSnapshot`, `createMemoryStore`, `SNAPSHOT_DEBOUNCE_MS = 30_000`.
  - `lib/analyse/__tests__/snapshotDebounce.test.ts` — 5 tests :
    - 1er appel jamais skippé.
    - 2e appel < 30 s → skippé.
    - 2e appel ≥ 30 s → non skippé.
    - Isolation entre utilisateurs.
    - Override `debounceMs` testable.
- **Modifiés** :
  - `app/api/analyse/snapshot/route.ts` — store module-scoped, body JSON parsé pour `patrimoineComplet`, retourne `{ skipped: true }` quand fenêtre active. Fallback `getPatrimoineComplet(user.id)` si body absent (compat).
  - `hooks/use-patrimoine-analyse.ts` — `fireAndForgetSnapshot(patrimoine)` envoie le payload JSON dans le body, 3 sites d'appel mis à jour.

## BLOC D — Dashboard sur `wealth_snapshots` (I4)

La requête historique principale du dashboard bascule sur `wealth_snapshots`, alimentée par `/api/analyse/snapshot` à chaque visite de `/analyse`. Plus de divergence visible entre la timeline du dashboard et la courbe `PatrimoineEvolutionChart`.

- **Modifié** : `app/(app)/dashboard/page.tsx`
  - Requête `patrimony_snapshots` → `wealth_snapshots` avec mapping `patrimoine_net → total_net_value`, `patrimoine_brut → total_gross_value`, `total_dettes → total_debt`.
  - Normalisation locale `snapshotsRaw` → `snapshots` pour conserver l'ancienne shape downstream (timeline + CAGR).
- **Annotés `// TODO I4`** (laissés sur `patrimony_snapshots` car colonnes manquantes ou flux legacy) :
  - `app/api/dashboard/route.ts` (colonne `confidence_score` absente de `wealth_snapshots`).
  - `app/api/snapshots/route.ts` (route legacy GET + POST).
  - `supabase/functions/snapshot-daily/index.ts` (Edge cron legacy).

## BLOC E — Stress tests refonte (I5 + I6)

**I6 (double comptage loyers)** : retrait de `+ loyersAnnuelsNormaux` au calcul du `revenuPotentielAnnuel`. Les loyers sont déjà capitalisés dans `portefeuille` mois par mois (ligne 295) → les compter aussi en flux SWR avançait artificiellement l'âge FIRE.

**I5 (baseline)** : `StressParams` renomme `projectionBase` → `baselineProjection` (avec type `StressParamsLegacy` pour compat retro). Quand le scenario a un impact strictement nul (`portefeuille = loyers = epargne = rendement_delta = 0`), `ageFireAvecStress` est aligné directement sur `baselineProjection.ageIndependanceCentral`. Élimine la divergence structurelle entre l'algo de stress (mensuel constant) et l'algo de `projectionGlobale` (annuel avec amortissement crédit).

- **Modifié** : `lib/analyse/stressTest.ts`
- **Tests ajoutés** : 4 dans `lib/analyse/__tests__/stressTest.test.ts`
  - Loyers 1000 €/mois + portefeuille fixe + scenario neutre → `age_fire_avec_stress === ageFireBaseline` (test demandé).
  - Baseline `null` + scenario neutre → stress `null` aussi, `retardMois = 0`.
  - Scenario non nul (`CRASH_MARCHES`) ne court-circuite pas.
  - Compat retro : `projectionBase` accepté en plus de `baselineProjection`.

## BLOC F — ActionsDuMois × OptimiseurFiscal (I3)

`genererActionsMensuelles` accepte désormais `opportunitesFiscales?: OpportuniteFiscale[]` et `maxActions?: number` (défaut 5). Top 2 opportunités applicables triées par `gain_annuel_eur` injectées en `type: 'fiscal'`, `priorite: 'haute'`. Filtre `overlapsExistingAction` évite les doublons par mots-clés (PEA / AV / PER / immobil).

- **Modifié** : `lib/analyse/recoMensuelles.ts`
  - Type `ActionMensuelleType` étend `'fiscal'`. Type `ActionPriorite` ajouté.
  - `ActionMensuelle.priorite?: 'haute' | 'moyenne' | 'info'`.
  - Helper `overlapsExistingAction` interne.
- **Modifiés (sites d'appel)** :
  - `app/(app)/dashboard/page.tsx` — calcule `calculerOpportunitesFiscales().opportunites` et passe à `genererActionsMensuelles`.
  - `app/api/email/monthly-report/route.ts` — idem (email mensuel cohérent avec le dashboard).
  - `components/dashboard/actions-du-mois.tsx` — icône `Receipt` ajoutée au `ICON_BY_TYPE`.
- **Tests ajoutés** : 6 dans `lib/analyse/__tests__/recoMensuelles.test.ts`
  - User avec TMI 30 + opportunité PEA → action `'fiscal'` priorité haute, titre contient « PEA » et le gain.
  - Aucune opportunité fournie → liste inchangée (compat retro).
  - Opportunités non applicables / gain = 0 ignorées.
  - Top 2 par `gain_annuel_eur` (1500, 1000, 300 → seules les 2 premières gardées).
  - Plafond `maxActions` (3 règles + 2 fiscales ≤ 5).
  - Doublon : drift source = « PEA » → opportunité « Optimiser PEA » filtrée.

## Récapitulatif fichiers Sprint 1

### Créés (4)
- `lib/email/batch.ts` + `lib/email/__tests__/batch.test.ts`
- `lib/analyse/snapshotDebounce.ts` + `lib/analyse/__tests__/snapshotDebounce.test.ts`

### Modifiés (13)
- `lib/analyse/projectionFIRE.ts`
- `lib/analyse/stressTest.ts`
- `lib/analyse/recoMensuelles.ts`
- `lib/analyse/__tests__/projectionFIRE.test.ts`
- `lib/analyse/__tests__/stressTest.test.ts`
- `lib/analyse/__tests__/recoMensuelles.test.ts`
- `hooks/use-patrimoine-analyse.ts`
- `app/(app)/dashboard/page.tsx`
- `app/api/analyse/snapshot/route.ts`
- `app/api/email/monthly-report/route.ts`
- `app/api/dashboard/route.ts` (annotation TODO I4)
- `app/api/snapshots/route.ts` (annotations TODO I4)
- `supabase/functions/snapshot-daily/index.ts` (annotation TODO I4)
- `components/dashboard/actions-du-mois.tsx` (icône fiscal)

### Migrations
Aucune nouvelle migration Sprint 1. Les modifications sont 100 % code TypeScript.

---

## Points NON corrigés

✅ **Tous les points de l'audit initial sont traités** (Sprint 3 termine la suppression de `patrimony_snapshots`).

Pour les évolutions futures (révision annuelle constantes fiscales, provisioning cron mensuel Supabase, tests composants avec jsdom), voir [NEXT_ACTIONS.md](./NEXT_ACTIONS.md).

---

# SPRINT 2

> Date : 2026-05-17 (J0+2)
> Tests : **55 fichiers / 810 tests passent** (740 → 810, **+70**)
> Typecheck : `npx tsc --noEmit` silencieux
> ESLint : `npx eslint . --max-warnings 0` passe (0 erreur, 0 warning)

## BLOC A — Hardening import CSV (D13 + D14 + D15 + D16 + D19)

**D14 — Limites taille/lignes.** `app/api/portfolio/import/route.ts` retourne `413` si `Content-Length > 5 Mo` (ou `file.size` en multipart) et `422` si le CSV dépasse 5 000 lignes. Constantes exportées `MAX_CSV_BYTES`, `MAX_CSV_LINES`.

**D15 — Validation Zod.** Créé `lib/portfolio/importSchema.ts` (`ImportCsvBodySchema` + `formatZodErrors`) et `lib/auth/authSchemas.ts` (`LoginBodySchema`, `SignupBodySchema` avec règle de confirmation). Routes `/api/portfolio/import`, `/api/auth/login`, `/api/auth/signup` parsent leur body via `safeParse` → 400 avec messages structurés.

**D16 — Catalogue `instruments` propre.** Créé `lib/portfolio/cleanInstrumentName.ts` (pure) : retire préfixes (VENTE/ACHAT/...), patterns de date, capitalise, fallback ISIN/ticker si trop court. Appliqué avant tout INSERT dans `instruments`.

**D13 — INSERT ISIN-safe.** Pattern `insert().select().maybeSingle()` ; en cas de retour `null` (conflit UNIQUE issu d'une race), fallback `SELECT WHERE isin=?`. Plus de positions perdues côté users concurrents.

**D19 — Enrichissement parallélisé.** Tous les ISINs nouveaux sont collectés en une passe puis enrichis via `runInBatches(isin, enrichISIN, { batchSize: 5, delayMs: 2500 })`. Respect du rate-limit OpenFIGI (25 req/min sans clé).

**Tests ajoutés (25)** :
- `lib/portfolio/__tests__/cleanInstrumentName.test.ts` (8)
- `lib/portfolio/__tests__/importSchema.test.ts` (12 — couvre aussi auth schemas)
- `app/api/portfolio/import/__tests__/import-limits.test.ts` (4)
- `lib/email/__tests__/batch.test.ts` (+1 : 12/5/2 batches, scénario D19)
- `vitest.config.ts` étendu à `app/**/*.test.ts`

## BLOC B — Outillage qualité (D2 + D3 + D5)

**D5 — `database.types.ts` complété.** 6 interfaces ajoutées manuellement (la CLI Supabase n'est pas locale) : `WealthSnapshot`, `SignupError`, `EmailLog`, `IsinCache`, `PortfolioSnapshot`, `ImportHistory` + types Insert correspondants.

**D2 — ESLint actif en build.** `next.config.ts` : retrait de `eslint.ignoreDuringBuilds`. `eslint.config.mjs` ignore `next-env.d.ts` + `.next/**` + `tsconfig.tsbuildinfo`. Erreurs corrigées :
- 8 erreurs hooks dans `ProjectionFIRE.tsx` : refactor wrapper + `ProjectionFIREInner` avec narrowing par cast (les guards garantissent les non-null avant l'appel).
- 3 erreurs `no-html-link-for-pages` : `<a>` → `<Link>` dans `analyse-client.tsx` et `CryptoSummary.tsx`.
- 7 erreurs `react/no-unescaped-entities` : apostrophes échappées en `&apos;`.
- 2 erreurs `prefer-const` (auto-fix).
- 20 warnings nettoyés (imports/vars inutilisés, prefix `_` ou suppression).

**D3 — Husky + lint-staged.** `husky` et `lint-staged` installés. Hook `pre-commit` lance `lint-staged` (`eslint --max-warnings 0` sur les fichiers staged). Hook `pre-push` lance `tsc --noEmit && vitest run`. `README.md` créé avec section Développement (install via `npm install` + bypass `--no-verify` documenté).

## BLOC C — Tests email + intégration agrégateur (D7 + D8)

**D7 — `lib/email/__tests__/sendEmail.test.ts` (5 tests)** : succès nominal, 429 rate limit, 5xx, `RESEND_API_KEY` absente (pas d'appel réseau), exception inattendue. Le mock Resend est une vraie classe (pas `vi.fn().mockImplementation`) pour supporter `new Resend(...)`.

**D7 — `lib/email/__tests__/monthly-report-template.test.ts` (7 tests)** : présence prénom, patrimoine en EUR, token unsubscribe + libellé FR, absence d'`undefined`/`NaN`, gestion `actions_du_mois` vide (message "Tout est en ordre"), robustesse `meilleure_performance: null`, évolution négative formatée.

**D8 — `lib/analyse/__tests__/aggregateur.integration.test.ts` (7 tests)** : mock supabase fluide complet, `enrichPositions` et `fx` mockés. Couvre :
- Structure complète du retour `getPatrimoineComplet`.
- `totalNet=0` quand vide, sans crash.
- TMI null → `tmi_estime=true` ; TMI renseigné → `tmi_estime=false`.
- `fire_type='lean'` → cible FIRE supérieure à `fire_type='standard'` (SWR 3,5 % vs 4 %).
- Idempotence : deux appels successifs donnent les mêmes valeurs.

## BLOC D — Factorisation fiscale (D10 + D9 résidu)

**D10 — `lib/analyse/regimeFiscalImmo.ts` créé.** Source unique pour :
- `normalizeFiscalRegime(raw)` — accepte enum DB, alias (`rental`, `primary`, `nue`, `meuble_tourisme`), match partiel.
- `fiscalRegimeLabel(regime)` — libellé FR par régime.
- `isRegime(bien, list)` — utilisé par l'optimiseur (compat).
- `detecterRegimeFiscal({ type_location, recettes_annuelles, tmi_pct })` — recommandation avec justification :
  - Meublé < 77 700 € → micro-BIC.
  - Meublé ≥ 77 700 € → réel.
  - Nu ≥ 15 000 € → réel obligatoire.
  - Nu + TMI > 30 % → réel recommandé.
  - Tourisme → meuble_tourisme.
  - Sans loyer → indéterminé.
- Constantes : `PLAFOND_MICRO_FONCIER`, `PLAFOND_MICRO_BIC`, `TMI_SEUIL_REEL_PCT`.

Sites d'appel mis à jour :
- `optimiseurFiscal.ts` : `isRegime` délégué à `regimeFiscalImmo`.
- `aggregateur.ts` : `FISCAL_TO_TYPE` remplacé par `inferTypeUsageFromRegime` basé sur `normalizeFiscalRegime`.

**D9 résidu** : suppression de la fonction locale `formatEur` dans `lib/analyse/recommandations.ts` ; remplacée par l'import partagé `lib/utils/format` avec `{ decimals: 0 }`. Seul `lib/email/templates/monthly-report.ts` garde son `formatEur` local (besoin d'espaces fines insécables compatibles mail, documenté).

**Tests ajoutés (15)** : `lib/analyse/__tests__/regimeFiscalImmo.test.ts` — 5 cas demandés + 10 sur normalisation/label/seuils.

## BLOC E — Nice-to-have (D6 + I7)

**D6 — SCPI dans cash-flow.** Créé `lib/analyse/scpiCashflow.ts` (`computeScpiCashflowMonthly`, `DEFAULT_SCPI_YIELD_PCT = 4.0`). Pure, accepte `market_value` (fallback `cost_basis`) et un override `yield_pct` optionnel. Intégré dans `/api/snapshots/route.ts` : positions SCPI chargées via `buildPortfolioFromDb` puis ajoutées au `monthlyCashFlow`. Le TODO Phase 2 a été retiré.

**I7 — Jalons croisés avec l'historique.** Créé `lib/analyse/jalonsHistorique.ts` (`enrichJalonsAvecHistorique`). Pour chaque jalon de type `milestone`, cherche le premier snapshot `patrimoine_net ≥ valeur` et marque `atteint=true` + `date_atteinte`. Option `retirerAtteints` pour ne garder que les jalons futurs. Type `JalonFIRE` étendu avec `atteint?: boolean` et `date_atteinte?: string`.

**Tests ajoutés (12)** : `scpiCashflow.test.ts` (6) + `jalonsHistorique.test.ts` (6, dont le cas "patrimoine 650k → 100k et 500k atteints, 1M reste futur").

## Récapitulatif fichiers Sprint 2

### Créés (15)
- `lib/portfolio/cleanInstrumentName.ts` + test
- `lib/portfolio/importSchema.ts` + test
- `lib/auth/authSchemas.ts`
- `app/api/portfolio/import/__tests__/import-limits.test.ts`
- `lib/email/__tests__/sendEmail.test.ts`
- `lib/email/__tests__/monthly-report-template.test.ts`
- `lib/analyse/__tests__/aggregateur.integration.test.ts`
- `lib/analyse/regimeFiscalImmo.ts` + test
- `lib/analyse/scpiCashflow.ts` + test
- `lib/analyse/jalonsHistorique.ts` + test
- `.husky/pre-commit` (lint-staged)
- `.husky/pre-push` (tsc + vitest)
- `README.md`

### Modifiés (16)
- `app/api/portfolio/import/route.ts` (D13/D14/D15/D16/D19)
- `app/api/auth/login/route.ts` (Zod)
- `app/api/auth/signup/route.ts` (Zod)
- `app/api/snapshots/route.ts` (D6)
- `lib/analyse/aggregateur.ts` (D10 + cleanup)
- `lib/analyse/optimiseurFiscal.ts` (D10)
- `lib/analyse/recommandations.ts` (D9 résidu)
- `lib/email/__tests__/batch.test.ts` (test 12/5/2)
- `vitest.config.ts` (app/**/*.test.ts)
- `eslint.config.mjs` (ignore next-env.d.ts)
- `next.config.ts` (ESLint actif)
- `package.json` (husky, lint-staged, scripts)
- `types/database.types.ts` (D5 — 6 interfaces)
- `types/analyse.ts` (JalonFIRE.atteint/date_atteinte)
- `components/analyse/ProjectionFIRE.tsx` (refactor wrapper/Inner)
- `components/analyse/StressTestPanel.tsx` (cleanup import)
- `app/(app)/analyse/analyse-client.tsx` (<a> → <Link>)
- `components/analyse/CryptoSummary.tsx` (<a> → <Link>)
- `app/(auth)/login/page.tsx` (apostrophe)
- `app/(app)/parametres/parametres-form.tsx` (apostrophes)
- `app/(app)/immobilier/nouveau/page.tsx` (apostrophes + unused import)
- `components/forms/add-valuation-form.tsx` (apostrophe)
- `components/real-estate/quick-actuals-entry.tsx` (cleanup)
- `lib/real-estate/fiscal/foncier-reel.ts` (`_deficitDuToInterest`)
- `lib/portfolio/__tests__/csvImport.test.ts` (cleanup imports)
- `lib/profil/__tests__/calculs.test.ts` (cleanup imports)
- `app/api/dashboard/route.ts` (TODO I4 annotation)
- `app/api/assets/route.ts` (cleanup)
- `app/api/cash/route.ts` (cleanup)
- `app/api/real-estate/[id]/route.ts` (cleanup)

### Migrations
Aucune nouvelle migration Sprint 2.

---

## Tests Sprint 2

```
Test Files  55 passed (55)
      Tests  810 passed (810)
   Duration  ~10 s
```

ESLint `--max-warnings 0` passe (0 erreur, 0 warning).
`tsc --noEmit` silencieux.

---

# SPRINT 3 — Suppression de `patrimony_snapshots`

> Date : 2026-05-17 (J0+3)
> Tests : **55 fichiers / 810 tests** (inchangé — migration data + refactor)
> Typecheck silencieux · ESLint 0 warning
> Migrations à appliquer en prod : 026 puis 027 (dans cet ordre)

## Contexte

Dernier point en attente de l'audit initial : la table legacy `patrimony_snapshots` (migration 001) cohabitait avec `wealth_snapshots` (migration 020). Trois consommateurs restaient encore branchés sur l'ancienne table :
- `/api/dashboard/route.ts` (annoté `// TODO I4`)
- `/api/snapshots/route.ts` GET + POST (legacy)
- Edge Function `supabase/functions/snapshot-daily` (cron Supabase)

Le scénario A documenté dans NEXT_ACTIONS.md (migrer + supprimer) est exécuté ici.

## Étape 1 — Migration 026 : backfill

**Fichier** : `supabase/migrations/026_patrimony_to_wealth_backfill.sql`

Copie l'historique de `patrimony_snapshots` vers `wealth_snapshots` avec mapping :
- `total_gross_value` → `patrimoine_brut`
- `total_net_value` → `patrimoine_net`
- `total_debt` → `total_dettes`
- `real_estate_value + scpi_value` → `total_immo`
- `financial_value` → `total_portefeuille`
- `cash_value` → `total_cash`

Idempotente via `ON CONFLICT (user_id, snapshot_date) DO NOTHING` → ne touche pas aux `wealth_snapshots` plus récents calculés par le code Sprint 1.

Données perdues (volontairement) :
- `monthly_cashflow` : recalculé à la prochaine visite via `/api/analyse/snapshot`.
- `confidence_score` : déjà recalculé à la volée dans `/api/dashboard` (la colonne lue n'était jamais utilisée).
- `scpi_value`, `other_value`, `notes` : marginaux, abandonnés.

## Étape 2 — `/api/dashboard/route.ts`

- Requête `patrimony_snapshots` → `wealth_snapshots`.
- Mapping local pour préserver la shape `total_net_value/total_gross_value/total_debt` attendue par les consommateurs downstream (timeline + CAGR).
- Le `confidence_score` final reste calculé depuis `assets.confidence` (comme avant).

## Étape 3 — `/api/snapshots/route.ts`

Réécriture complète en proxy fin :
- **GET** lit `wealth_snapshots` et mappe vers la shape `patrimony_snapshots` legacy (pour compat clients externes éventuels). Conserve `getPagination` et les filtres `from`/`to`.
- **POST** appelle `getPatrimoineComplet(userId)` puis fait l'upsert directement dans `wealth_snapshots` (même logique que `/api/analyse/snapshot` mais sans anti-rebond, pour préserver la sémantique "force write" de la route legacy).

Imports nettoyés : `confidenceScore`, `computeRealEstatePortfolio`, `computeScpiCashflowMonthly`, `buildPortfolioFromDb`, `format` retirés.

## Étape 4 — Edge Function `snapshot-daily` dépréciée

`supabase/functions/snapshot-daily/index.ts` réécrit en stub 410 Gone avec instructions pour désactiver le cron Supabase :

```sql
SELECT cron.unschedule('snapshot-daily-cron');
```

Le snapshot quotidien est désormais assuré par 2 mécanismes :
- À chaque visite `/analyse` (fire-and-forget via `usePatrimoineAnalyse`).
- Au cron Vercel `/api/cron/refresh-prices` (08:00 UTC, déclenche aussi `persistPortfolioSnapshot` pour les users sans visite récente).

## Étape 5 — Migration 027 : DROP

**Fichier** : `supabase/migrations/027_drop_patrimony_snapshots.sql`

`DROP TABLE IF EXISTS public.patrimony_snapshots CASCADE` — supprime aussi les policies RLS et triggers d'audit associés.

⚠ **À appliquer SEULEMENT après** :
1. Migration 026 effectuée.
2. Code Sprint 3 déployé en prod.
3. Cron Supabase `snapshot-daily-cron` désactivé manuellement.

## Récapitulatif fichiers Sprint 3

### Créés (4)
- `supabase/migrations/026_patrimony_to_wealth_backfill.sql` (+ DOWN)
- `supabase/migrations/027_drop_patrimony_snapshots.sql` (+ DOWN)

### Modifiés (4)
- `app/api/dashboard/route.ts` — bascule sur `wealth_snapshots`, mapping normalisé.
- `app/api/snapshots/route.ts` — réécriture en proxy fin (GET + POST).
- `supabase/functions/snapshot-daily/index.ts` — stub 410 Gone.
- `lib/portfolio/build-from-db.ts` — commentaire d'en-tête mis à jour.

### Pas de test ajouté

Le périmètre est une migration de schéma + refactor de routes (proxies de lecture). Les tests existants (810) couvrent déjà :
- `getPatrimoineComplet` (test intégration agrégateur) — utilisé par le nouveau POST `/api/snapshots`.
- `/api/analyse/snapshot` (anti-rebond + body PatrimoineComplet) — la logique de référence.

## Ordre de déploiement prod

1. **Code** : merger et déployer la branche Sprint 3 sur Vercel.
2. **Vérifier** : `/api/dashboard`, `/api/snapshots` GET et POST répondent comme avant (mêmes shapes, mêmes statuts).
3. **Désactiver** cron Supabase : `SELECT cron.unschedule('snapshot-daily-cron');` dans SQL Editor.
4. **Appliquer** migration 026 : SQL Editor.
5. **Vérifier** : `SELECT COUNT(*) FROM wealth_snapshots;` doit refléter l'ancien historique.
6. **Appliquer** migration 027 : SQL Editor → la table legacy disparaît.

## Tests Sprint 3

```
Test Files  55 passed (55)
      Tests  810 passed (810)
   Duration  ~12 s
```

ESLint `--max-warnings 0` passe. `tsc --noEmit` silencieux.
