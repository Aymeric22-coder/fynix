# Refonte /analyse — 8 onglets → 3 onglets

> Date : 2026-05-18
> Périmètre : `app/(app)/analyse/*`, `components/analyse/*`, `app/(app)/dashboard/page.tsx`, `components/dashboard/actions-du-mois.tsx`.
> Aucune ligne touchée dans `lib/analyse/*`.

---

## Nouvelle structure (texte)

```
/analyse
├── « Où j'en suis »                ← onglet par défaut
│   ├── ScoresBand (5 scores cliquables + modale détail)
│   ├── RepartitionChart (donut + liste par classe d'actif)
│   ├── CouvertureCash (mois de charges couverts par le cash)
│   └── PortefeuilleAnalyse
│       ├── BourseAnalyse        (sectorielle + géo MSCI)
│       ├── ETFAnalyse           (expansion micro-expositions)
│       ├── CryptoAnalyse
│       ├── ImmoPapierAnalyse    (SCPI)
│       ├── ObligataireAnalyse
│       └── MetauxAnalyse
│
├── « Simuler »
│   └── ProjectionFIRE (englobe :)
│       ├── Stacked-area 4 composantes
│       ├── 8 sliders (épargne, rendement, revenu cible, appréciation,
│       │   inflation loyers, inflation gén., SWR, progression épargne)
│       ├── Simulateur acquisitions futures (jusqu'à 5)
│       └── StressTestPanel — « Et si… » résistance au stress
│           (6 scénarios, crash_marches sélectionné par défaut)
│   └── WhatIfSimulator (3 sous-tabs : Épargne / Immobilier / Allocation)
│
└── « Optimiser »                   ← badge nb recommandations
    ├── OptimiseurHero (NEW — « 💡 X €/an que tu laisses sur la table »)
    ├── OptimiseurFiscal (8 opportunités chiffrées + profil fiscal + disclaimer)
    └── Recommandations (3-6 recos priorisées + bouton « ✓ Fait » par carte)
```

Le paramètre URL `?tab=situation|simuler|optimiser` deep-link directement à l'onglet (utilisé par `actions-du-mois.tsx` qui pointe désormais vers `?tab=optimiser`).

---

## Mapping ancien → nouveau

| Ancien onglet (8) | Contenu | Destination | Notes |
|---|---|---|---|
| Global | Donut + 5 KPIs (Patrimoine, Portef, Immo, Cash, Revenu passif) | **Supprimé** | Doublon Dashboard. Donut conservé via RepartitionChart dans onglet 1. |
| Portefeuille (6 sous-onglets) | Sectorielle/géo MSCI par classe | **Où j'en suis** | Bloc « Analyse du portefeuille financier ». |
| Immo physique | ImmoSummary | **Supprimé** | Doublon `/immobilier`. |
| Cash | CashSummary + Rendement + Couverture + Alerte | **Où j'en suis** (couverture seule) | Le reste fait doublon avec `/cash`. |
| Scores & Projection | ScoresBand + ProjectionFIRE | **Où j'en suis** (scores) + **Simuler** (projection) | Scission. |
| Simulateur | WhatIfSimulator | **Simuler** | Conservé tel quel. |
| Recommandations | Recommandations | **Optimiser** | Avec nouveau bouton « ✓ Fait » de session. |
| Optimisation fiscale | OptimiseurFiscal | **Optimiser** | Précédé du nouveau `OptimiseurHero`. |

---

## Composants déplacés / créés / modifiés

### Nouveaux composants
- `components/analyse/OptimiseurHero.tsx` — bandeau hero amber avec total gains fiscaux récupérables (`gain_annuel_eur` somme × 5 ans). Affiche un message « optimisation au maximum » quand 0.
- `components/analyse/CouvertureCash.tsx` — extrait du bloc « Couverture des charges » de l'ancien CashAnalyse (jauge 4 paliers).

### Composants modifiés
- `app/(app)/analyse/analyse-client.tsx` — entièrement réécrit (3 onglets, ordre Situation/Simuler/Optimiser, deep-linking via `urlParam="tab"`, `defaultTab="situation"`).
- `components/analyse/StressTestPanel.tsx` — scénario par défaut `crash_marches` (au lieu de `null`) + titre « Et si… — résistance au stress » plus visible.
- `components/analyse/ProjectionFIRE.tsx` — réordonnancement : Acquisitions futures **avant** StressTestPanel (était l'inverse). Le `StressTestPanel` reste interne à `ProjectionFIRE` car il a besoin du `projectionBase` calculé par les sliders.
- `components/analyse/Recommandations.tsx` — chaque carte expose maintenant un bouton « ✓ Fait » / « Refaire » qui bascule l'élément dans une section « Marquées comme faites » (state `useState<ReadonlySet<string>>` local, non persisté).
- `app/(app)/dashboard/page.tsx` — donut « Allocation » retiré (doublon de `RepartitionChart` dans /analyse). Le timeline passe en pleine largeur. Import `DonutChart` supprimé. KpiGrid, récap immo, récap portefeuille **conservés** car non-doublons (KPIs distincts : CAGR, debt_ratio, confidence_score, etc.).
- `components/dashboard/actions-du-mois.tsx` — lien `?tab=recos` → `?tab=optimiser`.

### Composants supprimés (orphelins après refonte)
- `components/analyse/tabs/GlobalAnalyse.tsx`
- `components/analyse/tabs/ImmoPhysiqueAnalyse.tsx`
- `components/analyse/tabs/CashAnalyse.tsx`
- `components/analyse/tabs/ScoresProjectionAnalyse.tsx`
- `components/analyse/CashSummary.tsx` (orphelin une fois CashAnalyse supprimé)
- `components/analyse/ImmoSummary.tsx` (orphelin une fois ImmoPhysiqueAnalyse supprimé)

`components/analyse/CryptoSummary.tsx` est **conservé** car toujours utilisé par `tabs/portefeuille/CryptoAnalyse.tsx`.

---

## Fichiers modifiés (récap)

```
app/(app)/analyse/analyse-client.tsx              (réécrit)
app/(app)/dashboard/page.tsx                       (retrait donut + import)
components/analyse/CouvertureCash.tsx              (nouveau)
components/analyse/OptimiseurHero.tsx              (nouveau)
components/analyse/ProjectionFIRE.tsx              (réordonnancement)
components/analyse/Recommandations.tsx             (bouton Fait)
components/analyse/StressTestPanel.tsx             (scénario défaut + titre)
components/dashboard/actions-du-mois.tsx           (lien tab)

components/analyse/tabs/GlobalAnalyse.tsx          (supprimé)
components/analyse/tabs/ImmoPhysiqueAnalyse.tsx    (supprimé)
components/analyse/tabs/CashAnalyse.tsx            (supprimé)
components/analyse/tabs/ScoresProjectionAnalyse.tsx (supprimé)
components/analyse/CashSummary.tsx                 (supprimé)
components/analyse/ImmoSummary.tsx                 (supprimé)
```

---

## Vérifications

| Check | Résultat |
|---|---|
| `npx vitest run` | **966 / 966 tests passants** (66 fichiers, ~13s) |
| `npx tsc --noEmit` | **silencieux** (0 erreur) |
| `npx eslint . --max-warnings 0` | **exit 0** (aucune erreur, aucun warning) |
| `lib/analyse/*` touché ? | **non** — calculs intacts |
| Tests modifiés ? | **non** — aucun test ne référence les composants supprimés |
| Imports orphelins ? | **non** — tous les composants supprimés ont été retirés des consommateurs |

Le compteur de tests reste à 966 (aucun ajout/suppression de test). 

---

## Vérification fonctionnelle (lecture du code)

- ✅ Les 5 scores cliquables (`ScoresBand`) sont dans **« Où j'en suis »**.
- ✅ La projection FIRE 4 composantes + sliders sont dans **« Simuler »** (via `ProjectionFIRE`).
- ✅ Les 6 stress tests sont dans **« Simuler »** (via `StressTestPanel` interne à `ProjectionFIRE`).
- ✅ Le simulateur d'acquisitions futures (≤ 5) est dans **« Simuler »** (interne à `ProjectionFIRE`, placé **avant** les stress tests désormais).
- ✅ Les 3 sous-tabs What-if (Épargne / Immobilier / Allocation) sont dans **« Simuler »** (via `WhatIfSimulator`).
- ✅ Les 8 opportunités fiscales sont dans **« Optimiser »** (via `OptimiseurFiscal`).
- ✅ Les recommandations mensuelles sont dans **« Optimiser »** (via `Recommandations`).
- ✅ L'analyse portefeuille (6 sous-onglets MSCI) est dans **« Où j'en suis »** (via `PortefeuilleAnalyse`).
- ✅ Le bandeau hero gains fiscaux affiche `gainAnnuel = Σ opp.gain_annuel_eur` et `gain5ans = gainAnnuel × 5`.
- ✅ Default scenario stress test = `'crash_marches'` (au lieu de `null`).
- ✅ Bouton « ✓ Fait » sur chaque reco, state `useState<ReadonlySet<string>>`, non persisté.
- ✅ `?tab=optimiser` deep-linké depuis `actions-du-mois`.
- ✅ `defaultTab="situation"` dans `<Tabs>` → onglet par défaut = « Où j'en suis ».

---

## Ce qui N'a PAS été fait et pourquoi

1. **`StressTestPanel` non extrait en bloc autonome dans la page** — il reste rendu à l'intérieur de `ProjectionFIRE` (et non comme sibling direct dans l'onglet « Simuler »). Raison : le panneau a besoin du `projectionBase` calculé par les sliders en `useState` internes à `ProjectionFIRE`. Le hoist du state aurait été un refactor invasif touchant ~400 lignes. Compromis : le panneau a été **réordonné en bas** de `ProjectionFIRE` (après les acquisitions), avec un **titre plus visible** « Et si… — résistance au stress », et un **scénario par défaut** non-null. L'utilisateur le voit immédiatement à l'ouverture de l'onglet.

2. **« Rendement moyen du cash »** (calcul de l'ancien `CashAnalyse`) — supprimé conformément à la consigne stricte « garde UNIQUEMENT la couverture en mois ». Si cette info doit revenir, elle peut être ajoutée à `/cash` (sa place naturelle) plutôt qu'à `/analyse`.

3. **Alerte « Cash excessif » (> 20 % du patrimoine)** — supprimée pour la même raison. Pourrait remonter via les `recommandations` existantes (catégorie `liquidite`).

4. **KpiGrid + récap simu immo + récap portefeuille du Dashboard** — conservés. Ce ne sont pas des doublons purs des 5 KPIs de l'ancien onglet Global d'`/analyse` (Dashboard expose CAGR, debt_ratio, confidence_score, fraîcheur prix, etc. que /analyse ne montrait pas). La consigne « si c'est un doublon pur » a été interprétée strictement.

5. **Timeline patrimoine** — deux composants similaires existent dans le Dashboard (`PatrimoineEvolutionChart` Sprint 2 + `PatrimonyAreaChart` legacy). Ce doublon préexistait à la refonte ; pas dans le périmètre.

6. **Persistance des recos marquées « Fait »** — explicitement hors scope dans la consigne (« state local uniquement pour cette session, pas besoin de persister pour l'instant »). Ajouter une table `recos_done` côté Supabase + endpoint API serait un Sprint suivant.

7. **Page `/analyse/page.tsx`** — non modifiée car ce n'est qu'un wrapper `<AnalyseClient />`. Toute la logique vit dans le client.
