# RAPPORT D'AUDIT — SECTION IMMOBILIÈRE

**Date :** 2026-05-19
**Périmètre :** `app/(app)/immobilier/*`, `lib/real-estate/*`, `components/real-estate/*`,
tables Supabase `real_estate_properties`, `real_estate_lots`, `property_charges`,
`property_valuations`, `debts`.
**Référentiel fiscal :** législation française en vigueur 2024 / loi de finances 2025
(notamment réintégration des amortissements LMNP en plus-value).

---

## RÉSUMÉ EXÉCUTIF

| Indicateur | Évaluation |
|---|---|
| **Score global** | **6,5 / 10** |
| Cœur de calcul (PMT / CRD / IRA / fiscalité) | 8 / 10 — solide, testé |
| Modèle de données | 6 / 10 — riche mais 1 crédit max, pas de courte durée |
| Couverture fiscale (régimes courants) | 7 / 10 — 7 régimes simulés, déficits FIFO 10 ans |
| Couverture fiscale (dispositifs de défiscalisation) | 1 / 10 — Pinel / Denormandie / Malraux / MH / Loc'Avantages absents |
| UX de saisie | 4 / 10 — formulaire monolithique, sans wizard, sans tooltips |
| UX d'analyse | 6 / 10 — 6 onglets, beaucoup d'infos mais pas de comparateur |
| Tests | 9 / 10 — 16 fichiers, ~2 500 lignes de tests purs |

- **Problèmes critiques de calcul :** 4 (cf. §1)
- **Fonctionnalités manquantes majeures :** 12 (cf. §2-3)
- **Régimes / cas fiscaux non traités :** 8 (cf. §4)
- **Améliorations UX prioritaires :** 9 (cf. §5)

**Verdict :** la section a une fondation de calcul de très bonne qualité (calculs purs,
testés, multi-régimes avec carry-forward fiscal), mais souffre de manques **produit**
plutôt que techniques : impossibilité d'avoir plusieurs crédits sur un même bien
(PTZ + prêt principal + travaux), pas de courte durée (Airbnb), aucun dispositif
fiscal incitatif, saisie monolithique sans guidage, pas de simulateur sandbox.

---

## 1. PROBLÈMES CRITIQUES

### 1.1 [CRITIQUE — UNITÉS] Rendements exprimés en ratio dans `computeKPIs` mais affichés via `formatPercent`

- **Fichier :** [lib/real-estate/kpis.ts:49-62](lib/real-estate/kpis.ts:49)
- **Détail :** `grossYieldOnPrice`, `grossYieldFAI`, `netYield`, `netNetYield` sont retournés
  comme **ratios** (ex : `0.052` pour 5,2 %) :
  ```ts
  const grossYieldOnPrice = property.purchasePrice > 0
    ? grossYearRent / property.purchasePrice : 0
  ```
- **Mais affichés** dans [app/(app)/immobilier/page.tsx:227-229](app/(app)/immobilier/page.tsx:227)
  via `formatPercent(kpis.netNetYield)` et `formatPercent(kpis.grossYieldOnPrice)`.
  Pendant ce temps, sur la page détail ([app/(app)/immobilier/[id]/page.tsx:95-96](app/(app)/immobilier/[id]/page.tsx:95)),
  le calcul fait à la main est `(annualRents / acqCost) * 100` — donc une valeur en pourcentage.
- **Impact :** affichage potentiellement faux d'un facteur 100 selon la convention de
  `formatPercent`. À vérifier dans `lib/utils/format.ts` : si `formatPercent(0.05)` → "5 %",
  alors la page détail (qui passe déjà des % * 100) double l'erreur. Si `formatPercent(5)` → "5 %",
  alors les cartes liste sous-évaluent d'un facteur 100.
- **Correction :** uniformiser. Recommandation : KPIs en **pourcentage** (5 pour 5 %) pour
  être cohérent avec `tmiPct`, `interestRate`, `propertyIndexPct`, etc. déjà utilisés
  partout en %. Modifier `kpis.ts` lignes 49-62 pour multiplier par 100. Adapter les tests.

### 1.2 [CRITIQUE — MODÉLISATION] Un seul crédit actif par bien (`UNIQUE INDEX ... WHERE status='active'`)

- **Fichier :** [supabase/migrations/006_credit_unification.sql:93-95](supabase/migrations/006_credit_unification.sql:93)
  ```sql
  CREATE UNIQUE INDEX idx_debts_one_active_per_asset
    ON debts (asset_id) WHERE status = 'active';
  ```
- **Impact métier :** un investisseur français cumule très fréquemment **3 crédits** sur un
  même bien : prêt principal amortissable + PTZ + prêt travaux (PEL/CEL ou Action Logement).
  La projection cumulée du remboursement et du déficit foncier sera fausse pour ces dossiers.
- **Correction :** lever l'index unique ; introduire une notion d'**Encours** ou retourner
  un tableau `debts[]` lié à un asset. Aligner `lib/real-estate/build-from-db.ts` pour
  accepter `DbDebt[]` et concaténer les schedules.

### 1.3 [CRITIQUE — UX] Régime fiscal facultatif à la création → calculs ensuite forcés en `foncier_nu`

- **Formulaire :** [app/(app)/immobilier/nouveau/page.tsx:218-228](app/(app)/immobilier/nouveau/page.tsx:218)
  → `<option value="">Non défini</option>` autorisé.
- **Conséquence :** [app/(app)/immobilier/[id]/page.tsx:245](app/(app)/immobilier/[id]/page.tsx:245)
  applique `dbProperty.fiscal_regime ?? 'foncier_nu'` pour le bilan année. La projection
  utilise un régime arbitraire que l'utilisateur n'a pas choisi.
- **Impact :** affichage de cash-flow et d'impôt potentiellement très différent de la
  réalité (un meublé en LMNP réel n'a pas du tout le même P&L qu'un foncier réel).
- **Correction :** rendre `fiscal_regime` **requis** au formulaire OU afficher un état
  "Régime non choisi — fiscalité non calculée" plutôt qu'un résultat trompeur.

### 1.4 [CRITIQUE — FISCAL] LMNP réel : non-prise en compte de la quote-part de déficit imputable sur revenu global hors amortissement

- **Fichier :** [lib/real-estate/fiscal/lmnp-reel.ts:80-83](lib/real-estate/fiscal/lmnp-reel.ts:80)
- **Détail :** quand `resultAfterAmort < 0`, le déficit BIC est entièrement reporté sur
  10 ans dans `bicDeficitsByAge`. Or en **LMNP non professionnel**, le déficit BIC
  d'exploitation (hors amortissements) est **imputable sur le revenu global du foyer**
  jusqu'à 10 700 € (avec la nuance "BIC non-pro" — ≤ 5 ans depuis 2009, mais
  exploitable sur les BIC non-pro futurs). En l'état, la lib applique strictement
  "10 ans BIC non-pro uniquement", ce qui est correct **pour la part amortissements**
  mais sous-estime l'optimisation possible sur la part hors amortissement.
- **Impact :** simulation trop pessimiste pour les profils à TMI élevé en LMNP avec
  forts intérêts d'emprunt et charges. La règle simulée est **acceptable en première
  approche** mais à documenter dans l'UI.
- **Correction :** ajouter une note explicative sur la fiche et, plus tard, distinguer
  la part `resultAfterAmort` due aux charges/intérêts (BIC non-pro 10 ans) vs strict
  amortissement (stock indéfini déjà géré).

---

## 2. FONCTIONNALITÉS MANQUANTES — MODÈLE DE DONNÉES

### Légende complexité : S (≤ 1 j) · M (≤ 3 j) · L (≤ 10 j) · XL (> 10 j)

### 2.1 Type d'usage du bien (résidence principale / secondaire / locatif)

- **Manque :** la table `real_estate_properties` n'a pas de colonne `usage_type`.
  Le code la déduit à partir du régime fiscal ([app/(app)/immobilier/page.tsx:22-30](app/(app)/immobilier/page.tsx:22)).
- **Conséquences :** pas de différenciation taxe d'habitation (résidence secondaire),
  pas de masquage des champs "loyer" pour une RP, pas de modélisation de l'avantage
  fiscal d'occupation par le propriétaire.
- **Complexité :** **S** — ajouter colonne enum `usage_type` + adapter formulaire.

### 2.2 Plusieurs crédits par bien (cf. §1.2)

- **Complexité :** **M** — schéma + UI multi-crédit + sommation amortissements.

### 2.3 Location courte durée (Airbnb / Booking)

- **Manque :**
  - Pas de champ `rental_type` (longue / courte) sur le lot.
  - Pas de `nightly_rate`, `occupancy_rate`, `cleaning_fee`, `platform_commission_pct`.
  - `charges.management` ne distingue pas conciergerie / ménage.
- **Complexité :** **L** — extension schéma + calculs revenus variables + saisonnalité +
  bascule micro-BIC 71 % vs 50 %.

### 2.4 Loyer de marché et delta loyer actuel vs marché

- **Manque :** pas de champ `market_rent` sur le lot. Impossible de signaler un bien
  sous-loué (alerte commune chez Horiz.io, Rendement Locatif).
- **Complexité :** **S** — colonne + alerte UI dans `insights.ts`.

### 2.5 Revenus annexes structurés (parkings, caves, garages, antennes)

- **Manque :** géré uniquement via lots de type `parking`/`garage`/`storage`.
  Pas de catégorie "revenus passifs" séparée (antennes relais, panneaux publicitaires).
- **Complexité :** **M**.

### 2.6 Champs d'acquisition manquants

- Pas de `agency_fees` à l'achat (frais d'agence ≠ frais de notaire).
- Pas d'`down_payment` explicite — déduit par soustraction.
- Pas de `acquisition_method` (achat classique / VEFA / viager / SCI / démembrement).
- **Complexité :** **S** chacun.

### 2.7 Démembrement de propriété (usufruit / nue-propriété)

- **Manque :** aucun champ pour modéliser une nue-propriété (très utilisée en investissement
  patrimonial : décote 20-40 % à l'achat, pas de loyers, pas de TF pour le nu-propriétaire).
- **Complexité :** **L** — nouveau régime de calcul + intégration plus-value (point d'entrée
  spécifique au remembrement gratuit).

### 2.8 Mode de détention enrichi

- `holding_mode` (direct / SCI / SARL famille / indivision) existe pour SCPI dans le
  schéma mais **pas pour `real_estate_properties`** ([001_initial_schema.sql:240-263](supabase/migrations/001_initial_schema.sql:240)).
- **Complexité :** **M**.

### 2.9 Tracker fiscal LMNP/LMP automatique (recettes > 23 000 € ET > revenus pro)

- **Manque :** rien dans le code ne vérifie le seuil de bascule automatique LMNP → LMP.
  L'utilisateur choisit son régime, point.
- **Complexité :** **M** — calcul cross-biens (sommer recettes meublé du foyer).

### 2.10 Champs manquants au formulaire de création

Le formulaire `app/(app)/immobilier/nouveau/page.tsx` couvre 16 champs sur les ~30 que
le modèle DB supporte. Notamment absents de la saisie initiale :

| Champ DB | Conséquence |
|---|---|
| `furniture_amount` | LMNP réel : pas d'amortissement mobilier sauf via édition ultérieure |
| `land_share_pct` | Amortissement bâtiment imprécis (défaut 15 %) |
| `amort_*_years` | Tous fixes aux défauts |
| `rental_index_pct` / `charges_index_pct` / `property_index_pct` | Projection avec hypothèses non assumées |
| `gli_pct`, `management_pct`, `vacancy_months` | Pas de saisie en flow initial |
| `lmnp_micro_abattement_pct` | Pas de choix 50/71 % à la création |
| `lmp_ssi_rate` | Pas de saisie |
| `acquisition_fees_treatment` | Pas de choix `expense_y1` vs `amortized` |
| `assumed_total_rent` | Pas d'override possible avant ajout des lots |

- **Complexité :** **M** — refonte en wizard (cf. §5.1).

---

## 3. FONCTIONNALITÉS MANQUANTES — CALCULS FINANCIERS

### 3.1 KPIs absents

Sur 14 KPIs réellement calculés ([lib/real-estate/types.ts:272-291](lib/real-estate/types.ts:272)),
manquent à l'appel :

| KPI | Pourquoi c'est attendu |
|---|---|
| **TRI / IRR** sur horizon 10 / 15 / 20 ans (avec valeur de revente projetée) | Standard de tous les simulateurs (Horiz, Rendement Locatif). On a déjà une bisection NPV pour le TAEG → factoriser |
| **DSCR** (Debt Service Coverage Ratio = NOI / mensualité) | Indicateur bancaire crucial |
| **Cap Rate** (NOI / valeur vénale) | Standard institutionnel |
| **Cash-on-Cash Return** (CF annuel / apport) | Présent en partie via `leverageRatio` mais pas en % de retour direct |
| **Payback total opération** (vs `paybackYear` qui est sur apport) | Cf. cumul depuis -totalCost |

- **Complexité :** **M** — toutes les briques existent (projection + amortization).

### 3.2 Simulation de remboursement anticipé partiel

- **Présent :** [lib/real-estate/credit.ts:111-142](lib/real-estate/credit.ts:111)
  calcule l'IRA pour un **remboursement total** (modal revente).
- **Manque :** simulation partielle "je rembourse X € en année N : économie d'intérêts ?
  nouvelle mensualité ? réduction de durée ?".
- **Complexité :** **M**.

### 3.3 Modulation d'échéance / réaménagement

- **Manque :** pas de simulation "augmenter de 10 % la mensualité → durée raccourcie de N mois".
- **Complexité :** **M**.

### 3.4 IRL (Indice de Référence des Loyers) — vrai indice INSEE

- **Présent :** `rental_index_pct` est un **% forfaitaire libre** (défaut 2 %).
- **Manque :** branchement sur la série INSEE de l'IRL (publiée trimestriellement).
  Permettrait une indexation calibrée + une **clause "loyer plafonné en zone tendue"**
  (Pinel, encadrement Paris/Lille/Lyon).
- **Complexité :** **L** — fetch + cache INSEE + UI choix "IRL réel" / "% forfait".

### 3.5 Plus-value LMP : exonération sur CA des 2 dernières années

- **Présent :** constantes `PLAFOND_EXO_LMP_TOTAL = 90_000` et `PLAFOND_EXO_LMP_PARTIELLE = 126_000`
  dans [plusValue.ts:69-71](lib/real-estate/plusValue.ts:69).
- **Manque :** le formulaire de revente n'a pas (apparemment) de champ "CA moyen N-1 / N-2"
  exposé à l'utilisateur. À vérifier dans `components/real-estate/simulation-revente-modal.tsx`.
- **Complexité :** **S**.

### 3.6 Plus-value SCI à l'IS — sortie via dividendes vs CCA

- **Présent :** mention dans le header de [plusValue.ts:21-23](lib/real-estate/plusValue.ts:21).
- **Manque :** vérifier que le simulateur expose bien la double imposition IS + PFU 30 %
  vs remboursement de comptes courants d'associés (CCA) sans imposition.
- **Complexité :** **S** — UI / vérification.

### 3.7 Comparateur de régimes pour un même bien

- **Manque :** outil "même bien, simulé en LMNP réel vs micro vs SCI IS — quel régime
  optimal ?". Présent chez Horiz, Jedéclaremonmeublé.
- **Complexité :** **M** — la projection est déjà paramétrée par régime ; il suffit
  d'exécuter `runSimulation` N fois et de mettre en tableau côte-à-côte.

### 3.8 Comparateur de biens

- **Manque :** vue "comparer biens A / B / C" sur rendement, cash flow, TRI 15 ans.
- **Complexité :** **M**.

### 3.9 Sensibilité (what-if)

- **Manque :** sliders interactifs "si le taux passe de 3,5 % à 4 %", "si vacance + 1 mois",
  "si loyer + 5 %". Standard chez Rendement Locatif.
- **Complexité :** **M**.

---

## 4. PROBLÈMES FISCAUX — par régime

### 4.1 Foncier réel ([foncier-reel.ts](lib/real-estate/fiscal/foncier-reel.ts))

| OK | Détail |
|---|---|
| ✅ | Charges déductibles bonnes (PNO, GLI, TF, comptable, copro, gestion, entretien, autres + intérêts + assurance emprunteur) |
| ✅ | Déficit foncier 10 700 € sur revenu global + report 10 ans sur foncier (FIFO via `ageDeficits`) |
| ✅ | CFE non appliquée (correct — pas de CFE en location nue) |
| ✅ | Frais de notaire correctement non déductibles |
| ⚠️ | Approximation "réduction d'impôt = onGlobalIncome × TMI" : économiquement équivalent, mais juridiquement c'est une imputation sur le revenu global avant calcul de l'IR (donc soumis au barème progressif). Pour un foyer en bord de tranche, l'écart peut être de quelques % |
| ❌ | Plafond 21 400 € (en cas de **deux** locations en déficit la même année) non géré — pas applicable mono-bien mais à prévoir si analyse multi-biens |
| ❌ | Cas du déficit en présence d'un *engagement de conservation* (3 ans) non testé en UI |

### 4.2 LMNP micro-BIC ([lmnp-micro.ts](lib/real-estate/fiscal/lmnp-micro.ts))

| OK | Détail |
|---|---|
| ✅ | Abattement 50 % / 71 % paramétrable |
| ✅ | Pas de déficit possible (correct) |
| ❌ | **Pas de bascule auto** au-delà de 77 700 € (188 700 € en classé). Une note UI est promise mais à implémenter |
| ❌ | **Réforme LF 2024-2025 sur les meublés de tourisme non classés** : abattement micro-BIC réduit à **30 %** (au lieu de 50 %) avec plafond ramené à 15 000 €. Non implémenté |
| ❌ | **Réforme LF 2024-2025 sur meublés de tourisme classés** : abattement ramené de 71 % à **50 %**, plafond 77 700 € (sauf zones tendues). Implémentation actuelle (50 ou 71) est **obsolète** vs LF 2025 |

### 4.3 LMNP réel ([lmnp-reel.ts](lib/real-estate/fiscal/lmnp-reel.ts))

| OK | Détail |
|---|---|
| ✅ | Amortissement non créateur de déficit (règle BIC) bien implémentée |
| ✅ | Stock d'amortissement non utilisé reportable indéfiniment |
| ✅ | Déficit BIC FIFO 10 ans |
| ✅ | CFE déductible |
| ⚠️ | Ventilation amortissement uniquement par 3 catégories (bâti / travaux / mobilier). Pas de **décomposition par composants** légalement admissible (gros œuvre 50 ans / façade 30 ans / toiture 25 ans / agencements 10-15 ans / installations 25 ans). En LMNP cette ventilation fine est moins critique qu'en SCI IS, mais l'expert-comptable la pratique |
| ❌ | **Réforme LF 2025 — réintégration des amortissements à la plus-value LMNP** : déjà prévue dans le header de [plusValue.ts:10-13](lib/real-estate/plusValue.ts:10) mais à vérifier dans le détail du calcul. C'est un **changement majeur de la fiscalité 2025** |
| ❌ | Pas de gestion du **déficit BIC non-pro imputable sur autres BIC non-pro du foyer** (donc si l'utilisateur a 2 LMNP, le déficit de l'un absorbe le bénéfice de l'autre). Modèle mono-bien |

### 4.4 LMP ([lmp.ts](lib/real-estate/fiscal/lmp.ts))

| OK | Détail |
|---|---|
| ✅ | Cotisations SSI paramétrables (défaut 35 %) à la place des PS 17,2 % |
| ✅ | Déficit imputable sur revenu global sans limite (équivalent économique via `taxPaid = -reduction`) |
| ⚠️ | Taux SSI 35 % est une moyenne — varie entre ~30 % (forfait social allégé) et ~45 % selon situation. Acceptable par défaut mais à documenter |
| ❌ | Pas de gestion de la **carte d'identification professionnelle** (CFE supplémentaire, immatriculation CFE chambre de commerce) |
| ❌ | **Exonération de plus-value pro art. 151 septies** : dans [plusValue.ts:67-71](lib/real-estate/plusValue.ts:67) mais champ CA moyen 2 ans à exposer en UI |
| ❌ | Cotisations SSI minimum forfaitaires (~1 200 € même si déficit) non modélisées |

### 4.5 SCI à l'IS ([sci-is.ts](lib/real-estate/fiscal/sci-is.ts))

| OK | Détail |
|---|---|
| ✅ | Tarif 15 % / 25 % avec seuil 42 500 € correct |
| ✅ | Déficit reportable indéfiniment |
| ✅ | Amortissements totalement déductibles (pas de limitation BIC) |
| ✅ | Frais d'acquisition `expense_y1` ou `amortized` paramétrable |
| ❌ | **Distribution des dividendes** non simulée. Une SCI à l'IS génère du cash mais l'associé n'y a accès que par dividende (PFU 30 % ou barème + PS) ou compte courant d'associé (CCA) sans imposition. Le simulateur ne distingue pas |
| ❌ | Plus-value SCI IS : taxation **au taux IS** (15/25 %) sans abattement durée, puis **second étage PFU 30 %** si distribution. À vérifier dans plusValue.ts |
| ❌ | CET / CVAE (potentiellement applicable si recettes locatives habituelles importantes) non modélisée |

### 4.6 SCI à l'IR ([sci-ir.ts](lib/real-estate/fiscal/sci-ir.ts))

- **Implémentation actuelle :** délégation pure à `makeFoncierReelCalculator(tmiPct)`.
- ❌ **Quote-part des parts entre associés** non modélisée (Phase 1 — documenté en commentaire).
- ❌ Pas de gestion de l'**option pour l'IS** rétroactive (5 ans pour revenir à l'IR depuis 2019).
- **Impact :** acceptable pour une SCI familiale à un seul associé / un seul foyer fiscal.
  Insuffisant pour une SCI multi-associés.

### 4.7 Foncier micro ([foncier-micro.ts](lib/real-estate/fiscal/foncier-micro.ts))

| OK | Détail |
|---|---|
| ✅ | Abattement 30 % correct |
| ✅ | Plafond 15 000 € documenté mais non bloquant (par choix produit) |
| ⚠️ | Base imposable calculée sur `netRent` (loyers - vacance) — en réalité, le micro-foncier
  s'applique sur le **loyer perçu réellement encaissé**, ce qui colle bien (vacance déjà
  déduite). Choix produit cohérent et explicité en commentaire ligne 24-26 |

### 4.8 Dispositifs fiscaux incitatifs — **TOTALEMENT ABSENTS**

Aucun support pour :

| Dispositif | Population concernée |
|---|---|
| **Pinel / Pinel+** | Très large — investissement neuf 2024 |
| **Denormandie** | Investissement ancien avec travaux dans 222 villes éligibles |
| **Malraux** | Patrimoine secteur sauvegardé |
| **Monuments Historiques** | Niche très avantageuse (déduction 100 % des travaux) |
| **Loc'Avantages** (ex-Cosse) | Loyer plafonné contre réduction d'impôt |
| **Censi-Bouvard** | Éteint mais relevant pour stock existant |
| **Réduction d'impôt SCPI fiscale** | Catégorie distincte mais à modéliser |
| **TVA récupérable** (résidence services / para-hôtelier) | LMNP géré services classés |

- **Complexité :** **XL** — chaque dispositif a ses plafonds, durées d'engagement, taux de
  réduction, conditions de zone. Modélisation propre nécessite une table `tax_incentives`
  liée à `real_estate_properties`.

---

## 5. AMÉLIORATIONS UX/UI

### Critiques (à faire en priorité)

#### 5.1 Refonte du formulaire de création en **wizard / stepper**

- **Constat :** [app/(app)/immobilier/nouveau/page.tsx](app/(app)/immobilier/nouveau/page.tsx)
  est un formulaire monolithique de 268 lignes en une colonne. L'utilisateur découvre
  tout d'un coup et n'a aucun guidage sur quels champs sont critiques.
- **Recommandation :** wizard en 4-5 étapes :
  1. **Identification & adresse** (avec autocomplete API Adresse gouv.fr)
  2. **Acquisition & financement** (prix, frais, travaux, apport)
  3. **Crédit** (peut être passé pour saisie ultérieure)
  4. **Régime fiscal** (avec **assistant de choix** : 3-4 questions → recommandation)
  5. **Lots & loyers** (si multi-lots) — peut être passé
- **Bénéfice attendu :** réduction du taux d'abandon, meilleure qualité des données.

#### 5.2 Tooltips / aide contextuelle sur champs techniques

- Aucun tooltip n'est présent pour : **TAEG**, **CFE**, **GLI**, **PNO**, **TMI**,
  **abattement micro-BIC**, **quotité d'assurance**, **différé partiel / total**,
  **type d'amortissement**, **acquisition_fees_treatment**.
- **Recommandation :** composant `<Tooltip>` inline pour chaque label technique
  + lien vers une page "Lexique fiscal" dédiée.

#### 5.3 Régime fiscal **obligatoire** (cf. §1.3)

#### 5.4 Mode "simulateur sandbox" sans création de bien

- **Constat :** pour simuler un achat futur, il faut créer un bien en base. Pas de mode
  "calculateur jetable".
- **Recommandation :** route `/immobilier/simulateur` avec stockage `localStorage` ou
  `session_storage`, bouton "Convertir en bien réel" à la fin.

#### 5.5 Comparateur de régimes pour un même bien

- **Recommandation :** sur l'onglet "Rentabilité & Cash-flow", ajouter un toggle
  "Comparer régimes" → tableau LMNP réel vs LMNP micro vs SCI IS, avec **recommandation**
  basée sur cash-flow net 10 ans.

### Importantes

#### 5.6 Indicateurs cash-flow visibles **sans scroll**

- Sur la page détail [app/(app)/immobilier/[id]/page.tsx:264-307](app/(app)/immobilier/[id]/page.tsx:264),
  6 KPIs en grid (valeur estimée, CRD, patrimoine net, cash flow mensuel, rendement brut,
  PV latente) — c'est correct, mais le **rendement net-net après impôts** manque alors
  qu'il est le plus pertinent.

#### 5.7 Mode "scénario" : sliders interactifs

- Augmenter le loyer de 5 %, allonger la vacance de 1 mois, hausse des charges 10 %.
- Pas implémenté.

#### 5.8 Graphiques manquants

Vérifier les graphiques de l'onglet "Rentabilité" (`SimulationPanel`). Pertinents :
- **Capital remboursé vs intérêts payés** (stacked area sur la durée du crédit) ✅ probablement présent
- **Évolution patrimoine net** (valeur du bien − CRD) sur 30 ans
- **Cash flow cumulé** avec point break-even mis en évidence
- **Répartition fiscale annuelle** (IR / PS / SSI / IS / impôt local)

#### 5.9 Filtres & tris de la liste des biens

- [app/(app)/immobilier/page.tsx](app/(app)/immobilier/page.tsx) affiche les biens en
  cartes 2 colonnes sans filtre.
- **Manque :** tri par rendement net-net, cash flow, valeur, date d'acquisition.
  Filtre par régime fiscal, par type, par statut. Recherche par adresse.

### Nice-to-have

- **Export PDF du bilan d'année** ou **Excel des projections**.
- **Carte des biens** (Leaflet + adresse géocodée).
- **Photos du bien** (1-N images) — Supabase Storage.
- **Documents joints** (acte de vente, baux, diagnostics DPE) — Supabase Storage.
- **Mode "sortie patrimoniale"** : à 65 ans, qu'est-ce qu'on garde, qu'est-ce qu'on vend ?

---

## 6. PROBLÈMES TECHNIQUES

### 6.1 Floats partout en monétaire

- [lib/real-estate/amortization.ts](lib/real-estate/amortization.ts) opère sur `number` (float64).
  Acceptable jusqu'à ~10⁹ €, mais des erreurs d'arrondi cumulatives existent (le `principalPart > balance ? clamp` ligne 146 le prouve).
- **Recommandation :** maintenir floats pour les calculs intermédiaires, mais **arrondir
  systématiquement à 2 décimales** à l'écriture en base. Vérifier le typage Postgres :
  `NUMERIC(18,2)` est correct dans le schéma → bonne conversion.

### 6.2 Conversion taux annuel → mensuel

- [amortization.ts:44](lib/real-estate/amortization.ts:44) utilise `r = annualRatePct / 100 / 12`
  (convention française).
- ✅ Cohérent avec la pratique des banques françaises (taux nominal proportionnel, pas équivalent).
- ⚠️ Mais le **TAEG** calculé par bisection ([amortization.ts:312](lib/real-estate/amortization.ts:312))
  applique `(1 + r_mensuel)^12 - 1` (équivalent). C'est **correct pour le TAEG** (qui est
  effectif annuel par définition européenne — directive 2008/48/CE et art. R314-1 Code conso).
  Cohérent.

### 6.3 Gestion des `simulationDate` / fuseaux horaires

- [credit.ts:39-43](lib/real-estate/credit.ts:39) utilise `getUTCFullYear` / `getUTCMonth` (bien).
- [amortization.ts:232-234](lib/real-estate/amortization.ts:232) utilise `getFullYear()` /
  `getMonth()` (heure locale) — **incohérence**. À aligner sur UTC pour éviter qu'un
  utilisateur à Tahiti voie un CRD différent.

### 6.4 Cache `monthly_payment` et `capital_remaining` dans `debts`

- [006_credit_unification.sql:18](supabase/migrations/006_credit_unification.sql:18) mentionne
  "recalculé à chaque write".
- **Risque :** drift si un calcul change et que les biens existants ne sont pas re-écrits.
- **Recommandation :** ne **plus** stocker ces valeurs (les calculer toujours à la volée) OU
  implémenter un job de réconciliation mensuel.

### 6.5 Typage `any` / cast `Record<string, unknown>`

- [app/(app)/immobilier/[id]/page.tsx:112-127](app/(app)/immobilier/[id]/page.tsx:112) utilise
  systématiquement `(prop as Record<string, unknown>).rental_index_pct as number ?? X`.
  C'est un workaround pour le typage strict de Supabase qui ne suit pas immédiatement les
  migrations.
- **Recommandation :** régénérer `types/database.types.ts` à chaque migration via
  `npx supabase gen types typescript --linked` et bannir ces casts.

### 6.6 Pas de validation Zod / RHF

- Le hook `useForm` (custom dans `hooks/use-form.ts`) ne semble pas valider via un schéma.
  Le formulaire de création n'a pas de feedback localisé (sauf `required` HTML5).
- **Recommandation :** intégrer Zod pour le côté serveur (validation des routes API
  `/api/real-estate/*`) — un payload mal formé peut casser un calcul fiscal sans erreur visible.

### 6.7 Tests — couverture des scénarios fiscaux extrêmes

- ✅ Tests présents sur les 7 régimes ([regimes.test.ts](lib/real-estate/__tests__/regimes.test.ts)).
- ❌ Pas de test "plusieurs déficits expirant à 10 ans en cascade".
- ❌ Pas de test "SCI IS bascule 15 % → 25 % à 42 500 €".
- ❌ Pas de test sur la **réforme LF 2025** (amortissement réintégré PV LMNP, abattement micro
  meublé tourisme passé à 30 / 50 %).

---

## 7. BENCHMARKING — fonctionnalités concurrentes absentes

| Fonctionnalité | Fynix actuel | Horiz.io | Rendement Locatif | Finary | Snowball | Immocloud | Jedéclaremonmeublé |
|---|---|---|---|---|---|---|---|
| Simulateur sans création de bien | ❌ | ✅ | ✅ | — | — | — | ✅ |
| Wizard de saisie | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comparateur régimes fiscaux | ❌ | ✅ | ✅ | — | — | — | ✅ |
| Comparateur biens A/B | ❌ | ✅ | ✅ | — | — | — | — |
| Dispositifs Pinel/Denormandie | ❌ | ✅ | ✅ | — | — | — | — |
| Location courte durée (Airbnb) | ❌ | ✅ | ✅ | — | — | ✅ | — |
| Gestion locative (bail, quittance) | ❌ | — | — | — | — | ✅ | ✅ |
| Déclaration LMNP auto (2031, 2042-C-PRO) | ❌ | — | — | — | — | — | ✅ |
| Mode sliders what-if | ❌ | ✅ | ✅ | — | — | — | — |
| Plusieurs crédits / bien | ❌ | ✅ | ✅ | — | — | — | — |
| Suivi réel vs simulé | ✅ | — | — | ✅ | ✅ | ✅ | — |
| Drift alerts | ✅ | — | — | — | — | — | — |
| Bilan année + détection écarts | ✅ | — | — | — | — | — | ✅ |
| Plus-value multi-régime | ✅ | ✅ | ✅ | — | — | — | ✅ |
| Suivi patrimonial cross-classes (immo + bourse + crypto) | ✅ | — | — | ✅ | ✅ | — | — |

**Avantages compétitifs uniques de Fynix :** suivi réel vs simulation, drift alerts,
bilan année fiscale, agrégation patrimoniale cross-classes.

**Retards majeurs :** wizard, simulateur sandbox, dispositifs fiscaux, courte durée, multi-crédit.

---

## 8. PLAN D'ACTION RECOMMANDÉ

### Sprint 1 — Corrections critiques (1-2 semaines)

1. **Uniformiser les unités KPI** (cf. §1.1) — modifier `lib/real-estate/kpis.ts` pour
   retourner des pourcentages (5 pour 5 %), aligner appelants, mettre à jour les tests.
2. **Rendre `fiscal_regime` obligatoire** au formulaire de création (cf. §1.3).
3. **Aligner timezone UTC** dans `computeRemainingCapitalAt` (cf. §6.3).
4. **Régénérer `types/database.types.ts`** depuis Supabase et supprimer les casts
   `Record<string, unknown>` (cf. §6.5).
5. **Mise à jour LF 2025** sur les abattements micro-BIC tourisme (cf. §4.2) +
   réintégration amortissements à la PV LMNP (cf. §4.3 — vérification).

### Sprint 2 — Fonctionnalités manquantes core (3-4 semaines)

6. **Multi-crédit par bien** (cf. §2.2) — lever l'unique index, multi-loan UI,
   sommation des schedules dans la projection.
7. **Wizard de création** en 5 étapes (cf. §5.1) + tooltips (cf. §5.2).
8. **Mode simulateur sandbox** (cf. §5.4).
9. **Champ `usage_type`** (résidence principale / secondaire / locatif) (cf. §2.1)
   + adaptation des charges affichables (TF / TH / TLV).
10. **Loyer de marché et alerte sous-loyer** (cf. §2.4).
11. **Comparateur régimes fiscaux** côte-à-côte (cf. §5.5).

### Sprint 3 — Fiscalité avancée (2-3 semaines)

12. **Dispositif Pinel / Pinel+** (réduction d'impôt sur 6/9/12 ans, zonage A/A bis/B1).
13. **Denormandie** (ancien avec travaux ≥ 25 % du coût total, mêmes taux que Pinel).
14. **Loc'Avantages** (loyer plafonné, réduction d'impôt 15/35/65 %).
15. **Monuments Historiques** (déductibilité 100 % travaux sur revenu global).
16. **Bascule auto LMNP → LMP** (recettes > 23 k€ ET > revenus pro).
17. **Distribution dividendes SCI IS** (PFU vs barème) + CCA.

### Sprint 4 — Location courte durée (3-4 semaines)

18. **Location courte durée Airbnb / Booking** (cf. §2.3) — modèle saisonnier, occupancy,
    nightly rate, charges spécifiques.
19. **Bascule auto entre micro-BIC tourisme non classé / classé** selon revenus.

### Sprint 5 — UX & polish (2 semaines)

20. **Sliders what-if** (cf. §5.7).
21. **Filtres & tris** sur la liste (cf. §5.9).
22. **Export PDF du bilan d'année**.
23. **Graphiques manquants** (cf. §5.8).
24. **Carte géographique des biens**.

---

## 9. SCHÉMA DE DONNÉES CIBLE RECOMMANDÉ

```typescript
// ─────────────────────────────────────────────────────────────────
// Identité & typologie
// ─────────────────────────────────────────────────────────────────

export type PropertyUsageType =
  | 'primary_residence'    // résidence principale (pas de loyers, TH possible)
  | 'secondary_residence'  // résidence secondaire (TH + éventuelle location partielle)
  | 'long_term_rental'     // locatif longue durée
  | 'short_term_rental'    // saisonnier / Airbnb / Booking
  | 'mixed_use'            // une partie occupée, une partie louée

export type PropertyKind =
  | 'apartment' | 'house' | 'building'      // immeuble de rapport
  | 'garage' | 'parking' | 'commercial'
  | 'land' | 'storage' | 'other'

export type HoldingMode =
  | 'direct'
  | 'sci_is'
  | 'sci_ir'
  | 'sarl_famille'
  | 'sas'
  | 'indivision'
  | 'usufruit'             // détenteur de l'usufruit
  | 'nue_propriete'        // détenteur de la nue-propriété
  | 'demembrement_complet' // suivi conjoint des deux parties

export interface Property {
  id:                string
  userId:            string
  // Identification
  name:              string
  usageType:         PropertyUsageType
  kind:              PropertyKind
  address:           Address
  surfaceM2:         number
  landSurfaceM2?:    number
  rooms?:            number
  floor?:            number
  constructionYear?: number
  dpeClass?:         'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  gesClass?:         'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

  // Acquisition
  purchasePrice:        number  // net vendeur
  notaryFees:           number
  agencyFees:           number  // distinct des frais de notaire
  worksAmount:          number
  furnitureAmount:      number
  acquisitionDate:      Date
  acquisitionMethod:    'classic' | 'vefa' | 'viager_occupied' | 'viager_free'
                       | 'auction' | 'donation' | 'inheritance'
  acquisitionFeesTreatment: 'expense_y1' | 'amortized_5y' | 'amortized_building' | 'none'

  // Mode de détention
  holdingMode:          HoldingMode
  holdingDetails?: {
    sciName?:         string
    sciSiren?:        string
    ownershipPct:     number   // quote-part de l'utilisateur (1-100)
    coOwners?:        string[] // noms / parts des co-indivisaires
  }

  // Régime fiscal (multi-régime possible si bascule en cours d'année)
  fiscalRegimeHistory: Array<{
    regime:    FiscalRegimeKind
    startDate: Date
    endDate?:  Date
    params?:   FiscalRegimeParams  // discriminé selon regime
  }>

  // Dispositifs fiscaux incitatifs
  taxIncentive?: TaxIncentive   // Pinel / Denormandie / Malraux / MH / Loc'Avantages / Censi-Bouvard

  // Valorisation
  currentEstimatedValue:  number
  valuationDate:          Date
  marketRentEstimate?:    number  // loyer marché (par mois pour le bien entier)

  // Paramètres simulation (indexations, amortissements, hypothèses)
  rentalIndexMode:        'fixed_pct' | 'irl_real'  // si irl_real, fetch série INSEE
  rentalIndexPct:         number
  chargesIndexPct:        number
  propertyIndexPct:       number
  landSharePct:           number    // % terrain non amortissable
  vacancyMonths:          number    // mois équivalents perdus par an

  // Amortissements (régimes réels)
  amortBuildingYears:     number    // ou ventilation par composant ci-dessous
  amortWorksYears:        number
  amortFurnitureYears:    number
  amortComponents?: Array<{
    label:        string   // "gros œuvre" / "toiture" / "façade" / etc.
    base:         number
    years:        number
    startYear?:   number   // si travaux ponctuel, autre que Y1
  }>

  // Hypothèses charges
  gliPct:                 number
  managementPct:          number
  lmpSsiRate:             number
  lmnpMicroAbattementPct: number    // 30 / 50 / 71 selon classé/non classé/tourisme

  notes?:                 string
  status:                 'active' | 'sold' | 'pending_sale' | 'pending_purchase'
  saleDate?:              Date
  salePrice?:             number

  createdAt:              Date
  updatedAt:              Date
}

// ─────────────────────────────────────────────────────────────────
// Adresse
// ─────────────────────────────────────────────────────────────────

export interface Address {
  street?:        string
  postalCode:     string
  city:           string
  insee?:         string   // code INSEE de la commune (pour zonage Pinel)
  department?:    string   // 22, 75, 13...
  country:        string   // 'FR'
  pinelZone?:     'A' | 'A_bis' | 'B1' | 'B2' | 'C'
  rentalZone?:    'tendue' | 'detendue'
  lat?:           number
  lng?:           number
}

// ─────────────────────────────────────────────────────────────────
// Lots (immeuble de rapport, garages associés)
// ─────────────────────────────────────────────────────────────────

export interface Lot {
  id:              string
  propertyId:      string
  userId:          string
  name:            string
  lotType:         'apartment' | 'garage' | 'parking' | 'commercial' | 'storage' | 'other'
  surfaceM2?:      number

  status:          'rented' | 'vacant' | 'owner_occupied' | 'works' | 'reserved'
  rentalType:      'long_term' | 'short_term' | 'mixed'

  // Loyer longue durée
  rentBaseAmount?: number  // loyer HC mensuel
  chargesAmount?:  number  // charges récupérables mensuelles
  marketRent?:     number

  // Loyer courte durée
  nightlyRate?:           number
  occupancyRatePct?:      number  // 0-100
  platformCommissionPct?: number  // ex: 15 % Airbnb
  cleaningFee?:           number
  conciergeFeePct?:       number

  // Locataire / bail (longue durée)
  tenantName?:      string
  leaseStartDate?:  Date
  leaseEndDate?:    Date
  leaseType?:       '3_6_9' | 'meuble_1y' | 'meuble_etudiant' | 'commercial_3_6_9' | 'mobilite' | 'saisonnier'
  depositAmount?:   number

  notes?:           string
  createdAt:        Date
  updatedAt:        Date
}

// ─────────────────────────────────────────────────────────────────
// Crédits (multi-crédit par bien)
// ─────────────────────────────────────────────────────────────────

export type LoanKind = 'amortissable' | 'in_fine' | 'relais' | 'ptz' | 'pel' | 'prêt_action_logement' | 'prêt_travaux'

export interface Loan {
  id:                  string
  propertyId:          string   // multi-crédit possible
  userId:              string
  kind:                LoanKind
  lender:              string
  status:              'active' | 'paid_off' | 'restructured'

  principal:           number
  annualRatePct:       number
  rateType:            'fixed' | 'variable' | 'mixed' | 'capped'
  rateCapPct?:         number   // pour taux capé
  durationMonths:      number
  startDate:           Date

  // Assurance emprunteur
  insurance: {
    type:           'group' | 'delegation'
    annualRatePct:  number
    base:           'capital_initial' | 'capital_remaining'
    quotitePct:     number   // 0-200 (couple 100/100 = 200)
    coverageType:   'deces' | 'deces_ptia' | 'deces_ptia_itt' | 'full'
  }

  // Différé
  deferralType?:       'none' | 'partial_interest' | 'total'
  deferralMonths?:     number

  // Frais
  bankFees:            number
  guaranteeFees:       number
  guaranteeType:       'hypotheque' | 'caution' | 'ppd' | 'autre'

  // Remboursement anticipé
  prepaymentAllowed:   boolean
  prepaymentPenaltyPct?: number  // surcharge IRA contractuelle si > min légal
  prepaymentExempted?:   boolean // clause "sans IRA"

  // Modulation
  modulableMonthlyPct?: number   // ex: ±30 %

  notes?:              string
  createdAt:           Date
  updatedAt:           Date
}

// ─────────────────────────────────────────────────────────────────
// Charges (par bien et par année)
// ─────────────────────────────────────────────────────────────────

export interface PropertyChargesYear {
  id:                  string
  propertyId:          string
  userId:              string
  year:                number

  // Taxes locales
  taxeFonciere:        number
  taxeHabitation:      number   // résidence secondaire
  taxeLogementsVacants: number  // TLV / THLV
  ordureMenageres:     number   // TEOM (si propriétaire)

  // Assurances
  insurancePNO:        number
  insuranceGLI:        number   // peut aussi être un %
  insuranceMRH:        number   // résidence principale

  // Copropriété
  condoFeesCurrent:    number   // charges courantes
  condoFeesWorks:      number   // travaux votés AG
  condoSpecialFund:    number   // fonds travaux obligatoire (loi ELAN)

  // Gestion locative
  managementAgencyFees: number  // si agence
  managementAgencyPct?: number

  // Plateformes courte durée
  airbnbCommission:    number
  bookingCommission:   number
  cleaningFees:        number
  conciergeFees:       number

  // Travaux & entretien
  maintenanceRoutine:  number   // <500 € unitaire, entretien
  maintenanceMajor:    number   // gros travaux non amortis
  repairsByTenant:     number   // refacturables locataire (information)

  // Comptable & autres pros
  accountantFees:      number
  legalFees:           number   // expulsion, contentieux
  diagnosticsFees:     number   // DPE, amiante, plomb

  // Fiscalité professionnelle
  cfe:                 number   // LMNP / LMP / SCI
  cvae?:               number   // SCI à l'IS avec gros CA

  // Abonnements
  internet:            number
  utilities:           number   // si charge propriétaire

  // Autres
  other:               number

  // Provisions
  vacancyRentLoss:     number   // calculé automatiquement, modifiable

  notes?:              string
  createdAt:           Date
  updatedAt:           Date
}

// ─────────────────────────────────────────────────────────────────
// Régimes fiscaux & dispositifs incitatifs
// ─────────────────────────────────────────────────────────────────

export type FiscalRegimeKind =
  | 'foncier_micro' | 'foncier_nu'
  | 'lmnp_micro' | 'lmnp_reel' | 'lmp'
  | 'sci_ir' | 'sci_is'

export interface TaxIncentive {
  kind: 'pinel' | 'pinel_plus' | 'denormandie' | 'malraux'
      | 'monuments_historiques' | 'loc_avantages' | 'censi_bouvard'

  // Pinel / Denormandie
  duration?:           6 | 9 | 12          // années d'engagement
  zone?:               'A' | 'A_bis' | 'B1' | 'B2' | 'C'
  rentCapMonthly?:     number              // loyer plafond mensuel
  tenantIncomeCapAnnual?: number

  // Malraux / MH
  worksAmount?:        number
  worksStartYear?:     number
  worksEndYear?:       number
  reductionRatePct?:   number              // ex: Malraux 30 % en site patrimonial remarquable

  // Loc'Avantages
  conventionType?:     'loc1' | 'loc2' | 'loc3'   // 15 / 35 / 65 %
  conventionStartDate?: Date
  conventionEndDate?:  Date

  notes?:              string
}

// ─────────────────────────────────────────────────────────────────
// Valorisations (historique)
// ─────────────────────────────────────────────────────────────────

export interface PropertyValuation {
  id:              string
  propertyId:      string
  userId:          string
  valuationDate:   Date
  value:           number
  pricePerM2?:     number
  source:          'purchase_deed' | 'owner_estimate' | 'agent_estimate'
                 | 'expert_appraisal' | 'dvf'     // DVF = Demandes de Valeurs Foncières (gouv.fr)
  confidence:      'low' | 'medium' | 'high'
  notes?:          string
  createdAt:       Date
}

// ─────────────────────────────────────────────────────────────────
// Documents joints
// ─────────────────────────────────────────────────────────────────

export interface PropertyDocument {
  id:           string
  propertyId:   string
  userId:       string
  kind:         'acte_vente' | 'compromis' | 'bail' | 'quittance'
              | 'dpe' | 'diagnostic_amiante' | 'plan' | 'photo'
              | 'pv_ag' | 'reglement_copro' | 'avis_tf' | 'autre'
  storagePath:  string         // Supabase Storage
  fileName:     string
  sizeBytes:    number
  mimeType:     string
  year?:        number         // si lié à une année (TF, AG, etc.)
  uploadedAt:   Date
}
```

---

## 10. ANNEXES

### 10.1 Couverture des tests

| Fichier | Lignes | Couverture |
|---|---|---|
| `amortization.test.ts` | 4 892 | PMT, schedule, deferral |
| `credit.test.ts` | 7 741 | CRD, IRA, PTZ |
| `credit-edge-cases.test.ts` | 13 025 | dates limites |
| `compare.test.ts` | 10 650 | réel vs simulé |
| `regimes.test.ts` | 6 796 | 7 régimes |
| `forecast.test.ts` | 9 850 | indexation projection |
| `insights.test.ts` | 10 082 | drift alerts |
| `year-end-report.test.ts` | 5 652 | bilan annuel |
| `plusValue.test.ts` | 10 707 | PV particuliers |
| `plusValue-regimes.test.ts` | 18 097 | PV multi-régimes |
| `incomplete-data.test.ts` | 4 884 | validations partielles |
| `build-from-db.test.ts` | 9 592 | conversion DB → simulation |
| `csv-import.test.ts` | 5 448 | parsing CSV |
| `defaultCharges.test.ts` | 1 476 | ratios défaut |
| `reference-*.test.ts` | 9 541 | benchmarks réels |

**Total : ~140 000 octets de tests** (≈ 2 800-3 200 lignes).

### 10.2 Législation référencée

- **CGI art. 150 U** : plus-value particuliers (abattements durée de détention).
- **CGI art. 151 septies** : exonération PV pro LMP selon CA.
- **Code consommation art. L313-47 / R314-1** : plafond IRA (3 % CRD ou 6 mois d'intérêts).
- **Loi de finances 2025** : réintégration des amortissements à la PV LMNP ;
  abattement micro-BIC tourisme non classé ramené à 30 % (plafond 15 000 €).

### 10.3 Indicateurs à instrumenter (Phase 6+)

- Taux de complétion du formulaire de création.
- Régime fiscal choisi (distribution).
- Erreurs de simulation (`incompleteData = true`).
- Drift alerts déclenchés (par type).
- Conversion simulateur → bien réel.

---

*Audit réalisé par lecture directe du code, validation des migrations Supabase 001 / 005 / 006,
inspection des 7 calculateurs fiscaux et de la projection annuelle.
Aucune modification de code n'a été apportée pendant l'audit.*
