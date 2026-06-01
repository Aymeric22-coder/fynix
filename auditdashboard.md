# 📊 Audit Dashboard — Rapport complet

> Projet : **Fynix** (pilotage patrimonial + FIRE) — Audit de la section `/dashboard`.
> Statut : audit + recommandations. **Aucune ligne de code modifiée.**
> Date : 2026-05-31.

---

## 🎯 Synthèse exécutive

### Note globale : **42 / 100** 🟠 — *À refondre en profondeur*

> **Verdict en 1 phrase :** le Dashboard de Fynix contient les bons matériaux mais les expose dans le mauvais ordre, calcule la même chose par 3 pipelines concurrents et confond trois missions (patrimoine, FIRE, fiscalité) — la base est saine, l'enveloppe est à reconstruire.

### Top 3 forces actuelles

1. **Moteur immobilier consolidé et fiable** — `computeRealEstatePortfolio` est la source unique pour le CRD, le cash-flow Y1 simulé, l'amortissement multi-crédit, le carry-forward fiscal. C'est la brique la plus mûre.
2. **Actions du mois pertinentes** — la logique `genererActionsMensuelles` (rebalance, cash dormant, DCA retard, opportunités fiscales) propose une recommandation contextualisée et actionnable, ce qui répond directement à la Q4 « où agir ».
3. **Historique patrimonial déjà capturé** — la table `wealth_snapshots` est alimentée à chaque visite de `/analyse` ; les jalons franchis et la courbe d'évolution sont déjà disponibles sans surcoût de saisie.

### Top 3 faiblesses critiques à corriger

1. **🔴 Trois pipelines de calcul concurrents pour le patrimoine net sur le même écran** (page Dashboard inline, `getPatrimoineComplet`, `wealth_snapshots` via `/api/analyse/snapshots`, + un quatrième endpoint `/api/dashboard` non utilisé par la page). Aucun garde-fou de cohérence ⇒ les chiffres peuvent diverger silencieusement.
2. **🔴 Patrimoine brut hybride, CAGR fictif, cash-flow trompeur** (BUG-1, BUG-2, BUG-3) : trois bugs structurels qui sabordent la confiance dans les chiffres affichés.
3. **🔴 Hiérarchie inversée** : KPIs patrimoine net/brut affichés en 8ᵉ position, derrière FIRE Hero + 3 widgets fiscaux + actions + jalons. La règle des 2 secondes est cassée — l'utilisateur doit scroller pour répondre à « combien je possède ».

### Note cible post-refonte (P0 + P1 implémentés) : **77 / 100** 🟡

Suffisant pour passer en zone « À améliorer ». Atteindre 80+ nécessite d'embarquer le P2 (mode présentation, vrai cash-flow patrimonial agrégé, prise en charge SCI/holding/non coté).

---

## Phase 1 — Audit de l'existant

### 1.1 Cartographie des composants (ordre vertical, top → bas)

| # | Composant | Source fichier | Rôle | Poids visuel | Verdict express |
|---|-----------|----------------|------|--------------|------------------|
| 0 | **FIRE Progress Hero** | `components/dashboard/fire-progress-hero.tsx` | Barre progression patrimoine vs cible FIRE, âge projeté, delta épargne | XL (hero) | **Hors mission Dashboard.** Pertinent pour /analyse, pas pour répondre à « combien je possède ». Squatte la zone hero qui devrait afficher le **patrimoine net**. |
| 1 | **FiscalKpiBanner** | `components/dashboard/fiscal-kpi-banner.tsx` | « X €/an récupérables » + CTA vers /analyse?tab=optimiser | L (bandeau amber + glow) | Fiscalité **trop dominante** en position 2. Doublon avec FIRE Hero comme CTA. |
| 2 | **ActionsDuMois** | `components/dashboard/actions-du-mois.tsx` | Top 3 actions priorisées (rebalance, invest cash, DCA, fiscal) | L | OK fonctionnellement mais c'est la **5ᵉ question (« où agir »)**, placée en 3ᵉ position avant même les chiffres. Inversé. |
| 3 | **PatrimoineEvolutionChart** | `components/dashboard/patrimoine-evolution-chart.tsx` | Aire net + brut + ligne portefeuille + cible FIRE | XL (h-64) | Bon graphe mais **doublon** avec #11 plus bas. |
| 4 | **TropheesCard** | `components/dashboard/trophees-card.tsx` | Jalons patrimoniaux franchis (10k, 25k…) | M | Gamification — sympa mais pollue le « pilier patrimoine ». |
| 5 | **CalendrierFiscal** | `components/dashboard/calendrier-fiscal.tsx` | 3 prochains événements fiscaux + expand | L | **Trop de fiscal**. Devrait vivre dans /analyse > Fiscalité. |
| 6 | **AlertsPanel** | `components/dashboard/alerts-panel.tsx` | Sur-exposition, données obsolètes, sim incomplètes | S | Utile mais trop tardif (après 6 sections). |
| 7 | **RealEstateAlertsPanel** | `components/dashboard/real-estate-alerts-panel.tsx` | Top 5 alertes drift immobilier | M | OK mais doublonne avec #6 sur le principe « alertes ». |
| 8 | **KpiGrid** | `components/dashboard/kpi-grid.tsx` | Net / Brut / CF mensuel / CAGR | M (4 stat cards) | **C'est ÇA le cœur du dashboard, et c'est noyé en 8ᵉ position.** Critique. |
| 9 | **RealEstatePortfolioBlock** | `components/dashboard/real-estate-portfolio-block.tsx` | Patrimoine net immo / PV latente / CF / valeur·dette | M (4 KPIs) | Pertinent **pour profil immo**, mais affiché systématiquement. |
| 10 | **Récap Portefeuille** (inline) | `dashboard/page.tsx:429-474` | Valeur / cost basis / PV latente / fraîcheur prix | M | Re-doublon avec #11 (KpiGrid) sur la valeur ; et c'est inline (pas un composant). |
| 11 | **PatrimonyAreaChart** | `components/charts/area-chart.tsx` (timeline) | Aire net+brut sur 13 snapshots | L | **DOUBLON DIRECT du #3.** Même graphe, même data. Bug. |
| 12 | **TopAssetsList** | `components/dashboard/top-assets-list.tsx` | Top 5 par valeur absolue | M | OK mais **manque le « meilleur/pire en rentabilité »** demandé par la mission. Et placé tout en bas. |

**Donut d'allocation** : retiré du dashboard (commentaire dashboard/page.tsx:477). Critique pour répondre à la Q2 « comment c'est réparti ».

#### Poids visuel : fiscalité vs reste

- **Widgets dédiés fiscalité** : 3 (FiscalKpiBanner + CalendrierFiscal + actions fiscales dans ActionsDuMois) → **~22 % du scroll**.
- **Widgets de patrimoine pur** (chiffres net/brut/évolution/top) : 4 réels (KpiGrid + 2 graphes timeline + Top assets) mais **2 graphes en doublon** + KpiGrid relégué très bas. Sentiment utilisateur : « il n'y a que du fiscal et du FIRE ».

### 1.2 Audit des sources de données

**Constat structurant : il existe 3 pipelines parallèles qui calculent le patrimoine sur le même écran** (et un 4ᵉ endpoint `/api/dashboard` qui n'est pas branché — code mort).

| Pipeline | Lecture brute | Lecture nette | Lecture évolution |
|----------|---------------|---------------|--------------------|
| **A. Page dashboard** (calcul inline lignes 207-235) | `assets.current_value` + `portfolioResult.summary.totalMarketValue` (+ proxy cost basis pour positions sans prix) | A − (`portfolio.totalCapitalRemaining` + `debts.capital_remaining`) | 13 dernières lignes `wealth_snapshots` |
| **B. getPatrimoineComplet** (appelé pour FIRE Hero / ActionsDuMois / CalendrierFiscal) | recharge **tout** indépendamment : positions enrichies + immo via `computeRealEstatePortfolio` + cash + profil | idem | ø (snapshot ponctuel) |
| **C. PatrimoineEvolutionChart** (client) | fetch `/api/analyse/snapshots?limit=24` → 24 lignes `wealth_snapshots` | idem | 24 points historiques |
| **D. /api/dashboard** (code mort) | calcul interne 5ᵉ variante (avec `lots.rent_amount`) | idem | 12 derniers snapshots | (non consommé par la page) |

→ Sur **le même écran**, le patrimoine net peut différer entre KpiGrid (pipeline A, à l'instant T), FIRE Hero (pipeline B) et la courbe (pipeline C). Aucun garde-fou de cohérence.

#### Données par section source

| Section | Champ exposé au dashboard | Calculé où ? | Risque |
|---------|---------------------------|--------------|--------|
| **Profil** | `tmi_rate`, `epargne_mensuelle`, `age`, `age_cible`, `revenu_passif_cible` (brut + ajusté foyer) | `loadProfile` dans aggregateur | OK |
| **Portefeuille** | `totalMarketValue`, `totalCostBasis`, `totalUnrealizedPnL`, `freshnessRatio`, positions[] | `buildPortfolioFromDb` côté dashboard + `getEnrichedPositions` côté aggregateur | **2 pipelines** d'enrichissement (FX, prix). Risque d'écarts. |
| **Cash** | Soldes via `patrimoineComplet.comptes` (pipeline B uniquement) | `loadCash` | KpiGrid (pipeline A) prend cash dans `assets` table — **double comptage potentiel** si même bien renseigné des 2 côtés. |
| **Immo** | `portfolio.properties[]`, `totalCapitalRemaining`, `totalMonthlyCFYear1` | `computeRealEstatePortfolio` (commun) ✅ | Bonne source unique pour l'immo. |
| **Analyse** | `opportunites_fiscales`, `recoMensuelles`, `jalonsHistorique`, `evenements_fiscaux` | divers utils sur `patrimoineComplet` | OK |

#### Doublons confirmés

1. **Graphe évolution patrimoine affiché 2× sur le même écran** (PatrimoineEvolutionChart + PatrimonyAreaChart). Bug certain.
2. **Valeur portefeuille affichée 2× différemment** : KpiGrid (brut consolidé) + Récap portefeuille (`totalMarketValue` pur). Pas le même chiffre selon positions sans prix.
3. **Confidence/fraîcheur affichés 3×** : KpiGrid (Fiabilité données), ConfidenceBadge dans la timeline, Fraîcheur prix dans le récap portefeuille.
4. **Patrimoine net immo** affiché à la fois dans KpiGrid (composé) et RealEstatePortfolioBlock (séparé). Le « Valeur · Dette » du bloc immo recouvre partiellement « Patrimoine brut · Dette » de KpiGrid.

### 1.3 Audit des calculs (résumé, détail en Phase 4)

- 🔴 **BUG-1** — Patrimoine brut mélange valeur de marché et cost basis (`dashboard/page.tsx:213`).
- 🔴 **BUG-2** — CAGR n'est pas une performance d'investissement, il inclut les apports d'épargne (`dashboard/page.tsx:237-244`).
- 🟠 **BUG-3** — « Cash-flow mensuel » est uniquement immobilier mais le label est générique (`dashboard/page.tsx:228-234`).
- 🟠 **BUG-4** — Pas de cohérence cash entre les deux pipelines : double comptage potentiel.
- 🟠 **BUG-5** — Top 5 mélange granularités (1 bien immo entier vs 1 position atomique).
- 🟠 **BUG-6** — Allocation calculée sur le brut hybride avec clés hétérogènes (`asset:*` + `class:*` mélangés).
- 🟢 OK — Patrimoine net = brut − dettes (CRD, pas capital initial).
- 🟢 OK — Détection over-exposition à 70 %.
- ❌ **Manquant** — Métrique « meilleur/pire investissement » absente.

---

## Phase 4 — Vérification des calculs

### Tableau récapitulatif

| Indicateur | Source(s) | Formule actuelle | Formule recommandée | Bug détecté ? | Priorité fix |
|---|---|---|---|---|---|
| **Patrimoine brut** | `assets.current_value` (RE+cash+other) + `portfolioResult.summary.totalMarketValue` + `(totalCostBasis − totalCostBasisValued)` | `assetsValue + portfolioBrut` où `portfolioBrut = MV + (CB − CB_valued)` — hybride MV/CB | **MV stricte** uniquement. Afficher un badge `« N positions non valorisées · X € manquants »` quand MV < CB. Forcer un refresh prix avant tout calcul de note. | 🔴 BUG-1 | **P0** |
| **Patrimoine net** | brut − (`portfolio.totalCapitalRemaining` + `debts.capital_remaining` non-immo) | brut − CRD total | Idem mais sur brut MV strict. Ajouter contrôle : si `total_debt > grossValue`, afficher `« endettement supérieur aux actifs »` + net négatif explicite (pas masqué). | partiel (hérite BUG-1) | **P0** |
| **Ratio dette** | `totalDebt / grossValue` | `debt_ratio = totalDebt/grossValue × 100` (arrondi 2 décimales) | Idem mais clipping `[0, +∞[`. Couleur warning > 60 %, danger > 80 %. | non | P1 |
| **Cash-flow mensuel** | `portfolio.totalMonthlyCFYear1 − otherMonthlyLoan` si `hasSim`, sinon 0 | Affiché « Cash-flow mensuel » | **P0 — Renommer** « Cash-flow immobilier (simulé Y1, après impôts) ». **P1 — Ajouter** un vrai CF patrimonial = `loyers_nets + dividendes_estimés + intérêts_livrets − mensualités`. Distribué dans `instrument_prices` (yield TTM) + `cash_accounts.balance × rate_annuel/12`. | 🟠 BUG-3 | **P0 (rename) / P1 (vrai CF)** |
| **CAGR (Performance)** | `wealth_snapshots.total_net_value` first/last | `(net_last / net_first)^(1/years) − 1` | **Deux indicateurs distincts** : (a) **TWR portefeuille** = `Π(1 + r_i) − 1` annualisé à partir des transactions et flux entrants ; (b) **Croissance patrimoniale annualisée** (formule actuelle) explicitement labellée « apports inclus ». Préciser la fenêtre (1A glissant par défaut, sélecteur 3M/6M/1A/3A). | 🔴 BUG-2 | **P0** |
| **Fiabilité données** | `(highConfAssets + freshPortfolio) / grossValue × 100` | Comptabilise les assets `confidence='high'` + positions actives avec `priceStale=false` et MV non null | Conserver mais **fixer la base** : utiliser `grossValueMV` cohérent avec BUG-1. Aujourd'hui dénominateur hybride ⇒ score sous-estimé pour utilisateur avec positions non valorisées. | partiel | P1 |
| **Allocation par classe** | `assets` (asset_type) + `portfolioResult.summary.allocationByClass` | Clés `asset:real_estate / asset:cash / asset:other` mixées avec `class:etf / class:crypto / class:scpi…` | **Taxonomie unique** : `Immobilier · Actions · ETF · Obligations · SCPI · Crypto · Cash · Or/métaux · Autres`. Normaliser AVANT le donut. Base = patrimoine net (par défaut) avec toggle « net / brut ». Edge case : si net ≤ 0, basculer auto sur brut + tooltip explicatif. | 🟠 BUG-6 | **P0** |
| **Top 5 actifs (poids)** | `assets[]` + `portfolioResult.positions[]` | Concaténation de biens immo entiers + positions atomiques, tri par valeur absolue | **Top 5 consolidé** : 1 ligne = 1 enveloppe (PEA / CTO / AV / PER), 1 ligne = 1 bien immo, 1 ligne = 1 livret. Drill-down au clic vers le détail atomique. Base = patrimoine **brut MV strict**. | 🟠 BUG-5 | **P0** |
| **Meilleur / Pire investissement (rentabilité)** | — (absent) | non calculé | **P0** : (a) **financier** : TWR annualisé par enveloppe ou par position (selon vue) ; (b) **immo** : rendement net annualisé `(loyers nets − charges − intérêts) / equity` ; (c) **filtrage** : minimum 90 jours de détention ; (d) **comparabilité** : afficher classés par classe d'actifs, **pas** de podium inter-classes (sinon l'immo avec levier écrase tout — biais documenté en annexe). | ❌ manquant | **P0** |
| **Évolution patrimoniale** | `wealth_snapshots` | Aire net+brut, fenêtre fixe = N dernières lignes | Conserver. **Supprimer** la 2ᵉ instance (`PatrimonyAreaChart`) — code mort sur le Dashboard. Ajouter sélecteur fenêtre (3M/6M/1A/3A/Max). Vérifier que le calcul de `progression_fire_pct` côté API utilise la cible foyer-ajustée et pas brute. | 🟢 (mais doublon visuel) | **P0 (suppression)** |
| **Jalons franchis** | `wealth_snapshots` + `MILESTONES` durs | `enrichJalonsAvecHistorique` — 1ʳᵉ date où `patrimoine_net ≥ seuil` | OK. Edge case à valider : si un snapshot ancien dépasse un seuil mais qu'un snapshot plus récent repasse en dessous (krach), le jalon est **conservé comme atteint** — comportement correct pour « trophée » mais à confirmer. | non | — |
| **Cash-flow immo Y1** | `runSimulation` × bien (carry-forward fiscal multi-année) | Source unique `computeRealEstatePortfolio` ✅ | RAS — c'est la brique la plus mûre. Documenter clairement que c'est **Y1 simulé**, pas le réalisé. | non | — |
| **Opportunités fiscales** | `calculerOpportunitesFiscales(patrimoine)` | Somme `gain_annuel_eur` des `applicable=true` | OK mais le bandeau actuel est anxiogène (gros chiffre amber en position 2). **P0** : déplacer dans Zone Fiscalité compacte (3-4 chiffres clés). | non | P0 (UX) |
| **CRD immobilier** | `debts.amortization_schedule` (analytique) | Capital restant dû recalculé via amortization schedule (pas la valeur stockée) | ✅ correct. Garantit cohérence avec la simulation. | non | — |
| **CRD autre** | `debts.capital_remaining` (stocké) | Lecture directe | OK. À surveiller : le champ n'est pas recalculé automatiquement, l'utilisateur doit le maintenir à jour pour les crédits non-immo. | non | P2 (auto-recalc) |
| **Confidence score** | `assets.confidence` (manuel) + `priceStale` (auto) | `(highConfAssets + freshPortfolio) / grossValue` | Cf. ligne « Fiabilité données ». Risque : les biens immo n'ont jamais `confidence='high'` automatiquement → score plombé chez les profils immo. | partiel | P1 |
| **TMI / IFI / impôts annuels** | `profile.tmi_rate` + `patrimoine_net` ≥ 1.3M€ | `tmi_rate` lu tel quel ; IFI implicite via `evenementsFiscaux` | OK mais affichage Dashboard à compacter. Pas de calcul IFI exact (juste un événement déclenché à 1.3M€). | non | P1 (calcul IFI exact dans /analyse) |

### Edge cases à gérer systématiquement

| Cas | Comportement actuel | Comportement attendu |
|---|---|---|
| Patrimoine = 0 (compte vide) | DashboardEmptyState s'affiche ✅ | OK |
| Patrimoine net < 0 (dettes > actifs) | Affiché tel quel (négatif) | Afficher avec sémantique claire : badge danger + texte explicatif. Pas de masquage. |
| Devises étrangères | `toEur(local, devise)` via Frankfurter | OK mais à confirmer pour `current_value` côté `assets` (pas de currency colonne lue). |
| Snapshots manquants (< 2 points) | CAGR = null, courbe = empty state ✅ | OK |
| Position sans prix | Cost basis utilisé en proxy (cf. BUG-1) | MV null + indicateur visuel + CTA refresh |
| Bien immo sans charges renseignées | `charges_are_estimated=true`, CF surévalué | OK (déjà flaggé). À rendre plus visible dans le KPI cash-flow. |
| Utilisateur sans `enveloppes` saisies | Calendrier fiscal absent | Acceptable mais relever en alerte douce |
| Krach < jalon précédent | Jalon conservé comme « franchi » | À documenter explicitement |

### Exemple chiffré de test (BUG-1)

Utilisateur :
- 1 ETF 50 parts × 100 € MV = **5 000 € MV**, cost basis 4 000 €
- 1 action 10 parts sans prix actualisé (priceStale), cost basis 2 000 €
- 0 immo, 0 cash

**Formule actuelle** :
`portfolioBrut = 5 000 + (6 000 − 5 000) = 6 000 €` → affiché « Patrimoine brut : 6 000 € »
**Vrai brut MV strict** : `5 000 €` (les 10 parts non valorisées sont inconnues)

Écart : **+20 % de sur-estimation** affichée comme valeur de marché. Si l'action a fait −50 % depuis l'achat, le brut réel est **4 000 €** → écart réel **+50 %**.

---

## Phase 2 — Test multi-profils

### Profil 1 — Le débutant (25 ans, 15 k€, primo-investisseur)

**Composition** : Livret A 12 k€, PEA naissant 3 k€ (1 ETF World), pas d'immo.

**Ce qu'il voit** :
- FIRE Hero **anxiogène** : « projection hors horizon » ou « Entre 65 et 80 ans » → décourage immédiatement.
- FiscalKpiBanner → vide ou « 0 € récupérables » (rien à optimiser à 15 k€) → bandeau muet ou supprimé.
- ActionsDuMois → 0 ou 1 action (DCA pas en retard, cash dormant peut être détecté).
- CalendrierFiscal → 1-2 événements (déclaration IR).
- KpiGrid : Net 15 000 € / Brut 15 000 € / CF 0 € / CAGR — → **noyé en position 8**.

**Réponses aux 6 questions** :
1. Se situer en 2 secondes ? **Non** — il faut scroller jusqu'à la 8ᵉ section.
2. Pertinent pour lui ? **Non** — FIRE Hero et fiscalité sont hors sujet à 15 k€.
3. Manque ? **Comparatif épargne mensuelle vs moyenne** ; **objectifs court terme** (épargne de précaution 3-6 mois) ; un **guide « par où commencer »**.
4. Inutile/anxiogène ? **FIRE Hero**, **opportunités fiscales** (donne l'impression d'être déjà en retard).
5. Présentable à un tiers ? **Non** — ne renvoie pas une image rassurante.
6. Axe à suivre ? Faible — il ne saura pas s'il doit prioriser épargne, diversification, formation.

**Verdict** : **4 / 10**

### Profil 2 — L'investisseur immo (40 ans, 3 locatifs + RP, endettement 60 %)

**Composition** : RP 350 k€ + 3 locatifs cumulés 540 k€, dettes 540 k€, peu de financier (50 k€ AV).

**Ce qu'il voit** :
- FIRE Hero → âge projeté sans doute correct mais peu d'intérêt (sa stratégie est immo, pas FIRE classique).
- RealEstatePortfolioBlock → **pertinent** (4 KPIs, lien biens).
- RealEstateAlertsPanel → **pertinent** si drifts détectés.
- KpiGrid : Cash-flow simulé **OK** (label sim_cf_label affiché), CAGR distordu par les apports immo.
- Top assets dominé par les 4 biens → noyé l'AV.

**Réponses** :
1. 2 secondes ? **Partiel** — bonne info immo mais KPIs principaux toujours bas.
2. Pertinent ? **Oui en grande partie**.
3. Manque ? **TRI par bien**, **rendement net pondéré global immo**, **LTV global**, **DSCR** (Debt Service Coverage Ratio).
4. Inutile ? FiscalKpiBanner et FIRE Hero peu utiles dans son cas.
5. Présentable ? **Plutôt oui** — le bloc immo consolidé est lisible.
6. Axe à suivre ? Moyen — pas de focus refinancement / arbitrage entre biens.

**Verdict** : **6 / 10** (meilleur profil servi par le dashboard actuel).

### Profil 3 — L'investisseur boursier (35 ans, 80 % financier)

**Composition** : PEA 80 k€, CTO 40 k€, AV 30 k€, livret A 10 k€. Total ~160 k€.

**Ce qu'il voit** :
- KpiGrid → CF mensuel = **0 €** ❌ (alors qu'il touche des dividendes).
- Top 5 → dominé par les positions ETF individuelles (1 part = 1 ligne) → **le top ne reflète pas sa stratégie par enveloppe**.
- CAGR fictif (inclut épargne mensuelle).
- Récap Portefeuille (PV latente, fraîcheur) → **pertinent** mais relégué en bas.

**Réponses** :
1. 2 secondes ? **Non** — KPIs noyés + CF 0 € incohérent.
2. Pertinent ? **Partiel** — l'info portefeuille existe mais éparpillée.
3. Manque ? **TWR par enveloppe**, **allocation sectorielle/géo dans le donut** (présent uniquement dans /analyse), **comparaison vs benchmark (MSCI ACWI/World)**, **dividendes annuels estimés**.
4. Inutile ? RealEstateAlertsPanel (pas d'immo), CalendrierFiscal alourdi avec événements PEA/AV uniquement.
5. Présentable ? **Non** — top 5 atomique illisible pour un tiers.
6. Axe à suivre ? Faible — pas de focus rééquilibrage classe d'actifs.

**Verdict** : **4 / 10**

### Profil 4 — Le patrimoine diversifié (50 ans, 800 k€ net)

**Composition** : RP 400 k€ (dette 100 k€), 2 locatifs 500 k€ (dette 250 k€), PEA 80 k€, AV 60 k€, SCPI 30 k€, PER 20 k€, livrets 60 k€.

**Ce qu'il voit** : tout. C'est le profil pour lequel le Dashboard a probablement été conçu en pratique — il a un peu de chaque widget.

**Réponses** :
1. 2 secondes ? **Non** — trop de widgets, KPI principal toujours en position 8.
2. Pertinent ? **Oui dans l'absolu** mais effet « tableau de bord d'avion » : trop d'infos, hiérarchie floue.
3. Manque ? **Vue consolidée par enveloppe** (RP / Locatif / Financier / Cash), **vraie répartition d'allocation** sur le Dashboard.
4. Inutile ? Doublons (graphe ×2, valeur portefeuille ×2, fiabilité ×3).
5. Présentable ? **Mitigé** — un conseiller pro y trouvera son compte, un proche se perdra.
6. Axe à suivre ? Bon — ActionsDuMois fait le job ici.

**Verdict** : **6 / 10**

### Profil 5 — Le préretraité (60 ans, 1.5 M€, focus revenus passifs et transmission)

**Composition** : RP 500 k€ (sans dette), 1 locatif 400 k€ (dette résiduelle 50 k€), AV 400 k€, PER 100 k€, livrets 100 k€.

**Ce qu'il voit** :
- FIRE Hero → projection probablement « déjà atteint » → peu pertinent.
- ActionsDuMois → pertinent (cash dormant probable).
- Pas de focus revenus passifs **mensuels totaux** sur le Dashboard.
- Pas de focus **abattement transmission AV** (152 500 €/bénéficiaire avant 70 ans).

**Réponses** :
1. 2 secondes ? **Non**.
2. Pertinent ? **Partiel** — manque ce qui compte à son horizon.
3. Manque ? **Revenus passifs mensuels totaux** (loyers nets + dividendes + intérêts + rentes), **projection succession** (IFI + abattements + démembrement), **simulateur retraite/rente AV**.
4. Inutile ? FIRE Hero (objectif déjà atteint), FiscalKpiBanner (orienté optimisation pas transmission).
5. Présentable ? **Non, pas en l'état pour un notaire/expert-comptable** — manque la vue transmission.
6. Axe à suivre ? Faible sur transmission, OK sur optimisation.

**Verdict** : **5 / 10**

### Profil 6 — Le haut patrimoine complexe (45 ans, 3 M€, entrepreneur)

**Composition** : SCI 800 k€ (dette 400 k€), holding non cotée 600 k€, RP 500 k€ sans dette, 2 locatifs en LMNP 600 k€ (dette 300 k€), PEA + CTO 400 k€, crypto 100 k€, démembrement parts d'entreprise.

**Ce qu'il voit** :
- Pas de support **SCI / holding / parts non cotées** côté schéma DB (les `instruments` sont indexés ISIN, donc non cotés mal gérés).
- Pas de support **démembrement** (nu-propriété / usufruit).
- Top 5 → dominé par valeurs absolues, mais comment intégrer 600 k€ de parts non cotées illiquides ?
- CAGR fictif accentué par flux entrepreneuriaux.

**Réponses** :
1. 2 secondes ? **Non** — au-delà du dashboard, le modèle de données n'absorbe pas son patrimoine.
2. Pertinent ? **Partiel** — bonne couverture immo + financier liquide, le reste est ignoré.
3. Manque ? **Module entités juridiques** (SCI, holding), **valorisation non cotée** (DCF, multiple PER), **démembrement**.
4. Inutile ? Calendrier fiscal sous-dimensionné (pas de CFE, CVAE, IS prévisionnel).
5. Présentable ? **Non** — un expert verra immédiatement les trous.
6. Axe à suivre ? Faible — le moteur ne « sait » pas que sa holding distribue ses dividendes.

**Verdict** : **4 / 10**

### Tableau comparatif multi-profils

| Profil | Note /10 | Ce qui manque pour lui | Ce qui est superflu |
|---|---|---|---|
| **1. Débutant (15 k€)** | **4** | Comparatif épargne, guide « par où commencer », objectif court terme | FIRE Hero anxiogène, fiscal, jalons |
| **2. Investisseur immo** | **6** | TRI par bien, LTV global, DSCR, rendement net pondéré | FiscalKpiBanner, FIRE Hero |
| **3. Investisseur boursier** | **4** | TWR par enveloppe, allocation sectorielle/géo, benchmark, dividendes estimés | RealEstateAlerts, top atomique |
| **4. Patrimoine diversifié** | **6** | Vue consolidée par enveloppe, allocation lisible | Doublons (graphe ×2, fiabilité ×3) |
| **5. Préretraité** | **5** | Revenus passifs mensuels totaux, succession, abattements AV | FIRE Hero atteint, FiscalKpiBanner optimisation |
| **6. Haut patrimoine complexe** | **4** | Modèle SCI/holding/non coté, démembrement, IS prévisionnel | — (le problème est en amont du dashboard) |

**Moyenne profils : 4,83 / 10**

---

## Phase 3 — Architecture cible et plan de refonte

### 3.1 Architecture en zones

> **Principe directeur** : le Dashboard répond aux **5 questions essentielles** dans l'ordre (combien / réparti / performe / agir / évolue) + un rappel FIRE compact en clôture.

#### Zone 1 — Hero patrimoine (top, immédiatement visible)

- **Patrimoine net** (chiffre dominant, taille XL, financial-value)
- En dessous : `Brut · Dette · Δ vs mois dernier (% et €)`
- Sélecteur fenêtre temporelle (3M / 6M / 1A / 3A / Max) à droite — pilote la zone 4
- **Badge fiabilité unique** (consolidation des 3 indicateurs actuels)
- Conditionnel : badge `« N positions non valorisées »` cliquable → refresh
- Responsive : sur mobile, brut/dette/delta passent en sous-ligne, fenêtre = sélecteur compact

#### Zone 2 — Répartition

- **Donut allocation** par classe d'actifs unifiée (Immobilier · Actions · ETF · Obligations · SCPI · Crypto · Cash · Autres)
- Toggle **brut / net** (par défaut **net** ; auto-bascule brut si net ≤ 0 + tooltip)
- Légende avec % et €
- Cliquable → drill-down (par enveloppe, par bien) en modal ou expand
- Responsive : donut centré + légende sous le donut sur mobile

#### Zone 3 — Top investissements (consolidé par enveloppe/bien)

**Construit avec 2 sous-blocs côte à côte (desktop) / empilés (mobile) :**

A. **Top 5 par poids** — consolidé :
- 1 ligne = 1 enveloppe (PEA / CTO / AV / PER) ou 1 bien immo ou 1 livret
- Tri par valeur absolue
- Drill-down au clic vers la section détaillée
- Affichage : nom, valeur, % du brut, mini-barre

B. **Meilleur / Pire en rentabilité** (P0) :
- 2 cartes : `🏆 Meilleur investissement` + `📉 Pire investissement`
- Métrique par classe (explicite) :
  - **Financier** : TWR annualisé (par enveloppe)
  - **Immobilier** : rendement net annualisé = `(loyers_nets_an − charges − intérêts) / equity_investi`
  - **Cash** : rendement nominal (livrets) = `taux_servi`
- **Filtrage minimum 90 jours** de détention (sinon non éligible)
- **Pas de podium inter-classes** par défaut — affichage *« Meilleur financier : ETF World +12.4 % · Meilleur immo : Locatif Paris +6.8 % net »*. Toggle expert « comparer toutes classes » disponible.
- Tooltip explicatif : « Comment c'est calculé ? »

#### Zone 4 — Performance & évolution

- **Courbe d'évolution patrimoniale** (`PatrimoineEvolutionChart` conservé)
- Net + brut + ligne portefeuille + cible FIRE (référence horizontale)
- Fenêtre pilotée par la zone 1
- **Suppression définitive** de `PatrimonyAreaChart` (doublon)
- Ajout d'un mini-bloc à droite (desktop) : `TWR portefeuille (annualisé)` + `Croissance patrimoniale (apports inclus)` — les 2 chiffres séparés, étiquetés

#### Zone 5 — Axes d'amélioration

- **2-3 actions priorisées** (réutiliser `ActionsDuMois` épuré : 3 max, pas d'extension)
- + **2-3 alertes** consolidées (sur-exposition, données stale, drift immo) — un seul panneau unifié
- Lien « Voir toutes les recommandations » → /analyse?tab=optimiser

#### Zone 6 — Fiscalité (compacte, secondaire)

- **Carte unique** avec 3-4 chiffres clés :
  - TMI (% + libellé tranche)
  - Impôts annuels estimés (€)
  - Opportunités fiscales (€/an récupérables) — **compact**, pas de bandeau XL amber
  - Si applicable : IFI estimé (patrimoine taxable > 1.3M€)
- Lien « Détails et calendrier » → /analyse?tab=fiscalite
- **Suppression** du `CalendrierFiscal` du Dashboard (déplacé dans /analyse > Fiscalité)

#### Zone 7 — Rappel FIRE compact (clôture, demande utilisateur)

- 1 ligne unique : `🎯 Indépendance projetée : 52 ans (objectif 50) · 38 % du chemin parcouru · [Voir ma trajectoire →]`
- Renvoie vers la page /analyse > Trajectoire FIRE
- **Pas de hero, pas de barre de progression XL** — juste un rappel + CTA
- Si profil incomplet : CTA discret « Définir mon objectif » sans bandeau dramatique

#### Zone 8 (P2) — Mode présentation (toggle)

- Bouton discret en haut à droite : `🎬 Mode présentation`
- Active un mode épuré :
  - Masque TMI, IFI, opportunités fiscales chiffrées
  - Arrondi les montants au millier
  - Masque le nom de l'utilisateur, les identifiants
  - Cache les CTA (Actions, alertes)
- Pensé pour montrer à banquier, notaire, famille

### 3.2 Affichage conditionnel par profil

| Zone | Débutant | Investisseur immo | Boursier | Diversifié | Préretraité | HNW complexe |
|---|---|---|---|---|---|---|
| Hero patrimoine | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Répartition | ⚠️ minimaliste (≤ 2 classes) | ✅ avec sous-bloc « LTV par bien » | ✅ ajouter mini sectorielle/géo | ✅ | ✅ | ✅ + entités juridiques (P1+) |
| Top 5 poids | ⚠️ si ≥ 3 actifs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Meilleur/Pire | ❌ si < 90j ancienneté | ✅ | ✅ | ✅ | ✅ | ✅ |
| Évolution | ⚠️ « commencera après 2ᵉ visite » | ✅ | ✅ | ✅ | ✅ | ✅ |
| Axes amélioration | ✅ adapté (épargne / diversification) | ✅ | ✅ | ✅ | ⚠️ ajouter transmission | ⚠️ ajouter optim IS |
| Fiscalité compacte | ❌ masqué si patrimoine < 50 k€ | ✅ | ✅ | ✅ | ✅ + abattements AV | ✅ + IS prévisionnel (P2) |
| Rappel FIRE | ✅ ton encourageant | ✅ | ✅ | ✅ | ⚠️ basculer sur « rente projetée » | ✅ |

### 3.3 Suppressions / déplacements

**À supprimer du Dashboard :**
- `PatrimonyAreaChart` (doublon — code mort)
- Bandeau XL `FiscalKpiBanner` (intégré dans Zone 6 compact)
- `CalendrierFiscal` (déplacé dans /analyse > Fiscalité)
- `TropheesCard` (déplacé dans /analyse > Trajectoire FIRE, ou en footer Zone 4)
- Récap portefeuille inline (consolidé dans Zone 1 + Zone 4)

**À déplacer vers /analyse :**
- `FIREProgressHero` XL → /analyse > Trajectoire FIRE (rappel compact en Zone 7 du Dashboard)
- Détail des alertes drift immo → /immobilier (Zone 5 du Dashboard garde un compteur consolidé)

**À renommer (P0) :**
- KPI « Cash-flow mensuel » → « Cash-flow immobilier (Y1 simulé) »
- KPI « Performance (CAGR) » → 2 KPIs : « TWR portefeuille » + « Croissance patrimoine (apports inclus) »

### 3.4 Liste priorisée des tâches

#### 🔴 P0 — Critiques (à faire avant toute refonte visuelle)

| ID | Tâche | Pourquoi | Effort estimé |
|---|---|---|---|
| **P0.1** | Convergence sur **un seul pipeline de calcul** = `getPatrimoineComplet` enrichi des prix portfolio actualisés | Élimine les 3 sources de vérité concurrentes | L (refacto serveur) |
| **P0.2** | **Fix BUG-1** : patrimoine brut = MV stricte + badge « N positions non valorisées » | Stoppe l'hybride MV/CB silencieux | S |
| **P0.3** | **Fix BUG-2** : remplacer CAGR unique par TWR portefeuille + Croissance patrimoine (apports inclus) | Indicateur de performance fiable | M (nécessite TWR depuis transactions) |
| **P0.4** | **Fix BUG-3** : renommer « Cash-flow mensuel » → « Cash-flow immobilier (Y1 simulé) » | Élimine le label trompeur | XS |
| **P0.5** | **Fix BUG-5** : top 5 consolidé par enveloppe/bien | Rend le top actionnable | M |
| **P0.6** | **Fix BUG-6** : taxonomie d'allocation unique + donut sur Dashboard | Donut absent aujourd'hui = Q2 sans réponse | M |
| **P0.7** | **Métrique meilleur/pire investissement** par classe (TWR financier, rendement net immo) avec filtre 90 jours | Livrable demandé, absent aujourd'hui | L |
| **P0.8** | **Suppression** `PatrimonyAreaChart` + récap portefeuille inline + déplacements FIRE Hero / Calendrier fiscal | Désencombre | S |
| **P0.9** | **Refonte hiérarchie verticale** : Hero patrimoine → Répartition → Top → Évolution → Axes → Fiscalité compacte → Rappel FIRE | Rétablit règle des 2 secondes | M |
| **P0.10** | **Tests unitaires** sur les calculs critiques (brut, net, TWR, CAGR croissance, top, allocation) — non-régression | Garantit la justesse dans le temps | M |

#### 🟠 P1 — Importantes

| ID | Tâche | Pourquoi | Effort |
|---|---|---|---|
| **P1.1** | **Vrai cash-flow patrimonial mensuel** = loyers nets + dividendes estimés + intérêts livrets − mensualités | Indicateur Q1+Q5 complet | L |
| **P1.2** | Sélecteur **fenêtre temporelle** (3M/6M/1A/3A/Max) qui pilote Hero + Évolution + delta | Profondeur de lecture | M |
| **P1.3** | Affichage conditionnel par profil (débutant minimaliste, immo enrichi, boursier enrichi, préretraité avec rente) | Personnalisation | M |
| **P1.4** | Comparaison portefeuille vs **benchmark MSCI ACWI/World** sur la zone Évolution | Q3 « comment ça performe » plus riche | M |
| **P1.5** | Dividendes annuels estimés (TTM) + projection annuelle de revenus passifs totaux | Profil préretraité | M |
| **P1.6** | Refonte du composant `RealEstateAlertsPanel` consolidé dans Zone 5 unique | Élimine la duplication d'alertes | S |
| **P1.7** | Edge case patrimoine net < 0 : sémantique claire + bascule auto allocation brut | Robustesse | S |
| **P1.8** | Recalcul automatique du `capital_remaining` pour les crédits non-immo (amortization stockée) | Évite la dérive manuelle | M |
| **P1.9** | Calcul **IFI exact** (au lieu d'un simple événement déclenché à 1.3 M€) | Pertinence pour HNW | M |
| **P1.10** | Composant Zone 6 « Fiscalité compacte » avec TMI / Impôts annuels / IFI / Opportunités | Compacte la zone | S |

#### 🟢 P2 — Nice-to-have

| ID | Tâche | Pourquoi | Effort |
|---|---|---|---|
| **P2.1** | **Mode présentation** (toggle, masque données sensibles, arrondi au millier) | Carte de visite, profil 5/6 | M |
| **P2.2** | Support entités juridiques (SCI, holding) côté modèle de données + dashboard | HNW complexe | XL (chantier complet) |
| **P2.3** | Support démembrement (nu-propriété/usufruit) | HNW complexe | XL |
| **P2.4** | Allocation **sectorielle + géographique** sur le Dashboard (aujourd'hui /analyse only) | Profil boursier | M |
| **P2.5** | Simulateur succession / abattements AV / DUTREIL pour profil préretraité | Profil 5 | L |
| **P2.6** | Export PDF du Dashboard (rapport mensuel personnalisé) | Carte de visite | M |
| **P2.7** | Animations à l'apparition (count-up sur les chiffres clés) | UX | S |
| **P2.8** | Couleur conditionnelle delta vs mois dernier (vert/rouge) + comparatif vs N-1 | UX | S |

---

## Scoring

### Niveau 1 — Notes par critère (sur 10)

| Critère | Note /10 | Justification |
|---|---|---|
| **Lisibilité visuelle** | **4** | 12 widgets verticaux empilés, 3 doublons confirmés, hiérarchie inversée (KPI principal en 8ᵉ), pas de toggle / sélecteur global. |
| **Pertinence des informations** | **5** | Le contenu existe (KPIs, top, alertes, actions, FIRE) mais 3 widgets fiscaux + FIRE Hero + jalons noient le pilier patrimoine. |
| **Justesse des calculs** | **4** | 3 pipelines parallèles + BUG-1 (brut hybride) + BUG-2 (CAGR fictif) + BUG-3 (CF mensuel trompeur). Bonne brique immo, mais le reste perd la confiance. |
| **Règle des 2 secondes** | **3** | Patrimoine net invisible immédiatement (8ᵉ position). FIRE Hero domine. Sans scroll, on ne peut pas répondre à « combien je possède ». |
| **Équilibre fiscalité** | **3** | 3 widgets dédiés fiscalité dont un bandeau XL amber en position 2 (FiscalKpiBanner). Couvre ~22 % du scroll alors que la mission est « secondaire ». |
| **Personnalisation & recommandations** | **5** | `ActionsDuMois` solide et contextualisé. Mais aucun affichage conditionnel par profil — débutant et HNW reçoivent le même contenu. |
| **Effet « carte de visite »** | **4** | Trop de bruit, données sensibles visibles (TMI, IFI), top atomique illisible pour un non-initié, pas de mode présentation. |

### Niveau 2 — Notes par profil (sur 10)

| Profil | Note /10 | Ce qui manque | Ce qui est superflu |
|---|---|---|---|
| **Débutant (15 k€)** | **4** | Comparatif épargne, guide « par où commencer », objectif court terme | FIRE Hero anxiogène, fiscal, jalons |
| **Investisseur immo** | **6** | TRI par bien, LTV global, DSCR, rendement net pondéré | FiscalKpiBanner, FIRE Hero |
| **Investisseur boursier** | **4** | TWR par enveloppe, allocation sectorielle/géo, benchmark, dividendes estimés | RealEstateAlerts, top atomique |
| **Patrimoine diversifié** | **6** | Vue consolidée par enveloppe, allocation lisible | Doublons (graphe ×2, fiabilité ×3) |
| **Préretraité** | **5** | Revenus passifs mensuels totaux, succession, abattements AV | FIRE Hero atteint, fiscal optimisation |
| **Haut patrimoine complexe** | **4** | Modèle SCI/holding/non coté, démembrement, IS prévisionnel | — (le problème est en amont du dashboard) |

**Moyenne profils : 4,83 / 10**

### Niveau 3 — Note globale (sur 100)

#### Calcul pondéré

| Critère | Poids | Note /10 | Sous-total |
|---|---|---|---|
| Justesse des calculs | 25 % | 4 | 10,0 |
| Règle des 2 secondes + lisibilité (moy) | 20 % | 3,5 | 7,0 |
| Pertinence des informations | 15 % | 5 | 7,5 |
| Moyenne notes profils | 20 % | 4,83 | 9,7 |
| Effet carte de visite | 10 % | 4 | 4,0 |
| Équilibre fiscalité | 5 % | 3 | 1,5 |
| Personnalisation | 5 % | 5 | 2,5 |
| **Total** | **100 %** | — | **42,2 / 100** |

### Grille de lecture

| Tranche | Verdict | Action recommandée |
|---|---|---|
| 0-40 | 🔴 À refaire entièrement | Refonte complète, repartir d'une page blanche |
| **41-60** | **🟠 À refondre en profondeur** | **Garder la base, restructurer l'essentiel** ← ici (42) |
| 61-80 | 🟡 À améliorer | Optimisations ciblées, pas de refonte structurelle |
| 81-100 | 🟢 Solide | Polish et ajustements mineurs |

### Note cible post-refonte (P0 + P1 implémentés)

| Critère | Poids | Note cible /10 | Sous-total cible |
|---|---|---|---|
| Justesse des calculs (1 pipeline + bugs fixés + tests) | 25 % | 8 | 20,0 |
| Règle des 2 secondes + lisibilité (moy après refonte zones) | 20 % | 8,5 | 17,0 |
| Pertinence des informations | 15 % | 8 | 12,0 |
| Moyenne notes profils (conditionnel + meilleur/pire + top consolidé) | 20 % | 7 | 14,0 |
| Effet carte de visite (P2 mode présentation pas inclus) | 10 % | 6 | 6,0 |
| Équilibre fiscalité (zone 6 compacte) | 5 % | 8 | 4,0 |
| Personnalisation (affichage conditionnel) | 5 % | 7 | 3,5 |
| **Total cible** | **100 %** | — | **76,5 / 100** ≈ **77 🟡** |

**Pour atteindre 80+ (🟢)** : embarquer P2.1 (mode présentation), P2.4 (allocation sectorielle/géo), P2.5 (succession). Le P2.2 (entités juridiques) et P2.3 (démembrement) sont des chantiers majeurs débordant du périmètre Dashboard.

---

## Annexes

### A. Tests à mettre en place pour valider la justesse des calculs

Tous à ajouter dans `lib/analyse/__tests__/` ou `lib/finance/__tests__/`, runnés via `npx vitest run`.

#### Calculs patrimoine

| Test | Cas d'entrée | Sortie attendue |
|---|---|---|
| `patrimoineBrutMV.test.ts` | 1 ETF 5 000 € MV + 1 action sans prix (CB 2 000 €) | Brut = 5 000 € + flag `positionsNonValorisees=1` (PAS 6 000 €) |
| `patrimoineNet.test.ts` | Brut 100 000 €, CRD immo 60 000 €, debt non-immo 5 000 € | Net = 35 000 € |
| `patrimoineNetNegatif.test.ts` | Brut 10 000 €, dette 50 000 € | Net = −40 000 € + sémantique `endettement_excessif=true` |
| `cashFlowImmoLabel.test.ts` | Profil sans immo, dividendes 200 €/mois | Label = `"Cash-flow immobilier (Y1 simulé)"` valeur = 0 € (P0). En P1 : vrai CF = 200 € |
| `twrPortefeuille.test.ts` | 1 ETF acheté 10 k€ il y a 1 an, MV 11 k€, aucun apport | TWR = +10 %, annualisé OK |
| `twrAvecApports.test.ts` | 10 k€ initial + 1 k€/mois × 12, MV finale 25 k€ | TWR ≠ CAGR ; TWR ≈ rendement réel, CAGR croissance ≈ +150 % (apports inclus) — les 2 chiffres doivent diverger |
| `croissancePatrimoineCAGR.test.ts` | Snapshots N=10k, N+1=20k (1 an) | CAGR = +100 % + label `"apports inclus"` |
| `topConsolide.test.ts` | 5 lignes PEA (50, 30, 20, 15, 10) + 1 bien immo 350k + 1 livret 20k | Top = [Bien immo 350k, PEA total 125k, Livret 20k] (3 entrées) ; PAS les 5 lignes PEA atomiques |
| `meilleurInvestParClasse.test.ts` | 3 ETF (TWR +12 %, +5 %, −3 %) + 2 biens immo (rdt 7 %, 4 %) | Meilleur financier = ETF +12 % ; Meilleur immo = bien à 7 % ; pas de podium inter-classes |
| `filtreAnciennete90j.test.ts` | Position achetée il y a 30 j (TWR +50 %) | Exclue du calcul meilleur/pire |
| `allocationTaxonomie.test.ts` | Mix assets (real_estate, cash) + portfolio (etf, crypto) | Une seule taxonomie unifiée, % somme = 100 % à ε près |
| `pipelineUnique.test.ts` | Même utilisateur, calculer net via getPatrimoineComplet + (ancien) page inline | Doivent diverger de moins de 1 € (ou idéalement = 0) |

#### Tests d'intégration

| Test | Vérifie |
|---|---|
| `dashboardCoherence.test.ts` | Sur un utilisateur fixture, les 3 valeurs `net` affichées sur le Dashboard (KpiGrid, FIRE Hero, courbe) sont **identiques au centime** |
| `dashboardEmptyState.test.ts` | 0 assets + 0 positions + 0 biens → `DashboardEmptyState` rendu, pas de KpiGrid à 0 € |
| `dashboardSnapshotE2E.test.ts` | Playwright/Vitest browser : screenshot diff pour les 6 profils fixtures |

### B. Glossaire

| Terme | Définition |
|---|---|
| **CAGR** (Compound Annual Growth Rate) | Taux de croissance annualisé. Formule : `(V_final / V_initial)^(1/n) − 1`. **Inclut tous les flux**, y compris les apports d'épargne. Bon pour mesurer une croissance de patrimoine, **inapproprié** pour mesurer une performance d'investissement isolée. |
| **TWR** (Time-Weighted Return) | Performance pondérée par le temps. Neutralise l'effet des apports/retraits. Formule : `Π(1 + r_i) − 1` où chaque `r_i` est la performance entre deux flux. **C'est la métrique correcte** pour comparer la performance d'un portefeuille à un benchmark. |
| **MWR** (Money-Weighted Return) | Performance pondérée par les montants (= TRI / IRR). Reflète l'expérience monétaire de l'investisseur (gros apports au mauvais moment pénalisent). Utile pour le pilotage personnel, moins pour comparer à un benchmark. |
| **CRD** | Capital Restant Dû. Sur un crédit amortissable, ce qui reste à rembourser — **pas le capital initial**. |
| **LTV** | Loan-To-Value. Ratio dette / valeur du bien. Indicateur d'endettement immobilier. |
| **DSCR** | Debt Service Coverage Ratio = revenus locatifs nets / mensualités. > 1 = le bien s'auto-finance. |
| **MV / CB** | Market Value (valeur de marché actuelle) / Cost Basis (prix d'achat historique). |
| **IFI** | Impôt sur la Fortune Immobilière. Patrimoine immobilier taxable > 1,3 M€. |
| **TMI** | Tranche Marginale d'Imposition. Taux d'imposition de la tranche la plus haute du foyer. |
| **Cash-flow patrimonial** | Différence mensuelle entre tous les flux entrants (loyers nets, dividendes, intérêts, rentes) et tous les flux sortants liés au patrimoine (mensualités, charges, impôts). |
| **Rendement net annualisé immobilier** | `(loyers nets − charges − intérêts d'emprunt) / equity_investi`, exprimé en % annuel. Permet la comparaison avec un TWR financier (sous réserves de levier). |

### C. Convention de comparabilité inter-classes (décision Phase 3)

**Décision retenue** : ne **pas** afficher de podium inter-classes par défaut.

**Raison** : l'immobilier avec effet de levier produit mécaniquement des rendements sur equity supérieurs (effet du levier, pas de la qualité de l'actif), ce qui faussait toute comparaison « actions vs immo ». L'exposition `MV` est elle-même non comparable (un bien immo à 350 k€ avec 300 k€ de dette représente 50 k€ d'equity).

**Implémentation** : afficher **un meilleur et un pire par classe** (financier, immobilier, cash) dans la Zone 3, avec libellé explicite de la métrique. Toggle expert disponible pour les utilisateurs avancés qui veulent comparer en TRI net de levier.

### D. Pipelines de calcul actuels — code mort à supprimer

- `/api/dashboard` (route handler complet, non consommé par la page Dashboard depuis la migration vers les Server Components) — à confirmer puis supprimer
- `PatrimonyAreaChart` (utilisé uniquement par le Dashboard, à supprimer après la refonte Zone 4)
- Inline récap portefeuille (lignes 429-474 de `dashboard/page.tsx`) — remplacé par le mini-bloc TWR / Croissance de la Zone 4

---

## Phase 5 — Cadrage de l'implémentation

### 5.1 Estimation en jours-homme par tâche P0

> **Hypothèses** : 1 développeur senior connaissant déjà le codebase Fynix (Next.js 15 + Supabase + lib/analyse), 1 jour-homme = 7 h productives, marge imprévus = couverture review code + ajustements post-test + bugs de surface non détectés en spec.

| ID | Tâche | Effort qualitatif | Jours-homme estimés | Marge imprévus | **Total réaliste** |
|---|---|---|---|---|---|
| **P0.1** | Pipeline unique = `getPatrimoineComplet` enrichi des prix portfolio actualisés | L | 5,0 j | +2,0 j | **7,0 j** |
| **P0.2** | Patrimoine brut = MV stricte + badge « positions non valorisées » | S | 1,0 j | +0,5 j | **1,5 j** |
| **P0.3** | Séparer TWR portefeuille + Croissance patrimoine (apports inclus). Construire le moteur TWR à partir de `transactions`. | M | 4,0 j | +1,0 j | **5,0 j** |
| **P0.4** | Renommer « Cash-flow mensuel » → « Cash-flow immobilier (Y1 simulé) » | XS | 0,25 j | +0,25 j | **0,5 j** |
| **P0.5** | Top 5 consolidé par enveloppe/bien + drill-down | M | 3,0 j | +1,0 j | **4,0 j** |
| **P0.6** | Taxonomie unique d'allocation + donut sur Dashboard | M | 3,0 j | +1,0 j | **4,0 j** |
| **P0.7** | Meilleur/Pire par classe (TWR fin. + rdt net immo), filtre 90 j | L | 4,0 j | +1,5 j | **5,5 j** |
| **P0.8** | Suppressions (`PatrimonyAreaChart`, FiscalKpiBanner XL, CalendrierFiscal, `TropheesCard`) + déplacements vers /analyse | S | 1,0 j | +0,5 j | **1,5 j** |
| **P0.9** | Refonte hiérarchie verticale + assemblage des 7 zones | M | 4,0 j | +1,5 j | **5,5 j** |
| **P0.10** | Tests fondations (15 tests Vitest listés Annexe A) | M | 3,0 j | +1,0 j | **4,0 j** |
| **Total P0** | | | **28,25 j** | **+10,25 j** | **38,5 j ≈ 39 j** |

#### Durée calendaire réaliste

| Régime de travail | Conversion | Durée calendaire | Commentaire |
|---|---|---|---|
| **Temps plein** (5 j/semaine) | 39 j ÷ 5 | **≈ 8 semaines** (~2 mois) | Possible mais intense ; prévoir 1 semaine tampon pour livrer en 9 semaines (~2,2 mois) |
| **Mi-temps** (2,5 j/semaine) | 39 j ÷ 2,5 | **≈ 16 semaines** (~4 mois) | Régime réaliste si autres chantiers en parallèle |
| **Temps partiel léger** (1 j/semaine) | 39 j ÷ 1 | **≈ 39 semaines** (~9 mois) | Déconseillé : trop de context-switching, le bénéfice utilisateur arrive trop tard |

**Recommandation** : viser un **mi-temps soutenu** (2,5 à 3 j/semaine) avec livraison vague par vague tous les 5-6 semaines. Permet de capitaliser sur la dynamique sans saturer.

### 5.2 Vérification du prérequis P0.7 — historique transactions

**Diagnostic : ✅ exploitable en l'état, P0.7 reste classé L (pas d'inflation en XL).**

#### Ce qui existe

| Élément | Statut | Détail |
|---|---|---|
| Table `transactions` | ✅ présente | `supabase/migrations/001_initial_schema.sql:165` — append-only par conception (pas d'`updated_at`, commentaire « Jamais modifiée, jamais supprimée »). |
| Schéma adapté au TWR | ✅ | Colonnes : `transaction_type` (purchase/sale/dividend), `amount`, `currency`, `fx_rate_to_ref` (taux EUR au moment de la transaction — clé pour FX-cohérence), `executed_at`, `quantity`, `unit_price`, `position_id`. |
| Alimentation automatique | ✅ | `app/api/portfolio/positions/route.ts:201-209` crée une `transaction` (`purchase`) à chaque ajout de position. Idem dividendes (`/api/portfolio/dividends`), ventes (`/api/transactions`), imports CSV (`/api/portfolio/import`). |
| Indexation temporelle | ✅ | `idx_txn_user_time ON transactions (user_id, executed_at DESC)` — requêtes TWR rapides. |
| RLS | ✅ | `user_own_data` policy par user_id. |

#### Trous identifiés (à traiter dans le scope P0.3 / P0.7)

1. **Positions legacy sans transaction d'origine** — Si une position a été créée avant la mise en place de la création automatique de transaction, elle n'aura pas de `purchase` historisé. **Mitigation** : fallback `position.acquisition_date` + `position.average_price * quantity` comme transaction synthétique. Coût : ~0,25 j inclus dans la marge P0.3.

2. **Dividendes en cash non rattachés à un instrument** — Si l'utilisateur reçoit un dividende mais n'a pas mis à jour sa position, la transaction `dividend` peut être orpheline. **Mitigation** : ces dividendes sont quand même comptabilisés dans la croissance patrimoniale (apport externe), donc pas bloquant pour TWR.

3. **Cash flows entrants externes** (versements PEA, AV, livret) — Pas tous historisés en `transactions` aujourd'hui ; le pipeline TWR doit pouvoir distinguer un **flux d'apport** (à neutraliser dans TWR) d'une **performance**. **Solution** : utiliser la table `cash_balance_history` (`supabase/migrations/001:idx_cash_bal_hist`) pour reconstruire les apports par snapshot, en complément de `transactions`. Coût : +0,5 j inclus dans la marge P0.3.

4. **Précision FX** — Le champ `fx_rate_to_ref` est correctement stocké à la transaction mais à recroiser avec `fx_rates` actuel pour la valorisation. La cohérence est déjà gérée côté `getEnrichedPositions`. RAS.

**Verdict** : P0.7 reste estimé à **5,5 j** comme planifié. Les 3 trous ci-dessus sont gérables dans les marges déjà allouées à P0.3 et P0.7.

### 5.3 Plan de migration progressive pour P0.1

> **Principe directeur** : zero big-bang. À aucun moment l'utilisateur ne doit voir des chiffres différents entre deux écrans. Le pipeline existant reste autoritaire jusqu'à validation explicite.

#### Étape 1 — Nouveau pipeline en parallèle, derrière un feature flag

**Action** :
- Créer `lib/analyse/dashboardPipeline.ts` qui consomme **uniquement** `getPatrimoineComplet` (enrichi d'un appel parallèle aux prix portfolio actualisés) et renvoie une structure unique `DashboardData` (KPIs + allocation + top + évolution + alerts).
- Introduire un feature flag serveur `DASHBOARD_UNIFIED_PIPELINE` (variable d'env Vercel + cookie de bypass pour QA).
- Dans `app/(app)/dashboard/page.tsx`, **calculer les deux variantes en parallèle** (ancien inline + nouveau) ; n'afficher que l'ancien pour l'utilisateur, **logguer en serveur** la divergence en JSON (avec un échantillonnage 1 utilisateur sur 10 pour éviter le flood).

**Critères de validation** :
- Le nouveau pipeline compile, type-checke (`npx tsc --noEmit` silencieux), n'introduit aucune nouvelle requête SQL onéreuse (vérifier sur Supabase Logs : pas de +50 % de query time sur `/dashboard`).
- Les logs de divergence sont collectés sur au moins 50 utilisateurs réels pendant 1 semaine.

**Risques** :
- Surcoût latence Dashboard (~+20-30 % temps serveur). Acceptable en dev, à monitorer en prod.
- Logs trop verbeux → spammer Vercel logs. **Mitigation** : sampling + format JSON structuré filtrable.

**Effort** : ~2 j inclus dans les 7 j de P0.1.

#### Étape 2 — Test de cohérence sur N utilisateurs fixtures + utilisateurs réels

**Action** :
- Créer 6 fixtures correspondant aux 6 profils audités (Phase 2). Insérer données réalistes en base de test via script seed.
- Exécuter le pipeline nouveau ET l'ancien sur ces 6 fixtures, asserter `|new.net_value - old.net_value| < 1 €` (à 1 € près pour absorber les arrondis flottants), idem brut, idem dette, idem allocation à 0,1 % près.
- Compléter par les logs de divergence collectés à l'étape 1 sur utilisateurs réels — viser **< 1 % de divergences > 10 €** parmi les utilisateurs échantillonnés.
- Pour chaque divergence > 10 €, **investiguer la cause** : c'est soit un bug pipeline, soit un bug pré-existant dans l'ancien pipeline (souvent BUG-1 ou BUG-4 qui se révèlent).

**Critères de validation** :
- 6 fixtures : convergence centime-près sur net/brut/dette, ≤ 0,1 % d'écart sur l'allocation.
- Utilisateurs réels : ≥ 99 % des cas avec divergence < 10 €. Pour le 1 % restant, divergence **expliquée et attribuée** (soit fix BUG ancien, soit fix pipeline nouveau).
- Test `pipelineUnique.test.ts` (Annexe A) ajouté au suite Vitest et passant.

**Risques** :
- Découvrir des bugs anciens importants → tentation de tout corriger en cascade. **Discipline** : si le bug est dans l'ancien pipeline, l'accepter et bloquer la bascule jusqu'au passage en étape 3 (qui va de toute façon supprimer l'ancien).
- Données fixtures non-représentatives → faux sentiment de sécurité. **Mitigation** : enrichir les fixtures à chaque divergence non triviale observée en prod.

**Effort** : ~2 j inclus dans les 7 j de P0.1 (mais peut s'étirer si beaucoup de divergences à investiguer).

#### Étape 3 — Bascule contrôlée

**Action** :
- Activer le feature flag `DASHBOARD_UNIFIED_PIPELINE` pour un sous-ensemble d'utilisateurs (commencer par toi-même + équipe en dogfood, puis 10 %, puis 50 %, puis 100 %).
- À chaque palier, surveiller : (a) plaintes utilisateurs (« mes chiffres ont changé »), (b) erreurs serveur sur `/dashboard`, (c) latence p95.
- Garder le flag actif/désactivable au runtime pendant au moins 2 semaines après 100 %.

**Critères de validation** :
- Aucune erreur 500 imputable au nouveau pipeline sur 100 % du trafic pendant 7 jours consécutifs.
- Latence p95 du Dashboard ≤ +15 % vs avant migration.
- Zéro plainte « chiffre incohérent » après stabilisation.

**Risques** :
- Régression silencieuse découverte tard. **Mitigation** : continuer à logger l'ancien pipeline en shadow pendant 1 semaine après bascule 100 %.

**Effort** : ~1 j de monitoring + 1 j de buffer correction, inclus dans les 7 j de P0.1.

#### Étape 4 — Suppression du code mort

**Action** :
- Retirer le bloc de calcul inline dans `dashboard/page.tsx` (lignes 207-326 environ).
- Supprimer l'endpoint `/api/dashboard` (confirmer auparavant qu'aucun consommateur externe n'existe — recherche `from('dashboard')` + audit du SDK client).
- Supprimer le feature flag `DASHBOARD_UNIFIED_PIPELINE` (le code unifié devient le chemin par défaut, plus de branche conditionnelle).
- Supprimer les helpers devenus orphelins (à identifier via `tsc` + `eslint --rule no-unused-vars`).

**Critères de validation** :
- `npx vitest run` : 491 tests + nouveaux tests passent.
- `npx tsc --noEmit` silencieux.
- `npm run build` : pas d'erreur webpack ni RSC (apprentissage memory `feedback_pre_deploy_check`).
- Vérification visuelle Dashboard sur les 6 profils fixtures avant push.
- Déploiement Vercel READY, vérifié via MCP `get_deployment`.

**Risques** :
- Suppression d'un endpoint utilisé par un script tiers méconnu. **Mitigation** : grep global + 1 semaine d'observation des logs 404 sur `/api/dashboard` avant suppression effective.

**Effort** : ~1 j inclus dans les 7 j de P0.1.

#### Récapitulatif P0.1

| Étape | Durée | Cumulé | Bascule visible utilisateur ? |
|---|---|---|---|
| 1 — Pipeline parallèle + flag | ~2 j | 2 j | Non |
| 2 — Tests cohérence | ~2 j (+ collecte logs sur 1 semaine calendaire) | 4 j | Non |
| 3 — Bascule progressive | ~2 j (+ 2 semaines calendaires de palier) | 6 j | Oui (10 → 100 %) |
| 4 — Suppression code mort | ~1 j | 7 j | Non (déjà basculé) |

**Durée calendaire P0.1 totale ≈ 4 semaines** (en parallèle d'autres tâches P0 indépendantes), pour 7 j-homme nets de travail.

### 5.4 Recalcul de la note cible avec P1.3 + P1.4 promus en P0

#### Impact qualitatif

- **P1.3 (affichage conditionnel par profil)** : élève fortement Débutant (− éléments anxiogènes), Boursier (+ allocation sect/géo conditionnelle), Préretraité (+ focus rente). Effet aussi sur « personnalisation » et « pertinence ».
- **P1.4 (benchmark MSCI ACWI/World sur évolution)** : élève Boursier (Q3 « comment ça performe »), pousse aussi Diversifié et HNW.

#### Nouvelles notes

| Critère | Poids | Note cible **actuelle** /10 | Note cible **avec P1.3+P1.4** /10 | Justification du gain |
|---|---|---|---|---|
| Justesse des calculs | 25 % | 8 | **8** | Inchangé (déjà couvert par P0.1-P0.3) |
| Lisibilité + 2 secondes (moy) | 20 % | 8,5 | **8,5** | Inchangé |
| Pertinence des informations | 15 % | 8 | **9** | Benchmark MSCI + conditionnel = couverture Q3 / personnalisation +1 |
| Moyenne notes profils | 20 % | 7 | **7,3** | Cf. tableau ci-dessous |
| Effet carte de visite | 10 % | 6 | **6** | Inchangé (toujours bloqué par mode présentation = P2.1) |
| Équilibre fiscalité | 5 % | 8 | **8** | Inchangé |
| Personnalisation | 5 % | 7 | **9** | P1.3 est précisément la personnalisation par profil → saut majeur |

#### Détail moyenne profils

| Profil | Note cible **actuelle** | Note cible **avec P1.3+P1.4** | Effet |
|---|---|---|---|
| Débutant | 7 | **7,5** | Conditionnel masque FIRE, fiscal, jalons |
| Investisseur immo | 7 | **7** | Peu d'effet (P1.3 surtout pour les autres profils) |
| Investisseur boursier | 7 | **8,5** | Benchmark MSCI + allocation sect/géo conditionnelle = saut |
| Patrimoine diversifié | 7 | **7,5** | Bénéfice incrémental |
| Préretraité | 7 | **7** | P1.3 aide mais focus rente arrive en P1.5 |
| Haut patrimoine complexe | 7 | **6** | Profil 6 reste structurellement mal servi (cf. 5.6) ; le conditionnel ne suffit pas |

Moyenne = (7,5 + 7 + 8,5 + 7,5 + 7 + 6) / 6 = **7,25 ≈ 7,3 / 10**

#### Calcul pondéré

| Critère | Poids | Note /10 | Sous-total |
|---|---|---|---|
| Justesse calculs | 25 % | 8 | 20,0 |
| Lisibilité + 2 sec | 20 % | 8,5 | 17,0 |
| Pertinence | 15 % | 9 | 13,5 |
| Moyenne profils | 20 % | 7,3 | 14,6 |
| Carte de visite | 10 % | 6 | 6,0 |
| Équilibre fiscalité | 5 % | 8 | 4,0 |
| Personnalisation | 5 % | 9 | 4,5 |
| **Total** | **100 %** | — | **79,6 / 100 ≈ 80** |

#### Verdict

- **Note cible = 79,6 / 100 — on est À LA FRONTIÈRE du seuil 80 🟢**, sans le franchir clairement.
- **Pour franchir 80 sans ambiguïté**, il manque :
  1. **P2.1 (mode présentation)** — fait passer « carte de visite » de 6 à 8 → **+1 point pondéré** → total **80,6 / 100 ✅**
  2. Alternative : P2.4 (allocation sectorielle/géographique sur Dashboard) — fait passer la moyenne profils de 7,3 à 7,6 → **+0,6 point** → total **80,2 / 100 ✅** (mais bénéfice moins large).
- **Recommandation** : promouvoir **P1.3 + P1.4 + P2.1** en P0 pour livrer une refonte à **80,6 / 100 🟢 « Solide »**. Coût additionnel estimé : +6 j (P1.3 ~3 j, P1.4 ~2 j, P2.1 ~3 j) → total P0 redimensionné ≈ **45 j (≈ 9 semaines temps plein, ≈ 4,5 mois mi-temps)**.

#### Effort additionnel détaillé

| ID | Tâche | Effort | Marge | **Total** |
|---|---|---|---|---|
| P1.3 → P0.11 | Affichage conditionnel par profil | 2,5 j | +0,5 j | **3,0 j** |
| P1.4 → P0.12 | Benchmark MSCI ACWI/World sur évolution | 1,5 j | +0,5 j | **2,0 j** |
| P2.1 → P0.13 | Mode présentation | 2,5 j | +0,5 j | **3,0 j** |
| **Sous-total promotions** | | | | **8,0 j** |
| **Nouveau total P0 (39 + 8)** | | | | **≈ 47 j** |

### 5.5 Validation du découpage en 3 vagues

#### Évaluation du découpage proposé

**Verdict global : ✅ pertinent, avec 2 ajustements à appliquer.**

| Vague | Tâches proposées | Évaluation | Ajustement |
|---|---|---|---|
| **V1 — Fondations techniques** | P0.10 → P0.1 → P0.2 + P0.3 + P0.4 | ✅ ordre correct. Tests d'abord = filet de sécurité ; pipeline unique avant fixes calculs car les fixes appliqués au mauvais pipeline seraient à refaire. | **Ajouter P0.6 (taxonomie d'allocation)** dans V1 : c'est une refonte des constantes (`ASSET_TYPE_LABELS`, `ASSET_CLASS_LABELS`) qui doit être déployée atomiquement avec les calculs, pas en milieu de refonte visuelle. |
| **V2 — Refonte visuelle** | P0.9 + P0.8 + P0.5 + P0.6 + Zone 6 + Zone 7 | ✅ cohérent. | **Retirer P0.6** (déplacée en V1). **Ajouter P0.13 (mode présentation)** si promu — sinon V2 reste tel quel + couvre les Zones 6 et 7. |
| **V3 — Différenciateurs** | P0.7 + P1.3 + P1.2 | ✅ logique : tâches à plus forte valeur perçue arrivent en dernier, après stabilisation. | **Ajouter P0.12 (benchmark MSCI)** si promu. P1.2 (sélecteur fenêtre) reste OK. |

#### Découpage final recommandé

| Vague | Tâches | Total jours | Livrable utilisateur visible ? |
|---|---|---|---|
| **V1 — Fondations techniques** | P0.10, P0.1, P0.2, P0.3, P0.4, P0.6 | **22 j** | ❌ (les chiffres sont justes mais l'UI ne change pas) — déployable en silence |
| **V2 — Refonte visuelle** | P0.5, P0.8, P0.9, Zone 6 fiscal compacte, Zone 7 rappel FIRE, [P0.13 si promu] | **11 j (+3 si P0.13)** | ✅ (refonte visible) |
| **V3 — Différenciateurs** | P0.7, P1.2, [P0.11 + P0.12 si promus] | **5,5 j (+5 si promus)** | ✅ (haute valeur perçue) |

#### Livrabilité indépendante de chaque vague

| Vague | Commitable / déployable indépendamment ? | Conditions |
|---|---|---|
| **V1** | ✅ **OUI** | Les calculs serveur changent, l'UI est inchangée. L'utilisateur ne voit (idéalement) aucune différence — sauf correction silencieuse de chiffres erronés. **Déploiement sans préavis utilisateur acceptable.** |
| **V2** | ✅ **OUI**, mais à coupler à une communication produit | Refonte visible. L'utilisateur va remarquer le changement de hiérarchie. **Préparer un onboarding « Découvre ton nouveau Dashboard »** côté UI (modal d'introduction, première visite). |
| **V3** | ✅ **OUI** | Les différenciateurs sont des ajouts non-bloquants. Chaque tâche (P0.7, P1.2, P0.11, P0.12) peut être livrée séparément en sous-mini-vagues. |

**Stratégie commit recommandée** : 1 PR par tâche P0 (atomiques), regroupées en releases par vague. Permet de rollback granulaire si une tâche pose problème en prod.

#### Dépendances cachées à surveiller

| Dépendance | Vague impactée | Mitigation |
|---|---|---|
| **P0.5 (top consolidé) suppose des `financial_envelopes` peuplées** — pour un utilisateur qui n'a pas créé d'enveloppes, le top retombe sur les positions atomiques. | V2 | Fallback : si `envelope_id IS NULL` sur ≥ 50 % des positions, agréger par `asset_class` au lieu de par enveloppe. Documenter dans le code. |
| **P0.7 (TWR) dépend du moteur transactions construit en P0.3** — si V3 démarre alors que P0.3 a été repoussée, blocage. | V1 → V3 | Verrouiller que P0.3 est fait en V1 dans l'ordre proposé. **Aucune flexibilité** sur ce point. |
| **P0.6 (taxonomie unique) impacte le donut V2 ET le KpiGrid V1** — si déployée en V2 seule, le KpiGrid V1 affichera l'ancienne taxonomie pendant la fenêtre inter-vagues. | V1 ↔ V2 | **C'est pourquoi P0.6 doit être en V1** (cf. ajustement ci-dessus). |
| **P0.1 (pipeline unique) impacte les calculs consommés par TOUS les widgets** — si V1 plante en cours de bascule (étape 3 de la migration progressive), tous les chiffres Dashboard sont à risque. | V1 | Gérer le feature flag jusqu'à la fin de V1, ne lever qu'après confirmation de stabilité 100 % trafic. |
| **P0.13 (mode présentation, si promu)** suppose que la refonte hiérarchique V2 est en place — masquer des données sensibles dans l'ancien layout est moins propre. | V2 → V3 | Si promu, le placer en fin de V2 ou début de V3. |
| **Migrations SQL** : aucune des tâches P0 ne nécessite une migration Supabase (les tables existantes sont suffisantes). ✅ pas de dépendance avec la rituel CLI manuelle. | — | RAS. |

### 5.6 Disclaimer Profil 6 — Haut patrimoine complexe

> **Confirmation noir sur blanc.**

1. **Le profil HNW complexe (Profil 6) ne sera pas correctement couvert par cette refonte Dashboard.** Il restera structurellement mal servi tant que le modèle de données Fynix ne supporte pas :
   - **Entités juridiques** (SCI, holding, SARL de famille, SAS) — table `legal_entities` + lien `assets.entity_id` à créer.
   - **Démembrement** (nu-propriété / usufruit) — colonnes `dismemberment_type`, `dismemberment_share` sur `assets` ou table dédiée.
   - **Valorisation non cotée** (DCF, multiple PER, dernière levée) — table `private_valuations` à créer.
   - **Fiscalité spécifique** (IS, CFE, CVAE, intégration fiscale, Dutreil) — moteur fiscal à étendre.

2. **Ces refontes (P2.2 + P2.3) sont des chantiers indépendants du Dashboard.** Elles concernent le modèle de données, les pages /portefeuille et /immobilier, le moteur fiscal et l'aggregateur — pas l'écran Dashboard lui-même. Estimation très grossière : **30-60 jours-homme par chantier**, hors scope du présent audit.

3. **Le Dashboard refondu (P0 + promotions P1.3/P1.4/P2.1) reste utilisable mais incomplet pour ce profil.**
   - **Utilisable** : l'utilisateur HNW voit correctement ses biens immo, ses positions cotées, son cash, son top consolidé, son meilleur/pire en rentabilité.
   - **Incomplet** : il ne verra **pas** ses parts de SCI/holding (sauf à les saisir comme « positions non cotées » avec une valorisation manuelle dans `assets`), pas d'optimisation IS, pas de simulation Dutreil, pas de démembrement. La note 6/10 obtenue pour ce profil en post-refonte (cf. 5.4) reflète cette limite assumée.

4. **Cette limitation NE doit PAS bloquer la livraison de la refonte Dashboard.** Servir correctement les profils 1 à 5 (Débutant → Préretraité) qui couvrent l'écrasante majorité des utilisateurs Fynix vaut beaucoup plus que d'attendre une couverture HNW qui demanderait 4-6 mois de chantier amont supplémentaire.

5. **Communication recommandée envers les utilisateurs HNW** : afficher dans la zone Hero du Dashboard, **conditionnellement** (si patrimoine net > 2 M€ détecté), un badge discret « Fonctionnalités SCI / holding / démembrement à venir — saisis tes parts comme positions non cotées en attendant ». Coût marginal : 0,5 j, à inclure dans P0.11 (conditionnel par profil).

---

## Phase 6 — Journal d'implémentation

### Sprint V1.0 — Filet de sécurité (fixtures + caractérisation) — 2026-05-31

**Objectif :** poser un filet de sécurité avant toute modification du code Dashboard. Capturer l'état actuel des calculs sur 6 profils-fixtures et préparer la checklist exécutable des spécifications P0.

**Livrables (18 fichiers nouveaux, 0 modification du code de production) :**

| Catégorie | Fichier | Rôle |
|---|---|---|
| Types | `lib/analyse/__tests__/dashboard-v1/fixtures/types.ts` | Interfaces `DashboardFixture`, `DashboardAssetRow`, `PortfolioSummaryFixture`, etc. |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/debutant.fixture.ts` | Profil 1 — 15 k€, Livret A + PEA naissant |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/investisseur-immo.fixture.ts` | Profil 2 — RP + 3 locatifs, endettement 60 % |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/investisseur-boursier.fixture.ts` | Profil 3 — 160 k€, 80 % financier (déclenche BUG-1) |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/patrimoine-diversifie.fixture.ts` | Profil 4 — 800 k€ net, mix complet |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/preretraite.fixture.ts` | Profil 5 — 1,5 M€, focus revenus passifs |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/hnw-complexe.fixture.ts` | Profil 6 — 3,1 M€ (proxies SCI/holding, déclenche BUG-1) |
| Fixtures | `lib/analyse/__tests__/dashboard-v1/fixtures/index.ts` | `ALL_FIXTURES` + ré-exports |
| Test | `lib/analyse/__tests__/dashboard-v1/dashboard-caracterisation.test.ts` | 48 assertions de caractérisation + 7 TODOs cible refonte |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/patrimoineBrutMV.test.ts` | P0.2 — 6 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/patrimoineNet.test.ts` | P0.1/P0.2 — 8 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/patrimoineNetNegatif.test.ts` | Edge case — 5 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/cashFlowImmoLabel.test.ts` | P0.4 + P1.1 — 7 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/twrPortefeuille.test.ts` | P0.3 TWR — 7 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/twrAvecApports.test.ts` | P0.3 divergence — 4 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/croissancePatrimoineCAGR.test.ts` | P0.3 rename — 6 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/topConsolide.test.ts` | P0.5 — 7 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/meilleurInvestParClasse.test.ts` | P0.7 — 7 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/filtreAnciennete90j.test.ts` | P0.7 filtre — 6 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/allocationTaxonomie.test.ts` | P0.6 — 10 TODOs |
| Spec | `lib/analyse/__tests__/dashboard-v1/specs/pipelineUnique.test.ts` | P0.1 convergence — 9 TODOs |

**Résultat Vitest :** `157 fichiers OK · 2 149 tests passés · 89 TODOs · 0 échec` (durée ≈ 42 s).

**Décisions prises pendant le sprint :**

1. **Approche de caractérisation = replay des formules sur inputs déjà calculés** (plutôt que mock complet de `buildPortfolioFromDb` + `computeRealEstatePortfolio`). Justification : économise ~2 j de mock complexe, capture le même comportement, et reste valable pour la suite quand P0.1 introduira le pipeline unique. Les fixtures fournissent directement le `portfolioSummary` et le `realEstatePortfolio` au format renvoyé par les briques amont.
2. **Fixtures à deux niveaux : `currentBuggy` (état actuel avec bugs) + `expected` (cible refonte)** dans la même structure. Permet à un seul jeu de fixtures de servir à la fois la caractérisation V1 et les futures specs des unités P0.
3. **Profil 6 (HNW) : SCI et holding modélisés en `asset_type='other'` avec valorisation manuelle**, conformément au disclaimer 5.6 — pas d'attente d'un modèle dédié.
4. **Tolérance numérique :**
   - Patrimoine, dette, allocation : `EPS = 0,01 €`
   - Ratios (`debt_ratio`, `confidence_score`) : `EPS = 0,05-0,1 pp`
   - CAGR : `EPS = 0,1 pp` (compense les arrondis successifs `Math.pow`/`ln`)
5. **Ordre des `describe.each`** sur la suite de caractérisation = ordre du rapport Phase 2 (debutant → hnw-complexe), pour faciliter la lecture des sorties.

**Correctifs en cours de sprint :**
- Fixture `investisseur-boursier` : valeur CAGR initialement calculée à la main à 10,86 %. La valeur exacte est 10,97 % (vérifiée via Node `Math.pow(160000/152000, 1/0.4928) − 1`). Corrigée à 10,97 % avant commit.

**Points ouverts / questions à valider avant V1.1 :**

1. **Top consolidé — agrégation des livrets** : faut-il regrouper « Livret A + LDDS + LEP » en une seule ligne « Livrets réglementés », ou les laisser séparés (cohérent avec l'UX `/cash` actuel) ? Décision provisoire dans `topConsolide.test.ts` : **séparés**. À valider produit.
2. **Convention « Top consolidé » sur le PEA d'un débutant** : la fixture débutant n'a qu'une seule position dans le PEA. Faut-il l'agréger sous l'étiquette « PEA » (cohérence) ou afficher directement le nom de l'ETF (densité d'info) ? Décision provisoire : **toujours par enveloppe** (cohérence forte). À valider.
3. **`currentBuggy.topAssetsByValue` ex æquo** : la fixture `investisseur-boursier` a 3 positions à 15 000 € chacune. Le tri stable de JavaScript renvoie celle insérée en premier, mais cette stabilité dépend du moteur. Si un futur passage de Node casse cet ordre, le test caractérisation va ré-échouer sur le 5ᵉ rang. **Mitigation à prévoir :** rendre le tri déterministe via un tie-breaker explicite (`id` croissant) dans `dashboardPipeline.ts` (P0.1).
4. **Profil 6 — actualisation valorisations SCI/holding** : `last_valued_at` à `2025-12-01` (6 mois). Le seuil de 30 jours du dashboard va déclencher une alerte `stale_data`. C'est représentatif du vrai usage HNW (valorisations annuelles ou semestrielles), mais il faut s'assurer qu'on n'envoie pas une alerte de panique systématique pour ce profil. À traiter dans P0.11 (conditionnel par profil) — bien tagged.
5. **`/api/dashboard`** : endpoint 4ᵉ pipeline non utilisé par la page. Confirmé code mort dans Phase 1.2 du rapport. À supprimer en V1.P0.1 étape 4. Pas bloquant pour V1.0.

**Ce qui n'a PAS été fait (et c'est voulu) :**

- Aucun fichier de code de production modifié.
- Aucun helper `dashboardPipeline.ts` créé — c'est P0.1.
- Aucun mock de `buildPortfolioFromDb` ou `computeRealEstatePortfolio` (cf. décision 1).
- Pas de fixture pour profils edge case « patrimoine 0 » ou « net négatif » : ils sont gérés par `patrimoineNetNegatif.test.ts` (squelette) sans avoir besoin d'un 7ᵉ profil dédié.

**Prochaine étape recommandée (V1.1) :** P0.1 — **Pipeline unique sous feature flag**, étape 1 du plan de migration progressive (Phase 5.3). Coût estimé : ~2 j. Critères de validation : type-check OK, compilation propre, `pipelineUnique.test.ts` activé sur les 6 fixtures (en parallèle de l'ancien pipeline).

---

### Sprint V1.1 — Pipeline unifié sous feature flag — 2026-05-31

**Objectif :** consolidation architecturale. Extraire les calculs du bloc inline `dashboard/page.tsx:207-367` dans un module pur testable, sans corriger les bugs et sans toucher au visuel utilisateur.

**Livrables (6 fichiers nouveaux + 1 fichier test V1.0 activé) :**

| Fichier | Rôle |
|---|---|
| `lib/feature-flags.ts` | Helper `isUnifiedDashboardPipelineEnabled({ cookieValue })` — cookie > env > défaut (false en prod, true ailleurs) |
| `lib/feature-flags.test.ts` | 11 assertions sur les 3 niveaux de priorité (cookie / env / défaut) |
| `lib/analyse/dashboard-pipeline/types.ts` | Interfaces `DashboardData`, `DashboardPipelineInputs`, `DashboardKpis`, etc. |
| `lib/analyse/dashboard-pipeline/calc.ts` | `computeDashboardData(inputs)` — fonction pure, reproduction stricte du bloc inline + tie-breaker `id` |
| `lib/analyse/dashboard-pipeline/load.ts` | `loadDashboardInputs(supabase, userId)` — wiring Supabase (assets/debts/snapshots + buildPortfolioFromDb + computeRealEstatePortfolio) |
| `lib/analyse/dashboard-pipeline/index.ts` | Point d'entrée `buildDashboardData(supabase, userId)` + ré-exports types |
| `lib/analyse/__tests__/dashboard-v1/specs/pipelineUnique.test.ts` | **Activé** (squelette V1.0 remplacé) — 84 assertions de convergence sur les 6 fixtures + idempotence + tie-breaker |

**Architecture du pipeline (mini-diagramme) :**

```
                  ┌──────────────────────────────────┐
buildDashboardData│                                  │
  (supabase,      │  loadDashboardInputs             │
   userId)        │  ─ assets        (Supabase)      │
       │          │  ─ debts         (Supabase)      │
       ▼          │  ─ snapshots     (Supabase)      │ → DashboardPipelineInputs
                  │  ─ buildPortfolioFromDb()        │
                  │  ─ computeRealEstatePortfolio()  │
                  └──────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────┐
                  │  computeDashboardData (pure)     │
                  │  ─ KPIs (brut, net, dette, CF…) │
                  │  ─ allocation (donut)            │
                  │  ─ topAssets (avec tie-breaker)  │
                  │  ─ timeline (snapshots → ASC)    │ → DashboardData
                  │  ─ alerts                        │
                  │  ─ realEstateDriftSummaries      │
                  └──────────────────────────────────┘
```

**Résultat tests :** `159 fichiers OK · 2 233 tests passés · 89 TODOs · 0 échec` (durée ≈ 42 s). `tsc --noEmit` silencieux. `npm run build` ✅. `/dashboard` bundle inchangé à 7,53 kB (le pipeline n'est pas branché).

**Décisions techniques prises pendant le sprint :**

1. **Stratégie d'équivalence par transitivité.** Plutôt que de réimplémenter une 3ᵉ copie des formules dans `pipelineUnique.test.ts` (l'« ancien pipeline » à comparer), on s'appuie sur les valeurs `currentBuggy` des fixtures, dont la V1.0 a déjà prouvé qu'elles égalaient la sortie de l'ancien pipeline (48 assertions vertes). On a donc : `nouveau == currentBuggy` ⇒ `nouveau == ancien`. Économie de ~150 lignes de test dupliquées et zéro risque de divergence d'implémentation entre 2 copies des mêmes formules.
2. **Pureté du calc** — `computeDashboardData` est strictement pure (pas de I/O, pas de Date.now() local — sauf `new Date()` pour le seuil `stale_data` à 30 j, qui reproduit fidèlement le bloc inline). Permet la testabilité directe sans mock Supabase et garantit l'idempotence.
3. **Imports de constantes UI** — `ASSET_TYPE_LABELS`, `ASSET_TYPE_COLORS`, `ASSET_CLASS_LABELS`, `ASSET_CLASS_COLORS` sont importés depuis `lib/utils/format` dans le calc.ts (comme le fait page.tsx). Ce sont des records purs ; pas de problème de pureté.
4. **Tie-breaker `id` sur le top et l'allocation** — ajouté comme deuxième clé de tri (`|| a.id.localeCompare(b.id)` et `keyA.localeCompare(keyB)` pour l'allocation). Validé en V1.0 : sur la fixture boursier (3 ex æquo à 15 000 €), l'ordre alphabétique coïncide avec l'ordre d'insertion actuel, donc aucune divergence observable, mais l'ordre devient robuste à un changement d'insertion futur.
5. **Force boolean sur `incompleteData`** — `PropertySimResult.simulation.incompleteData` peut être `undefined` côté `computeRealEstatePortfolio`. Le bloc inline le traite comme falsy (`!p.simulation.incompleteData`). Dans `load.ts`, on applique `!!p.simulation.incompleteData` pour rester strict sur le typage `DashboardData` sans dévier comportementalement.
6. **Tests `feature-flags` via `vi.stubEnv`** — `process.env.NODE_ENV` est non-configurable depuis Node ≥ 20 (sécurité). On utilise `vi.stubEnv` qui gère ce cas proprement avec restauration automatique.
7. **L'assertion « somme des % d'allocation = 100 » a été déplacée en TODO V1.2** — elle ne peut pas tenir tant que BUG-1 (brut hybride) est en place : le donut couvre seulement la MV, mais le grossValue compte aussi les CB des positions non valorisées. Sur les fixtures boursier et HNW, la somme actuelle = 98,1 % et 97,2 % respectivement — c'est cohérent avec le bug. Remplacée par un invariant de construction (somme des valeurs = somme des assets positifs + somme allocationByClass) qui passe sur les 6 fixtures.

**Résultats de convergence par fixture (nouveau pipeline vs `currentBuggy`) :**

| Profil | KPI grossValue | KPI netValue | KPI debt_ratio | CF mensuel | CAGR | Confidence | Top types | Alloc keys |
|---|---|---|---|---|---|---|---|---|
| Débutant | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ null | ✓ 0 pp | ✓ | ✓ |
| Immo | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ < 0,1 pp | ✓ 0 pp | ✓ | ✓ |
| Boursier | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ < 0,1 pp | ✓ 0 pp | ✓ (5ᵉ rang = p-eur, tie-breaker validé) | ✓ |
| Diversifié | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ < 0,1 pp | ✓ 0 pp | ✓ | ✓ |
| Préretraité | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ < 0,1 pp | ✓ 0 pp | ✓ | ✓ |
| HNW complexe | ✓ 0 € | ✓ 0 € | ✓ 0 pp | ✓ 0 € | ✓ < 0,1 pp | ✓ 0 pp | ✓ | ✓ |

**Divergence : zéro centime, zéro pp.** L'écart CAGR (< 0,1 pp) reflète les arrondis `Math.pow` successifs et tombe largement dans la tolérance épsilon prévue par les fixtures elles-mêmes.

**Divergences résiduelles : aucune.**

**Points ouverts pour V1.2 :**

1. **Branchement du pipeline sur `dashboard/page.tsx`** : reporté en V1.4 (cf. plan 5.3 étape 3). En V1.2 on attaque les corrections de calculs dans le module isolé, sans encore exposer à l'utilisateur. **Question à valider** : préfères-tu (a) faire les corrections P0.2/P0.4/P0.6 d'abord (V1.2), puis P0.3 TWR (V1.3), puis branchement (V1.4) ; ou (b) brancher dès V1.2 le pipeline derrière le flag (en mode A/B silencieux côté serveur, pas d'effet utilisateur) pour exercer la chaîne complète plus tôt ? Recommandation : **(a)**, plus orthogonal.
2. **Sur l'allocation, faut-il garder l'invariant trivial actuel** (somme valeurs = somme inputs positifs) ou la retirer carrément et compter sur les tests P0.6 V1.2 ? Décision provisoire : **garder** comme garde-fou minimal anti-régression du calc.
3. **Endpoint `/api/dashboard` mort** : confirmé non utilisé par la page mais pas encore supprimé. À traiter en V1.4 (étape 4 du plan de migration). Pas bloquant.
4. **Stale data — fixture HNW** : les valorisations SCI/holding à `2025-12-01` déclenchent bien `stale_data: 3 actif(s) non valorisé(s) depuis +30 jours` sur cette fixture. C'est intentionnel pour matérialiser le besoin P0.11 (affichage conditionnel pour atténuer cette alerte sur le profil HNW). Pas une régression.

**Ce qui n'a PAS été fait (volontairement) :**

- `dashboard/page.tsx` non modifié — le bloc inline reste autoritaire pour l'utilisateur.
- Aucune correction de bug — BUG-1 à BUG-6 reproduits à l'identique dans le nouveau pipeline.
- Pas de migration SQL (confirmé : aucune n'était nécessaire).
- Pas de branchement sur la page — le pipeline est dormant, exécuté uniquement par les tests.

**Prochaine étape recommandée (V1.2) :** P0.2 (brut MV strict + badge positions non valorisées) + P0.4 (rename CF immobilier) + P0.6 (taxonomie unifiée d'allocation). Coût estimé : ~6 j. Critères de validation : tests `patrimoineBrutMV.test.ts`, `cashFlowImmoLabel.test.ts`, `allocationTaxonomie.test.ts` activés et verts ; le test `pipelineUnique.test.ts` voit ses TODOs V1.2 décommentés et passant.

---

### Sprint V1.2 — Corrections P0.4 + P0.2 + P0.6 — 2026-05-31

**Objectif :** corriger les 3 bugs « simples » dans le pipeline isolé, sans toucher au bloc inline (qui reste autoritaire pour l'utilisateur jusqu'à V1.4). Faire diverger volontairement le nouveau pipeline de l'ancien sur les KPIs corrigés, en conservant la convergence sur les autres.

**Récapitulatif par sous-tâche :**

| Sous-tâche | Fichiers touchés | Fichiers ajoutés |
|---|---|---|
| **P0.4** — rename CF immobilier | `lib/analyse/dashboard-pipeline/types.ts` (clé `cash_flow_immo_y1` + label) ; `lib/analyse/dashboard-pipeline/calc.ts` (return des 2 champs) ; `lib/analyse/__tests__/dashboard-v1/specs/cashFlowImmoLabel.test.ts` (activé) ; `lib/analyse/__tests__/dashboard-v1/specs/pipelineUnique.test.ts` (assertion mise à jour) | — |
| **P0.2** — brut MV strict + badge | `types.ts` (champs `unvaluedPositions*`) ; `calc.ts` (suppression du proxy CB + comptage non valorisées + label formaté) ; `pipelineUnique.test.ts` (gross/net/debt_ratio/confidence basculent sur expected) ; `patrimoineBrutMV.test.ts` (activé) | — |
| **P0.6** — taxonomie allocation | `types.ts` (slice `{ key, label, valueEur, percent, color }` + `allocationBase` + `allocationTotal`) ; `calc.ts` (refonte complète de la section allocation + alerte `over_exposure` qui consomme `TAXONOMY_LABELS`) ; les 6 fichiers fixtures (renommage `allocationCanonical` → `allocation` + ajout `key`, mappage `fonds_euros` → `obligations`) ; `pipelineUnique.test.ts` (assertion allocation bascule, somme % = 100 décommentée) ; `allocationTaxonomie.test.ts` (activé) | `lib/finance/asset-taxonomy.ts` + `lib/finance/__tests__/asset-taxonomy.test.ts` |

**Résultat tests :** `163 fichiers OK · 2 343 tests passés · 65 TODOs · 0 échec` (52 s). `tsc --noEmit` silencieux. `npm run build` ✅. `dashboard/page.tsx` confirmé **intact** (zéro ligne dans `git diff`).

**Tableau de convergence mis à jour (KPIs nouveau pipeline vs ancien) :**

| KPI | Débutant | Immo | Boursier | Diversifié | Préretraité | HNW | Régime d'assertion |
|---|---|---|---|---|---|---|---|
| `gross_value` | = | = | **÷ (3 000 €)** | = | = | **÷ (100 000 €)** | `== expected` |
| `net_value` | = | = | **÷ (3 000 €)** | = | = | **÷ (100 000 €)** | `== expected` |
| `debt_ratio` | = | = | = (0) | = | = | **÷ (9,86 → 10,14)** | dérivé du brut strict |
| `confidence_score` | = | = | **÷ (98,13 → 100)** | = | = | **÷ (18,31 → 18,84)** | dérivé du brut strict |
| `cash_flow_immo_y1` | = | = | = | = | = | = | `== currentBuggy` (rename seul) |
| `cash_flow_immo_y1_label` | nouveau | nouveau | nouveau | nouveau | nouveau | nouveau | string littéral |
| `cagr` | = | = | = | = | = | = | `== currentBuggy` |
| `allocation.keys` | basculé | basculé | basculé | basculé | basculé | basculé | `== expected.allocation` |
| `topAssets` | = | = | = | = | = | = | `== currentBuggy` (V1.3 P0.5 plus tard) |

Légende : `=` = convergence préservée avec l'ancien · **÷** = divergence volontaire vers `expected` · `nouveau` = champ introduit par V1.2.

**Mapping taxonomie (P0.6) :**

| Source | Clé d'origine | Clé taxonomie cible | Notes |
|---|---|---|---|
| `asset_type` | `real_estate` | `immobilier_physique` | RP + locatifs |
| `asset_type` | `cash` | `cash` | livrets, comptes courants |
| `asset_type` | `other` | `autres` | proxy SCI/holding en attendant P2.2 |
| `asset_class` | `etf` | `etf` | UCITS ETF tous types |
| `asset_class` | `actions` / `action` | `actions` | titres individuels |
| `asset_class` | `obligations` / `obligation` | `obligations` | obligations directes |
| `asset_class` | **`fonds_euros`** | **`obligations`** | **ambiguïté assumée** — majoritairement obligataire (>70 % typiquement), perte de la nuance « capital garanti » non pertinente pour répartition par classe |
| `asset_class` | `scpi` | `scpi` | |
| `asset_class` | `crypto` | `crypto` | |
| `asset_class` | `cash` | `cash` | rare côté positions |
| `asset_class` | `or` / `metaux` / `gold` | `or_metaux` | aucune fixture actuelle |
| `asset_class` | inconnu | `autres` | fallback safe (jamais d'erreur) |

**Effets collatéraux observés :**

1. **L'invariant trivial sur l'allocation est devenu plus pertinent** — En V1.1 il prouvait juste que `sum(allocation.value) = sum(inputs)`. En V1.2 avec P0.2, sur les fixtures sans BUG-1, on a aussi `sum = grossValue`. Sur Boursier/HNW, on a `sum = grossValueMVStrict = grossValue corrigé`. L'invariant tient toujours **et** la propriété forte « somme % = 100 » a pu être réactivée (déTODO).
2. **L'alerte `over_exposure` consomme maintenant `TAXONOMY_LABELS`** — auparavant `ASSET_TYPE_LABELS[type] ?? type`. Sur Immo (immobilier 94,68 %), le message devient `« Sur-exposition Immobilier : 95 % du patrimoine »` (label canonique au lieu de la clé brute `asset:real_estate`). Effet de bord positif sur l'UX, mais c'est uniquement visible dans le pipeline isolé — la page Dashboard utilise toujours l'ancienne alerte jusqu'à V1.4.
3. **`ASSET_TYPE_LABELS` n'est plus importé** dans `calc.ts` — purge naturelle d'une dépendance désormais redondante. `ASSET_TYPE_COLORS`, `ASSET_CLASS_LABELS`, `ASSET_CLASS_COLORS` également supprimés des imports.
4. **Fixtures `expected.allocation` renommées + recalibrées** — toutes les 6 fixtures ont vu leur champ `expected.allocationCanonical` renommé `expected.allocation` avec le shape `{ key, label, valueEur, percent }`. Le mapping `fonds_euros → obligations` a fusionné des slices auparavant séparés (visible sur Diversifié, Préretraité, Immo). Total cohérent à 100 % sur les 6 profils.
5. **Aucun impact sur le test de caractérisation V1.0** — `dashboard-caracterisation.test.ts` ne consomme PAS `computeDashboardData` du pipeline (il a sa propre fonction interne `computeDashboardFromFixture` qui reproduit l'ancienne formule statique). Il reste 100 % vert, ce qui prouve formellement que **l'ancien pipeline n'a pas bougé**.

**Décisions techniques majeures (4) :**

1. **Mapping `fonds_euros` → `obligations`** au lieu d'introduire une 10ᵉ clé `fonds_euros`. Argument : la taxonomie cible doit refléter le **risque économique**, pas le **wrapper fiscal**. Un fonds euros à 99 % d'obligations souveraines reste de l'obligataire. La nuance « capital garanti » est pertinente côté `/cash` ou `/portefeuille`, pas dans le donut Dashboard. Coût d'inversion futur faible si demande utilisateur.
2. **Format du label `unvaluedPositionsLabel` calculé côté pipeline** (et non côté composant UI). Permet de garder le composant React simple (consommation d'une string) et d'avoir le formatage testable une seule fois. Le composant peut toujours ignorer ce label et reformater à partir des champs numériques s'il le souhaite.
3. **`Map<TaxonomyKey, number>` au lieu de `Record<string, ...>`** pour l'agrégation par taxonomie dans `calc.ts`. Plus type-safe (clé garantie d'être une `TaxonomyKey`), itération déterministe sur l'ordre d'insertion (utile pour debug).
4. **Critère « MV null »** pour comptage des non valorisées, **pas `priceStale`**. Une position avec un prix de la veille mais frais à 25 h reste valorisée — c'est une question d'âge, pas d'absence. Le critère MV null = vraie absence d'information. Aligné sur le futur badge P1 qui pourra distinguer les 2 (« 1 obsolète + 1 inconnue »).

**Points ouverts pour V1.3 (P0.3 TWR + Croissance séparés) :**

1. **Construction du moteur TWR** — emplacement proposé : `lib/finance/twr.ts` (logique financière pure) + `lib/portfolio/transaction-segments.ts` (assemblage des segments depuis la table `transactions`). Le TWR opère sur des positions financières (table `positions`), pas sur l'agrégateur global.
2. **Source de transactions** — `transactions` table append-only (cf. Phase 5.2). Fallback `acquisition_date` + `average_price * quantity` pour les positions legacy.
3. **Format dans `DashboardKpis`** — remplacer `cagr: number | null` par 2 champs distincts : `twr_portefeuille_pct: number | null` (vraie performance, exclut apports) et `croissance_patrimoine_pct: number | null` (apports inclus, label explicite). Bonus : ajouter `twr_window: '3M' | '6M' | '1A' | '3A' | 'max'` pour préparer P1.2.
4. **Fixtures** — ajouter `expected.twr_pct` + `expected.croissance_patrimoine_pct` aux 6 fixtures. La fixture diversifié servira de fixture phare pour matérialiser la divergence (CAGR 6,73 % apports inclus vs TWR ≈ +2-3 % réel).
5. **Test de divergence** — `twrAvecApports.test.ts` (squelette V1.0) à activer : vérifier que `twr ≠ cagr` sur les fixtures à apports significatifs, `twr ≈ cagr` sur les fixtures sans apport.
6. **Sélection de la fenêtre temporelle (P1.2)** — repoussée à V3 si on reste sur le périmètre P0. Décision à prendre : ajouter `windowMonths?: number` en option de `computeDashboardData()` ou réserver pour V3 ? Recommandation : **réserver pour V3**, garder V1.3 sur la base d'une fenêtre fixe (toute l'historique disponible) pour limiter le scope.

**Ce qui n'a PAS été fait (volontairement) :**

- `dashboard/page.tsx` non modifié (vérifié : zéro ligne dans `git diff`).
- Aucun moteur TWR amorcé — scope V1.3.
- Aucune correction du top consolidé (P0.5) — scope V1.3 ou V2.
- Aucune migration SQL (confirmé : pas nécessaire).

**Prochaine étape recommandée (V1.3) :** P0.3 — moteur TWR + Croissance patrimoniale séparés. Coût estimé : ~5 j. Critères de validation : `lib/finance/twr.ts` créé, tests `twrPortefeuille.test.ts` + `twrAvecApports.test.ts` + `croissancePatrimoineCAGR.test.ts` activés et verts, `DashboardKpis` expose 2 champs distincts au lieu de `cagr`.

---

### Sprint V1.3 — P0.3 : TWR + Croissance patrimoniale séparés — 2026-06-01

**Objectif :** corriger BUG-2 en isolant le CAGR trompeur (qui mélange performance et accumulation) en deux indicateurs distincts : un TWR portefeuille (apports neutralisés, vraie performance) + une croissance patrimoniale annualisée (apports inclus, libellée explicitement). Architecture pyramidale : moteur pur testé sur cas pédagogiques, assembleur testé sur mini-fixtures, pipeline dashboard avec 2 fixtures enrichies sur 6.

**Récapitulatif des modifications par sous-tâche :**

| Sous-tâche | Fichiers nouveaux | Fichiers modifiés |
|---|---|---|
| **2** — Moteur TWR pur | `lib/finance/twr.ts` (110 l.), `lib/finance/__tests__/twr.test.ts` (130 l.) | — |
| **3** — Assembleur de segments | `lib/portfolio/transaction-segments.ts` (185 l.), `lib/portfolio/__tests__/transaction-segments.test.ts` (155 l.) | — |
| **4 + 5** — Intégration calc + types | — | `lib/analyse/dashboard-pipeline/types.ts` (+5 champs `DashboardKpis`, +`transactionsPortefeuille?` + `asOfDate?` à `DashboardPipelineInputs`, +`currentQuantity?` / `acquisitionDate?` / `averagePriceEur?` à `DashboardPortfolioPosition`) ; `calc.ts` (suppression `cagrValue`, ajout `computeCroissancePatrimoine` + `computePortefeuilleTwr`, filtrage positions tracées) |
| **6** — Calibration fixtures | — | 6 fixtures (4 vides : `transactionsPortefeuille: []` + `asOfDate` + `expected.twr_portefeuille_pct: null` + `expected.croissance_patrimoine_pct: …` ; 2 enrichies : transactions documentées + calcul TWR manuel en commentaire) ; `fixtures/types.ts` (alignement `PortfolioPositionFixture` + `DashboardFixture.inputs`) |
| **7** — Tests Annexe A | — | `twrPortefeuille.test.ts` (activé) ; `twrAvecApports.test.ts` (activé, assertions pédagogiques) ; `croissancePatrimoineCAGR.test.ts` (activé) ; `pipelineUnique.test.ts` (suppression refs `cagr`, ajout TWR + Croissance basculés sur `expected`) |

**Résultat tests :** `168 fichiers OK · 2 412 tests passés · 48 TODOs · 0 échec` (48 s). `tsc --noEmit` silencieux. `npm run build` ✅. `dashboard/page.tsx` **strictement intact**.

**Mini-tableau « historique transactions par fixture » :**

| Fixture | # transactions | Plage temporelle | Position(s) tracée(s) | Couverture du TWR |
|---|---|---|---|---|
| Débutant | 0 | — | — | `null` + label « Pas assez d'historique » |
| Investisseur immo | 0 | — | — | idem |
| Investisseur boursier | 0 | — | — | idem |
| **Patrimoine diversifié** | **3** (toutes `purchase`) | 2025-01-01 → 2025-12-01 | p-pea-1 (ETF World PEA) | +9,50 %/an sur 514 j |
| **Préretraité** | **2** (toutes `purchase`) | 2024-06-01 → 2025-06-01 | p-av-fe (Fonds Euros AV BPCE) | +4,46 %/an sur 728 j |
| HNW complexe | 0 | — | — | `null` + label « Pas assez d'historique » |

**Tableau de convergence mis à jour (V1.3) :**

| KPI | Débutant | Immo | Boursier | Diversifié | Préretraité | HNW | Régime |
|---|---|---|---|---|---|---|---|
| `twr_portefeuille_pct` | `null` | `null` | `null` | **+9,50** | **+4,46** | `null` | `== expected` |
| `croissance_patrimoine_pct` | `null` | +9,17 | +10,97 | +6,73 | +2,06 | +6,78 | `== expected` (= ancien `cagr`) |
| `cagr` | — | — | — | — | — | — | **supprimé du type** |
| Autres KPIs (gross / net / alloc / top / CF / confidence) | inchangés vs V1.2 |

**Tableau de divergence pédagogique (`twrAvecApports.test.ts`) :**

| Fixture | TWR portefeuille | Croissance patrimoine | Écart | Sens | Interprétation |
|---|---|---|---|---|---|
| **Patrimoine diversifié** | **+9,50 %** | **+6,73 %** | **+2,77 pp** | TWR > Croissance | Bon timing des entrées (rachat à 200 € après krach intermédiaire à 220 €). Performance pure dépasse la moyenne pondérée par les apports. |
| **Préretraité** | **+4,46 %** | **+2,06 %** | **+2,40 pp** | TWR > Croissance | Fonds euros sur-performe la moyenne patrimoniale, diluée par les biens immo statiques (RP + locatif). TWR capte la vraie performance financière. |

Direction identique (TWR > Croissance) mais raisons différentes. L'assertion `|TWR − Croissance| > 1 pp` est verrouillée formellement avec un message pédagogique explicite.

**Documentation du calcul manuel — Diversifié :**

Position phare : `p-pea-1`, `currentMv=50 000 €`, `currentQuantity=220`.

- **T1** = 2025-01-01 : `purchase 150 @ 200 €` → 30 000 €. qty après = 150.
- **T2** = 2025-06-01 : `purchase 50 @ 220 €` → 11 000 €. qty après = 200.
- **T3** = 2025-12-01 : `purchase 20 @ 200 €` → 4 000 €. qty après = 220.
- **asOf** = 2026-05-30 : MV = 50 000 € (prix actuel = 50 000 / 220 = 227,27 €).

| Segment | Durée | Start value | End value | Rendement |
|---|---|---|---|---|
| 1 : 2025-01-01 → 2025-06-01 | 151 j | 30 000 € | 33 000 € (= 150 × 220) | +10,00 % |
| 2 : 2025-06-01 → 2025-12-01 | 183 j | 44 000 € (= 33 000 + 11 000) | 40 000 € (= 200 × 200) | −9,09 % |
| 3 : 2025-12-01 → 2026-05-30 | 180 j | 44 000 € (= 40 000 + 4 000) | 50 000 € (MV finale) | +13,64 % |

- TWR cumulé = 1,10 × 0,9091 × 1,1364 − 1 = **+13,64 %**
- totalDays = 514 j (> 365 → `extrapole = false`)
- TWR annualisé = `(1,13636)^(365/514) − 1` ≈ **+9,50 %**

**Documentation du calcul manuel — Préretraité :**

Position phare : `p-av-fe`, `currentMv=300 000 €`, `currentQuantity=275 000`. `costBasis` recalibré 280 000 → 278 000 (= 200 000 + 78 000).

- **T1** = 2024-06-01 : `purchase 200 000 @ 1,00 €` → 200 000 €. qty après = 200 000.
- **T2** = 2025-06-01 : `purchase 75 000 @ 1,04 €` → 78 000 €. qty après = 275 000.
- **asOf** = 2026-05-30 : MV = 300 000 € (prix actuel = 1,0909 €).

| Segment | Durée | Start value | End value | Rendement |
|---|---|---|---|---|
| 1 : 2024-06-01 → 2025-06-01 | 365 j | 200 000 € | 208 000 € (= 200 000 × 1,04) | +4,00 % |
| 2 : 2025-06-01 → 2026-05-30 | 363 j | 286 000 € (= 208 000 + 78 000) | 300 000 € (MV finale) | +4,90 % |

- TWR cumulé ≈ 1,04 × 1,04895 − 1 ≈ **+9,09 %**
- totalDays = 728 j (> 365 → `extrapole = false`)
- TWR annualisé = `(1,0909)^(365/728) − 1` ≈ **+4,46 %**

**Décisions techniques majeures (V1.3) :**

1. **Seuil `extrapole` à 90 j / 365 j** — Sous 90 jours : `null` (annualiser une perf très courte n'a aucune valeur statistique). Entre 90 et 365 jours : valeur **avec flag `extrapole = true`** pour que l'UI ajoute un caveat « estimé sur N jours ». Au-delà : `extrapole = false`. Décision retenue plutôt que « tout ou rien » pour servir les nouveaux utilisateurs sans frustrer.
2. **Dividendes ignorés en V1.3.** Un `dividend` n'est pas un flux externe — il reste dans l'enveloppe (ou est réinvesti). Son impact apparaît mécaniquement via la `currentMvEur` finale. P1.X pourra distinguer dividendes réinvestis vs sortis.
3. **Périmètre TWR : positions tracées uniquement.** Position sans transaction NI fallback → exclue **à la fois** de `finalValue` ET des segments intermédiaires. Bug d'intégration découvert pendant le développement (sans ce filtre, `finalValue` agrégeait des positions non tracées → segment final faussé +332 %).
4. **Fallback legacy via `acquisitionDate` + `averagePriceEur`** — implémenté + testé en mini-fixture, non utilisé par les fixtures dashboard V1.3 (transactions explicites pour les enrichies, exclusion totale pour les autres).
5. **Recalibrage `costBasis` de p-av-fe** (280 000 → 278 000) pour cohérence interne entre transactions et état courant. Aucun test antérieur ne dépendait de cette valeur exacte.

**Edge cases découverts pendant l'implémentation :**

1. **2 transactions à la même date** → 2 events distincts, segment inter-events de durée 0 filtré par `computeTwr`. Comportement correct mais initialement inattendu — une assertion de test a été ajustée.
2. **`asOfDate` identique à la dernière transaction** → aucun segment final (sinon endDate − startDate = 0). Comportement intentionnel.
3. **Position avec `currentMvEur=null`** → exclue de `finalValue`, ses transactions traitées si présentes mais sans impact sur le segment final. Cohérent avec P0.2.
4. **Tri par `executedAt` (chaîne)** via `localeCompare` — déterministe sur ISO `YYYY-MM-DD[Thh:mm:ssZ]`.

**Points ouverts pour V1.4 (bascule + suppression code mort) :**

1. **Branchement du pipeline sur `dashboard/page.tsx`** : modifier le Server Component pour appeler `buildDashboardData(supabase, userId)` derrière le flag `DASHBOARD_UNIFIED_PIPELINE`. Adapter les composants UI consommateurs (KpiGrid, donut, TopAssetsList) pour lire les nouveaux champs.
2. **Composants UI à adapter** (à prévoir comme un sprint V1.4 visuel dédié) :
   - `kpi-grid.tsx` : afficher 2 cartes (TWR + Croissance) au lieu de 1 carte CAGR
   - Donut allocation : consommer la taxonomie canonique
   - Bandeau « N positions non valorisées » conditionnel (P0.2)
   - Label cash-flow renommé (P0.4)
3. **Suppression code mort** (étape 4 du plan migration P0.1) : retrait du bloc inline `dashboard/page.tsx:207-326`, suppression de `/api/dashboard` (4ᵉ pipeline mort), suppression du feature flag une fois la bascule 100 % validée.
4. **`loadDashboardInputs` à étendre** : construire la liste `transactionsPortefeuille` depuis la table `transactions` (append-only) via une requête supplémentaire dans la `Promise.all` actuelle, et alimenter `currentQuantity` / `acquisitionDate` / `averagePriceEur` sur chaque position depuis `positions.average_price` × `positions.quantity` + fallback `positions.acquisition_date`.
5. **Documentation utilisateur** : mini-changelog interne sur la signification des nouveaux KPIs (TWR vs Croissance, badge positions non valorisées, taxonomie d'allocation).

**Ce qui n'a PAS été fait (volontairement) :**

- `dashboard/page.tsx` non modifié (`git diff` vide, vérifié).
- Aucun composant UI touché.
- `loadDashboardInputs` non étendu pour les transactions (sera fait en V1.4 avec la bascule).
- Pas de top consolidé P0.5 (différé après V1.4).
- Pas de migration SQL.

**Prochaine étape recommandée (V1.4) :** bascule + suppression code mort. Coût estimé : ~3-5 j. Critères de validation : flag activé → la page consomme `buildDashboardData()`, chiffres identiques côté utilisateur sur un échantillon de profils, `pipelineUnique.test.ts` continue de passer, `/api/dashboard` supprimé, `dashboard-caracterisation.test.ts` peut être archivé (l'ancien pipeline disparaît).

---

### Sprint V1.4 — Bascule technique + adaptation UI + suppressions — 2026-06-01

**Objectif :** la page Dashboard consomme maintenant le pipeline unifié. KpiGrid adapté (Option B), badge « positions non valorisées » en place, code mort supprimé (bloc inline + `/api/dashboard` + feature flag + test caractérisation). Aucun push ni déploiement (réservé V1.5).

**Décision design pour KpiGrid : Option B retenue.**
4 cartes au lieu de 5 (Net / Brut + badge / CF immo / Performance). Le widget « Performance » place le **TWR portefeuille** en valeur principale (`+X,X %`) et la **croissance patrimoine** en sous-titre (`Patrimoine +Y,Y %/an (apports inclus)`). Si TWR null, le sous-titre porte la raison. Justification : Option B minimise le bouleversement visuel V1.4 (cohérence forte avec la grille 4-cartes historique), réserve la mise en valeur séparée pour V2 (Zone 4 « Performance & évolution »).

**Récapitulatif par sous-tâche :**

| Sous-tâche | Fichiers touchés | Notes |
|---|---|---|
| **1** — Étendre `loadDashboardInputs` | `lib/analyse/dashboard-pipeline/load.ts` (+50 l.) | Ajout requêtes `transactions` + `positions` (méta) dans le `Promise.all`. Mapping `transactionsPortefeuille` (conversion FX inline). `currentQuantity` / `acquisitionDate` / `averagePriceEur` alimentés sur chaque position. `asOfDate = new Date()`. |
| **2** — KpiGrid Option B | `components/dashboard/kpi-grid.tsx` (réécrit) | 4 cartes. Carte « Performance » composite : TWR principal + Croissance en sous-titre. Caveat `· estimé court historique` si `twr_extrapole=true`. Label CF immo dynamique depuis `cash_flow_immo_y1_label`. |
| **3** — Badge positions non valorisées | `components/dashboard/unvalued-positions-badge.tsx` (nouveau, 30 l.) | Chip warning discret en absolute top-right de la carte Brut. Lien vers `/portefeuille`. Conditionnel `count > 0`. |
| **4** — Bascule `dashboard/page.tsx` | `app/(app)/dashboard/page.tsx` (−170 l.) | Remplacement du chargement Promise.all initial (41-92) par 1 appel `loadDashboardInputs`. Suppression du bloc inline 212-381 (calculs + alertes + driftSummaries + assemblage kpis + isEmpty). Aliases `assets`/`snapshots`/`portfolio`/`portfolioSummary` pour préserver le JSX. Cast `as PropertyDriftSummary[]` sur `driftSummaries`. Imports purgés (ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, ASSET_CLASS_LABELS, ASSET_CLASS_COLORS, computeRealEstatePortfolio, buildPortfolioFromDb). |
| **5** — Tests visuels | — | À la charge utilisateur, cf. § « Validation visuelle attendue » plus bas. |
| **6** — Suppressions + reconfig | Suppressions : `app/api/dashboard/route.ts` (−194 l.) · `lib/feature-flags.ts` · `lib/feature-flags.test.ts` · `lib/analyse/__tests__/dashboard-v1/dashboard-caracterisation.test.ts`. Reconfig : `pipelineUnique.test.ts` (commentaire de tête réécrit pour refléter la nouvelle sémantique « test de non-régression du pipeline officiel »). | Le flag a été **complètement supprimé en V1.4** (et non « passé à true en V1.5 » comme initialement envisagé) : `tsc` + `vitest` + `build` valident que rien n'en dépend plus. V1.5 = push + déploiement = activation prod. |

**Vérifications finales :**

- ✅ `npx vitest run` : **166 fichiers · 2 353 tests passés · 41 TODOs · 0 échec**
- ✅ `tsc --noEmit` silencieux
- ✅ `npm run build` ✅ — bundle `/dashboard` **inchangé à 7,53 kB**, route `/api/dashboard` disparue de la liste
- ✅ `git diff --stat` : `app/(app)/dashboard/page.tsx` **+57 −243** · `app/api/dashboard/route.ts` **−194** · `components/dashboard/kpi-grid.tsx` **+70 −36**. Total : **+128 / −458 lignes** (économie nette **−330 lignes** côté code utilisateur)
- ✅ Aucune référence résiduelle à `DASHBOARD_UNIFIED_PIPELINE` ni `cagr` dans le code (hors `auditdashboard.md`)

**Tableau récapitulatif — bugs corrigés visibles à l'écran :**

| Bug | Visible où ? | Manifestation |
|---|---|---|
| **BUG-1** — Brut hybride MV/CB | Carte « Patrimoine brut » + badge | Brut plus bas qu'avant si positions sans prix actualisé. Badge `⚠ N` cliquable en haut-droite. |
| **BUG-2** — CAGR ≠ performance | Carte « Performance » | TWR en valeur principale, croissance patrimoine en sous-titre. Label conditionnel si données insuffisantes. |
| **BUG-3** — Cash-flow trompeur | Carte CF | Label « Cash-flow immobilier (Y1 simulé) » (au lieu de « Cash-flow mensuel »). Valeur numérique inchangée. |
| **BUG-6** — Taxonomie | Pipeline (donut pas affiché en V1.4) | Allocations canoniques produites par le pipeline mais donut masqué depuis la refonte 3-onglets de `/analyse`. V2 le réactivera. |

**BUGs qui restent visibles (scope V2) :** BUG-5 (top atomique), doublon graphe évolution, doublons fiscalité (FiscalKpiBanner XL + CalendrierFiscal).

**Validation visuelle attendue (à charge utilisateur) :**

1. `npm run dev` → ouvrir `/dashboard` sur ton compte
2. **KpiGrid** : les 4 cartes Net / Brut / CF immo / Performance s'affichent
3. **Brut + badge** : si positions sans prix → valeur plus basse + badge `⚠ N` en haut-droite (clic → `/portefeuille`)
4. **Label CF** : « Cash-flow immobilier (Y1 simulé) »
5. **Performance** : TWR principal + Croissance en sous-titre (ou raison si null)
6. Tous les **autres widgets** s'affichent comme avant (aucune régression attendue, page.tsx ne touche pas leur rendu)
7. Si régression visuelle → on revient sur V1.4 AVANT V1.5

**Décisions techniques majeures (V1.4) :**

1. **Suppression du flag dès V1.4** au lieu de le garder pour activation V1.5. Justification : le code unifié devient le chemin par défaut, tester en local = tester la prod. Pas de branche `flag=false` à maintenir. V1.5 = juste push + PR + déploiement.
2. **Réutilisation de `inputs.*` partout** (pas de rappels `computeRealEstatePortfolio` / `buildPortfolioFromDb` séparés). Économie : une passe Supabase au lieu de deux.
3. **Cast `as PropertyDriftSummary[]`** sur les alertes drift. Le pipeline reste découplé de `lib/real-estate/insights` (type `unknown[]` côté pipeline). Cast sûr car les données viennent toujours de `computeRealEstatePortfolio`. Documenté en commentaire.
4. **Composant badge dans un fichier dédié** (`unvalued-positions-badge.tsx`) plutôt qu'inline. Réutilisable + testable.
5. **`pipelineUnique.test.ts` reconfiguré comme test de non-régression** plutôt que supprimé. Il vérifie maintenant `nouveau == fixture.expected` sur tous les KPIs corrigés (sauf topAssets qui reste sur `currentBuggy` jusqu'à P0.5). C'est la digue anti-régression du chantier P0.

**Points ouverts pour V1.5 :**

1. **Git** : créer une branche feature, commiter par bloc thématique (V1.0 fixtures + V1.1 pipeline + V1.2 corrections + V1.3 TWR + V1.4 bascule), pousser.
2. **PR GitHub** : titre + description couvrant V1.0 → V1.4. Joindre les captures de validation visuelle.
3. **Déploiement Vercel** : automatique sur push → preview URL. Validation visuelle sur preview AVANT merge `master`.
4. **Merge** vers `master` → déploiement prod automatique.
5. **Post-déploiement** : monitoring 24-48 h des erreurs serveur sur `/dashboard`.
6. **Communication** : mini-changelog interne (TWR vs Croissance, badge unvalued, label CF immo).

**Ce qui n'a PAS été fait (volontairement) :**

- Aucun push, aucune PR, aucun déploiement (V1.5).
- Aucune refonte visuelle au-delà de l'Option B (V2).
- Donut masqué : taxonomie utilisée par le pipeline mais pas affichée.
- Top atomique inchangé, doublons V2.
- Pas de migration SQL.

**Prochaine étape recommandée (V1.5) :** validation visuelle utilisateur → push + PR + merge + déploiement. Coût estimé : ~0,5 j (essentiellement attente Vercel + monitoring).

---

### V1.4-BIS — Diagnostic décalage observé / code commité — 2026-06-01

**Constat critique de la session** : la validation visuelle locale par l'utilisateur a révélé un Dashboard qui montrait encore l'ancien code (« Performance (CAGR) +132 026 369,70 % », « Cash-flow mensuel », « Sur-exposition asset:real_estate »), alors que les sprints V1.0 → V1.4 étaient annoncés terminés. **Hypothèse validée** : aucune des modifications V1.0 → V1.4 n'avait été commitée. Les fichiers étaient sur le disque mais en statut `M` / `??` côté git. La prod Vercel auto-déployée depuis `master` servait encore le HEAD pré-chantier.

**Diagnostic produit** : 5 investigations (KpiGrid utilisé, origine du +132M %, état réel page.tsx, origine « asset:real_estate », badge unvalued). Le code disque était correct partout, c'est uniquement l'absence de commit qui cassait la chaîne.

**Leçon clé pour la suite** : la suite Vitest valide la fonction pure `computeDashboardData(fixture.inputs)` et le typage page via `tsc`, mais ne valide **pas** :
- Que le code disque est cohérent avec ce qui est commité
- Que le déploiement Vercel utilise bien le code à jour
- Le rendu JSX réel sur des données utilisateur

À l'avenir : **commiter à chaque fin de sprint** sur une branche feature, et utiliser l'URL preview Vercel comme terrain de validation visuelle. Idéalement ajouter un test d'intégration Playwright page-niveau (backlog post-V1).

### V1.4-TER — Mise en cohérence git — 2026-06-01

- Branche `feat/dashboard-pipeline-unifie` créée depuis `master`
- 5 commits atomiques répartis selon le découpage sprint :
  - `e8902bc` — `test(dashboard): V1.0 - 6 fixtures + tests Annexe A`
  - `692a45f` — `feat(dashboard): V1.1 - pipeline unifie en parallele, clone bug-compatible`
  - `2aa5b8e` — `fix(dashboard): V1.2 - taxonomie unifiee + brut MV strict + rename CF immo`
  - `cf17e0f` — `feat(dashboard): V1.3 - moteur TWR separe de la croissance patrimoniale (P0.3)`
  - `6ef4a3a` — `refactor(dashboard): V1.4 - bascule UI sur pipeline unifie + suppression code mort`
- Limitation honnête signalée : `calc.ts` + `types.ts` créés en bloc untracked → tout dans le commit V1.1 (impossible de scinder via `git add -p`). Mention explicite dans les messages des commits V1.1 et V1.2.
- Modification mineure non-fonctionnelle pour passer le hook `eslint --max-warnings 0` : retrait d'un import `type DashboardFixture` inutilisé dans `pipelineUnique.test.ts` (1 ligne, zéro impact fonctionnel).
- Push `git push -u origin feat/dashboard-pipeline-unifie` réussi → URL preview Vercel `fynix-git-feat-dashboard-pipel-411e64-aymeric22-coders-projects.vercel.app`.

### Nettoyage snapshots Supabase — 2026-06-01

- Audit des `wealth_snapshots` du compte utilisateur via MCP Supabase
- **Constat** : aucun snapshot aberrant. 6 snapshots cohérents entre 78 k€ et 134 k€ sur 14 jours (17 → 31 mai). Le +132 026 369,70 % vient de la formule CAGR annualisée sur historique court avec saut non-organique de +56 k€ (saisie d'un bien immo le 22 mai).
- **Décision validée par l'utilisateur** : Option A — aucun DELETE. Le seuil 90 jours de `computeCroissancePatrimoine` (V1.3 commit `cf17e0f`) résoudra l'affichage une fois V1.5 mergé.

### V1.5 — Déploiement prod — 2026-06-01

- Merge `--no-ff` de `feat/dashboard-pipeline-unifie` dans `master`
- Merge commit `a95f8aa` — `feat(dashboard): merge V1 - refonte pipeline + corrections calculs`
- Push `master` (`6713146..a95f8aa`)
- Vercel deployment prod `dpl_HNNAmpm4rCb292r5pEyqMRnP6CQU` → `READY`
- **Validation visuelle prod confirmée par l'utilisateur** sur `fynix-mu.vercel.app/dashboard` (alias custom configuré via `NEXT_PUBLIC_APP_URL`)
- Bugs visibles à l'écran corrigés :
  - **BUG-1** : brut MV strict + badge positions non valorisées
  - **BUG-2** : CAGR remplacé par TWR portefeuille + Croissance patrimoine + seuil 90 j (le +132 026 369,70 % devient « Pas assez d'historique » jusqu'à ~mi-août)
  - **BUG-3** : label « Cash-flow immobilier (Y1 simulé) »
  - **BUG-6** : taxonomie d'allocation canonique (donut masqué V1.4, réactivé V2)
- Branche feature `feat/dashboard-pipeline-unifie` supprimée local + remote
- Tag `v1.0-dashboard-refonte` posé sur le merge commit et pushé

---

## 🏁 Clôture V1

**Note globale Dashboard estimée post-V1 : ~70 / 100** 🟡

La cible théorique V1 (77 / 100) supposait aussi P0.5 (top consolidé par enveloppe) repoussé en V2 visuel. Les corrections P0.2 / P0.4 / P0.6 / P0.3 livrées en V1 portent l'écran de 42 → ~70 sur des chiffres justes, des labels explicites et une taxonomie cohérente. La refonte visuelle (zones / hiérarchie / top consolidé / mode présentation) reste à faire pour franchir 80+.

### Bugs restants identifiés pour V2 / V3

- **BUG-5** : Top consolidé par enveloppe (refonte visuelle, P0.5)
- **Doublon graphe d'évolution** : `PatrimonyAreaChart` à supprimer en V2 (P0.8)
- **Doublons fiscalité** : Calendrier fiscal + `FiscalKpiBanner` XL à reléguer dans /analyse > Fiscalité (P0.8 + Zone 6 compacte)
- **BUG-7** : Confidence score plombé par biens immo en `confidence='medium'` (P1.6bis)
- **Donut allocation** masqué en V1 → réactivation en V2 avec la nouvelle taxonomie + tooltip pédagogique `fonds_euros → obligations`

### P1 reportés en backlog post-V1

- **P1.2** — Sélecteur fenêtre temporelle (3M / 6M / 1A / 3A / Max) pilotant Hero + Évolution
- **P0.11 promu (était P1.3)** — Affichage conditionnel par profil (à confirmer ordre V2 ou V3)
- **P1.4** — Benchmark MSCI ACWI / World sur la zone Évolution
- **P1.1** — Vrai cash-flow patrimonial (loyers nets + dividendes + intérêts livrets − mensualités)
- **P1.6bis** — Confidence score immobilier durci (les biens RE en `medium` ne devraient pas pénaliser le score à ce point)
- **Protection floor sur `computeCroissancePatrimoine`** — ajouter un cap absolu (par ex. `Math.min(rate, 999)`) ou refuser le calcul si saut non-organique détecté (variation > X % sur < Y jours), pour éviter les chiffres délirants même au-delà du seuil 90 j

### Backlog technique

- **Test d'intégration Playwright** page-niveau (leçon V1.4-BIS) — couvre le rendu JSX réel sur user seedé, complète la couverture pipeline isolé de Vitest
- **Commits réguliers en fin de sprint** sur une branche feature pour exploiter l'URL preview Vercel comme terrain de validation visuelle continue
- **Endpoint `/api/dashboard`** : supprimé ✅
- **Bloc inline `dashboard/page.tsx`** : supprimé ✅
- **Feature flag `DASHBOARD_UNIFIED_PIPELINE`** : supprimé ✅
- **Test de caractérisation `dashboard-caracterisation.test.ts`** : supprimé ✅ (l'ancien pipeline n'existe plus)

### Bilan chiffré

| Indicateur | Avant V1 | Après V1 |
|---|---:|---:|
| Pipelines de calcul Dashboard concurrents | 3-4 | **1** |
| Bugs structurels visibles | 6 (BUG-1 à BUG-6) | **2** (BUG-5 + BUG-7) |
| Tests Vitest pertinents au Dashboard | 0 | **66 actifs + 12 squelettes restants** |
| Couverture taxonomie d'allocation | clés hétérogènes `asset:*`+`class:*` | 9 clés canoniques |
| Indicateur performance | 1 CAGR trompeur | TWR + Croissance séparés, labels explicites |
| Code mort Dashboard | bloc inline 243 l. + endpoint `/api/dashboard` | supprimé |
| Note Dashboard estimée | 42 / 100 🟠 | ~70 / 100 🟡 |

