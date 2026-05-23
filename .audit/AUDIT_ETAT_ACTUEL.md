# AUDIT ÉTAT ACTUEL — Section immobilière FIRECORE

Date initiale : 2026-05-21 · Dernière mise à jour : 2026-05-23 (V8.2)
Périmètre : Sprints 1 à 5 + correctifs Sprint 3.5
Méthode : audit lecture seule, 6 domaines parallélisés sur 6 agents, consolidation.

> Rapports détaillés par domaine dans ce même dossier : [D1](D1_calculs.md) · [D2](D2_cas_usage.md) · [D3](D3_robustesse.md) · [D4](D4_ux.md) · [D5](D5_integration.md) · [D6](D6_database.md)

---

## SUIVI DES VAGUES

Le travail de correction est sérialisé en vagues (1 vague = 1 branche = 1 PR, pas de parallélisation du chemin critique).

| Vague | Périmètre | Statut | Commit / PR |
|---|---|---|---|
| **V1** | ROB-001 + ROB-002 + ROB-003 (wizard rollback + bandeau ?warn= + ALLOWED_KINDS + charges null) | ✅ Mergé | [PR #1](https://github.com/Aymeric22-coder/fynix/pull/1) → `c96c37f` |
| **V2** | Hygiène types DB (extension manuelle pour migrations 034/036/037/038/040/043 + 4 casts retirés) | ✅ Mergé | [PR #2](https://github.com/Aymeric22-coder/fynix/pull/2) → `4d542b6` |
| **V3.1** | Multi-crédit moteur + portfolio (`loans[]`, `aggregateLoans` partout) | ✅ Mergé direct master | `3b568f4` |
| **V3.2** | Boutons + tableaux multi-crédit (DELETE strict + bouton corbeille + tableau d'amortissement à onglets + mensualité par ligne + latentGain cohérent + RegimeComparator multi) | ✅ Mergé direct master | `d84bfd9` |
| **V4** | Dashboard `/analyse` converge sur le moteur `lib/real-estate/` (BUG-007/008 + BUG-D1-M08 + INCOH-002/003/004). `loadImmo` délègue à `computeRealEstatePortfolio` au lieu de calculer via un moteur fiscal séparé | ✅ Mergé direct master | `3ec90eb` |
| **V5** | Bandeau `/immobilier` converge sur le moteur (BUG-D1-M03 + cohérence cartes ↔ bandeau). `buildPropertySummariesFromPortfolio` remplace le calcul parallèle | ✅ Mergé direct master | `d1476be` |
| **V6** | Synthèse fiche détail converge sur le moteur (BUG-001 commissions short-term + BUG-D1-M04 charges Synthèse + cash-flow Synthèse aligné `kpis.monthlyCashFlowYear1`). `resolveCharges` accepte `opts.excludeShortTermPlatformFees` pour casser le double comptage | ✅ Mergé direct master | `3e29edf` |
| **V7** | Refonte `netNetYield` "sans crédit" (tous régimes) + BUG-D1-M05 SciDistribution. `netNetYield = netYield − (taxPaid / totalCost × 100)` — la seule différence entre nette et net-net est désormais l'impôt réellement payé. Invariant verrouillé : `taxPaid = 0 ⇒ netNetYield === netYield`. `SciDistribution.netProfitAfterIS` consomme `max(0, fiscalResult − taxPaid)` au lieu du proxy cash inflated | ✅ Mergé direct master | — |
| **V8.1** | Trois fixes mécaniques fiscaux (audit niches). (a) Micro-foncier : plafond CGI art. 32 (15 000 €/an) — `FONCIER_MICRO_CEILING` + `forcedRegimeSwitch` propagé dans `ProjectionYear` (réutilisable lmnp-micro). (b) **BUG-004** Pinel/Denormandie : réduction plafonnée à 10 000 €/an (`GLOBAL_TAX_NICHE_CAP`, CGI art. 200-0 A) dans `reduction-schedule.ts`. (c) **BUG-006** Loc'Avantages : base = loyer effectivement perçu (`monthlyRent × max(0, 12 − vacancyMonths)`) au lieu du loyer théorique. 11 tests d'invariant ajoutés | ✅ Mergé direct master | — |
| **V8.2** | **BUG-D1-M06** LMNP micro ceiling. `resolveLmnpMicroCeiling(abattementPct)` branché dans `getFiscalCalculator` : abattement 50 % → 77 700 € (classique OU tourisme classé, même plafond donc pas de catégorie à stocker), abattement 30 % → 15 000 € (tourisme non classé). Constantes nommées `LMNP_MICRO_CEILING_LONG_TERM` / `LMNP_MICRO_CEILING_TOURISM_UNCLASSIFIED` (réévaluation triennale IRL). `forcedRegimeSwitch` réutilise le slot V8.1. 7 tests d'invariant | ✅ Mergé direct master | — |
| **V8.3+** | Cf. plan section 8 — non démarrées (BUG-005 Pinel éligibilité [bloqué P7 surface en DB], décisions produit foncier MaPrimeRénov / LMP déficit amort / agrégation foyer / MH / Pinel clos 2025) | ⏳ À venir | — |

**Total items traités à ce jour** : **21/41** (P1: 9/11 — ROB-001/002/003 + BUG-002/003 + INTEG-001/002 + BUG-007/008 + BUG-001 + BUG-004 + BUG-006 ; P2: 10/19 — régen types + BUG-009 + INTEG-005/006 + BUG-D1-M01 + BUG-D1-M02 + BUG-D1-M08 + BUG-D1-M03 + BUG-D1-M04 + BUG-D1-M05 + **BUG-D1-M06**) · **≥67 nouveaux tests** ajoutés (V1–V8.1 + 7 invariants V8.2 : LMNP micro forced ≤/> 77 700 € à 50 %, ≤/> 15 000 € à 30 %, indexation IRL franchit les 2 seuils, fallback 71 % saisi libre).

---

## RÉSUMÉ EXÉCUTIF

| Domaine | Score | Bugs critiques | Bugs mineurs | Frictions UX |
|---|---|---|---|---|
| 1. Cohérence calculs | **4/10** | 9 | 8 | — |
| 2. Couverture cas d'usage | **7.5/10** | 4 (dont 2 dégradés) | — | — |
| 3. Robustesse | **6.5/10** | 3 | 7 | — |
| 4. UX & lisibilité | **7/10** | — | — | 10 |
| 5. Intégration modules | **5/10** | 7 | — | — |
| 6. Base de données | **4.5/10** | 0 (RLS OK) + 3 structurels | — | — |
| **GLOBAL** | **5.75/10** | **23** | **15** | **10** |

**Top 3 verdicts** :
1. **Le moteur `lib/real-estate/` est rigoureux et testé**, mais les consommateurs (page détail, dashboard `/analyse`, portfolio agrégé) recalculent à la main et divergent → un même KPI s'affiche avec 3 à 4 valeurs différentes selon l'écran.
2. **Le multi-crédit est implémenté à 30 %** : la Synthèse de la fiche bien l'utilise, mais Rentabilité, What-if, Suivi réel, Liste portfolio et Tableau de bord l'ignorent. Sur un bien avec un PTZ, 5 écrans donnent 5 cash-flows différents.
3. **L'intégration `property_events` → tableau de bord consolidé est cassée à zéro** : `alertCount` est codé en dur à 0 dans `app/(app)/immobilier/page.tsx:103`, le dashboard n'interroge JAMAIS `property_events`, le type d'alerte `'unpaid_rent'` est orphelin. Un investisseur multi-biens ne voit aucun impayé depuis la vue d'ensemble.

**Bonnes nouvelles** :
- RLS OK sur toutes les nouvelles tables (zéro fuite cross-user).
- Empty states présents partout (sauf onglet Charges).
- Responsive globalement bien fait (sauf 2 cartes en `grid-cols-3` fixe et l'historique charges sans overflow).
- Formatage des montants cohérent (`formatCurrency`/`formatPercent` utilisés partout sur les valeurs principales).
- What-if 100 % client-side — aucun risque de pollution des données.
- Aucune anomalie « positif en rouge / négatif en vert » détectée.

---

## 1. BUGS CRITIQUES

### BUG-001 — Double comptage commissions short-term dans les charges ✅ _(V6 → `3e29edf`)_
- **Fichier** : [lib/real-estate/build-from-db.ts:255-308](lib/real-estate/build-from-db.ts) + [lib/real-estate/charges-resolver.ts:91-103](lib/real-estate/charges-resolver.ts)
- **Description** : Pour un lot `short_term` ou `mixed`, `computeMonthlyRentForLot` renvoie `netOwnerRevenueTotal/12` (déjà net des commissions Airbnb/Booking + ménage + conciergerie). Mais `resolveCharges` recalcule `management_airbnb_pct × annualRent`, `management_concierge`, etc. et les empile dans `charges.other` via `extraChargesFrom040`.
- **Impact** : pour un Airbnb à 50 000 €/an avec 13,5 % commission + 8 000 € ménage, sur-déduction ~15 000 €/an → résultat fiscal, taxPaid et cashFlowAfterTax tous faux.
- **Reproduction** : un bien short_term avec `nightly_rate_low` saisi + une ligne `property_charges` avec `management_airbnb_pct > 0` ou `management_concierge > 0`.
- **Résolu V6** : `resolveCharges` accepte `opts.excludeShortTermPlatformFees`. `build-from-db.ts` détecte `hasShortTermLot = lots.some(rental_type ∈ {short_term, mixed})` et passe l'option. Les 4 postes plateformes/ménage/conciergerie sont zéroés ; `management_agency_pct` (mandat agence classique, distinct des plateformes) reste préservé.

### BUG-002 — Projection Rentabilité ignore les crédits secondaires
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:649-653](app/(app)/immobilier/[id]/page.tsx) + [components/real-estate/simulation-panel.tsx:49,182](components/real-estate/simulation-panel.tsx)
- **Description** : `SimulationPanel` accepte `debt: DbDebt | null` (singulier). Toute la projection (KPIs Y1, rendements, paybackYear, tableau annuel) est calculée sur le crédit principal seul.
- **Impact** : sur un bien avec PTZ + prêt principal, CF Y1 et rendement net-net **affichés dans la carte de la liste ET dans l'onglet Rentabilité** sont faux (mensualité PTZ ignorée, écart 100-500 €/mois). L'utilisateur arbitre sur des chiffres erronés.
- **Correction** : étendre `RawSimulationInput` à `loans: RawLoanInput[]` ou injecter `aggregateLoans` dans la projection.

### BUG-003 — PortfolioCard écrase le crédit secondaire en multi-crédit
- **Fichier** : [lib/real-estate/portfolio.ts:108-127](lib/real-estate/portfolio.ts)
- **Description** : `debtByAsset[d.asset_id] = { ... }` écrase au lieu de cumuler. Pour un bien à 2 crédits, seul le dernier renvoyé par Supabase (ordre non garanti) est utilisé.
- **Impact** : KPIs liste `/immobilier` divergent de la Synthèse fiche détail. Cash-flow et LTV consolidés faux.
- **Correction** : charger un `Map<string, DbDebt[]>` puis utiliser `aggregateLoans`.

### BUG-004 — Réduction Pinel/Denormandie non plafonnée niches fiscales ✅ _(V8.1)_
- **Fichier** : [lib/real-estate/fiscal/incentives/reduction-schedule.ts](lib/real-estate/fiscal/incentives/reduction-schedule.ts)
- **Description** : `computePinel` plafonne en interne à 10 000 € (`pinel.ts:141-148`), mais `reduction-schedule.ts` retournait `r.taxReductionPerYear` brut.
- **Résolu V8.1** : import `GLOBAL_TAX_NICHE_CAP` depuis `pinel.ts` + `cappedAnnualReduction = Math.min(annualReduction, GLOBAL_TAX_NICHE_CAP)` appliqué dans le tableau année par année. Invariant testé : aucune sortie Pinel/Denormandie ne dépasse 10 000 €/an, même en stressant les paramètres. Note : avec les plafonds Pinel actuels (300k base + 5500€/m²) et taux LF 2024, le max théorique par bien est ~6 000 €/an, donc le cap est inopérant en l'état actuel mais protège contre (a) une remontée des taux, (b) le branchement de la vraie surface (BUG-005), (c) l'agrégation foyer multi-biens (amélioration séparée).

### BUG-005 — Pinel/Denormandie appliqué sans vérifier l'éligibilité
- **Fichier** : [lib/real-estate/fiscal/incentives/reduction-schedule.ts:84-118](lib/real-estate/fiscal/incentives/reduction-schedule.ts)
- **Description** : `surfaceM2 = 1000` (BYPASS_SURFACE) et `annualRentHC = 0` court-circuitent les vérifs d'éligibilité Pinel. L'UI panneau signale l'inéligibilité, mais la projection crédite la réduction quand même.
- **Impact** : projection mensongère pour bien zone C ou loyer > plafond zone.
- **Correction** : passer les vraies `surfaceM2`/`annualRentHC`, ne créditer que si `eligible: true`.

### BUG-006 — Loc'Avantages : réduction calculée sur loyer théorique ✅ _(V8.1)_
- **Fichier** : [lib/real-estate/fiscal/incentives/reduction-schedule.ts](lib/real-estate/fiscal/incentives/reduction-schedule.ts)
- **Description** : `annualRentHC = rent.monthlyRent × 12` = loyer théorique (sans vacance). CGI art. 199 tricies impose les loyers RÉELLEMENT perçus.
- **Résolu V8.1** : `perceivedMonths = Math.max(0, 12 − vacancyMonths)` ; `annualRentPerceived = monthlyRent × perceivedMonths`. Sur Loc2 / 800 €/mois / 1 mois de vacance, la réduction passe de 3 360 € à 3 080 € (−280 € — bon impact dépend de la vacance saisie). Sur vacance excessive (15 mois), clampée à 0 (pas de réduction négative). 4 tests d'invariant (vacance 0/1/3/15 mois).

### BUG-007 — Dashboard `/analyse` utilise un moteur fiscal séparé ✅ _(V4 → `3ec90eb`)_
- **Fichier** : [lib/analyse/immoCalculs.ts:167-180](lib/analyse/immoCalculs.ts) + `lib/analyse/fiscaliteImmo.ts`
- **Description** : le tableau de bord n'utilise PAS `lib/real-estate/fiscal/` mais une calculatrice séparée sans amortissement, sans report de déficit, sans carry-forward.
- **Impact** : `cashflow_net_fiscal` dashboard ≠ `cashFlowAfterTax` fiche détail. Scores et recommandations consolidés faussés.
- **Résolu V4** : `loadImmo` délègue à `computeRealEstatePortfolio` (qui appelle `runSimulation` = moteur complet). Helper `buildBienImmoFromSimulation` mappe vers `BienImmo`. Les fonctions `calculerKPIsBien` / `calculerImpotFoncier` sont conservées `@deprecated` (plus appelées en runtime, tests historiques préservés).

### BUG-008 — Dashboard `/analyse` lit `debts.capital_remaining` DB au lieu du CRD analytique ✅ _(V4 → `3ec90eb`)_
- **Fichier** : [lib/analyse/aggregateur.ts:192-208](lib/analyse/aggregateur.ts)
- **Description** : Capital restant lu de la DB (snapshot ponctuel, dérive jour après jour) au lieu de `computeRemainingCapitalAt` analytique utilisé fiche détail. Pas de filtre `status='active'` non plus.
- **Impact** : total dette et équity dashboard peuvent être périmés de plusieurs mois.
- **Résolu V4** : `BienImmo.credit_restant = sim.capitalRemaining` (= `aggregateLoans(...).totalRemainingCapital` analytique multi-crédit calculé par le moteur portfolio). Filtre `status='active'` ajouté sur le SELECT debts (cf. BUG-D1-M08).

### BUG-009 — Tableau d'amortissement ne montre pas les crédits séparément
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:315,625-630](app/(app)/immobilier/[id]/page.tsx)
- **Description** : `schedule = buildAmortizationSchedule(loanForCalc)` — crédit principal uniquement. Le PTZ/prêt travaux est invisible.
- **Impact** : l'utilisateur ne peut pas vérifier le détail d'amortissement de son PTZ.
- **Correction** : afficher un onglet par crédit, ou utiliser `multiCredit.schedule` déjà calculé.

### ROB-001 — Wizard de création : pas de rollback si crédit ou lots échouent
- **Fichier** : [app/(app)/immobilier/nouveau/page.tsx:294-350](app/(app)/immobilier/nouveau/page.tsx)
- **Description** : seul le POST de création de bien est checké. Les fetch `credit` (l.295) et `lots` (l.345) **ne lisent pas leur réponse** — un échec partiel laisse un bien orphelin sans message d'erreur.
- **Impact** : bien créé sans crédit ni lot, utilisateur atterrit sur fiche incohérente sans alerte.
- **Correction** : `if (!res.ok || json.error) ...` sur chaque fetch + toast non-bloquant ou redirect `?warn=...`.

### ROB-002 — 5 kinds d'événements courte durée rejetés par l'API
- **Fichier** : [app/api/real-estate/[id]/events/route.ts:18-21](app/api/real-estate/[id]/events/route.ts)
- **Description** : `ALLOWED_KINDS` ne contient PAS `booking_cancellation`, `platform_payout`, `guest_damage`, `platform_dispute`, `seasonal_closure` — pourtant déclarés dans `types/database.types.ts:50-63` et autorisés par le CHECK de la migration 042.
- **Impact** : **impossible de saisir AUCUN événement de suivi réel sur un bien courte durée**. Régression silencieuse.
- **Correction** : ajouter les 5 valeurs ; idéalement importer la liste depuis les types DB.

### ROB-003 — `annual_charges` = NaN si une colonne charges est null
- **Fichier** : [app/api/real-estate/[id]/route.ts:42-45](app/api/real-estate/[id]/route.ts)
- **Description** : `charges.taxe_fonciere + charges.insurance + ...` sans `?? 0`. Une row `property_charges` avec colonnes null (pré-migration 040 ou INSERT partiel) → `NaN` → `net_yield` cassé.
- **Impact** : API renvoie metrics nulles/NaN, KPIs trompeurs.
- **Correction** : `(charges.X ?? 0) + ...` (pattern déjà utilisé dans `build-from-db.ts:271`).

### CAS-DASH-001 / INTEG-003 — Tableau de bord ignore `property_events`
- **Fichier** : [app/(app)/immobilier/page.tsx:103](app/(app)/immobilier/page.tsx) + [lib/real-estate/portfolio-summary.ts:138-209](lib/real-estate/portfolio-summary.ts)
- **Description** : `alertCount: 0` codé en dur ; aucune query `property_events` dans le SELECT du dashboard ; `PortfolioAlert.kind = 'unpaid_rent'` est orphelin (aucun émetteur).
- **Impact** : impayés, sinistres, vacances prolongées invisibles depuis `/immobilier`. Oblige à ouvrir chaque fiche.
- **Correction** : SELECT events non résolus, grouper par `property_id`, injecter dans `alertCount`, ajouter branche `'unpaid_rent'` dans `generatePortfolioAlerts`.

### INTEG-001 — Cash-flow consolidé ignore les multi-crédits (= BUG-003 côté agrégé)
Voir BUG-003.

### INTEG-002 — SimulationPanel / WhatIf / RealTrackingPanel sur crédit principal uniquement
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:651,676,805](app/(app)/immobilier/[id]/page.tsx) + [lib/real-estate/build-from-db.ts:196-250](lib/real-estate/build-from-db.ts)
- **Description** : trois consommateurs reçoivent `debtRow` (principal seul) alors que `multiCredit.totalMonthly` est disponible juste à côté (page.tsx:313).
- **Impact** : Synthèse et Rentabilité d'un même bien donnent des CF contradictoires ; `RealTrackingPanel` classe à tort comme « conforme » un mois où le PTZ a bien été prélevé.
- **Correction** : refondre `build-from-db.ts` pour accepter `DbDebt[]` ; minimum, passer `multiCredit.totalMonthly` en prop séparée à `RealTrackingPanel`.

### INTEG-005 — DELETE crédit ne respecte pas `loan_kind`
- **Fichier** : [app/api/real-estate/[id]/credit/route.ts:266-282](app/api/real-estate/[id]/credit/route.ts)
- **Description** : DELETE supprime TOUS les `debts` actifs d'un asset, sans filtre `loan_kind`. Incohérent avec PUT (l.168-186) qui cible un seul crédit par `(asset_id, loan_kind)`.
- **Impact** : impossible de supprimer un PTZ sans détruire aussi le crédit principal.
- **Correction** : accepter `?loan_kind=ptz` ou exposer `/debts/[debtId]`.

### INTEG-006 — Aucune UI pour supprimer un crédit secondaire
- **Fichier** : [components/real-estate/multi-credit-list.tsx](components/real-estate/multi-credit-list.tsx) + [components/real-estate/credit-tab.tsx](components/real-estate/credit-tab.tsx)
- **Description** : `MultiCreditList` est en lecture seule. Aucun bouton corbeille par ligne. Un crédit erroné ajouté reste à vie.
- **Correction** : ajouter bouton corbeille par ligne (dépend de INTEG-005 corrigé).

---

## 2. BUGS MINEURS

### BUG-D1-M01 — MultiCreditList : mensualité ligne sans assurance, total avec
- **Fichier** : [components/real-estate/multi-credit-list.tsx:50-52,83-87](components/real-estate/multi-credit-list.tsx)
- Somme visuelle des lignes ≠ total affiché.

### BUG-D1-M02 — PropertyCard : latentGain ≠ moteur
- **Fichier** : [components/real-estate/portfolio/property-card.tsx:48](components/real-estate/portfolio/property-card.tsx)
- `acqCost` sans furniture/bank_fees/guarantee_fees → latentGain carte ≠ fiche détail.

### BUG-D1-M03 — Portfolio summary : `monthlyCharges` toujours 0 ✅ _(V5 → `d1476be`)_
- **Fichier** : [app/(app)/immobilier/page.tsx:101](app/(app)/immobilier/page.tsx) + [lib/real-estate/portfolio-summary.ts:230,284](lib/real-estate/portfolio-summary.ts)
- `rawProps[i].monthlyCharges = 0` hardcodé → `totalMonthlyCharges` dashboard toujours 0.
- **Résolu V5** : `buildPropertySummariesFromPortfolio` lit `projection[0].charges / 12` du moteur. Le bandeau /immobilier affiche désormais la vraie valeur. Test bonus : `summary.totalLatentGain ≡ sum(PropertyCard.latentGain)` verrouille la cohérence cartes ↔ bandeau.

### BUG-D1-M04 — Synthèse : `monthlyCharges` sans GLI ni gestion % ✅ _(V6 → `3e29edf`)_
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:135-139,348-350](app/(app)/immobilier/[id]/page.tsx)
- Calcul manuel ignore les 7 colonnes explicites mais aussi `gli_pct`, `management_pct` et toutes les charges enrichies migration 040.
- **Résolu V6** : la Synthèse lit `simResult.projection[0].charges` (= `fixedCharges + gli + management`, incluant mig 040 résolues). Le cash-flow Synthèse passe aussi sur `kpis.monthlyCashFlowYear1` → "même chiffre partout" verrouillé par tests sentinelles dans `multi-credit-consistency.test.ts`.

### BUG-D1-M05 — SCI distribution : `netProfitAfterIS` confondu avec cash
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:705-712](app/(app)/immobilier/[id]/page.tsx)
- Passe `cashFlowAfterTax + principalRepaid` comme « résultat distribuable ». Bug d'interprétation comptable.

### BUG-D1-M06 — LMNP micro : plafond LF 2025 jamais déclenché ✅ _(V8.2)_
- **Fichier** : [lib/real-estate/fiscal/index.ts](lib/real-estate/fiscal/index.ts) + [lib/real-estate/fiscal/lmnp-micro.ts](lib/real-estate/fiscal/lmnp-micro.ts)
- **Description** : `makeLmnpMicroCalculator` était appelé sans le 3ᵉ paramètre `ceiling` → bascule auto micro→réel jamais déclenchée.
- **Résolu V8.2** : `resolveLmnpMicroCeiling(abattementPct)` dérive le plafond de l'abattement déjà stocké en DB. Mapping mécanique : 50 % → 77 700 € (classique OU tourisme classé, mêmes plafond), 30 % → 15 000 € (tourisme non classé), autre → fallback 77 700 €. Constantes nommées `LMNP_MICRO_CEILING_LONG_TERM` / `LMNP_MICRO_CEILING_TOURISM_UNCLASSIFIED` faciles à mettre à jour à chaque LF (réévaluation triennale IRL CGI art. 50-0). `forcedRegimeSwitch` propagé via le slot V8.1.

### BUG-D1-M07 — Foncier-micro : abattement sur `netRent` au lieu de `grossRent`
- **Fichier** : [lib/real-estate/fiscal/foncier-micro.ts:27](lib/real-estate/fiscal/foncier-micro.ts)
- Réglementairement ambigu (cf. clarifications).

### BUG-D1-M08 — Aggregateur `/analyse` : pas de filtre `status='active'` sur debts ✅ _(V4 → `3ec90eb`)_
- **Fichier** : [lib/analyse/aggregateur.ts:192-198](lib/analyse/aggregateur.ts)
- Un crédit `paid_off` avec capital_remaining résiduel pollue les agrégats.
- **Résolu V4** : Filtre `.eq('status', 'active')` ajouté sur le SELECT debts local de `loadImmo` (récupération du crédit principal pour la projection FIRE), et le calcul des KPIs est désormais délégué au moteur portfolio qui filtrait déjà depuis V3.1.

### ROB-101 — Pas de validation `loan_start_date >= acquisition_date`
- **Fichier** : [app/(app)/immobilier/nouveau/page.tsx:222-227](app/(app)/immobilier/nouveau/page.tsx)
- On peut saisir un prêt qui démarre 5 ans avant l'acquisition.

### ROB-102 — Pas de cap supérieur sur les taux
- **Fichiers** : wizard + [components/real-estate/credit-form.tsx:286-298](components/real-estate/credit-form.tsx)
- `min={0}` mais aucun `max` → saisie 999 % possible.

### ROB-103 — Période événement inversée acceptée
- **Fichier** : [components/real-estate/add-event-modal.tsx:164-191](components/real-estate/add-event-modal.tsx) + API events
- `period_end < period_start` enregistré tel quel.

### ROB-104 — DELETE credit utilise `alert()` natif
- **Fichier** : [components/real-estate/credit-form.tsx:191](components/real-estate/credit-form.tsx)
- Incohérent avec le reste de l'UI.

### ROB-105 — What-if slider gelé si `rent` ou `currentValue` = 0
- **Fichier** : [components/real-estate/what-if-simulator.tsx:124-146](components/real-estate/what-if-simulator.tsx)
- Min = max = 0 → slider mort sur bien vacant.

### ROB-106 — PATCH avec body vide retourne 200 silencieusement
- **Fichier** : [app/api/real-estate/[id]/route.ts:67-109](app/api/real-estate/[id]/route.ts)

### ROB-107 — `quick-actuals-entry` : `loading` partagé entre 3 onglets
- **Fichier** : [components/real-estate/quick-actuals-entry.tsx:69,114,144,175](components/real-estate/quick-actuals-entry.tsx)

### INTEG-007 — Révision de loyer irréversible
- **Fichier** : [app/api/real-estate/[id]/events/[eventId]/route.ts:58-81](app/api/real-estate/[id]/events/[eventId]/route.ts)
- Supprimer une révision ne restaure pas l'ancien `rent_amount` du lot.

### CAS-RP-001 — Onglets non filtrés pour Résidence Principale
- **Fichier** : [app/(app)/immobilier/[id]/page.tsx:425-838](app/(app)/immobilier/[id]/page.tsx)
- « Rentabilité », « Dispositif fiscal », « Suivi réel » restent visibles pour une RP sans aucun sens.

### CAS-WIZ-LOT-001 — Étape 5 du wizard non skippée pour RP
- **Fichier** : [app/(app)/immobilier/nouveau/page.tsx:657-665](app/(app)/immobilier/nouveau/page.tsx)
- Message « Aucun loyer à saisir » + clic « Suivant » inutile.

### CAS-WHATIF-001 — What-if non persistable
- **Fichier** : [components/real-estate/what-if-simulator.tsx](components/real-estate/what-if-simulator.tsx)
- Aucune sauvegarde (ni sessionStorage ni API). Pas un bug, mais friction forte.

---

## 3. INCOHÉRENCES DE CALCUL

### INCOH-001 — Cash-flow mensuel net (4 formules pour le même KPI)
- **A** — Liste PropertyCard : `kpis.monthlyCashFlowYear1` (moteur, après impôts + vacance, mono-crédit) — [property-card.tsx:108](components/real-estate/portfolio/property-card.tsx)
- **B** — Fiche Synthèse : `monthlyRents - annualCharges/12 - multiCredit.totalMonthly` (sans impôts, sans vacance, sans GLI/gestion %, multi-crédit OK) — [page.tsx:348-350](app/(app)/immobilier/[id]/page.tsx)
- **C** — Fiche Rentabilité : `kpis.monthlyCashFlowYear1` (moteur, après impôts + vacance, multi-crédit ignoré) — [simulation-panel.tsx:506](components/real-estate/simulation-panel.tsx)
- **D** — Dashboard `/analyse` : `loyer - mensualité - charges/12 - impôt` (moteur fiscal séparé) — [immoCalculs.ts:120,177](lib/analyse/immoCalculs.ts)
- **Valeur correcte** : aucune des 4 n'est exacte en multi-crédit. Cible : `kpis.monthlyCashFlowYear1` avec multi-crédit injecté dans la projection.

### INCOH-002 — Rendement brut (3 numérateurs × 3 dénominateurs) ✅ _(V4 → `3ec90eb`)_
- **A** — Liste : `(rent.monthlyRent × 12) / totalCost` — numérateur tous lots ou `assumed_total_rent`, dénominateur complet FAI.
- **B** — Fiche Synthèse : `(monthlyRented × 12) / acqCost` — numérateur lots status='rented' uniquement.
- **C** — Dashboard `/analyse` : `(loyer × 12) / (purchase_price + works)` — dénominateur amputé (pas de frais notaire, mobilier, bank_fees).
- **Valeur correcte** : A (convention FAI = Frais d'Acquisition Inclus). Résolu en V4 (BUG-007 / P1 #11) : `/analyse > BienImmo.rendement_brut = kpis.grossYieldFAI` (dénominateur = coût FAI complet via le moteur, cohérent avec la liste et la fiche).

### INCOH-003 — Capital restant dû (analytique vs DB) ✅ _(V4 → `3ec90eb`)_
- **A** — Fiche détail, MultiCreditList : `computeRemainingCapitalAt` analytique mois par mois (multi-crédit OK fiche).
- **B** — Liste : `computeRemainingCapitalAt` sur 1 seul crédit par asset.
- **C** — Dashboard `/analyse` : colonne DB `debts.capital_remaining` figée par snapshot.
- **Valeur correcte** : A étendu au multi-crédit. Résolu en V4 (BUG-008 / P1 #11) : `/analyse > BienImmo.credit_restant = sim.capitalRemaining` (= `aggregateLoans(...).totalRemainingCapital` analytique multi-crédit). Plus de snapshot DB.

### INCOH-004 — Valeur du bien dans le rendement ✅ _(V4 → `3ec90eb`)_
- **A** — Fiche, liste : `current_value ?? purchasePrice + works` pour patrimoine.
- **B** — Dashboard `/analyse` : `purchase_price + works` partout, jamais la valuation actuelle.
- **Valeur correcte** : valuation pour le patrimoine, coût de revient pour les rendements. Résolu en V4 (P1 #11) : `/analyse > BienImmo.valeur = kpis.currentNetPropertyValue + capitalRemaining` (= `currentEstimatedValue`, donc `asset.current_value` ou fallback). Les rendements utilisent eux `kpis.grossYieldFAI` / `kpis.netYield` (dénominateur coût FAI). Distinction respectée.

### INCOH-005 — Plus-value latente (`latentGain`) ✅ _(V3.2 → `d84bfd9`)_
- **A** — Fiche Synthèse : `currentVal - acqCost` complet (avec mobilier, bank_fees, guarantee_fees).
- **B** — Liste PropertyCard : `currentValue - (purchase_price + purchase_fees + works)` — incomplet.
- **Valeur correcte** : A. Résolu en V3.2 (BUG-D1-M02, P2 #22) : PropertyCard utilise désormais `kpis.totalCost` (= dénominateur unifié du moteur), strictement cohérent avec la Synthèse.

### INCOH-006 — Mensualité totale crédit (avec/sans assurance par ligne) ✅ _(V3.2 → `d84bfd9`)_
- **A** — MultiCreditList ligne : `computeMonthlyPayment` (sans assurance).
- **B** — MultiCreditList total : `aggregateLoans.totalMonthly` (avec assurance).
- **Valeur correcte** : B (ce que paye réellement le client).

---

## 4. MIGRATIONS — DRIFT ET NUMÉROTATION

### Numérotation cassée
- **DEUX `031_*`** : `031_onboarding_quick.sql` ET `031_drop_dca_tables.sql`. Ordre d'application dépendant du tri locale de `supabase db push`.
- **DEUX `033_*`** : `033_usage_type.sql` ET `033_transactions_external_ref_unique.sql`. Même problème.
- Risque : sur fresh DB, comportement non déterministe (idempotent grâce aux `IF NOT EXISTS`, donc pas de crash, mais sale).

### Migrations attendues introuvables
| Attendu | Statut | Notes |
|---|---|---|
| `039_cascade_delete.sql` | **MANQUANT** | CASCADE déjà posés dans 001 + 006, pas d'impact fonctionnel observé. Fichier dédié jamais créé. |
| `043_events_short_term.sql` | **MANQUANT (fusionné dans 042)** | Les 5 kinds courte durée sont ajoutés dans `042_short_term_rental.sql:92-113`. |
| `044_property_coordinates.sql` | **MANQUANT (numéroté 043)** | Le contenu existe sous `043_property_coordinates.sql`, en conflit numérique avec le hypothétique 043_events_short_term. |

### Migrations supposées appliquées
Toutes les colonnes des migrations 033 à 043 sont **effectivement consommées par le code** (composants, routes, lib). Pas de signal de migration non appliquée en production, mais **impossible de garantir sans accès Supabase**.

### Types TypeScript désynchronisés (plus grave que la numérotation)
Le fichier `types/database.types.ts` n'a **pas été régénéré** après les migrations 034, 036, 037, 040, 043 — alors qu'un commentaire en tête du fichier prescrit `supabase gen types typescript` après chaque migration. Conséquences :

| Fichier:ligne | Cast dangereux | Cause |
|---|---|---|
| [app/(app)/immobilier/[id]/page.tsx:709](app/(app)/immobilier/[id]/page.tsx) | `(propTyped as unknown as { cca_amount? })` | mig 037 |
| [app/(app)/immobilier/page.tsx:143-144](app/(app)/immobilier/page.tsx) | `(p as unknown as { latitude?, longitude? })` | mig 043 |
| [app/(app)/parametres/parametres-form.tsx:26,29](app/(app)/parametres/parametres-form.tsx) | `(profile as { professional_income_eur?, foyer_fiscal_parts? })` | mig 036 |
| [app/api/real-estate/[id]/credit/route.ts:35](app/api/real-estate/[id]/credit/route.ts) | type local redéclaré pour `loan_kind` | mig 034 |
| `lib/real-estate/charges-resolver.ts` (implicite) | aucune protection statique sur les ~20 colonnes mig 040 | mig 040 |

---

## 5. PROBLÈMES DE ROBUSTESSE (cas limites)

| Cas | Comportement | Sévérité |
|---|---|---|
| Bien sans loyers (`rent_base_amount=0`) | Guards `> 0` partout dans `kpis.ts:61-101` → sain | OK |
| Bien sans crédit | `kpis.ts:42,94-96` fallback `?? 0` | OK |
| `current_value=null` | Fallback `purchasePrice + works` | OK, sauf what-if (cf. ROB-105) |
| Adresse incomplète | `geocoding.ts:38-45` retourne `null` sans throw | OK |
| `cca_amount` manquant | Affiche `0 €` proprement | OK |
| Pinel sans `start_year` | Retour anticipé `reduction-schedule.ts:55-60,76` | OK |
| Lot court terme sans saisonnalité | Fallback occupancy 70 % + 80 €/nuit | OK |
| Colonne `property_charges` null | **NaN dans annual_charges** (ROB-003) | KO |
| Wizard fetch crédit/lots échec | **Pas de rollback ni d'erreur** (ROB-001) | KO |
| Kinds courte durée | **Rejetés en 400** (ROB-002) | KO |
| Période événement inversée | Acceptée silencieusement | mineur |
| Taux > 100 % saisi | Accepté | mineur |
| Double-clic submit wizard | Dépend de `Button loading=` — à confirmer | inconnu |
| PATCH body vide | 200 silencieux | mineur |

---

## 6. POINTS DE FRICTION UX

### FRICTION-001 — Acronymes fiscaux/financiers sans tooltip dans la fiche bien
TAEG, CRD, CFE, TMI, LTV, PFU, BIC, CCA, IRA, GLI, PNO, micro-BIC, LMNP/LMP, SCI IR/IS affichés bruts. Le wizard explique (`FISCAL_REGIME_DESCRIPTIONS`), pas les onglets fiche. Aucun composant `Tooltip` dans `components/ui/`.
→ **Correction** : créer `<InfoTip term="TAEG">` (ou `@radix-ui/react-tooltip`) + dictionnaire `lib/real-estate/glossary.ts`.

### FRICTION-002 — Couleurs Tailwind hors tokens design
[simulation-revente-modal.tsx:578-824](components/real-estate/simulation-revente-modal.tsx) mélange `text-emerald-400` / `text-amber-400` / `bg-amber-500/5` au lieu de `text-accent` / `text-warning`.
→ **Correction** : remplacement systématique + `lib/design/chart-colors.ts` pour Recharts.

### FRICTION-003 — Tableau Rentabilité : colonnes Charges/Crédit sans signe -
[simulation-panel.tsx:603-605](components/real-estate/simulation-panel.tsx) : « Vacance » a un `-` manuel, « Charges » et « Crédit » sont en `text-danger` SANS signe → lecture ambiguë.
→ **Correction** : `formatCurrency(-value, ...)` ou parenthèses comptables.

### FRICTION-004 — Onglet Charges sans empty-state d'accueil
`ChargesForm` affiche directement ses 8 sections vides ; `ChargesWarningBanner` n'apparaît qu'au niveau page liste.
→ **Correction** : afficher l'avertissement quand `initial == null`.

### FRICTION-005 — PropertyCard : `grid-cols-3` fixe sur très petit écran
[property-card.tsx:82,105](components/real-estate/portfolio/property-card.tsx) — pas de palier `sm:`. Saturation < 380 px.
→ **Correction** : `grid-cols-2 sm:grid-cols-3`.

### FRICTION-006 — TAEG affiché en vert sans contraste pédagogique
[credit-tab.tsx:193-198](components/real-estate/credit-tab.tsx) — vert peut suggérer « bon », mais c'est juste un indicateur.
→ **Correction** : tooltip + palette neutre.

### FRICTION-007 — Émojis 🔴🟡🔵 dans bandeau alertes
[portfolio-alerts-banner.tsx:67-69](components/real-estate/portfolio/portfolio-alerts-banner.tsx) — accessibilité (lecteurs écran) + politique UI à clarifier.
→ **Correction** : badges colorés sémantiques.

### FRICTION-008 — Tableau historique charges sans `overflow-x-auto`
[app/(app)/immobilier/[id]/page.tsx:750-782](app/(app)/immobilier/[id]/page.tsx) — débordement mobile sur 6 colonnes.
→ **Correction** : wrapper `<div className="overflow-x-auto">`.

### FRICTION-009 — Stepper mobile masque tous les labels
[stepper.tsx:57,73](components/ui/stepper.tsx) — `hidden sm:block` cache les titres d'étapes. Compteur `{step}/5` compense partiellement.
→ **Correction** : afficher au moins le label de l'étape courante.

### FRICTION-010 — `import-csv-modal` : `${r.confidence}%` sans espace insécable
[import-csv-modal.tsx:264](components/real-estate/import-csv-modal.tsx) — brise la convention typographique FR utilisée partout ailleurs.
→ **Correction** : `formatPercent(r.confidence, {decimals: 0})`.

---

## 7. SÉCURITÉ (RLS)

**Aucun problème RLS.** Les deux nouvelles tables sont protégées :

| Table | RLS | Policy |
|---|---|---|
| `property_events` (mig 041:62) | ENABLED | `user_own_events` USING + WITH CHECK = `user_id = auth.uid()` (FOR ALL implicite) |
| `property_tax_incentives` (mig 038:58) | ENABLED | `user_own_data` même schéma |
| `lot_seasonality` | — | n'existe pas — saisonnalité stockée en JSONB sur `real_estate_lots` (RLS hérité de la mig 001) |

Aucune fuite cross-user possible. **Index** également bien couverts pour tous les patterns de requête.

---

## 8. PLAN DE CORRECTION PRIORISÉ

### Priorité 1 — Corrections immédiates (bugs critiques bloquants)

Effort : **S** = < 1h, **M** = 2-6h, **L** = > 1 jour.

| # | Item | Effort | Pourquoi en P1 |
|---|---|---|---|
| 1 | ✅ **ROB-002** — Ajouter les 5 kinds courte durée à `ALLOWED_KINDS` _(V1 → `c96c37f`)_ | S | Régression silencieuse — toute UI courte durée cassée |
| 2 | ✅ **ROB-003** — `?? 0` sur les colonnes charges dans `[id]/route.ts:42-45` _(V1 → `c96c37f`)_ | S | Métriques NaN |
| 3 | ✅ **ROB-001** — Checker les fetch crédit/lots du wizard + bandeau `?warn=` _(V1 → `c96c37f`)_ | S | Données silencieusement incomplètes |
| 4 | **BUG-005** — Pinel inéligible appliqué → passer surface/loyer réels | S | Projection mensongère |
| 5 | ✅ **BUG-006** — Loc'Avantages : `monthlyRent × max(0, 12 − vacancyMonths)` _(V8.1)_ | S | Bug fiscal |
| 6 | **CAS-DASH-001 / INTEG-003** — Brancher `property_events` au dashboard + remplir `alertCount` | M | Intégration majeure manquante |
| 7 | ✅ **BUG-003 / INTEG-001** — `portfolio.ts` agréger via `aggregateLoans` au lieu d'écraser _(V3.1 → `3b568f4`)_ | M | Multi-crédit visible dans liste |
| 8 | ✅ **BUG-001** — `resolveCharges` accepte `opts.excludeShortTermPlatformFees`. `build-from-db.ts` détecte `hasShortTermLot` et passe l'option. 4 postes zéroés (airbnb/booking/cleaning/concierge), `management_agency_pct` préservé _(V6 → `3e29edf`)_ | M | Double comptage commissions |
| 9 | ✅ **BUG-004** — Pinel/Denormandie plafonnés à 10 000 €/an via `Math.min(annualReduction, GLOBAL_TAX_NICHE_CAP)` dans `reduction-schedule.ts`. Agrégation foyer multi-biens = amélioration séparée _(V8.1)_ | M | Niches fiscales |
| 10 | ✅ **BUG-002 / INTEG-002** — Refondre `build-from-db.ts` pour `DbDebt[]` + propager à SimulationPanel / WhatIf / RealTracking _(V3.1 → `3b568f4`)_ | L | Cause racine des incohérences multi-crédit |
| 11 | ✅ **BUG-007 / BUG-008** — Dashboard `/analyse` : `loadImmo` délègue à `computeRealEstatePortfolio` (moteur unique multi-crédit V3.1) via le helper pur `buildBienImmoFromSimulation`. Plus de moteur fiscal séparé, plus de snapshot DB du CRD _(V4 → `3ec90eb`)_ | L | Convergence moteurs de calcul |

### Priorité 2 — Corrections importantes (bugs mineurs + incohérences)

| # | Item | Effort |
|---|---|---|
| 12 | ✅ **D6 — aligner `types/database.types.ts`** sur migrations 034/036/037/038/040/043 — extension manuelle au lieu de régen brutale (les helpers FR auraient été détruits), 4 casts retirés _(V2 → `4d542b6`)_ | S |
| 13 | **D6 — renommer `031_drop_dca_tables.sql` → `032_…`** et tout décaler de 1 (avec migration tracking) ou documenter formellement | M |
| 14 | **D6 — créer `039_cascade_delete.sql`** formel (ou supprimer la référence du planning) | S |
| 15 | **CAS-RP-001** — Filtrer les onglets de la fiche selon `usage_type` | S |
| 16 | **CAS-WIZ-LOT-001** — Skip étape 5 wizard pour RP | S |
| 17 | ✅ **BUG-D1-M03** — `buildPropertySummariesFromPortfolio` lit `projection[0].charges / 12` du moteur au lieu de `0` hardcodé. Charges mensuelles totales du bandeau /immobilier passent de 0 à la vraie valeur _(V5 → `d1476be`)_ | S |
| 18 | ✅ **BUG-D1-M04** — La Synthèse lit désormais `simResult.projection[0].charges` + `kpis.grossYieldFAI` + `kpis.netYield` + `kpis.monthlyCashFlowYear1` (au lieu de calculs manuels qui ignoraient GLI/gestion %/mig 040). Cash-flow Synthèse strictement aligné carte ET Rentabilité _(V6 → `3e29edf`)_ | M |
| 19 | ✅ **BUG-009** — Tableau d'amortissement : onglets « Tous / Principal / PTZ / … » via prop `schedules?` sur AmortizationTable, rétrocompat mono inchangée _(V3.2 → `d84bfd9`)_ | M |
| 20 | ✅ **INTEG-005 + INTEG-006** — DELETE strict (`?loan_kind=` requis, validation enum, 400 sans) + bouton corbeille par ligne dans MultiCreditList (Modal pattern DeletePropertyButton). Caller credit-form mis à jour _(V3.2 → `d84bfd9`)_ | M |
| 21 | ✅ **BUG-D1-M01** — `monthly` par ligne MultiCreditList = `buildAmortizationSchedule(loan).totalMonthly` (assurance incluse), pré-calculé côté serveur. Somme garantie = `aggregateLoans.totalMonthly` _(V3.2 → `d84bfd9`)_ | S |
| 22 | ✅ **BUG-D1-M02** — PropertyCard : `latentGain` via `kpis.totalCost` (cohérent fiche détail), fallback `acqCost` si kpis null _(V3.2 → `d84bfd9`)_ | S |
| 23 | **BUG-D1-M05** — SCI distribution : exposer le vrai `netProfitAfterIS` comptable | S |
| 24 | ✅ **BUG-D1-M06** — `resolveLmnpMicroCeiling(abattementPct)` branché dans `getFiscalCalculator` ; mapping 50 % → 77 700 € (classique/tourisme classé), 30 % → 15 000 € (tourisme non classé). Réutilise le slot `forcedRegimeSwitch` propagé V8.1 _(V8.2)_ | S |
| 25 | ✅ **BUG-D1-M08** — Filtre `status='active'` ajouté sur le SELECT debts de `loadImmo` (et le calcul est désormais délégué au moteur portfolio qui filtrait déjà depuis V3.1) _(V4 → `3ec90eb`)_ | S |
| 26 | **ROB-101 / 102 / 103** — Validations dates crédit, cap taux, période événement | S |
| 27 | **ROB-104** — Remplacer `alert()` natif par toast | S |
| 28 | **ROB-105** — Range minimum dans what-if quand `rent=0` | S |
| 29 | **ROB-106 / 107** — PATCH body vide + loading partagé quick-actuals | S |
| 30 | **INTEG-007** — Choix produit : restaurer ancien loyer au DELETE révision (avec `previous_value`) | M |

### Priorité 3 — Améliorations UX

| # | Item | Effort |
|---|---|---|
| 31 | **FRICTION-001** — Créer `<InfoTip>` + glossaire pour les acronymes (TAEG, CRD, CFE, TMI, LTV, PFU, BIC, CCA, IRA, GLI, LMNP/LMP, SCI IR/IS) | M |
| 32 | **FRICTION-002** — Migrer `simulation-revente-modal` sur les tokens design + `chart-colors.ts` central | M |
| 33 | **FRICTION-003** — Signer les colonnes Charges/Crédit/Vacance du tableau Rentabilité | S |
| 34 | **FRICTION-004** — `ChargesWarningBanner` dans l'onglet Charges si `initial == null` | S |
| 35 | **FRICTION-005** — `grid-cols-2 sm:grid-cols-3` sur PropertyCard | S |
| 36 | **FRICTION-006** — Tooltip TAEG + palette neutre | S |
| 37 | **FRICTION-007** — Remplacer emojis 🔴🟡🔵 par `<Badge variant="…">` | S |
| 38 | **FRICTION-008** — `overflow-x-auto` sur historique charges | S |
| 39 | **FRICTION-009** — Stepper mobile : afficher le label de l'étape courante | S |
| 40 | **FRICTION-010** — `formatPercent` dans `import-csv-modal` | S |
| 41 | **CAS-WHATIF-001** — Persistance what-if (v1 sessionStorage, v2 table scénarios) | M-L |

---

## POINTS À CLARIFIER (intention produit)

Ces décisions ne sont pas des bugs mais des choix qu'il faut trancher avant de corriger les sections concernées.

1. **Rendement Synthèse vs Liste** — La Synthèse exclut les lots non `rented` (numérateur). Voulu (rendement réalisé) ou bug (rendement théorique attendu) ?
2. **`assumed_total_rent`** — Doit-il rester en double source de vérité avec la somme des lots, ou être supprimé ?
3. **Cash-flow Synthèse sans impôts** — Pédagogique (CF d'exploitation) ou aligner sur projection ?
4. **Foncier-micro abattement sur `netRent`** — Réglementairement ambigu, à valider.
5. **Loc'Avantages réduction** — Loyer théorique ou perçu (cf. BUG-006) ?
6. **Plafond niches fiscales 10 000 €** — Par bien ou agrégé foyer ?
7. **Cohérence Synthèse vs Rentabilité multi-crédit** — Aligner sur agrégat (recommandé) ou note explicative ?
8. **Réversibilité révision loyer** — Fait journal comptable ou intention modifiable (cf. INTEG-007) ?
9. **Onglet Suivi réel pour RP** — Masquer ou réinterpréter en « suivi des charges » ?
10. **Brouillon wizard sessionStorage** — TTL et nettoyage entre 2 créations consécutives ?
11. **Export PDF avec `year < currentYear`** — Cohérence des montants à auditer.
12. **Politique emojis UI produit** — La consigne CLAUDE.md « pas d'emojis » couvre-t-elle les libellés visibles utilisateur ?
13. **CCA SCI en DB** — La colonne `cca_amount` est-elle réellement appliquée en production (cast `as unknown` permanent) ?
14. **Seuil alerte impayé** — 1 mois ou 2+ ?

---

## ANNEXE — Dette technique repérée hors-scope d'une vague

Ces points n'étaient pas dans le périmètre strict d'une vague terminée mais ont été identifiés au passage et doivent revenir dans une prochaine vague.

### Repéré pendant V3.1 — à intégrer en V3.2
- **`RegimeComparator`** ([app/(app)/immobilier/[id]/page.tsx:733](../app/(app)/immobilier/[id]/page.tsx)) consomme encore `loanForCalc` (crédit principal seul) au lieu du tableau multi-crédit. Pour un bien à 2 crédits, la comparaison des régimes fiscaux sous-estime la mensualité réelle.
- **PDF export** ([app/api/real-estate/[id]/export-pdf/route.ts](../app/api/real-estate/[id]/export-pdf/route.ts)) enveloppe encore `[dbDebt]` (crédit principal seul) dans la signature multi. PDF complet multi-crédit = V3.2 ou plus tard.
- **BUG-009** (§ P2 #19) : tableau d'amortissement onglet « Amortissement » n'affiche que le crédit principal. Logique complémentaire de V3.1, candidat naturel V3.2.

---

*Rapport généré par audit lecture seule. Aucun fichier applicatif modifié. Findings cités avec file:line vérifiables.*
*Maintenu à jour à chaque vague — case cochée + commit / PR en regard.*