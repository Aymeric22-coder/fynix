# Audit Portefeuille FIRECORE — v2 (post-Phase 2)

**Date :** 2026-06-04
**Auditeur :** Claude Code
**Baseline v1 :** 5,5 / 10
**Objectif Phase 2 :** 8,5 / 10
**Commit audité :** `86e1a15`
**État DB observé :** 17 positions actives · 6 enveloppes · 32 transactions
(0 dividendes · 0 ventes avec `realized_pnl`) · 1 devise (EUR) · 3 benchmarks
× 15 prix = 45 points historiques.

---

## 1. Résumé exécutif

- **Note globale Phase 2 atteinte : NON.** Score : **7,3 / 10**.
- La progression depuis 5,5 est massive (+1,8). Tous les chantiers livrés sont
  individuellement solides : calculs corrects, tests verts, UX cohérente après
  INFO-TIPS. La régression P0 sur le graphique « Évolution du portefeuille »
  (cf. § 6) pénalise lourdement l'expérience visible en prod ; sans ce bug le
  score réel se situerait à ~8,2 / 10, tout proche de la cible. Les manques
  restants relèvent davantage du polish Phase 3 (DRIP, splits, fenêtres
  courtes MWR, export) que d'une faute structurelle.
- **Top 3 forces** :
  1. Exactitude des calculs TWR/MWR/IRR validée par 32 tests dédiés, formules
     mathématiquement correctes (bissection robuste, ajustement cash-flows).
  2. Architecture data **pure / testable** (`lib/portfolio/*` = 100 % logique,
     `components/*` = 100 % rendu). 131 fichiers tests, 1776/1776 verts.
  3. UX pédagogique post-INFO-TIPS : 19 tooltips couvrent tous les acronymes
     financiers critiques, libellés calibrés (1-2 phrases), placement bottom
     sur les `<th>` (overflow contourné).
- **Top 3 faiblesses persistantes** :
  1. Persona « Pré-retraité AV ≥ 8 ans » (TAX) : `regimeLabel` est correct
     mais le calcul AV ne distingue **pas** les primes ≤ 150 k€ vs > 150 k€
     (taux IR 7,5 % vs 12,8 %). Documenté comme "estimation cosmétique" mais
     potentiellement trompeur pour un patrimoine élevé.
  2. Fenêtres < 6 mois : `MWR` annualisé peut afficher des valeurs extrêmes
     (+200 %, −95 %) sur des séries courtes avec apports récents. InfoTip
     l'explique mais aucune mitigation côté UX (pas de bascule rendement
     absolu).
  3. Aucun mécanisme **lecture / édition** des transactions historiques. La
     modale "Nouvelle transaction" crée mais ne permet ni édition ni
     suppression d'une ligne erronée.
- **Top 3 bugs prioritaires** :
  1. **P0 — Graphique « Évolution »** clippe à zéro depuis le 27/05 (régression
     E12). Filtre `.is('envelope_id', null)` manquant L78-83 dans
     `app/(app)/portefeuille/page.tsx`. Cf. § 6 bug #1.
  2. **P1 — `/api/portfolio/snapshot` GET** souffre du même filtre manquant.
     Pas de consommateur actif mais bug réplicable. Cf. § 6 bug #2.
  3. **P2 — `dividends_count = 0` en DB** : le persona « Revenus passifs »
     n'a aucun cycle détecté. Le code DCAL est sain ; c'est l'absence
     d'import qui empêche d'évaluer le rendu réel. Pas une faute du code,
     mais un trou de couverture e2e.

---

## 2. Notes multi-dimensions

| Dimension                                  | Score | Justification courte                                                                                       |
| ------------------------------------------ | :---: | ---------------------------------------------------------------------------------------------------------- |
| UX et lisibilité (post INFO-TIPS)          |  8,5  | Tooltips calibrés, BNCH-pp clos, alignement OK. Bug graphique = −1.                                        |
| Exactitude des calculs                     |  9,0  | TWR/MWR/IRR purs et testés. Fiscal majorant assumé. Édge case primes > 150 k€ AV non géré.                 |
| Couverture fonctionnelle                   |  7,0  | TWR/MWR/PV/Dividendes/Fiscal/Benchmarks/CSV livrés. Manque DRIP, splits, édit-tx, export.                  |
| Robustesse multi-profil                    |  6,5  | Solide P1-P2-P3-P5. Faiblesses P4 (DRIP), P6 (HNW : volume / multi-AV).                                    |
| Performance technique (build, tests)       |  9,5  | 1776/1776 verts en 25-30 s. Build Vercel <2 min. Bundle 102 kB shared, /portefeuille 15.5 kB.              |
| Cohérence visuelle et pédagogique          |  8,0  | InfoTips + BNCH-pp. Manque polish des courbes (axe X doublons après bug E12), pas de bascule abs/annualisé.|

---

## 3. Régression test (14 chantiers)

| Chantier                              | État | Régression / Interaction négative                                                | Notes                                                                                  |
| ------------------------------------- | :--: | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| R1 — `realized_pnl`                   |  ✅  | Aucune. Colonne en DB, alimentée par `movements.ts`.                             | DB : 0 ventes typées → indicateur fonctionne mais invisible pour ce user.              |
| R2 — FX banner                        |  ✅  | Aucune.                                                                          | DB : 1 currency (EUR) → banner jamais affichée. Code branché et défensif.              |
| D4 — `computeRunningCump` trail       |  ✅  | Aucune.                                                                          | Trail exposé, utilisé par les tests CUMP (`cump.test.ts`).                              |
| R6 — KPI PV réalisée 12 M             |  ✅  | Aucune.                                                                          | `realized-pnl-card.tsx` rend `null` si total 0. Skippé en prod (0 ventes).             |
| R3 — CSV dividendes                   |  ✅  | Aucune.                                                                          | Pipeline `dividend-import.test.ts` vert. DB : 0 dividendes importés à ce jour.         |
| **E12 — TWR/MWR enveloppes**          |  ⚠️  | **A CASSÉ le graphique d'évolution** (cf. § 6 bug #1). Cause migration 044.       | La table fonctionne. C'est le wrapper `<div>` page qui n'a pas adapté son filtre.      |
| Modale « Nouvelle transaction »       |  ✅  | Aucune.                                                                          | 3 segments, validation client. Bug latent : pas d'édition / suppression.               |
| DCAL — calendrier dividendes          |  ✅  | Aucune (skippé sur 0 dividends).                                                  | Module pur testé. Visible uniquement onglet Global.                                    |
| EPT correctif Global-only             |  ✅  | Aucune.                                                                          | Triple condition `activeCategory === 'global'` propre.                                 |
| REFR — fraîcheur + manuel             |  ✅  | Aucune.                                                                          | P2 + P6 fonctionnels. UI affichée dans le bandeau de fraîcheur.                        |
| TAX — fiscalité enveloppe             |  ✅  | Aucune.                                                                          | Modèle correct sauf édge AV > 150 k€. Disclaimer explicite.                            |
| BNCH — benchmarks Edge Function       |  ✅  | Aucune en prod. Le détour Edge Function fonctionne.                              | 45 prix benchmarks en DB, cohérent avec 3 × 15 jours ouvrés.                           |
| INFO-TIPS                              |  ✅  | Bug overflow déjà corrigé (placement bottom).                                    | 19 tooltips, libellés validés.                                                         |
| BNCH-pp                                |  ✅  | Aucune.                                                                          | Helper local `formatSpreadPp`. `formatPercent` global intact.                          |

**Verdict régression** : 13/14 chantiers indemnes. E12 a introduit une
régression visible côté graphique (filtre manquant dans le wrapper page,
pas dans le module E12 lui-même).

---

## 4. Vérification des calculs

| Indicateur                  | Formule de référence                                                                                            | Implémentation observée                                                                                                                                          | Écart / Notes                                                                                                                                                                | Criticité |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: |
| TWR                         | `∏(1 + ri)` avec `ri = (Vfin − Vdebut − cf_net) / Vdebut`                                                       | `analytics.ts:60-83` : bucket cash-flows, `r = V_curr / (V_prev + cf) − 1`, produit cumulé. Cash-flow appliqué en début de période (convention BoD documentée).  | Conforme. Cas limite : V_start ≤ 0 → null (correct). Annualisation séparée via `annualizeReturn`.                                                                            |    OK     |
| MWR                         | IRR du vecteur `{cash flows + V_T}`, annualisé                                                                  | `analytics.ts:111-143` : bissection sur `[−0.99, 10]`, NPV = Σ flux × (1+r)^(−t). `V_0` traité comme apport au t=0.                                              | Conforme. Robuste (pas de divergence Newton). Sur fenêtre < 6 mois, valeur peut être absurde (limite mathématique de l'IRR annualisé). Pas de garde-fou UX.                  |    P2     |
| PV latente                  | Σ `(qty × prix_actuel − cost_basis)` positions ouvertes                                                          | `valuation.ts` : itère positions, calcule `marketValue` et `costBasis` en devise ref. PV = MV − CB. Filtre `status='active'`.                                    | Conforme. Fallback FX 1:1 documenté (`excludedForFx`) si paire indisponible.                                                                                                |    OK     |
| PV réalisée 12 M            | Σ `realized_pnl` sur transactions des 365 derniers jours                                                         | `build-from-db.ts` section R6 : `SELECT realized_pnl FROM transactions WHERE realized_pnl IS NOT NULL AND executed_at >= now()-365d`.                            | Conforme. Indicateur null tant qu'aucune vente n'a été enregistrée (DB actuelle = 0).                                                                                       |    OK     |
| YoC                         | Σ dividendes 12 M / Σ (PRU × qty)                                                                                | `build-from-db.ts` section dividendes : ratio numérateur (TTM dividendes en EUR) / dénominateur (`Σ costBasis` positions distributrices).                       | Conforme. Si dénominateur 0 → null. Si position fermée mais dividendes restent → division correcte (dénominateur reflète parts encore détenues).                            |    OK     |
| YoM                         | Σ dividendes 12 M / Σ valeur marché actuelle                                                                     | Idem YoC mais dénominateur = `Σ marketValue` au lieu de `Σ costBasis`.                                                                                            | Conforme.                                                                                                                                                                   |    OK     |
| PFU 30 %                    | gains × (12,8 % IR + 17,2 % PS)                                                                                  | `tax-estimate.ts:21` : constante `PFU_TOTAL = 0.30`. Appliqué CTO, crypto, PEA < 5 ans, AV < 8 ans, et fallback "ancienneté inconnue".                          | Conforme.                                                                                                                                                                   |    OK     |
| Abattement AV ≥ 8 ans       | min(4 600 € seul / 9 200 € couple marié-PACS, gains éligibles)                                                  | `tax-estimate.ts:305-332` : abattement foyer pré-calculé selon situation, **réparti au prorata** entre les contrats AV ≥ 8 ans avec PV > 0. Couple = mariage/PACS strict ; concubinage = individuel. | Conforme et soigné. **Manque** : taux IR 7,5 % vs 12,8 % selon primes ≤ ou > 150 k€. Tous taxés à 7,5 %, ce qui sous-estime pour primes > 150 k€.                            |    P2     |
| PRU / CUMP                  | rolling moyenne pondérée des achats nets des ventes au CUMP                                                     | `cump.test.ts` (15 cas) : achats incrémentaux pondèrent, ventes réduisent qty sans changer le PRU (convention CUMP).                                            | Conforme. Trail exposé via D4 pour traçabilité (par transaction).                                                                                                          |    OK     |
| Conversion FX               | par transaction (date historique) pour le coût, prix courant pour la valorisation                               | `build-from-db.ts` : `getFxRate(currency, refCurrency)` au prix courant pour MV ; coût converti via le taux observé à la date de la transaction (`fx_rates`).    | Conforme. Cas limite : si pas de taux historique → fallback prix courant (potentielle distorsion sur achats anciens en devise volatile).                                    |    P2     |

**Cas limites vérifiés** :
- Position intégralement vendue (`qty = 0`) : exclue du filtre `status='active'`, pas comptée. PV réalisée capturée via `realized_pnl` à la vente.
- Devise étrangère (EUR/USD/JPY) : `getFxRate` gère, fallback 1:1 documenté.
- Plusieurs lots d'achat : CUMP rolling testé (cf. `cump.test.ts`).
- Dividendes en devise étrangère : convertis via `getFxRate` à la date du dividende (testé dans `dividends.test.ts`).
- Fenêtres courtes : `annualizeReturn` pas guardée → MWR peut paraître extrême. P2.
- Couple marié vs concubinage : `normalizeSituationFamiliale` distingue strictement. Concubinage = individuel. ✓

---

## 5. Robustesse multi-profil

| # | Persona                    | Note   | Justification                                                                                                                                                                                                                                                                                    | Top 1 manque fonctionnel                                                                  |
| - | -------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 | Débutant ETF                | 8 / 10 | Cockpit + courbe + comparaison BNCH suffisent. InfoTips clarifient TWR/MWR. ETF accumulant → DCAL skip, légitime. Bug courbe gâche cette persona en premier (visible dès la 1ère semaine d'usage).                                                                                                | Aide à comprendre "pourquoi mon ETF n'apparaît pas dans DCAL" (libellé absent).            |
| 2 | Multi-enveloppes équilibré   | 7 / 10 | EPT (TWR/MWR par enveloppe) brille ici. TAX donne l'estimation foyer. Bug graphique très visible (5-6 enveloppes = 5x densité fausse). Pas d'export pour reporting.                                                                                                                              | Export CSV des positions ventilées par enveloppe.                                          |
| 3 | Avancé multi-classes         | 6 / 10 | Multi-devises supportées mais sans historique précis (FX courant pour fallback). Obligations non typées comme classe à part. Crypto OK via wallet. R2 banner désigne le risque mais sans détail par paire.                                                                                       | Coût historique en FX par transaction (et non taux courant).                               |
| 4 | Revenus passifs              | 6 / 10 | DCAL bien outillé (calendrier, projection annuelle, fréquence détectée). **Mais : pas de DRIP** ni de visualisation cumul TTM par mois. Persona dépendant à 100 % de l'import CSV (R3) car aucune saisie manuelle UI dédiée hors modale TX.                                                       | DRIP automatique (réinvestissement des dividendes).                                        |
| 5 | Pré-retraité (AV ≥ 8 ans)    | 7 / 10 | TAX gère bien l'abattement foyer + prorata multi-AV. Régime affiché clair. Manque : sous-estimation primes > 150 k€ (cf. § 4). Pas de simulation "et si je sors X € cette année ?".                                                                                                              | Simulateur de retrait progressif avec impact fiscal.                                       |
| 6 | HNW complexe (50+ positions) | 5 / 10 | Le bundle reste léger mais l'UX scroll commence à fatiguer (pas de filtrage avancé, pas de tri multi-colonnes, pas de regroupement par compte AV). Calculs supportent le volume sans souci. EPT scale bien (1 ligne par enveloppe).                                                              | Filtres / recherche / tri avancés sur la table des positions.                              |

**Note moyenne multi-profil : 6,5 / 10.**

---

## 6. Bugs détectés

| # | Bug                                                                                                                | Sévérité | Fichier(s)                                                                            | Cause racine                                                                                                                                                                                                                                                                                                                                          | Fix proposé                                                                                                                                                                                                                                                                | Effort |
| - | ------------------------------------------------------------------------------------------------------------------ | :------: | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| 1 | **Graphique « Évolution du portefeuille » oscillant + doublons dates depuis le 27/05** *(bug remonté utilisateur)* | **P0**    | `app/(app)/portefeuille/page.tsx:78-83`                                                | La requête `from('portfolio_snapshots').select(...).eq('user_id', ...).order(...).limit(90)` **ne filtre pas `envelope_id`**. Depuis la migration 044 (E12), la table contient des lignes globales (`envelope_id IS NULL`) ET des lignes par enveloppe. Pour ce user : 29 globales + 78 par enveloppe (6 enveloppes × 13 jours), soit ~7 lignes/jour. Le graphique reçoit ce mix → mêmes dates répétées, valeurs qui oscillent entre la valeur d'enveloppe (faible) et la valeur globale (~50 k€). Footer "65 snapshots sur 22 jours" = artefact de cette duplication. | Ajouter `.is('envelope_id', null)` à la chaîne. Diff minimal :<br>```ts<br>.from('portfolio_snapshots')<br>.select(...)<br>.eq('user_id', user!.id)<br>+ .is('envelope_id', null)<br>.order('snapshot_date', { ascending: false })<br>.limit(90)<br>``` | S      |
| 2 | `/api/portfolio/snapshot` GET souffre du même filtre manquant                                                     | **P1**    | `app/api/portfolio/snapshot/route.ts:26-31`                                            | Réplique exacte du bug #1 dans la route API. Pas de consommateur actif côté front (grep négatif) mais l'endpoint est public et pollue tout client externe.                                                                                                                                                                                          | Même fix : ajouter `.is('envelope_id', null)` avant `.order(...)`. Cohérence avec `build-from-db.ts:662` qui filtre déjà correctement.                                                                                                                                  | S      |
| 3 | Annualisation MWR sur fenêtres < 6 mois → valeurs extrêmes                                                          | P2        | `lib/portfolio/analytics.ts:111-143` + appelants `build-from-db.ts`                    | `computeMWR` retourne un IRR annualisé. Sur une fenêtre de 2 mois avec un apport de 10 k€ et une valorisation de 10,2 k€, l'IRR annualisé peut afficher +12 % alors que le rendement réel est +2 %. Comportement mathématiquement correct mais trompeur. InfoTip explique la chose mais aucune mitigation UX.                                       | Pour les fenêtres < 6 mois (ou < `ANNUALIZATION_MIN_DAYS = 365`, cf. BNCH), afficher le **rendement absolu non-annualisé** + libellé "Sur N mois" au lieu de l'IRR annualisé.                                                                                          | M      |
| 4 | Taux IR AV ≥ 8 ans ne distingue pas primes ≤/> 150 k€                                                              | P2        | `lib/portfolio/tax-estimate.ts:24,266-284`                                              | `AV_TAUX_REDUIT_IR = 0.075` appliqué uniformément. Or, sur la fraction des primes versées au-delà de 150 k€ (300 k€ couple), le taux IR passe à 12,8 % (PFU). Pour un HNW, sous-estimation potentielle.                                                                                                                                          | Ajouter une donnée `primesVersees` à `EnvelopeTaxInput` et bifurquer le taux selon le seuil 150 k€ / 300 k€ couple. Si donnée absente → conserver 7,5 % avec note "primes supposées ≤ 150 k€".                                                                                | M      |
| 5 | Coût historique en FX utilise le taux courant si pas de taux historique                                            | P2        | `lib/portfolio/build-from-db.ts` (section conversion coûts)                            | Si la table `fx_rates` n'a pas de point à la date de la transaction, le fallback prend le taux courant. Pour une position USD achetée à 1,05 et valorisée à 1,10 EUR/USD, le coût est sur-estimé en EUR si le taux courant est utilisé en lieu et place du 1,05.                                                                                  | Logguer un `excludedForFx` côté coût historique, identique à ce qui existe déjà côté valorisation. Documenter dans la banner R2.                                                                                                                                              | M      |
| 6 | Pas de mécanisme édition/suppression d'une transaction                                                              | P2        | UI globale `/portefeuille` + `add-transaction-modal.tsx`                                | La modale "Nouvelle transaction" crée. Aucune route DELETE/PUT sur `/api/portfolio/transactions/[id]` exposée côté UI. Erreur de saisie = inerte ou via SQL manuel.                                                                                                                                                                                | Nouvelle modale `edit-transaction-modal.tsx` + boutons crayon/poubelle sur les lignes du futur historique. Voir Phase 3.                                                                                                                                                  | L      |
| 7 | DCAL ne se rend pas pour un utilisateur sans dividendes typés (`dividend`)                                          | OK (non-bug) | DB (`transactions.transaction_type`)                                                  | Pas un bug code. DCAL renvoie `null` quand aucun cycle ≥ 2 versements. Pour ce user, 0 lignes type `dividend` → carte invisible. Couverture e2e à améliorer.                                                                                                                                                                                       | Importer un CSV de test (R3 le permet) ou ajouter une fixture dans les tests d'intégration.                                                                                                                                                                                | S      |
| 8 | `secret.txt` à la racine du projet                                                                                 | OK        | `.gitignore` ligne 26                                                                  | Confirmé ignoré par git. Confirmé non lu par aucun fichier prod (`app/`, `lib/`, `supabase/`). Risque résiduel : zéro.                                                                                                                                                                                                                                | Rien. Surveillance via gitignore.                                                                                                                                                                                                                                          | —      |

**Détail bug #1 (corroboration SQL)** :

```sql
SELECT envelope_id IS NULL AS is_global, COUNT(*) AS rows,
       MIN(snapshot_date) AS oldest, MAX(snapshot_date) AS newest
FROM portfolio_snapshots GROUP BY (envelope_id IS NULL);
```

Résultat :
- `is_global=true` : **29 rows** (2026-05-11 → 2026-06-10)
- `is_global=false` : **78 rows** (2026-05-27 → 2026-06-10)

Le 27/05 correspond au déploiement E12. Les 78 rows par enveloppe / 14 jours
= ~5,6 rows/jour → confirme 6 enveloppes actives × 14 jours. Le `limit(90)`
trie par date DESC et tronque, donc la fenêtre la plus récente est sur-représentée
par les lignes par enveloppe (5-6 par jour) tandis que le passé (avant E12)
ne contient que des lignes globales → courbe lisse avant 27/05, dents de scie après.

**Consommateurs sains de `portfolio_snapshots` (pour comparaison)** :
- `lib/portfolio/build-from-db.ts:312-316` : utilise `.not('envelope_id', 'is', null)` (E12).
- `lib/portfolio/build-from-db.ts:659-663` : utilise `.is('envelope_id', null)` (BNCH window).
- `lib/portfolio/persist-snapshot.ts:51` : INSERT explicite `envelope_id: null` (global).
- `lib/portfolio/persist-snapshot.ts:86` : INSERT par enveloppe avec `envelope_id` non-null.

→ Tous les consommateurs critiques côté lib sont corrects. Les 2 oublis sont
côté `app/` (page + route API), ajoutés ou modifiés sans relire le contrat
de la migration 044.

---

## 7. Axes d'amélioration Phase 3

Triés par impact / effort. Code couleur impact : low / med / high.

| # | Axe                                                                          | Description                                                                                                                                                                                                                              | Justification                                                                                                                                                                            | Effort | Impact |
| - | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: | :----: |
| 1 | **Fix graphique évolution + endpoint snapshot**                              | Ajouter `.is('envelope_id', null)` aux 2 sites identifiés § 6.                                                                                                                                                                            | Régression visible quotidiennement par tout user multi-enveloppes. Trivial. Bénéfice visuel immédiat.                                                                                     |   S    |  high  |
| 2 | Polish MWR < 6 mois : bascule rendement absolu                                | Si fenêtre < 180 j, afficher "X % sur N mois" au lieu de l'IRR annualisé. Garder l'annualisé en sous-libellé pour les ≥ 1 an.                                                                                                              | Améliore directement le ressenti des nouveaux users (qui n'ont qu'1-2 mois de données). InfoTip MWR adressait la confusion par les mots, pas la cause.                                  |   M    |  high  |
| 3 | Édition / suppression de transactions historiques                              | Routes PUT/DELETE + modale `edit-transaction-modal.tsx`. Ligne historique cliquable. Garde-fou : confirmation, recalcul CUMP impacté.                                                                                                       | Indispensable pour corriger une erreur de saisie. Sans cela les users vont en DB direct (ou abandonnent).                                                                                |   L    |  high  |
| 4 | Export CSV des positions (+ transactions)                                     | Bouton "Exporter" → CSV positions (qty, PRU, MV, +/−, enveloppe) + CSV transactions (date, type, montant, devise). Encodage UTF-8 + BOM Excel.                                                                                              | Persona "reporting" + sortie pour comptable. Trivial à implémenter une fois la data déjà en mémoire côté page.                                                                          |   S    |  med   |
| 5 | DRIP — réinvestissement automatique des dividendes                            | Toggle par position "DRIP actif". Si activé, chaque ligne `dividend` génère une `purchase` synthétique du même montant. Calculs YoC/YoM/PRU automatiquement cohérents.                                                                       | Persona "Revenus passifs" : aujourd'hui un dividende perçu et réinvesti manuellement nécessite 2 saisies + recalcul mental du PRU. Bénéfice fort, complexité moyenne.                    |   M    |  high  |
| 6 | Splits / fusions / regroupements d'actions                                    | Modale "Action sur titre" → split N:M, fusion (échange titre A vs titre B), dividende exceptionnel en titres. Ajuste qty/PRU sans générer de PV réalisée.                                                                                  | Sans ça, un split 4:1 vu en juin force le user à recalculer son PRU à la main. Indispensable pour persona HNW historique 10 ans.                                                       |   L    |  med   |
| 7 | Format temps relatif plus précis pour la fraîcheur (REFR)                     | Au lieu de "Mis à jour il y a 3 j", afficher "Mis à jour aujourd'hui 14:32" si même jour, "Hier 16:01" si J−1, etc. Détection 14:31 (heure marché) ou 17:35 (clôture) en label.                                                              | Polish UX. Aujourd'hui le label est vague.                                                                                                                                              |   S    |  low   |
| 8 | Annualisation activée à partir d'1 an pour BNCH                               | Cohérent avec `ANNUALIZATION_MIN_DAYS = 365` du module. Aujourd'hui le code respecte cette borne ; vérifier que l'UI BNCH affiche bien `—` au lieu d'un annualisé absurde sur < 365 j. Probablement déjà OK, à recroiser.                  | Hygiène / consistance avec MWR < 6 mois. À grouper avec axe #2.                                                                                                                          |   S    |  low   |
| 9 | Sortie HNW : filtres / recherche / tri multi-colonnes sur les positions       | Search input, dropdown classe, dropdown enveloppe, tri ascendant/descendant sur 3-4 colonnes-clés.                                                                                                                                          | Persona HNW (50+ positions) : aujourd'hui la table est un long scroll.                                                                                                                  |   M    |  med   |
| 10 | TAX : différencier primes ≤ vs > 150 k€ pour AV ≥ 8 ans                       | Nouveau champ `primesVersees` côté enveloppe AV. Bifurcation 7,5 % vs 12,8 % au-delà du seuil. Note explicite sur la fraction concernée.                                                                                                   | Persona "Pré-retraité aisé". Aujourd'hui sous-estimation.                                                                                                                                |   M    |  low   |
| 11 | Coût historique FX (banner R2 enrichi)                                        | Tracer dans `excludedForFx` les **coûts** sans taux historique, pas seulement les valorisations. Documenter dans le bandeau R2.                                                                                                            | Transparence pour persona multi-devises.                                                                                                                                                |   M    |  low   |
| 12 | Simulateur de retrait (AV / PEA) avec impact fiscal                            | Slider "Je sors X € cette année", calcule l'impôt résultant et le reliquat d'abattement.                                                                                                                                                   | Persona "Pré-retraité".                                                                                                                                                                   |   L    |  med   |
| 13 | Notification e2e : "Toi qui n'as importé aucun dividende, voici comment"      | Toast/EmptyState dédié dans DCAL pour pousser à l'import R3 plutôt qu'un trou. Avec un lien "Importer un CSV".                                                                                                                              | Conversion utilisateur (vers usage R3). Aujourd'hui la carte est juste absente sans explication.                                                                                          |   S    |  low   |
| 14 | Snapshots inverse-engineering : page d'admin pour rejouer un snapshot         | Outil debug. Vue de l'historique des snapshots persisted (avec mention global vs enveloppe), bouton "Recalculer pour date X". Bonus : alerte si gap > 7 j.                                                                                  | Outillage devtools. Utile maintenant que la table porte des sémantiques différentes.                                                                                                  |   M    |  low   |

---

## 8. Verdict

**Score Phase 2 atteint : NON (7,3 / 10, objectif 8,5).** Le bug graphique
P0 absorbe ~1 point à lui seul. Sans lui, on serait à ~8,2 / 10, à un cheveu
de la cible. Les ~0,3 restants tiennent dans le polish MWR < 6 mois (P2) et
l'absence d'édition de transactions. **Aucune dette technique structurelle**.

**3 priorités absolues pour la prochaine session** (par ordre) :

1. **Fix graphique évolution + endpoint snapshot** (2 sites, ~10 lignes,
   1 commit). Effort S, impact high. Restaure la confiance dans l'écran
   principal de la section.
2. **Polish MWR sur fenêtres courtes** (bascule rendement absolu < 6 mois).
   Effort M, impact high. Concrètement, modifie le rendu côté
   `build-from-db.ts` (passer un flag `useAnnualized` selon la durée de la
   fenêtre) et le composant côté page. Pas de migration.
3. **Édition / suppression de transactions historiques**. Effort L, impact
   high. C'est le manque le plus visible aujourd'hui — un user qui s'est
   trompé n'a aucun recours UI.

**Recommandation : continuer à itérer.** L'app n'est PAS prête pour une
phase "pause d'utilisation pure" tant que le bug graphique P0 traîne
(régression introduite mécaniquement par E12, visible chaque jour). Une
session de 1-2 h sur les 3 priorités ci-dessus serait nettement plus
rentable que de tester l'app en l'état. Après ces 3 fixes, oui, une phase
d'usage réel (saisie de transactions réelles, observation des courbes,
import de dividendes) permettrait d'identifier le prochain lot d'irritants.
