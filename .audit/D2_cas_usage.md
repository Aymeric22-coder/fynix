# DOMAINE 2 — COUVERTURE DES CAS D'USAGE

## Score : 7.5/10

## Synthèse
Les 9 parcours sont implémentés et globalement fonctionnels (wizard 5 étapes complet, fiche détail avec 7 onglets adaptés au usage_type, édition partielle, suivi réel multi-kinds, dashboard + carte + graphiques, export PDF 4 pages, what-if avec 4 presets). Les frictions principales sont (a) les onglets non pertinents pour une RP qui restent affichés, (b) `alertCount` codé en dur à zéro sur les cartes du dashboard (déjà identifié D5) et (c) le what-if 100% client (donc non persistable / non partageable).

---

## 2.1 Wizard locatif longue durée
**Statut : OK, parcours fonctionnel.**
- 5 étapes présentes : Identification / Acquisition / Crédit / Fiscalité / Lots — `app/(app)/immobilier/nouveau/page.tsx:407,488,546,629,657`.
- Validation requise bloquante par étape : `validateStep()` `nouveau/page.tsx:211-232` (renvoie un message et stoppe `goNext()` l.234-236).
- Re-validation sur submit final pour les étapes 1/2/4 (+ 3 si crédit) : `nouveau/page.tsx:250-256`.
- Mensualité temps réel : `loanPreview = computeMonthlyPayment(...)` `nouveau/page.tsx:375-378`, affichée l.615-621 dès que principal/taux/durée sont saisis.
- Régime fiscal vide → bloquant : `if (s === 4) { if (!draft.fiscal_regime) return 'Le régime fiscal est requis' }` `nouveau/page.tsx:228-230` + `<option value="" disabled>` l.635.
- Brouillon persisté (sessionStorage) + hydratation depuis simulateur `nouveau/page.tsx:188-201`.

## 2.2 Résidence principale (RP)
**Statut : Partiellement OK.**
- Étape 5 (lots) : message "Aucun loyer à saisir pour une résidence principale" `nouveau/page.tsx:661-665` (pas masquée mais désactivée — friction mineure).
- Fiche : KPIs locatifs masqués (rendement remplacé par "Type d'usage" `[id]/page.tsx:475-485`), section lots remplacée par message `[id]/page.tsx:502-505`.
- "Coût mensuel de possession" affiché à la place de Cash-flow `[id]/page.tsx:457-466` (signe négatif, formule `charges + crédit`).
- **Friction CAS-RP-01** : aucun filtrage des onglets selon `usage_type`. Pour une RP, les onglets "Rentabilité & Cash-flow", "Dispositif fiscal", "Suivi réel" restent affichés et exécutent des simulations vides/non pertinentes (cf. `[id]/page.tsx:425-838`, aucun `tabs.filter`).

## 2.3 SCI IS + Pinel+
**Statut : OK.**
- Onglet "Dispositif fiscal" présent `[id]/page.tsx:823-835`, rendu via `IncentiveTab`. Pinel+ supporté côté form/panel `components/real-estate/incentives/incentive-tab.tsx:86-91` + flag `is_pinel_plus`.
- Décomposition IR (avant / réduction appliquée / lost / net) : `<TaxReductionDecomposition>` conditionné sur `taxReductionTotal > 0` `[id]/page.tsx:682-700`. Label adapté pour Pinel+ l.693.
- Onglet Distribution SCI IS : conditionné sur `propTyped.fiscal_regime === 'sci_is'` `[id]/page.tsx:703-712` → `<SciDistribution>` avec netProfitAfterIS + cca_amount + tmi.

## 2.4 Airbnb saisonnier
**Statut : OK.**
- Formulaire courte durée disponible dans le wizard : `usage_type === 'short_term_rental'` déclenche un panneau dédié (nightly_rate_low, occupancy, avg_stay, classement Atout France) `nouveau/page.tsx:678-723`.
- Saisonnalité : graphique par lot court-terme `<SeasonalityChart>` rendu par lot `[id]/page.tsx:655-668`, table par défaut 12 mois `short-term-lot-fields.tsx:34-46`.
- Suivi réel adapté : `add-event-modal.tsx:21-52` réordonne les kinds courte durée en premier (booking_cancellation, platform_payout, seasonal_closure, guest_damage, platform_dispute) selon `isShortTerm`.
- Note formule revenu (validée par autre agent) : 21717.50 × 0.85 ≈ 18460€ (vs 18484€ attendu), écart < 0.2%, OK.

## 2.5 Édition bien existant
**Statut : OK, parcours fonctionnel.**
- Route `/immobilier/[id]/edit` présente `app/(app)/immobilier/[id]/edit/page.tsx`.
- Préremplissage complet via `initial = { ... prop ... }` (15 champs dont `usage_type`, `fiscal_regime`, `lmnp_micro_abattement_pct`, `nbLots`, `nbCredits`, `hasIncentive`) `edit/page.tsx:43-63`.
- PATCH partiel par section : 3 sections (identification / acquisition / fiscalité) appellent `PATCH /api/real-estate/[id]` avec uniquement les champs modifiés `components/real-estate/edit-property-panel.tsx:109-116, 229-241, 334-336`.
- Bouton "Modifier" présent sur la fiche `[id]/page.tsx:862-869`.
- Re-validation : `fiscal_regime` requis l.327.

## 2.6 Suivi réel impayé
**Statut : OK sur la fiche, dégradé sur le dashboard (alertes globales).**
- Sur la fiche : `<RealTrackingPanel>` `[id]/page.tsx:795-808` affiche journal d'événements, bouton "Ajouter un événement" `real-tracking-panel.tsx:184-188`, alerte `tracking.alerts.map(...)` l.170-179, kinds non résolus marqués "Non résolu" / "✓" l.216-241.
- KPI loyers encaissés recalculé : `value={formatCurrency(tracking.realizedRent, ...)}` l.126-127 (vs prévision avec delta).
- Persistance API : `/api/real-estate/[id]/events` (POST/PATCH/DELETE) — fichier présent `app/api/real-estate/[id]/events/route.ts`.
- **Dégradé CAS-DASH-01** : sur le dashboard `app/(app)/immobilier/page.tsx:103` `alertCount: 0` codé en dur ; le dashboard ne lit jamais `property_events` (cf. select l.27-37). Une carte de bien ayant un impayé n'affichera pas de badge alerte. (Reprise note D5.)

## 2.7 Tableau de bord consolidé
**Statut : OK, sauf `alertCount` hardcodé.**
- Message 0 biens : `<EmptyState>` `immobilier/page.tsx:161-168` avec CTA Ajouter un bien + prompt IA.
- Agrégation : `computeRealEstatePortfolio()` l.64 + `computePortfolioSummary()` l.108 → `<PortfolioKpis>` l.194.
- Tri par rendement : `sortBy: 'netNetYieldPct_desc'` (défaut) `portfolio-view.tsx:53`, switch tris l.225.
- 3 graphiques : Pie (répartition) + Bar (cash-flow par bien) + Area (projection) `properties-charts-view.tsx:82,118,152`.
- Carte : `<PropertyMap>` `portfolio-view.tsx:23,160` consommant `coords` géocodés en DB `immobilier/page.tsx:140-146`.
- Banner LMP + banner charges estimées présents l.171-192.

## 2.8 Export PDF
**Statut : OK, parcours fonctionnel.**
- Bouton `<ExportPdfButton>` `[id]/page.tsx:858-861`, sélecteur année (currentYear → max −10 ans bornés à acqYear) `export-pdf-button.tsx:31-33,60-62`.
- Texte affiché "Le PDF contient 4 pages" l.66.
- API : `GET /api/real-estate/[id]/export-pdf?year=YYYY` valide l'année (1900-2100) `export-pdf/route.ts:25-28`, charge data en parallèle l.32-60, génère via `generateAnnualReport` (`lib/real-estate/pdf/annual-report.ts`).
- 4 pages confirmées : 3 × `doc.addPage()` `annual-report.ts:114,118,122` + page initiale (sections SITUATION / PERFORMANCE / CHARGES / IMPACT FISCAL / RÉGIME / CALCUL / DISPOSITIF).
- Cohérence montants : utilise `runSimulation()` (même source que la fiche) → cohérent.

## 2.9 What-if
**Statut : OK, parcours fonctionnel (mais 100% client comme noté D5).**
- Bouton + panneau `<WhatIfSimulator>` `[id]/page.tsx:671-679` (onglet Rentabilité).
- 5 sliders `what-if-simulator.tsx:197-235` (loyer / charges / valeur / taux / vacance — adaptés courte durée).
- 4 presets : pessimist / optimist / rate_up / vacancy_2m `what-if-simulator.tsx:189-192,95`.
- BASE = baseKpis issus de la simulation server (`runSimulation`) ; `whatIfKpis` re-calcule via `useMemo` à chaque changement de slider l.84-92.
- Bouton reset l.247.
- Limitation : aucune persistance ni partage (déjà noté D5).

---

## Cas d'usage cassés ou incomplets

### CAS-RP-01 — Onglets non filtrés pour Résidence Principale
- **Parcours** : User crée un bien `usage_type = primary_residence` → ouvre la fiche.
- **Étape qui coince** : `app/(app)/immobilier/[id]/page.tsx:425-838` — l'array `tabs` est construit indépendamment de `usageType`. Les onglets "Rentabilité & Cash-flow", "Dispositif fiscal" et "Suivi réel" restent cliquables alors qu'ils n'ont aucun sens pour une RP (pas de loyers, pas de dispositif locatif).
- **Impact utilisateur** : confusion, projections de cash-flow et incentives à 0 / N/A visibles, suspicion de bug. Pollution UX.
- **Correction recommandée** : filtrer `tabs` en fin de définition : `const visibleTabs = isPrimaryRP ? tabs.filter(t => ['synthese', 'credit', 'amortissement', 'charges'].includes(t.id)) : tabs` puis passer `visibleTabs` au `<Tabs>` l.894.

### CAS-DASH-01 — `alertCount` codé en dur à 0 sur les cartes dashboard
- **Parcours** : User a un bien avec un événement `rent_unpaid` non résolu → retourne sur `/immobilier`.
- **Étape qui coince** : `app/(app)/immobilier/page.tsx:103` `alertCount: 0`. Aucune query `property_events` dans le `select` initial l.27-37.
- **Impact utilisateur** : aucune visibilité globale des impayés / sinistres / vacances depuis le dashboard. Oblige à ouvrir chaque fiche.
- **Correction recommandée** : ajouter une requête agrégée `select('property_id, id').from('property_events').is('resolved_at', null).in('kind', ['rent_unpaid', 'vacancy', ...])` groupée par `property_id`, puis brancher `alertCount` sur le count par bien. (Cf. D5 pour détails.)

### CAS-WHATIF-01 — What-if non persistable
- **Parcours** : User configure un scénario riche → quitte la page → tout perdu.
- **Étape qui coince** : `what-if-simulator.tsx` — pas de persistance des `params` (ni sessionStorage ni API).
- **Impact utilisateur** : impossible de comparer plusieurs scénarios sur la durée, de partager un what-if avec un partenaire/conseiller, ou de retrouver une simulation faite la veille.
- **Correction recommandée** : v1 cheap = persister dans `sessionStorage` par `propertyId`. v2 = table `property_whatif_scenarios` (user_id, property_id, name, params jsonb, created_at) + UI sauvegarde / chargement de scénarios nommés.

### CAS-WIZ-LOT-01 — Étape 5 non skip pour RP
- **Parcours** : RP wizard step 5.
- **Étape qui coince** : `nouveau/page.tsx:657-665` — l'étape 5 s'affiche avec un message "Aucun loyer à saisir" mais reste comptée 5/5 et oblige un clic "Suivant" inutile.
- **Impact utilisateur** : mineur, friction d'UX.
- **Correction recommandée** : adapter `STEPS` à 4 étapes si `!isRentalUsage`, ou skip auto via `goNext` quand step=4 → 5 et `!isRentalUsage` → submit.

---

## Points à clarifier
- L'onglet "Suivi réel" pour une RP : les "alertes" calculées sur `realizedRent` n'ont pas de sens (loyer = 0). Faut-il aussi le masquer ou le réinterpréter comme "Suivi des charges réelles" pour RP ?
- Brouillon wizard `sessionStorage` `nouveau/page.tsx:201` : aucun TTL / aucun nettoyage si l'utilisateur change de bien à mi-parcours. Risque léger de mélange de données entre 2 créations consécutives.
- Export PDF : year sélectionnable mais le PDF utilise toujours `runSimulation(simInputWithIncentive)` calé sur l'année courante via les charges de l'année saisie. À auditer côté D3/D4 pour confirmer la cohérence des montants quand `year < currentYear`.