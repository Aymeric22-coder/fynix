# DOMAINE 5 — INTÉGRATION ENTRE MODULES

## Score : 5/10

## Synthèse

L'intégration entre les modules immobiliers est partiellement implémentée. Les
flux les plus critiques (révision de loyer → loyer de base, ajout/suppression
d'un dispositif fiscal → projection, what-if isolé) fonctionnent. En revanche,
plusieurs intégrations sont rompues ou incohérentes :

- Le tableau de bord consolidé (`/immobilier`) **ignore totalement** les
  `property_events` : un impayé non résolu ne remonte JAMAIS dans le bandeau
  d'alertes du portefeuille, et le cash-flow consolidé n'utilise QUE les
  données de base.
- L'agrégation multi-bien (`computeRealEstatePortfolio`) ne charge qu'un seul
  crédit par asset (le dernier rencontré dans la boucle d'indexation), au
  lieu d'agréger via `aggregateLoans`. Ajouter un PTZ ou un prêt travaux
  n'augmente PAS le cash-flow consolidé du portefeuille.
- Sur la fiche bien, `SimulationPanel` (Rentabilité), `WhatIfSimulator` et
  `RealTrackingPanel` consomment uniquement le crédit "principal", pas
  l'agrégat multi-crédit pourtant calculé juste à côté pour la Synthèse.
- `alertCount` est codé en dur à 0 dans la page liste, donc l'alerte
  "X alertes sur ce bien" (kind=`under_rent`) ne se déclenche jamais.

Le simulateur what-if est en revanche **propre** : 100 % client-side, aucun
appel API ou Supabase ne fuit en base depuis les sliders.

---

## 5.1 Suivi réel ↔ Données de base — **PARTIEL OK**

Le handler POST `app/api/real-estate/[id]/events/route.ts:119-125` met bien à
jour `real_estate_lots.rent_amount` quand un événement `rent_revision` est
créé avec un `lot_id` et un `amount_eur` non null. Idem pour le PATCH
(`events/[eventId]/route.ts:46-52`) : si on édite le montant d'une révision
existante, le lot est resynchronisé.

Après création, la modale `add-event-modal.tsx:118-119` ferme et appelle
`router.refresh()`, donc la page détail RSC se réhydrate. Les KPIs de la
Synthèse (`monthlyRents` ligne 131-133 de `app/(app)/immobilier/[id]/page.tsx`)
sont alors recalculés à partir des lots loués → **le loyer mensuel et le
cash-flow théorique sont bien rafraîchis**.

Statut : **OK** pour la propagation, avec quelques réserves :

- Si on supprime un événement `rent_revision` (DELETE
  `events/[eventId]/route.ts:58-81`), le `rent_amount` du lot **n'est PAS
  restauré** à sa valeur antérieure. Il n'y a d'ailleurs aucune trace de la
  valeur précédente. Comportement par design (les révisions sont irréversibles
  vues comme un "fait" plutôt qu'une "intention"), mais peut surprendre
  l'utilisateur qui croit annuler la révision.
- Le PATCH `events/[eventId]/route.ts:32` n'autorise pas de modifier `lot_id`
  via le payload mais ne touche pas l'ancienne valeur du lot pointé.

## 5.2 Crédit ↔ Cash-flow — **KO (multi-crédit non propagé partout)**

L'agrégation multi-crédit (`lib/real-estate/multi-credit.ts`) existe mais elle
n'est invoquée que pour la Synthèse de la fiche bien
(`app/(app)/immobilier/[id]/page.tsx:313` → `multiCredit.totalMonthly` utilisé
ligne 342 et `crdNow` ligne 317).

Les consommateurs en aval de cette fiche reçoivent en revanche `debtRow`
(=premier crédit principal) :

- `SimulationPanel` (Rentabilité & Cash-flow) ligne 651 → la projection
  20-25 ans ignore PTZ / travaux / etc.
- `WhatIfSimulator` ligne 676 → idem.
- `RealTrackingPanel` ligne 805 prend `schedule?.totalMonthly` qui ne couvre
  que le crédit principal, pas `multiCredit.totalMonthly`.

Côté tableau de bord consolidé, c'est pire : `lib/real-estate/portfolio.ts`
:99-127 indexe les dettes par `asset_id` avec écrasement silencieux —
le dernier crédit rencontré dans la boucle gagne, sans filtre `loan_kind`
et sans agrégation. Le `monthlyLoanPayment` (lib/real-estate/portfolio-
summary.ts:352) provient de `kpis?.monthlyPayment` calculé sur ce seul
crédit. **Ajouter un 2ème crédit n'a aucun effet sur le cash-flow du
portefeuille global**.

Suppression d'un crédit : DELETE `app/api/real-estate/[id]/credit/route.ts
:266-282` supprime TOUS les crédits actifs du bien sans filtrer sur
`loan_kind`, alors que PUT lignes 168-186 cible UN crédit (asset_id +
loan_kind). Incohérence : impossible de supprimer un seul crédit secondaire
via cette route — il faut soit tout casser, soit éditer le crédit en
masquant ses valeurs.

L'UI `multi-credit-list.tsx` est en lecture seule (pas de bouton "supprimer"
par crédit), donc l'utilisateur n'a aucun moyen UI de supprimer un crédit
secondaire individuel après l'avoir ajouté.

## 5.3 Dispositif fiscal ↔ Projection — **OK**

Le flux est correctement câblé sur la fiche bien :

- Création/édition : PUT `app/api/real-estate/[id]/incentive/route.ts:84-145`
  fait l'upsert sur `property_tax_incentives` puis le front (formulaire dans
  `components/real-estate/incentives/incentive-form.tsx`) déclenche
  `router.refresh()`.
- Lecture serveur : `app/(app)/immobilier/[id]/page.tsx:89-94` recharge
  `incentiveRow`, puis `buildIncentiveReductionPerYear` (page.tsx:365-371)
  construit le tableau annuel de réduction d'IR.
- Injection projection : `simInputWithIncentive` (page.tsx:372) passé à
  `runSimulation`. La projection applique `taxPaid = max(0, taxPaid −
  reduction)` année par année.
- Affichage : `TaxReductionDecomposition` (page.tsx:683-700) ne s'affiche que
  si `simResult.projection[0].taxReductionTotal > 0`. L'IR avant / réduction
  / IR net est affiché correctement.

Suppression : DELETE `app/api/real-estate/[id]/incentive/route.ts:148-160`
supprime la ligne ; au refresh, `incentiveRow` est null →
`buildIncentiveReductionPerYear` retourne `[]` (reduction-schedule.ts:42)
→ projection revient au calcul standard. **OK**.

Petite faiblesse : la décomposition fiscale n'est affichée que pour Y1 (pas
de visualisation année par année du dispositif, alors que pour Pinel 9 ou
12 ans c'est utile).

## 5.4 Suivi réel ↔ Tableau de bord consolidé — **KO**

C'est l'intégration la plus défaillante du périmètre.

- `app/(app)/immobilier/page.tsx` ne SELECT jamais `property_events` (vérifié
  par grep). La page n'appelle aucune fonction qui agrège les events.
- `computeRealEstatePortfolio` (`lib/real-estate/portfolio.ts`) ne charge
  pas non plus les events.
- `computePortfolioSummary` (`lib/real-estate/portfolio-summary.ts:213-298`)
  produit des alertes basées uniquement sur :
  - régime fiscal manquant (ligne 145)
  - cash-flow négatif (ligne 158)
  - LTV / DSCR (lignes 171, 182)
  - `p.hasAlerts && p.alertCount > 0` (ligne 193)
- MAIS `app/(app)/immobilier/page.tsx:103` code en dur `alertCount: 0` pour
  CHAQUE bien dans `rawProps`. Donc la branche `under_rent` ligne 193 ne
  se déclenche **jamais**.
- Le type `PortfolioAlert.kind` (portfolio-summary.ts:56) déclare bien la
  valeur `'unpaid_rent'`, mais aucun code ne génère cette alerte. C'est du
  type orphelin.

Le cash-flow consolidé (`totalMonthlyCashFlow` portfolio-summary.ts:237)
provient uniquement des KPIs `monthlyCashFlowYear1` de la simulation
théorique. Un impayé non résolu, une charge exceptionnelle de 5 000 € ou
une vacance de 4 mois ne sont reflétés NULLE PART dans le tableau de bord.

Conséquence utilisateur : depuis `/immobilier`, impossible de savoir qu'un
locataire a 2 mois d'impayés, qu'un dégât des eaux a coûté 3 000 € sur un
bien, ou que la vacance d'un T3 dure depuis 6 mois. Il faut ouvrir chaque
fiche bien individuellement.

## 5.5 What-if ↔ Données réelles — **OK (parfait)**

Audit complet de `components/real-estate/what-if-simulator.tsx` :

- Aucun import `supabase`, `createClient`, ni `createServerClient`.
- Le seul `fetch` du fichier est absent (vérifié par lecture intégrale).
- Tous les recalculs passent par `useMemo` lignes 79-86 qui appellent
  `runWhatIfSim` → `buildSimulationInputFromDb` + `runSimulation`, deux
  fonctions pures.
- Les `setParams` (lignes 88-91, 95-121) modifient uniquement l'état React
  local.
- Le bouton "Réinitialiser" (ligne 247) restaure `baseValues` calculé une
  fois depuis les props (ligne 60-74).

**Aucun risque de pollution des données en base** par manipulation des
sliders. Le message UI ligne 175-176 ("Vos données réelles ne sont pas
modifiées") est honoré.

---

## Bugs d'intégration

### INTEG-001 — Cash-flow consolidé ignore les multi-crédits

- Modules concernés : Crédit ↔ Cash-flow portefeuille
- Fichier : `fynix/lib/real-estate/portfolio.ts:99-127`
- Symptôme observé en lecture du code : la boucle d'indexation
  `for (const d of allDebts ?? [])` écrase `debtByAsset[d.asset_id]` à
  chaque itération sans filtrer sur `loan_kind`. Si un bien a un crédit
  principal + un PTZ, seul le dernier inséré en DB est conservé. Aucun
  appel à `aggregateLoans` n'est fait dans ce fichier.
- Impact utilisateur : ajouter un 2ème crédit (PTZ, travaux) sur un bien
  n'affecte pas le `monthlyLoanPayment` ni le `monthlyNetCashFlow` ni le
  `totalCapitalRemaining` du tableau de bord `/immobilier`. Le LTV et
  DSCR consolidés sont aussi faux.
- Correction recommandée : grouper `allDebts` par `asset_id`, construire
  un `LoanInput[]` par asset, et appeler `aggregateLoans` pour récupérer
  `totalMonthly` et `totalRemainingCapital`. Réinjecter dans
  `PropertySimResult.capitalRemaining` et corriger `kpis.monthlyPayment`
  via une variante du SimulationResult qui accepte la mensualité agrégée.

### INTEG-002 — SimulationPanel / WhatIf / RealTrackingPanel n'utilisent que le crédit principal

- Modules concernés : Crédit ↔ Projection / Cash-flow fiche bien
- Fichiers :
  - `fynix/app/(app)/immobilier/[id]/page.tsx:651` (SimulationPanel
    reçoit `debt={dbDebt}` = crédit principal seul)
  - `fynix/app/(app)/immobilier/[id]/page.tsx:676` (WhatIfSimulator idem)
  - `fynix/app/(app)/immobilier/[id]/page.tsx:805`
    (`monthlyLoanPayment={schedule?.totalMonthly ?? 0}` — schedule basé
    sur loanForCalc = crédit principal seul, alors que
    `multiCredit.totalMonthly` est disponible juste au-dessus
    ligne 313)
  - `fynix/lib/real-estate/build-from-db.ts:196-250` (la signature ne
    prend qu'un `DbDebt`)
- Symptôme : la Synthèse du bien affiche un cash-flow correct (multi-
  crédit), mais l'onglet "Rentabilité & Cash-flow", l'onglet "Suivi réel"
  et le what-if affichent des chiffres calculés sur un seul crédit. Trois
  vues d'un même bien sur la même page donnent des cash-flows
  contradictoires.
- Impact utilisateur : confusion totale dès qu'un bien a plus d'un crédit.
  Le panel "Suivi réel" calcule un cash-flow attendu sous-estimé, donc
  classe à tort comme "conforme" un mois où le PTZ a bien été prélevé.
- Correction recommandée : refondre `build-from-db.ts` pour accepter
  `DbDebt[]` et utiliser `aggregateLoans` ; ou passer
  `multiCredit.totalMonthly` en prop séparée à `RealTrackingPanel` pour
  le cas le plus visible.

### INTEG-003 — Tableau de bord consolidé ignore property_events

- Modules concernés : Suivi réel ↔ Tableau de bord
- Fichier : `fynix/app/(app)/immobilier/page.tsx:22-145`
  (aucun SELECT sur `property_events`),
  `fynix/lib/real-estate/portfolio.ts:62-226` (idem),
  `fynix/lib/real-estate/portfolio-summary.ts:138-209`
  (générateur d'alertes sans accès aux events)
- Symptôme : un événement `rent_unpaid` non résolu sur un bien n'apparaît
  jamais dans `PortfolioAlertsBanner`. Le `kind: 'unpaid_rent'` déclaré
  dans `PortfolioAlert` est orphelin (aucun emetteur).
- Impact utilisateur : un investisseur multi-biens ne peut pas voir
  d'un coup d'œil quels biens ont des problèmes. Il doit ouvrir chaque
  fiche bien individuellement, ce qui contredit le rôle même d'un
  tableau de bord consolidé.
- Correction recommandée :
  1. SELECT `property_events WHERE user_id = $1 AND is_resolved = FALSE`
     dans `computeRealEstatePortfolio` ou directement dans la page
     `/immobilier`.
  2. Compter par `property_id` les events `rent_unpaid` non résolus et
     les passer dans `rawProps[i].alertCount`.
  3. Dans `generatePortfolioAlerts` (portfolio-summary.ts:138), ajouter
     une branche `kind: 'unpaid_rent'` avec severity `critical` pour
     chaque bien ayant ≥ 1 impayé non résolu.

### INTEG-004 — alertCount toujours à 0 dans la page liste

- Modules concernés : Insights bien ↔ Bandeau d'alertes portefeuille
- Fichier : `fynix/app/(app)/immobilier/page.tsx:103`
  (`alertCount: 0,` codé en dur)
- Symptôme : la branche d'alerte ligne 193 de `portfolio-summary.ts`
  (`properties.filter(p => p.hasAlerts && p.alertCount > 0)`) ne se
  déclenche jamais. Même un bien avec des alertes sous-loyer locales
  (calculées par `detectUnderRentAlerts` sur la fiche bien) reste muet
  au niveau portefeuille.
- Impact utilisateur : aucune remontée des alertes per-bien dans le
  bandeau consolidé, même quand la logique est censée le faire.
- Correction recommandée : calculer côté serveur la liste des alertes
  pertinentes par bien (sous-loyer, vacance prolongée, charges
  estimées…) puis injecter le bon `alertCount`, ou simplement supprimer
  la branche orpheline de `generatePortfolioAlerts`.

### INTEG-005 — DELETE crédit ne respecte pas loan_kind

- Modules concernés : Multi-crédit ↔ API REST
- Fichier : `fynix/app/api/real-estate/[id]/credit/route.ts:266-282`
- Symptôme : DELETE ne prend aucun paramètre `loan_kind` et supprime
  tous les `debts` actifs liés à l'asset. PUT (lignes 168-186) cible
  pourtant UN crédit par `(asset_id, loan_kind)`. Incohérence
  contractuelle de l'API.
- Impact utilisateur : impossible de supprimer un PTZ ou un crédit
  travaux sans tout détruire. Combiné avec INTEG-006 (pas de bouton
  UI), c'est un trou fonctionnel.
- Correction recommandée : accepter `?loan_kind=ptz` en query string et
  filtrer le DELETE en conséquence ; ou exposer un endpoint
  `/debts/[debtId]` pour la suppression unitaire.

### INTEG-006 — Pas d'UI pour supprimer un crédit secondaire

- Modules concernés : Multi-crédit ↔ UI
- Fichier : `fynix/components/real-estate/multi-credit-list.tsx`
  (composant en lecture seule),
  `fynix/components/real-estate/credit-tab.tsx`
  (formulaire édite uniquement le crédit principal sélectionné)
- Symptôme : l'utilisateur peut ajouter plusieurs crédits via le
  formulaire en changeant `loan_kind`, mais aucun bouton "supprimer
  ce crédit" n'existe par ligne. Les seuls boutons sont sur le
  formulaire global (CreditTab).
- Impact utilisateur : un crédit erroné ajouté reste à vie. L'option
  DELETE de l'API (INTEG-005) est de toute façon trop large.
- Correction recommandée : ajouter un bouton corbeille par ligne dans
  `MultiCreditList`, qui appelle DELETE avec `loan_kind` une fois
  INTEG-005 corrigé.

### INTEG-007 — Révision de loyer irréversible

- Modules concernés : Suivi réel ↔ Données de base
- Fichier : `fynix/app/api/real-estate/[id]/events/[eventId]/route.ts
  :58-81` (DELETE) ne restaure pas l'ancien `rent_amount` du lot.
- Symptôme : supprimer un événement `rent_revision` laisse le lot avec
  le NOUVEAU loyer. L'utilisateur doit éditer manuellement le lot.
- Impact utilisateur : surprenant — supprimer une révision ne l'annule
  pas. Risque d'oubli, le loyer reste faussé.
- Correction recommandée : stocker l'ancien `rent_amount` dans l'event
  (colonne `previous_value`) et le restaurer au DELETE si c'est la
  dernière révision pour le lot. Alternative : afficher dans l'UI un
  avertissement explicite avant suppression.

---

## Points à clarifier

1. **ALLOWED_KINDS API events** (hors scope D5 mais critique pour D4
   suivi réel) :
   `fynix/app/api/real-estate/[id]/events/route.ts:18-21` ne liste pas
   les 5 nouveaux kinds courte durée (booking_cancellation,
   platform_payout, guest_damage, platform_dispute, seasonal_closure)
   pourtant déclarés dans `types/database.types.ts:50-63` et autorisés
   par le CHECK constraint de la migration 042
   (`supabase/migrations/042_short_term_rental.sql:108`). Toute
   création d'event courte durée via UI sera rejetée par la couche API
   en 400. À noter dans D4 ou à corriger en quick-win.

2. **Périmètre de "alerte impayé"** : faut-il alerter à 1 mois
   d'impayé, ou seulement à 2+ mois ? La fonction `generatePortfolioAlerts`
   ne définit aucun seuil pour ce type. À spécifier avant
   implémentation INTEG-003.

3. **Cohérence Synthèse vs Rentabilité sur un bien multi-crédit** :
   actuellement la Synthèse affiche un cash-flow différent de l'onglet
   Rentabilité quand un bien a plusieurs crédits. Faut-il aligner les
   deux sur l'agrégat multi-crédit (recommandation INTEG-002) ou
   afficher dans la Rentabilité une note "calculé sur crédit principal
   uniquement, voir Synthèse pour le cash-flow agrégé" ?

4. **Réversibilité des révisions de loyer** : choix produit à valider —
   sont-elles considérées comme des faits non annulables (philosophie
   journal comptable) ou comme des intentions modifiables ? Détermine
   le sort d'INTEG-007.