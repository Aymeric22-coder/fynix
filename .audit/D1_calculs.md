# DOMAINE 1 — COHÉRENCE DES CALCULS

## Score : 4/10
## Synthèse
Le moteur de calcul `lib/real-estate/` (KPIs, projection, fiscalité) est rigoureux, pur et testé. Les incohérences viennent presque toutes des **consommateurs** : la page détail (Synthèse) recalcule à la main des KPIs qui divergent du moteur, l'agrégateur d'analyse (`lib/analyse/`) reste sur l'ancien modèle (lecture brute de `debts.capital_remaining` au lieu du CRD analytique), et le multi-crédit est traité partiellement (Synthèse oui, Rentabilité/Amortissement non, Liste/Portfolio non). Plusieurs bugs critiques de double comptage (commissions short-term, charges plateforme dans `other`) et plusieurs incohérences de KPIs entre onglets.

---

## 1.1 Cohérence inter-onglets

### Cash-flow mensuel net

- **Page liste (carte)** → `components/real-estate/portfolio/property-card.tsx:108` affiche `p.kpis.monthlyCashFlowYear1` qui provient de `computeKPIs` → projection complète après impôts, vacance, multi-crédit ✅ (cohérent moteur).
- **Fiche détail — Synthèse** → `app/(app)/immobilier/[id]/page.tsx:348-351` calcule manuellement :
  ```
  monthlyCashFlow = monthlyRents - monthlyCharges - monthlyLoanPayment
  ```
  où `monthlyRents` = somme des `lot.rent_amount` de status `rented` × 1, `monthlyCharges = annualCharges / 12` (somme brute des colonnes `property_charges`, **sans GLI ni gestion en %**), `monthlyLoanPayment = multiCredit.totalMonthly`. **Pas d'impôts, pas de vacance, pas de GLI/gestion**.
- **Fiche détail — Rentabilité (SimulationPanel)** → `components/real-estate/simulation-panel.tsx:506` affiche `kpis.monthlyCashFlowYear1` ✅ (cohérent moteur), **mais** la projection ne reçoit qu'**un seul crédit** (`debt: DbDebt | null`, ligne 49/182) : en multi-crédit, le CF de l'onglet Rentabilité est mécaniquement supérieur au CF de la Synthèse.
- **Tableau de bord `/analyse`** → `lib/analyse/aggregateur.ts:255-268` + `lib/analyse/immoCalculs.ts:120` calcule `cashflow = loyer − mensualité − charges/12` **sans impôts ni vacance** (il y a aussi `cashflow_net_fiscal` qui ajoute un impôt estimé par `fiscaliteImmo.ts`, formule différente de `lib/real-estate/fiscal/`).

**Verdict** : 4 formules distinctes pour le « cash-flow mensuel net » d'un même bien.

### Rendement brut / net-net

- **Liste (carte)** → `p.kpis.grossYieldFAI` et `p.kpis.netNetYield` (dénominateur = `totalCost` = prix + frais notaire + travaux + mobilier + frais bancaires + frais garantie) ✅.
- **Fiche détail — Synthèse** → `[id]/page.tsx:143-155` calcule un `grossYield` et `netYield` "maison" :
  - dénominateur `acqCost = purchase_price + purchase_fees + works + furniture + bank_fees + guarantee_fees` ✅ (identique à `kpis.totalCost`).
  - numérateur brut `annualRents = monthlyRents × 12` où `monthlyRents = sum(lots.rent_amount where status==='rented')` — **diffère** de `computeKPIs` qui prend `rent.monthlyRent` (= `assumed_total_rent` si défini, sinon somme des lots **sans filtre status**, cf. `build-from-db.ts:255` + `computeMonthlyRentForLot`). Si un lot est vacant/works/owner_occupied avec un `rent_amount` non nul → le rendement Synthèse l'ignore, le rendement Liste/Rentabilité le compte.
  - numérateur net = `annualRents - annualCharges` (sans GLI ni gestion en %) ≠ `netYield` du moteur (`gross - totalChargesY1` qui inclut GLI + management appliqués sur le loyer théorique annuel).
- **Rentabilité (SimulationPanel)** → utilise `kpis.netNetYield` + `kpis.grossYieldFAI` du moteur ✅.
- **Dashboard `/analyse`** → `lib/analyse/immoCalculs.ts:118-119` :
  ```
  rendement_brut = loyer × 12 / VALEUR_ESTIMEE × 100
  rendement_net  = (loyer × 12 - charges) / VALEUR_ESTIMEE × 100
  ```
  Dénominateur = `valeur = purchase_price + works_amount` (`aggregateur.ts:230`), donc **ni frais notaire, ni mobilier, ni frais bancaires**, et la propriété de la fonction est définie comme `valeur marché estimée` (`immoCalculs.ts:24`) — incohérence sémantique : le commentaire dit valeur estimée, l'agrégateur passe coût d'acquisition brut. C'est encore un 3ᵉ dénominateur.

**Verdict** : 3 dénominateurs et 3 numérateurs différents → la même fiche affiche un rendement brut différent selon l'écran.

### Capital restant dû (CRD)

- **Fiche détail — Synthèse (`crdNow`)** → `[id]/page.tsx:313-319` = `multiCredit.totalRemainingCapital` (somme analytique CRD via `computeRemainingCapitalAt` par crédit) ✅.
- **Fiche détail — Crédit (`MultiCreditList`)** → calcule un CRD par ligne via `computeRemainingCapitalAt` analytique + somme = `totalRemainingCapital` ✅.
- **Fiche détail — Amortissement** → reçoit `schedule = buildAmortizationSchedule(loanForCalc)` du **crédit principal uniquement** (`[id]/page.tsx:315`). En multi-crédit : le tableau d'amortissement affiché ignore les autres prêts → les CRD ligne par ligne ne correspondent PAS au CRD agrégé de la Synthèse. **Bug.**
- **Liste / portefeuille** → `lib/real-estate/portfolio.ts:184-201` calcule `capitalRemaining` analytiquement, **mais uniquement sur 1 crédit par asset** (`debtByAsset[d.asset_id] = ...` ligne 113 écrase en cas de doublons). Multi-crédit invisible.
- **Tableau de bord `/analyse`** → `lib/analyse/aggregateur.ts:201` lit directement la colonne `debts.capital_remaining` (sans filtre `status='active'`). Ce CRD est figé en DB (mis à jour ponctuellement via `POST /api/snapshots` selon le commentaire `portfolio.ts:6`), donc dérive jour après jour du CRD analytique de la fiche détail. Pas de multi-crédit propre non plus, somme par `asset_id` cumule tout sans filtre statut.

**Verdict** : 4 sources de vérité pour le CRD avec 2 méthodes (analytique vs lecture DB) qui peuvent s'écarter de plusieurs centaines/milliers d'€ selon la dernière exécution de snapshot.

### Valeur nette patrimoniale (estimée − CRD)

- **Fiche détail — Synthèse** → `[id]/page.tsx:352` `netPropertyValue = currentVal - crdNow` avec `currentVal = prop.asset.current_value` ✅.
- **Liste — PropertyCard** → `property-card.tsx:51` `netValue = currentValue - capitalRemaining` mais `capitalRemaining` ne tient compte que d'1 crédit (cf. ci-dessus) → écart en multi-crédit.
- **Portfolio agrégé** → `portfolio-summary.ts:222` `totalNetWorth = totalCurrentValue - totalRemainingCapital` ✅ tant que `remainingCapital` par bien est juste.
- **Dashboard `/analyse`** → `aggregateur.ts:318` `totalImmoEquity = totalImmo - totalDettes` avec `totalImmo` = somme des `purchase_price + works_amount` (**pas la valeur estimée**), `totalDettes` = colonne `debts.capital_remaining`. Conceptuellement faux et incohérent avec la fiche détail.

**Verdict** : fiche détail OK, dashboard `/analyse` confond coût d'acquisition et valeur estimée pour le total immo équity.

---

## 1.2 Cohérence fiscale

### LMNP réel — `lib/real-estate/fiscal/lmnp-reel.ts`
- Amortissement réduit bien le résultat fiscal (`lmnp-reel.ts:60-62`) ✅.
- Stock d'amortissement non utilisé reporté indéfiniment via `unusedAmortStock` (`lmnp-reel.ts:46-69`) ✅.
- Déficit BIC limité à 10 ans en FIFO via `ageDeficits` + `consumeDeficits` (`common.ts:69-97`, `lmnp-reel.ts:50,76-78`) ✅.
- Amortissement ne peut PAS créer de déficit (plafonné au profit avant amort) ✅.
- **Remarque** : amort des frais d'acquisition ajouté à `inputs.amortBuilding` dans `projection.ts:168` plutôt que dans une catégorie dédiée → comptable mais peu lisible (cf. clarifications).

### SCI à l'IS — `lib/real-estate/fiscal/sci-is.ts`
- Tranche 15 % jusqu'à 42 500 € puis 25 % au-delà (`sci-is.ts:18-23`) ✅.
- Déficit reportable indéfiniment via `isDeficitCarried` ✅.
- Dividendes (PFU 30 % vs barème 40 % abattement + PS 17,2 %) calculés sur `netProfitAfterIS` distinct du résultat avant IS (`sci-is.ts:130-167`) ✅.
- **Incohérence affichage** : `[id]/page.tsx:705-712` passe `netProfitAfterIS = cashFlowAfterTax + principalRepaid` à `SciDistribution`. Ce n'est PAS le résultat comptable après IS — c'est un proxy cash. Le résultat distribuable comptable d'une SCI IS = `fiscalResult − IS` (différent du cash). Bug d'interprétation.

### Pinel / Pinel+ — `lib/real-estate/fiscal/incentives/pinel.ts`
- `taxReductionPerYear` correctement appliqué via `projection.ts:178-181` :
  ```
  taxReductionApplied = min(taxReductionTotal, taxPaid)
  taxReductionLost    = max(0, taxReductionTotal - taxReductionApplied)
  taxPaidAfterIncentive = taxPaid - taxReductionApplied
  ```
  ✅ — borné à `taxPaid` (ne rend pas négatif), excédent perdu.
- `taxReductionLost = 0` quand IR > réduction ✅.
- **Bug mineur** : `reduction-schedule.ts:93,103,115` passe `surfaceM2 = 1000` (BYPASS_SURFACE) et `annualRentHC = 0` pour court-circuiter les vérifs d'éligibilité Pinel/Denormandie quand on construit le schedule. C'est documenté mais cela signifie que **le schedule Pinel est appliqué dans la projection même si le bien est inéligible** (loyer trop élevé, surface trop petite). L'éligibilité n'est vérifiée que dans le panneau UI, jamais dans la projection. Si l'utilisateur enregistre un dispositif Pinel non éligible → la projection le crédite quand même.
- Plafond global niches fiscales (10 000 €) calculé dans `computePinel:141-148` mais **PAS appliqué dans la projection** (`reduction-schedule.ts` retourne `r.taxReductionPerYear` sans plafonnement à 10 000 €). Si un Pinel annuel dépasse 10 000 €, la projection le compte intégralement.

### Loc'Avantages — `lib/real-estate/fiscal/incentives/loc-avantages.ts`
- `LOC_AVANTAGES_RATES` 15/35/65 % ✅.
- Convention `[convention_start, convention_end]` respectée (`reduction-schedule.ts:55-66`) ✅.
- **Bug** : `reduction-schedule.ts:45` calcule `annualRentHC = rent.monthlyRent * 12` = loyer **théorique** sans vacance, alors que `loc-avantages.ts:42-50` et la jurisprudence imposent les loyers **réellement perçus**. La réduction est donc surévaluée du facteur `vacancy / 12`. La projection elle-même utilise `netRent` (loyers nets de vacance), mais le calcul de la réduction l'ignore. Incohérence interne.

### Foncier réel — `lib/real-estate/fiscal/foncier-reel.ts`
- Déficit foncier plafonné à 10 700 € sur revenu global via `FONCIER_DEFICIT_GLOBAL_CAP` (`foncier-reel.ts:28,68`) ✅.
- Excédent reporté en file FIFO 10 ans sur revenus fonciers (`foncier-reel.ts:75-76`, `common.ts:69-74`) ✅.
- Imputation "10 700 sur revenu global" modélisée comme une réduction d'impôt = déficit × TMI (`foncier-reel.ts:72`) — approximation acceptable, **mais** signe inversé : `taxPaid = -globalIncomeReduction` (ligne 73). Si l'année suivante la projection cumule `cumulativeCashFlow += cashFlowAfterTax = cashFlowBeforeTax - taxPaid = cashFlowBeforeTax - (-x) = cashFlowBeforeTax + x` → c'est correct mais subtil. ✅ après vérification.
- **Bug** : intérêts d'emprunt déductibles des revenus fonciers (`foncier-reel.ts:38`) avec la règle « le déficit dû aux intérêts n'est imputable que sur revenus fonciers » modélisée à `foncier-reel.ts:64-69`. Mais le calcul ne sépare PAS les deux déficits dans le carry-forward : tout part dans `foncierDeficitsByAge[0]` sans tag (`foncier-reel.ts:76`). En pratique : si le déficit hors intérêts est plafonné à 10 700, l'excédent imputé sur foncier futur peut inclure des intérêts → conforme. Mais l'imputation FIFO future ne sait pas distinguer la part « ex-intérêts » de la part « ex-charges » : si l'utilisateur revend l'année 6 et continue à louer ailleurs, la part imputable sur revenu global vs foncier serait mal classée. Marginal en pratique.

### Micro foncier / Micro BIC — `foncier-micro.ts`, `lmnp-micro.ts`
- Calcul correct. ⚠️ Détail : `foncier-micro.ts:27` calcule base = `netRent` (loyers nets de vacance) au lieu de `grossRent` (loyers déclarés). Le commentaire ligne 24-26 reconnaît la simplification. Acceptable mais à clarifier.
- LMNP micro avec plafond LF 2025 (15 000 / 77 700) supporté via `forcedRegimeSwitch` (`lmnp-micro.ts:60-62`) ✅, **mais** dans le projection `lmnp_micro` est instancié sans le `ceiling` (`fiscal/index.ts:20` ne passe que `regime.abattementPct`, pas le plafond). Le bascule auto micro→réel n'est donc **jamais déclenché** dans la projection courante.

---

## 1.3 Multi-crédit

Source de vérité : `lib/real-estate/multi-credit.ts:aggregateLoans` (somme analytique mois par mois). Utilisé **uniquement** dans `app/(app)/immobilier/[id]/page.tsx:313`.

- **Somme des mensualités dans le cash-flow Synthèse** : ✅ `multiCredit.totalMonthly` (page.tsx:342).
- **Somme des mensualités dans la projection (Rentabilité)** : ❌ `SimulationPanel` ne reçoit qu'**1 crédit** (`debt`) → la projection, les KPIs `monthlyCashFlowYear1`, les rendements net-net etc. sont calculés sur le seul crédit principal. Pour un bien à 2 crédits actifs, le CF affiché par la card de la liste et l'onglet Rentabilité **ignore** le crédit secondaire.
- **Somme CRD valeur nette Synthèse** : ✅ `crdNow = multiCredit.totalRemainingCapital`.
- **Somme CRD dans la PropertyCard de la liste** : ❌ `portfolio.ts:113` écrase `debtByAsset[asset_id]` en cas de doublons → seul le dernier crédit retourné par Supabase est compté.
- **Tableau d'amortissement** : ❌ `[id]/page.tsx:315` `schedule = buildAmortizationSchedule(loanForCalc)` — **crédit principal uniquement**. Les 2 crédits **ne sont PAS affichés séparément** (le scope de l'audit demandait précisément ce comportement). On ne voit même pas le crédit secondaire.
- **Projection utilise bien les 2 schedules ?** : ❌ Non. `projection.ts` reçoit un seul `loan` (via `SimulationInput.loan`).
- **Affichage MultiCreditList** : le `monthly` par ligne est calculé avec `computeMonthlyPayment` (capital+intérêts seul, **sans assurance**), alors que `totalMonthly` agrégé en bas inclut l'assurance via `aggregateLoans`. La somme visuelle des lignes ≠ total affiché.

---

## 1.4 Courte durée

- **Revenu utilisé dans les KPIs = `netOwnerRevenueTotal`** : ✅ `build-from-db.ts:117-130` `computeMonthlyRentForLot` retourne `netOwnerRevenueTotal / 12` (après commissions plateformes + frais opé) pour short_term ; cumulé avec `rent_amount` pour mixed.
- **Commissions plateformes pas comptées une 2ᵉ fois dans property_charges ?** : ❌ **BUG MAJEUR**. `build-from-db.ts:273-307` :
  ```ts
  const resolved = resolveCharges(charges, annualRent)
  const extraChargesFrom040 = max(0, resolved.totalAnnualEur - alreadyAccountedExplicitly)
  charges.other = num(charges.other) + extraChargesFrom040
  ```
  `resolved` inclut `management_airbnb_pct/100 × annualRent`, `management_booking_pct/100 × annualRent`, `management_cleaning`, `management_concierge` (`charges-resolver.ts:91-103`). Or pour un lot short_term, `annualRent = netOwnerRevenueTotal` est **déjà net des commissions et des frais ménage/conciergerie** (cf. `revenue.ts:170-177`). Si l'utilisateur saisit `management_airbnb_pct` et `management_concierge` dans `property_charges` **et** a un lot short_term : double comptage des commissions et frais opé → le résultat fiscal et le cash-flow sous-estiment de cette somme.
- **Taux d'occupation effectif affiché** : ✅ `SeasonalityChart` (`seasonality-chart.tsx:72`) affiche `annualOccupancyPct`. `computeShortTermKpisForProperty` calcule `avgOccupancyPct` (`short-term/kpis.ts:94`) mais il **n'est affiché nulle part dans le détail Synthèse** ni dans la PropertyCard (vérifié via Grep). Seulement dans la sous-section saisonnalité par lot.

---

## Bugs critiques (calculs erronés)

### BUG-D1-001 — Double comptage commissions short-term / frais opé dans les charges
- **Fichier** : `lib/real-estate/build-from-db.ts:255-308` + `lib/real-estate/charges-resolver.ts:91-103`
- **Description** : Pour un lot `rental_type='short_term'` ou `'mixed'`, `computeMonthlyRentForLot` renvoie le **net après commissions plateformes + frais ménage/conciergerie/linen**. `annualRent = monthlyRent × 12` est donc déjà net. Mais `resolveCharges` recalcule `management_airbnb_pct/100 × annualRent`, `management_booking_pct/100 × annualRent`, `management_cleaning`, `management_concierge` et tout cela part dans `charges.other` via `extraChargesFrom040`.
- **Impact** : Double comptage des commissions et frais opérationnels short-term. Pour un Airbnb à 50 000 €/an avec 13,5 % de commission moyenne et 8 000 € de ménage/conciergerie, la sur-déduction peut atteindre 15 000 €/an → résultat fiscal sous-estimé d'autant, taxPaid faux, cashFlowAfterTax faux.
- **Reproduction** : Bien avec un lot short_term renseigné (nightly_rate_low + plateformes), et au moins une ligne `property_charges` avec `management_airbnb_pct > 0` ou `management_concierge > 0` saisie via `ChargesForm`.
- **Correction recommandée** : Quand un lot est short_term/mixed, exclure les colonnes `management_airbnb_pct/booking_pct/cleaning/concierge` de `extraChargesFrom040`, ou mieux : interdire leur saisie côté UI quand le lot est en courte durée (déjà net du revenu calculé).

### BUG-D1-002 — Projection Rentabilité ignore les crédits secondaires (multi-crédit)
- **Fichier** : `app/(app)/immobilier/[id]/page.tsx:649-653` (props `SimulationPanel`) + `components/real-estate/simulation-panel.tsx:49,182`
- **Description** : `SimulationPanel` prend un seul `debt: DbDebt | null`. La projection (et donc `kpis.monthlyCashFlowYear1`, `netNetYield`, `paybackYear`, tableau annuel) est calculée sur le crédit principal uniquement. L'agrégation multi-crédit n'existe que pour le KPI Synthèse `multiCredit.totalMonthly` et pour le CRD.
- **Impact** : Pour un bien à 2 crédits actifs (prêt principal + PTZ par ex.), le cash-flow Y1 et le rendement net-net affichés dans la card de la liste ET dans l'onglet Rentabilité **sont faux** (mensualité PTZ ignorée). Écart de 100 à 500 €/mois selon le PTZ. Bug critique car l'utilisateur prend des décisions d'arbitrage avec ces chiffres.
- **Reproduction** : Créer 2 lignes `debts` actives sur le même `asset_id` (UI multi-crédit existe via `MultiCreditList`). Comparer KPI Synthèse (correct) vs KPI Rentabilité (sous-estime le coût).
- **Correction recommandée** : Étendre `RawSimulationInput` à `loans: RawLoanInput[]` (au lieu de `loan?: RawLoanInput`), ou injecter `aggregateLoans` côté projection. Tableau d'amortissement à enrichir pour montrer les 2 crédits.

### BUG-D1-003 — PortfolioCard (liste) écrase le crédit secondaire en multi-crédit
- **Fichier** : `lib/real-estate/portfolio.ts:108-127`
- **Description** : `debtByAsset[d.asset_id] = { ... }` dans la boucle écrase au lieu de cumuler. Pour un bien à 2 crédits, seul le dernier retourné par Supabase (ordre non garanti car pas de `.order(...)`) est utilisé → CRD, mensualité, KPIs incorrects sur la liste.
- **Impact** : Même symptôme que BUG-D1-002 mais sur la page liste `/immobilier`. KPIs et CRD de la card divergent de la Synthèse.
- **Reproduction** : Idem BUG-D1-002, observer la card immobilier vs la fiche détail.
- **Correction recommandée** : Charger un array `debtsByAsset: Map<string, DbDebt[]>` puis utiliser `aggregateLoans` au lieu de `computeRemainingCapitalAt` sur un seul prêt.

### BUG-D1-004 — Réduction Pinel/Denormandie non plafonnée niches fiscales dans la projection
- **Fichier** : `lib/real-estate/fiscal/incentives/reduction-schedule.ts:118` + `lib/real-estate/projection.ts:178`
- **Description** : `computePinel` calcule `taxReductionPerYear` et expose `yearByYear[i].reductionIR = min(taxReductionPerYear, GLOBAL_TAX_NICHE_CAP)` (`pinel.ts:141-148`). Mais `reduction-schedule.ts:118` retourne `r.taxReductionPerYear` brut sans plafonnement, et la projection applique tel quel.
- **Impact** : Pour un Pinel à 14 % sur 12 ans sur 300 000 €, `taxReductionPerYear` = 3 500 € → pas de plafonnement. Mais pour un Pinel cumulé avec d'autres dispositifs côté foyer, le plafond global 10 000 € art. 200-0 A est éludé. La projection peut surévaluer la réduction d'IR. Aussi : si l'utilisateur a plusieurs biens Pinel, chaque bien ignore l'effet cap global.
- **Reproduction** : 2 biens Pinel chacun à 4 000 € de réduction annuelle → la projection retourne 4 000 + 4 000 = 8 000 €/an au lieu de plafonner par foyer à 10 000 €.
- **Correction recommandée** : Plafonner la réduction au niveau foyer (somme des dispositifs) dans une couche au-dessus de la projection mono-bien, et utiliser `r.yearByYear[i].reductionIR` au lieu de `r.taxReductionPerYear`.

### BUG-D1-005 — Pinel/Denormandie appliqué dans la projection sans vérifier l'éligibilité
- **Fichier** : `lib/real-estate/fiscal/incentives/reduction-schedule.ts:84-118`
- **Description** : Le helper court-circuite la vérif d'éligibilité (`surfaceM2 = 1000`, `annualRentHC = 0`). Si l'utilisateur enregistre un dispositif Pinel sur un bien dont le loyer dépasse le plafond zone, ou dont la zone n'est pas A/A bis/B1, la projection applique quand même la réduction.
- **Impact** : Projection trompeuse pour un bien non éligible. L'UI panneau Pinel signale l'inéligibilité, mais la projection continue de créditer la réduction.
- **Reproduction** : Saisir un `property_tax_incentives` Pinel zone C → projection retourne `taxReductionTotal > 0`.
- **Correction recommandée** : Appeler `computePinel` avec les vraies `surfaceM2` et `annualRentHC`, ne retourner la réduction que si `eligible: true`.

### BUG-D1-006 — Tableau d'amortissement ne montre pas les crédits séparément
- **Fichier** : `app/(app)/immobilier/[id]/page.tsx:315,625-630`
- **Description** : `schedule = loanForCalc ? buildAmortizationSchedule(loanForCalc) : null` — uniquement le crédit principal. L'onglet "Amortissement" du multi-crédit n'affiche pas les autres crédits.
- **Impact** : L'utilisateur ne peut pas voir l'amortissement de son PTZ / prêt travaux. Pas de moyen de vérifier le détail mois par mois.
- **Correction recommandée** : Soit afficher un onglet par crédit, soit afficher `multiCredit.schedule` (déjà calculé) qui présente le cumul mois par mois.

### BUG-D1-007 — Loc'Avantages : réduction calculée sur loyer théorique au lieu de loyer réel
- **Fichier** : `lib/real-estate/fiscal/incentives/reduction-schedule.ts:45,53`
- **Description** : `annualRentHC = rent.monthlyRent * 12` = loyer théorique (sans vacance). CGI art. 199 tricies impose les loyers **réellement perçus**. La doc dans `loc-avantages.ts:42-50` confirme « loyer annuel réellement perçu ».
- **Impact** : Pour un bien avec vacance non nulle, réduction Loc'Avantages surévaluée du facteur vacance/12.
- **Correction recommandée** : `annualRentHC = (rent.monthlyRent * 12) - (rent.monthlyRent * rent.vacancyMonths)` — ou indexer comme `netRent` dans la projection (avec rentFactor).

### BUG-D1-008 — Dashboard /analyse utilise un autre moteur fiscal (`fiscaliteImmo.ts`) que la fiche détail
- **Fichier** : `lib/analyse/immoCalculs.ts:167-180` + `lib/analyse/fiscaliteImmo.ts` (non lu mais référencé)
- **Description** : Le tableau de bord d'analyse ne réutilise PAS `lib/real-estate/fiscal/` mais une calculatrice fiscale séparée `lib/analyse/fiscaliteImmo.ts`. Donc impôt foncier estimé du dashboard ≠ impôt projection fiche détail (formules indépendantes, sans amortissement, sans report de déficit, sans carryforward).
- **Impact** : Cashflow_net_fiscal du dashboard ≠ cashFlowAfterTax projection fiche détail. Diagnostic faussé pour les scores et recommandations agrégés.
- **Correction recommandée** : Faire converger `lib/analyse/fiscaliteImmo.ts` vers `lib/real-estate/fiscal/` (ou idéalement consommer `runSimulation` puis lire le `kpis.annualCashFlowYear1`).

### BUG-D1-009 — Dashboard /analyse lit `debts.capital_remaining` colonne au lieu du CRD analytique
- **Fichier** : `lib/analyse/aggregateur.ts:192-208`
- **Description** : Capital restant et mensualité lus directement de la DB (sans filtre `status='active'` non plus). Or `capital_remaining` est mis à jour par un job snapshot ponctuel (cf. `portfolio.ts:6`), pas en temps réel. La fiche détail recalcule analytiquement via `computeRemainingCapitalAt`.
- **Impact** : Le total dette et le total équity du dashboard dérivent jour après jour de la valeur de la fiche détail. Le CRD du dashboard peut être périmé de plusieurs mois.
- **Correction recommandée** : Utiliser `computeRemainingCapitalAt` aussi dans `lib/analyse/aggregateur.ts`, et filtrer `status='active'`.

---

## Bugs mineurs

### BUG-D1-M01 — MultiCreditList : monthly par ligne sans assurance, total avec assurance
- **Fichier** : `components/real-estate/multi-credit-list.tsx:50-52,83-87`
- **Description** : `monthly = computeMonthlyPayment(...)` ne retourne que capital+intérêts. Le `totalMonthly` agrégé inclut l'assurance. Visuellement : somme des mensualités lignes ≠ total bas.
- **Correction** : Calculer `monthly = computeMonthlyPayment + monthlyInsurance` ou utiliser `buildAmortizationSchedule(...).totalMonthly` par ligne.

### BUG-D1-M02 — PropertyCard : latentGain calcule un acqCost différent du moteur
- **Fichier** : `components/real-estate/portfolio/property-card.tsx:48`
- **Description** : `acqCost = purchase_price + purchase_fees + works_amount` — n'inclut pas furniture, bank_fees, guarantee_fees. `kpis.totalCost` du moteur les inclut. Donc `latentGain` carte ≠ `latentGain` fiche détail.
- **Correction** : Utiliser `p.kpis.totalCost` comme dénominateur.

### BUG-D1-M03 — Portfolio summary : monthlyCharges toujours à 0
- **Fichier** : `app/(app)/immobilier/page.tsx:101` + `lib/real-estate/portfolio-summary.ts:230,284`
- **Description** : Le `rawProps[i].monthlyCharges = 0` est passé hardcodé. Donc `totalMonthlyCharges` agrégé du dashboard immo est toujours 0.
- **Correction** : Récupérer les charges réelles depuis `property_charges` (déjà chargées dans `chargesByProperty`).

### BUG-D1-M04 — Synthèse : monthlyCharges ne contient pas GLI ni gestion en %
- **Fichier** : `app/(app)/immobilier/[id]/page.tsx:135-139,348-350`
- **Description** : `annualCharges` calculé par filtre des 7 colonnes explicites de `property_charges` (taxe_fonciere, insurance, etc.) — ignore les GLI/gestion exprimées en % dans `gli_pct` et `management_pct` et toutes les charges enrichies de migration 040 (taxe_habitation, teom, condo_works, etc.). Le moteur de simulation les compte (via `resolveCharges` + `extraChargesFrom040`). La Synthèse les ignore.
- **Correction** : Réutiliser `resolveCharges` ou afficher `simResult.projection[0].charges` au lieu de recalculer manuellement.

### BUG-D1-M05 — SCI distribution : netProfitAfterIS confondu avec cash
- **Fichier** : `app/(app)/immobilier/[id]/page.tsx:705-712`
- **Description** : `netProfitAfterIS = cashFlowAfterTax + principalRepaid` est un proxy cash et non le résultat comptable distribuable. Pour distinguer ce qui est légalement distribuable (CGI art. 232 sociétés commerciales transposé en SCI IS), il faudrait `fiscalResult − IS payé`.
- **Correction** : Exposer `netProfitAfterIS` depuis le calculateur SCI IS (`fiscalResult - taxPaid` quand `taxableBase > 0`).

### BUG-D1-M06 — LMNP micro : plafond LF 2025 jamais déclenché
- **Fichier** : `lib/real-estate/fiscal/index.ts:20` + `lib/real-estate/fiscal/lmnp-micro.ts:60-62`
- **Description** : `makeLmnpMicroCalculator(tmiPct, abattementPct)` est appelé sans le 3ᵉ paramètre `ceiling`, donc `forcedRegimeSwitch` est toujours `undefined`. L'utilisateur n'est jamais alerté du bascule auto micro→réel.
- **Correction** : Passer un `ceiling` selon `LMNP_MICRO_ABATTEMENTS` en fonction du type meublé.

### BUG-D1-M07 — Foncier-micro applique abattement sur netRent au lieu de grossRent
- **Fichier** : `lib/real-estate/fiscal/foncier-micro.ts:27`
- **Description** : La base micro-foncier doit être les loyers bruts déclarés. Le code prend `netRent` (déjà déduit de la vacance) — légalement faux (les loyers ne sont pas « percus moins vacance », ils sont les loyers effectivement encaissés). Commentaire reconnaît la simplification.
- **Correction** : Discuter avec produit. Le commentaire propose de prendre `netRent` comme proxy de l'encaissé, ce qui est défendable mais ambigu.

### BUG-D1-M08 — Aggregateur analyse : pas de filtre status='active' sur debts
- **Fichier** : `lib/analyse/aggregateur.ts:192-198`
- **Description** : Pas de `.eq('status', 'active')` → un crédit `paid_off` avec `capital_remaining` résiduel en DB peut polluer la somme.
- **Correction** : Ajouter le filtre comme dans `lib/real-estate/portfolio.ts:107`.

---

## Incohérences de calcul

### INCOH-D1-001 — Cash-flow mensuel net (4 formules)
- **Endroit A** — Liste PropertyCard : `kpis.monthlyCashFlowYear1` (moteur, après impôts + vacance) — `property-card.tsx:108`
- **Endroit B** — Fiche Synthèse : `monthlyRents - annualCharges/12 - multiCredit.totalMonthly` (sans impôts, sans vacance, sans GLI/gestion %, multi-crédit OK) — `[id]/page.tsx:348-350`
- **Endroit C** — Fiche Rentabilité (SimulationPanel) : `kpis.monthlyCashFlowYear1` (moteur, après impôts + vacance, mais multi-crédit ignoré) — `simulation-panel.tsx:506`
- **Endroit D** — Dashboard /analyse : `loyer - mensualité - charges/12` (cashflow brut) puis `- impot_mensuel` (calculateur fiscal séparé `fiscaliteImmo.ts`) — `immoCalculs.ts:120,177`
- **Valeur correcte** : Endroit C est le plus rigoureux (moteur de projection complet) — sauf en multi-crédit où aucun n'est exact. Le bon comportement serait l'Endroit A/C avec multi-crédit injecté dans la projection.

### INCOH-D1-002 — Rendement brut (3 numérateurs / 3 dénominateurs)
- **Endroit A** — Liste : `kpis.grossYieldFAI = (rent.monthlyRent × 12) / totalCost` — numérateur somme tous lots ou `assumed_total_rent`, dénominateur prix de revient complet.
- **Endroit B** — Fiche Synthèse : `(monthlyRented × 12) / acqCost` — numérateur lots status='rented' uniquement, dénominateur prix de revient complet.
- **Endroit C** — Dashboard /analyse : `(loyer × 12) / (purchase_price + works)` — numérateur lots `rented` ou null, dénominateur amputé (pas de frais notaire, mobilier, bank_fees).
- **Valeur correcte** : Endroit A (FAI = Frais d'Acquisition Inclus, convention française).

### INCOH-D1-003 — Capital restant dû (analytique vs DB)
- **Endroit A** — Fiche détail, MultiCreditList, AmortizationTable : `computeRemainingCapitalAt(loan, today)` ou somme via `aggregateLoans` (multi-crédit OK fiche, KO ailleurs) — analytique mois par mois.
- **Endroit B** — Liste : `computeRemainingCapitalAt` sur 1 seul crédit par asset.
- **Endroit C** — Dashboard /analyse : colonne DB `debts.capital_remaining` figée par snapshot.
- **Valeur correcte** : Endroit A étendu au multi-crédit. Le snapshot DB n'a aucune raison d'être lu en temps réel pour cet usage.

### INCOH-D1-004 — Valeur du bien dans le rendement
- **Endroit A** — Fiche, liste : `currentEstimatedValue ?? purchasePrice + worksAmount` (assets.current_value de la dernière valuation) — pour `currentNetPropertyValue` et le ratio levier seulement.
- **Endroit B** — Dashboard /analyse : `purchase_price + works_amount` partout (jamais la valuation actuelle).
- **Valeur correcte** : Mixer les deux : valeur estimée pour le patrimoine et l'équity, coût de revient pour les rendements (convention FAI).

### INCOH-D1-005 — `latentGain` (plus-value latente)
- **Endroit A** — Fiche Synthèse : `currentVal - acqCost` avec `acqCost` complet (incluant mobilier, bank_fees, guarantee_fees) — `[id]/page.tsx:156`
- **Endroit B** — Liste PropertyCard : `currentValue - (purchase_price + purchase_fees + works)` — `property-card.tsx:48`
- **Valeur correcte** : Endroit A — un loueur réfléchit en plus-value brute « bien revendu vs ce qui m'a coûté tout compris ». Note : la PV fiscale (au sens fiscal) utilise un dénominateur encore différent (cf. `lib/real-estate/plusValue.ts`, hors scope D1).

### INCOH-D1-006 — Mensualité totale crédit (avec/sans assurance par ligne)
- **Endroit A** — MultiCreditList ligne par ligne : `computeMonthlyPayment` (sans assurance).
- **Endroit B** — MultiCreditList ligne agrégée : `aggregateLoans.totalMonthly` (avec assurance).
- **Valeur correcte** : Toujours inclure l'assurance (c'est ce que paye réellement le client) → Endroit B.

---

## Points à clarifier (intention produit ?)

1. **Rendement Synthèse vs Liste** — La Synthèse exclut volontairement les lots non `rented` du numérateur du rendement brut (`[id]/page.tsx:131-133`). Est-ce voulu (afficher le rendement réalisé, pas théorique) ou bug ? Conséquence : un bien neuf en travaux (status='works') affiche rendement = 0 dans la Synthèse mais > 0 dans la card.

2. **`assumed_total_rent`** — Quand la propriété a `assumed_total_rent != null`, build-from-db utilise cette valeur en priorité (build-from-db.ts:256-258), mais la Synthèse continue d'ignorer (page.tsx:131 utilise `lots` filtrés). Faut-il garder cette double source de vérité, ou supprimer `assumed_total_rent` au profit de la somme des lots ?

3. **Cash-flow Synthèse sans impôts** — La Synthèse présente un CF sans impôts ni vacance, ce qui « gonfle » le chiffre versus l'onglet Rentabilité. Question produit : afficher un CF d'exploitation brut (sans impôts) à côté du CF projetté (avec impôts) est-il pédagogique, ou faut-il aligner ?

4. **Foncier-micro abattement sur netRent** — Le commentaire `foncier-micro.ts:24-26` reconnaît qu'on prend `netRent` comme proxy de l'encaissé déclarable. Réglementairement c'est ambigu : les CERFA demandent les loyers perçus. C'est défendable mais à valider.

5. **Loc'Avantages réduction sur loyer théorique** — Cf. BUG-D1-007 : faut-il prendre les loyers théoriques (ce que fait `reduction-schedule.ts`) ou les loyers perçus nets de vacance ?

6. **CCA SCI** — `[id]/page.tsx:709` lit `(propTyped as unknown as { cca_amount?: number | null }).cca_amount ?? 0` — la colonne est-elle même définie en DB ? Si non, `SciDistribution` ne reçoit jamais que 0.

7. **Plafond niches fiscales 10 000 €** — Doit-il être appliqué par bien (acceptable pour un Pinel seul) ou au niveau foyer (correct fiscalement mais nécessite agrégation cross-biens) ?

8. **`monthlyPayment` aggregé** — Pour un crédit avec `insuranceBase = 'capital_remaining'`, la mensualité change chaque mois. `aggregateLoans` retourne `monthlyPayment + monthlyInsurance` (moyenne). Ce qui est affiché dans la Synthèse est donc une moyenne, pas la mensualité Y1 réelle. Conserver la moyenne ou afficher Y1 ?