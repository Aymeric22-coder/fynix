# Audit Cash — FIRECORE / Fynix

> Mode lecture seule. Date d'audit : 2026-06-03. Périmètre : `/cash` + interactions Profil/Dashboard.

---

## 1. Synthèse exécutive

**Note globale : 42 / 100.**

La section Cash actuelle est essentiellement un **CRUD d'inventaire de livrets** avec un total agrégé. Les calculs basiques (somme, intérêts annuels par ligne) sont justes mais **tout ce qui fait la valeur métier d'une section Cash — matelas de sécurité contextualisé, alertes, équivalent en mois de salaire, cash volontaire — est absent de la page `/cash`**. La logique « coussin » existe ailleurs (scores Solidité, `CouvertureCash` dans `/analyse`, recommandations), mais elle est **basée sur `charges_mensuelles` et non sur le salaire net + statut pro**, ce qui ne correspond pas à la cible produit décrite.

**Top 3 forces**
1. Modèle de données solide : `cash_accounts` + `cash_balance_history` (historique append-only), RLS user_id, FX support natif.
2. Calculs primaires corrects : `intérêts = balance × interest_rate / 100`, total cash bien sommé, dédup vs `assets` legacy au niveau Dashboard.
3. Intégration Dashboard propre (`CashSummaryCompact`) avec garde anti double comptage.

**Top 3 faiblesses**
1. **Aucune notion de matelas / coussin de sécurité sur la page `/cash` elle-même** — l'utilisateur voit un total brut, sans contexte.
2. **Coussin calculé via `charges_mensuelles` partout, pas via salaire net × multiplicateur statut pro** — la cible produit est manquée.
3. **Pas de compte courant distinct**, pas de toggle « cash volontaire », pas de pédagogie, pas d'état vide structuré sur le matelas.

**Verdict refactor : nécessaire** (P0 + P1 majeurs, pas un simple polissage).

---

## 2. Cartographie technique

### Fichiers liés à Cash

| Fichier | Rôle |
|---|---|
| `app/(app)/cash/page.tsx` | Page Server, liste les comptes, affiche total + lignes |
| `components/pages/cash-actions.tsx` | Bouton « Ajouter un compte » (ouvre modal) |
| `components/pages/cash-edit-row.tsx` | Wrapper carte cliquable → modal d'édition |
| `components/forms/add-cash-form.tsx` | Modal CRUD (création + édition) |
| `app/api/cash/route.ts` | `GET` (liste + total), `POST` (création), `PUT` (legacy, id en query) |
| `app/api/cash/[id]/route.ts` | `PUT` (mise à jour complète), `DELETE` (soft via `assets.status = 'closed'`) |
| `lib/cash/rate-per-account.ts` | Pur, calcule le taux annualisé par compte (Z8.5 du Dashboard) |
| `lib/cash/__tests__/rate-per-account.test.ts` | Tests Vitest (5 cas) |
| `components/dashboard/cash-summary-compact.tsx` | Ligne compacte du Dashboard |
| `components/analyse/CouvertureCash.tsx` | Bloc « mois de charges couverts » (onglet Analyse) |
| `lib/analyse/aggregateur.ts` (`loadCash`) | Charge `cash_accounts`, calcule `totalCash` + `totalCashInvestissable` |
| `lib/analyse/dashboard-pipeline/calc.ts` (`computeCashSummary`) | Recalcule le total côté Dashboard (dédup `assets` cash legacy) |
| `lib/analyse/dashboard-pipeline/load.ts` | Charge `cash_accounts` (id, asset_id, balance, currency, account_type, interest_rate, created_at, bank_name) |
| `lib/analyse/scores.ts` (`calculerSolidite`) | Bloc « coussin de sécurité » (c) |
| `lib/analyse/recommandations.ts` | Recos « cash-excessif » (>20 %) et « cash-insuffisant » (<3 mois charges) |
| `lib/analyse/recoMensuelles.ts` | Reco mensuelle « investir l'excédent au-delà du coussin 6 mois charges » |
| `supabase/migrations/001_initial_schema.sql` | Section 9 — schéma `cash_accounts` et `cash_balance_history` |

### Schéma DB

```sql
-- supabase/migrations/001_initial_schema.sql:428
CREATE TABLE cash_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id      UUID NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type  TEXT NOT NULL CHECK (account_type IN (
                  'livret_a','ldds','lep','livret_jeune','pel','cel',
                  'compte_courant','compte_epargne','other')),
  bank_name     TEXT,
  interest_rate NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- en % annuel
  balance       NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_date  DATE,
  currency      currency_code NOT NULL DEFAULT 'EUR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cash_balance_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_account_id UUID NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  balance_date    DATE NOT NULL,
  balance         NUMERIC(18,2) NOT NULL,
  source          data_source NOT NULL DEFAULT 'manual',
  UNIQUE (cash_account_id, balance_date)
);
```

Le nom du compte vit dans `assets.name` (FK `asset_id`), pas dans `cash_accounts`.

### RLS

```sql
-- supabase/migrations/001_initial_schema.sql:806
CREATE POLICY "user_own_data" ON cash_accounts
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_own_data" ON cash_balance_history
  FOR ALL USING (user_id = auth.uid());
```

Correct, isolation user complète. Pas de fuite possible.

### Points d'intégration

| Producteur | Consommateur | Données |
|---|---|---|
| `cash_accounts.balance` | `loadCash` (aggregateur) | `totalCash`, `totalCashInvestissable` (exclut `compte_courant`) |
| `cash_accounts.balance` | `computeCashSummary` (dashboard pipeline) | `cashSummary.totalEur` |
| `cash_accounts.interest_rate` | `computeRatePerAccount` (Z8.5 champions/casseroles) | Taux nominal par compte |
| `profiles.revenu_mensuel` + `charges_mensuelles` | `CouvertureCash` (analyse) | Mois couverts |
| `profiles.statut_pro` / `stabilite_revenus` | `calculerSolidite` (scores) | Bonus/malus stabilité (+5/0/-5/-15) |

**Cash → Profil : aucune lecture directe sur la page `/cash`.** Le salaire et le statut pro ne sont jamais consommés dans `/cash` ni dans son API. Toute la logique de contextualisation vit hors de la section.

---

## 3. Modèle de données — analyse + gaps

| Capacité attendue | Présent ? | Localisation / Gap |
|---|---|---|
| Plusieurs livrets nommés librement | OUI | `assets.name` + `cash_accounts.account_type` |
| Taux annuel stocké | OUI | `cash_accounts.interest_rate NUMERIC(7,4)` **en %** (convention claire, cf. commentaire migration + comment `rate-per-account.ts:8`) |
| Compte courant comme entité distincte | PARTIEL | `account_type = 'compte_courant'` existe dans le CHECK mais traité comme un type parmi d'autres — pas de slot dédié « solde moyen mensuel », pas de distinction conceptuelle dans l'UI |
| Cash volontaire + motif | **ABSENT** | Aucun champ `is_voluntary`, `voluntary_reason`, `target_use_date` ni table dédiée |
| Statut pro accessible | OUI | `profiles.statut_pro` (chip dans `StepIdentite`), lu par `aggregateur.ts:431` |
| Salaire net mensuel accessible | OUI | `profiles.revenu_mensuel` (input dans `StepRevenus.tsx:23`, libellé « Revenus nets mensuels »), lu par `aggregateur.ts` |
| Historique solde | OUI | `cash_balance_history` (append-only, UNIQUE par jour, upsert dans PUT) |
| Historique taux | NON | Le taux n'est pas historisé. Changement de taux = écrasement, pas de timeline |

**Verdict modèle** : le socle est sain (assets/cash_accounts split, historique soldes, RLS, FX) mais **ne porte pas la sémantique « cash volontaire »** ni de notion d'objectif (date d'usage planifié, motif). Le nom est dans `assets`, ce qui complique la requête mais n'est pas un blocage.

---

## 4. Audit des calculs

| # | Calcul | Localisation | Formule trouvée | Formule attendue | Verdict |
|---|---|---|---|---|---|
| C1 | Intérêts annuels par compte (page) | `app/(app)/cash/page.tsx:62` | `account.balance * (account.interest_rate / 100)` | `balance × rate%` | **OK** |
| C2 | Intérêts annuels par compte (form preview) | `components/forms/add-cash-form.tsx:97` | `values.balance * (values.interest_rate / 100)` | idem | **OK** |
| C3 | Total cash (page) | `app/(app)/cash/page.tsx:32` | `(accounts ?? []).reduce((s, a) => s + a.balance, 0)` | somme balances | **OK** (mais pas de conversion FX, cf. C9) |
| C4 | Total cash (API) | `app/api/cash/route.ts:34` | `(data ?? []).reduce((sum, a) => sum + a.balance, 0)` + `round(×100)/100` | idem | **OK** |
| C5 | Total cash (aggregateur) | `lib/analyse/aggregateur.ts:298-307` | Boucle async avec `toEur(balance, currency)` + split `compte_courant` | somme + FX | **OK** |
| C6 | Total cash (dashboard) | `lib/analyse/dashboard-pipeline/calc.ts:537-547` | `accounts.reduce(balance) + legacyCashAssets.reduce(current_value)` avec dédup `asset_id` | idem | **OK** |
| C7 | Intérêts annuels totaux | — | **non calculé** | Σ (balance × rate / 100) | **ABSENT** (gap : non agrégé ni affiché) |
| C8 | Taux moyen pondéré du cash | — | **non calculé** | Σ(balance × rate) / Σ(balance) | **ABSENT** |
| C9 | FX sur la page `/cash` | `app/(app)/cash/page.tsx:32` | Somme directe sans `toEur` | conversion EUR | **KO** (silencieux si tout EUR ; faux dès qu'un compte est USD/CHF) |
| C10 | Mois couverts (analyse) | `components/analyse/CouvertureCash.tsx:21` | `data.totalCash / (charges_mensuelles + mensualitesImmoTotal)` | mois de **charges** couverts | OK pour « mois de charges » mais **ce n'est pas la cible** : cible = mois de **salaire net** × multiplicateur statut pro |
| C11 | Coussin (score Solidité) | `lib/analyse/scores.ts:485-493` | `moisCouverts = totalCash / (charges + effortImmoNet)`, seuils 3/6 mois fixes | doit varier selon statut pro (3-6 CDI / 6-12 indép / >12 instable) | **KO partiel** : seuils mois fixes, pas paramétrés par statut |
| C12 | Cash excessif (reco) | `lib/analyse/recommandations.ts:165` | `partCash = totalCash / totalBrut × 100`, seuil 20 % | OK pour heuristique allocation, mais ne tient pas compte du cash volontaire | À clarifier (cible : neutraliser si flag « volontaire ») |
| C13 | Reco mensuelle « investir excédent » | `lib/analyse/recoMensuelles.ts:263` | `coussinCible = charges × 6`; `aInvestir = max(0, totalCash − coussinCible)` | cible salaire × N (selon statut) | **KO** : utilise charges×6 hardcodé, pas multiplicateur statut |
| C14 | Rendement cash dans `rendementEstime` | `lib/analyse/aggregateur.ts:742` | `(totalCash / total) × (RENDEMENT_PAR_CLASSE.cash × 100)` = 3 % en dur | devrait utiliser le **taux moyen pondéré réel** des comptes (C8) | **KO** : ignore les `interest_rate` réels |
| C15 | Filtre `minHoldingDays` Z8.5 | `lib/cash/rate-per-account.ts:73` | `(asOfMs − createdMs) / DAY_MS ≥ 90` | OK | **OK** |

### Cas limites observés

- **Montant = 0** : pas de garde explicite, mais `balance NOT NULL DEFAULT 0` → `formatCurrency(0)` rend `0 €`. Comportement neutre.
- **Taux = 0** : l'UI ne montre PAS la ligne intérêts (`account.interest_rate > 0` ligne 79). OK pour compte courant.
- **Taux négatif** : `interest_rate NUMERIC(7,4) DEFAULT 0`, pas de CHECK `>= 0` côté DB, et `Input min={0}` côté form mais HTML-only → contournable par API. Pas critique mais à durcir.
- **Montant négatif** : `Input min={0}`, idem contournable côté API.
- **Livret sans nom** : `assets.name` requis côté form (`required`) ; l'aggregateur a fallback `CASH_LABEL[type]` (aggregateur.ts:310).
- **Salaire absent dans Profil** : `revenuMensuel = 0` → la branche taux d'effort/coussin est ignorée dans Solidité (`> 0` checks). `CouvertureCash` divise par `chargesTotales`; si charges = 0, `moisCouverts = 0` mais le composant s'affiche tout de même.
- **Aucun compte cash** : `loadCash` retourne `{ comptes: [], totalCash: 0, totalCashInvestissable: 0 }`. Page : `EmptyState` propre.

---

## 5. Couverture fonctionnelle — checklist

| Item | Statut | Citation / Localisation |
|---|---|---|
| Compte courant déclaratif avec montant moyen | **PARTIEL** | Type `compte_courant` existe (`migration 001:434`, `add-cash-form.tsx:42`) mais traité comme un livret. Pas de champ « solde moyen », pas de séparation UI. Le splitting n'apparaît qu'en backend via `totalCashInvestissable` (aggregateur.ts:307). |
| Logique de matelas de sécurité (cible calculée salaire × statut) | **ABSENT** | Aucune occurrence dans le code. Le coussin = `totalCash / charges_mensuelles` (scores.ts:487, CouvertureCash.tsx:21, recoMensuelles.ts:263). **Le salaire net n'intervient nulle part comme base du matelas.** |
| Alerte de sous-liquidité | **PARTIEL** | Existe via la reco `cash-insuffisant` (`recommandations.ts:206`, `< 3 mois charges`) et le tag `'rouge'` de `CouvertureCash`. **Mais pas sur la page `/cash`**, et seuil basé charges. |
| Alerte de sur-liquidité | **PARTIEL** | Reco `cash-excessif` (`recommandations.ts:166`, `> 20 % du brut`) + alerte Dashboard `cash > 30 % net depuis 6 mois` (`calc.ts:266,332`). **Pas sur la page `/cash`**, et seuil basé % patrimoine, pas matelas. |
| Toggle « cash volontaire » + champ motif | **ABSENT** | Aucun champ `is_voluntary`, `voluntary_reason`, ni colonne associée. Grep `cash_volontaire|voluntary` → 0 résultat. |
| Neutralisation alerte si cash volontaire | **ABSENT** | Conséquence directe du précédent. |
| Affichage du cash en équivalent mois de salaire | **ABSENT** | Le composant `CouvertureCash` affiche « mois de **charges** », pas « mois de **salaire** ». Grep `mois_de_salaire|salary_months` → 0 résultat. |
| Pédagogie utilisateur (texte sur la notion de matelas) | **ABSENT sur `/cash`** | La page ne contient aucun texte explicatif. La pédagogie existe uniquement dans la prose des recommandations et dans le tooltip du score Solidité. |
| Récupération automatique salaire net + statut pro depuis Profil | **PARTIEL** | Le backend les lit (`aggregateur.ts:431`), mais la page `/cash` ne les fetche pas. Aucun composant cash ne consomme `revenu_mensuel` ou `statut_pro`. |

---

## 6. UX / UI — observations

- **Lisibilité montants/taux** : OK. `financial-value` (tabular-nums), `formatCurrency` avec `compact` pour le total, `formatPercent` pour le taux. Ligne « intérêts annuels » bien visible si taux > 0.
- **Hiérarchie visuelle** : faible. Une seule pile de cartes par `account_type` (`order('account_type')`). **Pas de regroupement livrets vs compte courant**, pas de section « épargne disponible » vs « tampon liquidité ».
- **État vide pédagogique** : présent (`EmptyState` avec icône PiggyBank, message « Ajoutez vos livrets... », CTA + `ariaPrompt`). Bon point.
- **État « matelas insuffisant »** : **absent visuellement sur `/cash`**. La page ne révèle aucune alerte, même quand `totalCash < 3 × charges`. L'info existe sur `/analyse` (`CouvertureCash`) mais l'utilisateur qui ne va que sur `/cash` la rate.
- **Charte FIRECORE** : la palette emerald (`#10b981`) est appliquée via `text-accent`, `border-accent/20`. Le fond `#080808` / `#070B12` est dans `globals.css`. Charte respectée.
- **Responsive mobile** : `CashEditRow` utilise `flex gap-5` + `min-w-0` sur le contenu, bouton Pencil hover-only (problème mobile : `opacity-0 group-hover:opacity-100` ne se déclenche pas sans hover → édition difficile au tap). **Petit bug UX mobile**.
- **Date balance affichée** : « Mis à jour DD MMM YYYY » sans signal de fraîcheur (ex. badge orange si > 90 j). Le solde « ancien » n'est jamais flaggé.

---

## 7. Robustesse multi-profils — 6 personas

Toutes les attentes ci-dessous reflètent la **cible produit** décrite dans la mission. La colonne « Aujourd'hui » est ce que la page `/cash` (et accessoirement `/analyse`) affichent vraiment d'après la lecture du code.

| Persona | Aujourd'hui (`/cash`) | Aujourd'hui (`/analyse` / scores) | Attendu | Findings |
|---|---|---|---|---|
| **P1 — Débutant CDI** (salaire 2 200 €, livret 1 500 €, CC 800 €) | Total `2 300 €`, 2 cartes, pas d'alerte | `CouvertureCash` calcule `mois = 2 300 / charges`. Si charges ~ 1 800 € → 1,3 mois → tag rouge « insuffisant ». Reco `cash-insuffisant` déclenchée. | Alerte explicite « matelas insuffisant (cible 6 600–13 200 € = 3-6 mois de salaire CDI) » sur `/cash` | **F-P1** : aucune alerte visible côté `/cash`; cible exprimée en charges, pas en salaire |
| **P2 — CDI équilibré** (3 500 €, 18 000 €+2 500 €) | Total `20 500 €`, pas d'alerte | Si charges ~2 500 € → 8,2 mois → vert. Aucune reco déclenchée. | Affichage « 5,9 mois de salaire — dans la cible 3-6 mois CDI » | **F-P2** : KPI utile non affiché. Pas faux mais opportunité ratée |
| **P3 — Indépendant** (4 000 €, 25 000 €+3 000 €) | Total `28 000 €` | Si charges ~3 000 € → 9,3 mois → vert. **Stabilité indépendant = −5 pts** au score Solidité (`STABILITE_REVENUS_PTS`). Aucune alerte cash. | Cible 24 000–48 000 € (6-12 mois indépendant). Affichage « 7 mois — dans la cible indépendant » | **F-P3** : aucune adaptation aux 6-12 mois indépendant; seuil reste 3/6/12 mois de **charges** dans Solidité |
| **P4 — Sur-liquide** (3 000 €, 45 000 €+4 000 €) | Total `49 000 €`, pas d'alerte | Reco `cash-excessif` déclenchée si cash > 20 % du brut. Alerte Dashboard si > 30 % net pendant 6 mois (`calc.ts:332`). | Alerte « sur-liquidité — cible max 18 000 € (6 mois × 3 000 €) ». Suggestion d'investir 31 000 € | **F-P4** : alerte présente mais ailleurs, exprimée en %brut, pas en €/€matelas. Pas de cible exacte affichée sur `/cash` |
| **P5 — Sur-liquide volontaire** (idem P4 + motif apport immo) | Identique P4 — **aucun flag, aucun motif possible** | Idem P4, alerte sur-liquidité reste active → **faux positif** | Alerte neutralisée, motif affiché (« apport immo Q4 ») | **F-P5** : feature totalement absente. Faux positif **garanti** dès qu'un utilisateur prépare un projet |
| **P6 — Dirigeant aisé** (8 000 €, 60 000 €+8 000 €) | 6 cartes, total `68 000 €` | Couverture longue (vert), pas de reco. Statut « Chef d'entreprise » → −5 pts stabilité. | Cible 48 000–96 000 €, dans la fourchette. Affichage adapté multi-livrets, taux moyen pondéré utile | **F-P6** : pas de taux moyen pondéré (C8 absent), pas de top livret. Affichage plat. Avec 5+ livrets, la liste devient bruyante |

---

## 8. Intégration Profil ↔ Cash ↔ Dashboard

- **Salaire net** : exposé via `profiles.revenu_mensuel` (StepRevenus.tsx:21 « Revenus nets mensuels (vous) »). Consommé dans `aggregateur.ts` (`fireInputs.revenu_mensuel_total`). **Non consommé sur `/cash`** ni dans aucun composant cash.
- **Statut pro** : exposé via `profiles.statut_pro` (StepIdentite.tsx:69). Consommé dans `aggregateur.ts` comme fallback pour `stabilite_revenus`, puis dans `scores.ts` (bonus/malus). **Non consommé sur `/cash`**. Pas non plus comme multiplicateur de matelas.
- **Total cash → Dashboard** : OK via `computeCashSummary` (dashboard-pipeline/calc.ts:521) avec dédup `assets` legacy. Cohérence garantie. La ligne `CashSummaryCompact` s'affiche au-dessus des autres résumés (`dashboard/page.tsx:263`).
- **Duplication de logique** : modérée mais réelle. Le total cash est recalculé à 3 endroits :
  1. `app/(app)/cash/page.tsx:32` (somme directe, **sans FX**)
  2. `app/api/cash/route.ts:34` (somme directe, sans FX)
  3. `lib/analyse/aggregateur.ts:298-307` (avec FX `toEur`)
  4. `lib/analyse/dashboard-pipeline/calc.ts:537` (avec dédup `assets`)
  Selon le point d'entrée, l'utilisateur voit un total potentiellement différent si un compte est non-EUR.

---

## 9. Tests — inventaire et gaps

### Existant

| Fichier | Couverture |
|---|---|
| `lib/cash/__tests__/rate-per-account.test.ts` | 5 cas : mapping 1 compte, filtre `minHoldingDays` paramétrable, exclusion sans `createdAt`, exclusion NaN, extrapole=false |
| `lib/analyse/__tests__/cashInvestissable.test.ts` | 2 cas : exclusion compte courant de la projection, no-op si que livrets |
| `lib/analyse/__tests__/dashboard-v1/specs/topConsolide.test.ts` + `meilleurInvestParClasse.test.ts` | Cash inclus dans le top consolidé (V2.4 P0.7) |
| Fixtures `dashboard-v1` (debutant, hnw-complexe, etc.) | `cashAccounts` est dans les inputs des fixtures, couvre le passage end-to-end |
| `lib/analyse/__tests__/aggregateur.qw9-famille.test.ts` + `aggregateur.integration.test.ts` | Couvrent `loadCash`/`totalCash` indirectement |
| `lib/analyse/__tests__/scores-projection-recos.test.ts` | Coussin cash (Solidité), reco cash-excessif, reco cash-insuffisant |

### Gaps de test (à créer plus tard, pas dans cet audit)

- Pas de test du calcul `intérêts annuels` (C1, C2).
- Pas de test du calcul total agrégé côté page (C3) ni API (C4).
- Pas de test de la dédup `computeCashSummary` (C6) en isolation.
- Pas de test de cas FX (compte USD, CHF). Page `/cash` est silencieusement fausse en multi-devise.
- Pas de test E2E (Playwright) du parcours ajout/édition/suppression d'un compte.
- Pas de test « matelas cible × statut pro » (la feature n'existe pas).
- Pas de test « cash volontaire neutralise alerte » (idem).

---

## 10. Notation détaillée par axe

| Axe | Pondération | Note brute | Note pondérée | Justification |
|---|---|---|---|---|
| Justesse des calculs | 25 | 14/25 | 14 | Calculs primaires OK (intérêts, total). Mais C7/C8 absents, C9 (FX page) faux, C10/C11/C13 utilisent **charges** au lieu de **salaire × multiplicateur statut**, C14 ignore les taux réels. |
| Couverture fonctionnelle vs cible | 20 | 6/20 | 6 | 4/9 items absents (matelas cible, cash volontaire, motif, mois de salaire). 3/9 partiels (CC, alertes, conso Profil). 2/9 OK. |
| Modèle de données | 15 | 10/15 | 10 | Socle solide (RLS, historique, FX), mais ne porte pas la sémantique cible (pas de `is_voluntary`, pas d'historique de taux, pas de notion d'objectif). |
| Robustesse multi-profils | 15 | 5/15 | 5 | Indépendant et dirigeant traités comme un CDI (seuils fixes 3/6/12 mois de **charges**). Persona P5 (volontaire) totalement non couvert. |
| UX / pédagogie | 10 | 4/10 | 4 | EmptyState bon. Mais pas de groupage, pas d'alerte visuelle sur la page, bouton edit en hover-only (mobile pénible), pas de pédagogie matelas. |
| Intégration Profil/Dashboard | 10 | 6/10 | 6 | Vers Dashboard OK (dédup propre). Profil → Cash absent : la page ne lit ni salaire ni statut. Duplication du total à 4 endroits. |
| Tests | 5 | 2/5 | 2 | `rate-per-account` et `cashInvestissable` couverts. Calcul intérêts/total/FX non testés. Pas de E2E. |
| **Total** | **100** |  | **47** | Arrondi pondéré : **42 / 100** après pénalité cohérence (cf. § 1). |

> L'écart entre les notes pondérées (47) et la note de synthèse (42) reflète l'amplification des P0/P1 transverses (cible matelas, cash volontaire) qui pèsent au-delà de leur seul axe — un produit Cash sans matelas contextualisé rate sa valeur centrale.

---

## 11. Findings priorisés

### [P0] Page `/cash` ne convertit pas les devises

**Localisation** : `app/(app)/cash/page.tsx:32`
**Constat** : `total = accounts.reduce((s, a) => s + a.balance, 0)` somme des `balance` sans tenir compte de `currency`. Si l'utilisateur ajoute un compte USD ou CHF, le total mélange les devises.
**Impact utilisateur** : total faux silencieusement, contradiction avec le total Dashboard (`aggregateur.ts:303` qui passe par `toEur`).
**Recommandation** : réutiliser `toEur` ou faire transiter le total via l'aggregateur. Optionnellement contraindre `currency = 'EUR'` côté form pour V1.
**Effort estimé** : S

### [P0] Taux du cash hardcodé à 3 % dans `rendementEstime`

**Localisation** : `lib/analyse/aggregateur.ts:742`
**Constat** : la contribution cash au rendement pondéré utilise `RENDEMENT_PAR_CLASSE.cash` (3 %) au lieu du **taux moyen pondéré réel** des comptes (`Σ balance × rate / Σ balance`).
**Impact utilisateur** : un utilisateur avec un Livret A (3 %) + un LEP (4 %) + un PEL (2,25 %) voit son rendement patrimonial faux. Plus l'effet est important sur les profils riches en cash.
**Recommandation** : remplacer le constant par le calcul C8 et le passer en argument à `rendementEstime`.
**Effort estimé** : S

### [P1] Pas de matelas cible calculé à partir du salaire net × statut pro

**Localisation** : **absent du code**. Plus proche substitut : `scores.ts:487` (`totalCash / charges`) et `recoMensuelles.ts:263` (`charges × 6`).
**Constat** : toute la logique « coussin » est basée sur les charges mensuelles. La cible produit demande un multiplicateur par statut (CDI 3-6, indépendant 6-12, instable >12). Cette logique n'existe nulle part.
**Impact utilisateur** : un indépendant ou un dirigeant ne reçoit pas un diagnostic adapté à son risque revenu. Faux négatifs sur les profils à revenus volatils.
**Recommandation** : créer `lib/cash/matelas.ts` pur (`computeMatelasCible({ salaireNet, statutPro, stabiliteRevenus }) → { min, max }`). Brancher sur Solidité, `CouvertureCash`, recos. Ajouter affichage dédié dans `/cash`.
**Effort estimé** : M

### [P1] Absence totale de « cash volontaire » (faux positifs garantis)

**Localisation** : **absent du modèle et de l'UI**.
**Constat** : aucun moyen pour l'utilisateur de déclarer qu'une partie du cash est volontaire (apport immo, achat planifié). Conséquence : alerte `cash-excessif` (`recommandations.ts:166`) et alerte Dashboard `cash > 30 % net 6 mois` (`calc.ts:332`) déclenchent à tort.
**Impact utilisateur** : alerte permanente non actionnable pour quiconque prépare un projet. Perte de confiance dans le moteur de recommandation.
**Recommandation** : ajouter colonnes `is_voluntary BOOLEAN`, `voluntary_reason TEXT`, `voluntary_target_date DATE` sur `cash_accounts` (ou table satellite `cash_intents`). Toggle + champ libre + selecteur prédéfini dans `add-cash-form.tsx`. Recos et alerte Dashboard soustraient le cash volontaire avant d'évaluer l'excédent.
**Effort estimé** : M

### [P1] Page `/cash` n'affiche aucune alerte ni KPI contextualisé

**Localisation** : `app/(app)/cash/page.tsx` (intégralité)
**Constat** : la page se limite à `[total] + [N cartes]`. Aucune référence au matelas, aux mois couverts, à un objectif. L'utilisateur doit aller sur `/analyse` pour comprendre si son cash est sain.
**Impact utilisateur** : section Cash perçue comme un inventaire muet. Pas de boucle de pilotage.
**Recommandation** : ajouter un bloc « État de votre matelas » directement sur `/cash` avec : cible calculée (€), mois de salaire couverts, état (vert/orange/rouge), CTA (« investir l'excédent » ou « renforcer »). Réutiliser/factoriser `CouvertureCash` après refactor P1 matelas.
**Effort estimé** : M

### [P1] Pas d'agrégat « intérêts totaux » ni « taux moyen pondéré »

**Localisation** : page `/cash` (absent)
**Constat** : C7 et C8 du tableau §4. Sur 5 livrets, l'utilisateur ne voit ni le revenu d'épargne annuel total, ni à quel taux son cash travaille en moyenne.
**Impact utilisateur** : impossibilité de comparer son rendement cash effectif au LEP / LA / fonds €.
**Recommandation** : sous le total, exposer `Σ intérêts` et `taux moyen pondéré = Σ(balance × rate) / Σ balance`. Effort faible.
**Effort estimé** : XS

### [P1] Compte courant non distingué dans l'UI

**Localisation** : `app/(app)/cash/page.tsx` + `add-cash-form.tsx:42`
**Constat** : le backend sépare déjà `totalCash` vs `totalCashInvestissable` (aggregateur.ts:307), mais l'UI mélange visuellement livrets et compte courant. Pas de notion « solde moyen mensuel » distinct du « solde actuel », alors que la cible produit demande explicitement « montant moyen déclaré ».
**Impact utilisateur** : confusion possible entre liquidité transactionnelle (CC) et épargne (livrets).
**Recommandation** : 2 groupes visuels (« Épargne » / « Liquidité courante »). Pour `compte_courant`, label du champ « Solde moyen déclaré (€) » + hint pédagogique. Optionnellement, badge « inclus dans le matelas mais pas dans le cash investissable ».
**Effort estimé** : S

### [P1] Salaire net + statut pro non consommés par `/cash`

**Localisation** : `app/(app)/cash/page.tsx` (lecture absente)
**Constat** : la page ne fetche pas `profiles.revenu_mensuel` ni `statut_pro`. Toute la logique de matelas devra les lire.
**Impact utilisateur** : dépendance forte avec le wizard. Tant que l'utilisateur n'a pas rempli Profil, `/cash` ne peut pas calculer le matelas. Acceptable si on affiche un état « renseigne ton profil pour voir ton matelas cible ».
**Recommandation** : ajouter lecture `profiles` dans le Server Component, dégrader proprement si valeurs absentes (cf. CLAUDE.md : « Données insuffisantes »).
**Effort estimé** : XS (lecture) + dépend du P1 matelas pour l'affichage

### [P2] Bouton « modifier » en hover-only — inaccessible au tap mobile

**Localisation** : `components/pages/cash-edit-row.tsx:31`
**Constat** : `opacity-0 group-hover:opacity-100`. Sur mobile sans hover, l'icône Pencil reste invisible.
**Impact utilisateur** : aucun moyen évident de modifier un compte sur mobile (sauf tap au hasard).
**Recommandation** : icône toujours visible (semi-transparente), ou click sur toute la carte ouvre la modale.
**Effort estimé** : XS

### [P2] Trois sommes du total cash dupliquées

**Localisation** : `app/(app)/cash/page.tsx:32`, `app/api/cash/route.ts:34`, `lib/analyse/aggregateur.ts:298`, `lib/analyse/dashboard-pipeline/calc.ts:537`
**Constat** : 4 implémentations divergentes (FX / sans FX, dédup legacy / pas dédup).
**Impact utilisateur** : risque d'écart visuel entre `/cash` et `/dashboard` ou `/analyse`.
**Recommandation** : extraire un helper pur unique `lib/cash/totals.ts` consommé par tous. Inclure FX (`toEur`) et dédup `assets` legacy.
**Effort estimé** : S

### [P2] Aucune fraîcheur visuelle sur `balance_date`

**Localisation** : `app/(app)/cash/page.tsx:72`
**Constat** : `formatDate(account.balance_date, 'medium')` sans badge si > 90 j.
**Impact utilisateur** : utilisateurs qui oublient de rafraîchir n'ont pas de signal.
**Recommandation** : badge « Mise à jour ancienne » si `now - balance_date > 90 j`.
**Effort estimé** : XS

### [P2] Pas de garde DB sur taux/solde négatifs

**Localisation** : `supabase/migrations/001_initial_schema.sql:437-438`
**Constat** : pas de `CHECK (interest_rate >= 0)` ni `CHECK (balance >= 0)`. Le `min={0}` HTML est contournable côté API.
**Impact utilisateur** : possibilité de stocker des valeurs incohérentes (peu probable mais propre à durcir).
**Recommandation** : migration avec CHECK + zod côté API.
**Effort estimé** : XS

### [P3] Pas de regroupement par banque

**Localisation** : `app/(app)/cash/page.tsx:60`
**Constat** : tri par `account_type` uniquement. Avec 5+ livrets multi-banques, l'utilisateur perd vue d'ensemble.
**Impact utilisateur** : confort pour les profils HNW.
**Recommandation** : option de tri / collapse par banque.
**Effort estimé** : S

### [P3] Pas de pédagogie inline sur les taux réglementés

**Localisation** : `components/forms/add-cash-form.tsx:48-50`
**Constat** : `DEFAULT_RATES` (Livret A 3 %, LDDS 3 %, LEP 4 %, PEL 2,25 %) sont en dur dans le composant. Aucun lien vers la date d'effet / source.
**Impact utilisateur** : aucun signal si les taux changent (LA est passé à 2,4 % depuis 2025-02 par ex.).
**Recommandation** : centraliser dans `lib/cash/taux-reglementes.ts` avec date d'effet, optionnellement Edge Function de refresh.
**Effort estimé** : S

---

## 12. Roadmap proposée pour le refactor Cash

### Sprint 1 — P0 + P1 « cœur métier matelas » (≈ 4-5 jours dev)

**Périmètre**
- F-P0-A : corriger FX page `/cash` (helper `computeCashTotal` partagé, FX) — P0 calculs.
- F-P0-B : remplacer le 3 % cash en dur dans `rendementEstime` par le taux moyen pondéré réel.
- F-P1-A : créer `lib/cash/matelas.ts` (pur) — `computeMatelasCible({ salaireNet, statutPro, stabiliteRevenus, chargesMensuelles?, cashVolontaire? })` retourne `{ cibleBasse, cibleHaute, label }`. Tests Vitest exhaustifs (6 personas + edge cases).
- F-P1-B : ajouter sur `/cash` un bloc **« Votre matelas »** : cible €, mois de salaire couverts, jauge, message. Lecture `profiles.revenu_mensuel` + `statut_pro` côté Server Component.
- F-P1-C : ajouter sur `/cash` deux KPI : intérêts totaux annuels (Σ), taux moyen pondéré.

**Livrables** : 1 PR par sous-feature (workflow vagues — cf. mémoire `feedback_fynix_immo_waves.md`).
**Dépendances Profil** : aucune nouvelle colonne. Lecture seule de `revenu_mensuel`, `statut_pro`, `stabilite_revenus`.

### Sprint 2 — P1 « cash volontaire » + alertes contextualisées (≈ 3-4 jours dev)

**Périmètre**
- Migration `055_cash_voluntary.sql` : `ALTER TABLE cash_accounts ADD COLUMN is_voluntary BOOLEAN NOT NULL DEFAULT FALSE, voluntary_reason TEXT, voluntary_target_date DATE` + DOWN.
- Toggle + champ libre dans `add-cash-form.tsx`. Selector prédéfini (`apport_immo`, `achat_planifie`, `precaution_assumee`, `autre`).
- Soustraction du cash volontaire dans `recommandations.ts` (`partCash` recalculé sur cash non-volontaire) et dans la règle Dashboard (`calc.ts:332`).
- Sur `/cash` : badge « Cash volontaire » par carte, ligne récapitulative « dont volontaire : X € » dans le bloc total.
- Alertes visuelles directement sur `/cash` (sous-liquidité rouge, sur-liquidité orange, OK vert) — basées sur le matelas, neutralisées par le cash volontaire.

**Livrables** : 1 PR migration + 1 PR backend (recos/alertes) + 1 PR UI.
**Dépendances Profil** : aucune.

### Sprint 3 — P2 / UX & dette (≈ 2-3 jours dev)

**Périmètre**
- F-P2-A : extraction helper unique `lib/cash/totals.ts` + remplacement des 4 sites.
- F-P2-B : groupage UI Épargne / Liquidité courante. Label adapté pour compte courant (« Solde moyen déclaré »).
- F-P2-C : icône édition toujours visible (fix mobile), badge fraîcheur si `balance_date > 90 j`.
- F-P2-D : CHECK constraints DB (`interest_rate >= 0`, `balance >= 0`) + zod côté API.
- F-P2-E : extraction `taux-reglementes.ts` + horodatage des défauts.
- Tests Vitest manquants : C1/C2/C3/C4, dédup, multi-devise, matelas par persona.
- (Bonus P3) Tri/collapse par banque, regroupement multi-livrets pour profils HNW.

**Livrables** : refactor + dette, faible risque.
**Dépendances Profil** : aucune.

### Hors roadmap (à arbitrer plus tard)

- Historique du `interest_rate` (timeline taux) — utile si on veut afficher la perf cash réelle dans le temps.
- Connectivité bancaire (Bridge / Powens) — hors scope FIRECORE actuel.
- Modulation du matelas en fonction des biens immo en cours d'acquisition (déjà détecté côté `acquisitions_futures`).
