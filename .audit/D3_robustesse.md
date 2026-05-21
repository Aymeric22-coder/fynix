# DOMAINE 3 — ROBUSTESSE

## Score : 6.5/10

## Synthèse (2 phrases)
Le moteur de calcul `lib/real-estate` est défensif (guards `> 0` systématiques, fallback `?? 0`, `incompleteData: true`, géocodage qui ne throw jamais) et le wizard de création persiste son brouillon en sessionStorage. Mais plusieurs zones côté API/UX laissent passer des cas dégradés : un kind d'événement « courte durée » qui sera systématiquement rejeté par l'API (régression), création de bien sans rollback en cas d'échec partiel (crédit/lot), validations croisées de dates absentes (acquisition vs prêt, période vacance), et `alert()` natif sur la suppression de crédit.

## 3.1 Données manquantes
- Rendements : zero-div correctement gardés. `kpis.ts:61,68,77,86,101` testent tous le dénominateur (`purchasePrice > 0`, `totalCost > 0`, `downPayment > 0`).
- Bien sans crédit : `kpis.ts:42,94-96` utilisent `??` partout, `remainingCapitalNow` retombe sur `loan?.principal ?? 0`. Sain.
- `current_value=null` (plus-value affichée) : `kpis.ts:97-99` fallback `purchasePrice + worksAmount`. Le composant `what-if-simulator.tsx:70` lit `asset?.current_value ?? 0` → si null, les sliders `currentValue` ont min=max=0 (voir 3.2).
- Adresse incomplète : `lib/real-estate/geocoding.ts:38-45` filtre les `null/''`, retourne `null` si `< 3 chars` ou aucun field. Ne throw jamais. Sain.
- `cca_amount` : grepé, présent uniquement dans SCI-IS. Aucune ref UI qui crash si null trouvée.
- Pinel sans `start_year` : `lib/real-estate/fiscal/incentives/reduction-schedule.ts:55-60,76` fallback `calendarYear1` + retour anticipé si `duration_years==null || start_year==null`. Sain.
- Lot court terme sans saisonnalité : `build-from-db.ts:117-130` retombe sur `rent_amount ?? 0` ou `computeShortTermRevenue` avec params par défaut (occupancy 70 %, nuit 80 €). Sain.
- Charges incomplètes : `build-from-db.ts:271` `num = v => Math.max(0, v ?? 0)` partout. Bon. Mais `app/api/real-estate/[id]/route.ts:42-45` (route GET) somme directement `charges.taxe_fonciere + charges.insurance + ...` sans `?? 0` → si une colonne est `null` (cas migration 040 ou row partielle), tout le `annual_charges` devient `NaN` (et `net_yield` aussi). Voir ROB-002.

## 3.2 Validation formulaires
- Wizard `app/(app)/immobilier/nouveau/page.tsx:211-232` : valide `name`, `address_city`, `surface_m2`, `purchase_price`, `purchase_fees`, `acquisition_date`, prêt si activé, régime fiscal. Messages affichés en haut (`error` ligne 765), pas à côté du champ.
- Pas de **cap taux** : `min={0}` mais aucun `max` → on peut saisir 999 % comme taux d'intérêt ou taux d'assurance (`page.tsx:597-612`, `credit-form.tsx:286,294`). Saisie absurde possible.
- Pas de validation croisée **`loan_start_date >= acquisition_date`** : aucun warning ni erreur.
- Pas de validation **`loan_start_date <= today`** : on peut saisir un prêt qui démarre dans le futur sans alerte.
- Différé : `credit-form.tsx:121` rejette correctement `deferral_months >= duration_months`. Bon.
- PATCH body vide : `app/api/real-estate/[id]/route.ts:67-109` — si `Object.keys(body)===0`, aucun update n'est lancé mais retourne `{updated:true}` (faux positif silencieux). Mineur.
- `add-event-modal.tsx:82` calcule `vacancyPreview` seulement si `pe >= ps`, mais le formulaire n'empêche pas de soumettre une période inversée (l'API accepte `period_end < period_start`). Voir ROB-003.
- `add-event-modal.tsx` : pas de warning « montant > loyer mensuel » pour `rent_unpaid`. Le pré-remplissage (l.71-73) met `-rent_amount` mais l'utilisateur peut écraser à 10× sans alerte.
- `quick-actuals-entry.tsx:115` rejette correctement `rentAmount <= 0`. Sain. Année saisie via input `min={2000} max={2100}`, négatifs impossibles (numérique avec min=0).
- Wizard étape 5 short-term : `lot_occupancy_rate_pct` `max={100}` OK ; `lot_nightly_rate_low` pas de borne sup (≥ 0 OK). Sain.
- What-if (`what-if-simulator.tsx:124-146`) : si `baseValues.monthlyRent==0` ou `currentValue==0`, les ranges min/max s'écrasent à 0 → slider inutilisable. Cosmétique mais l'UX devient morte sur un bien non loué. Voir ROB-mineur.

## 3.3 Erreurs réseau
- Wizard `nouveau/page.tsx:262-358` : seul le POST de création est checké (`if (propJson?.error || !propertyId)`). Les `fetch` suivants pour `credit` (l.295) et `lots` (l.345) **ne lisent pas la réponse** — un 401/500 sur le crédit crée un bien orphelin sans crédit, sans message d'erreur, sans rollback. Voir ROB-001.
- `add-event-modal.tsx:114-117` : gère bien `!res.ok || json.error` et restitue `json.error ?? HTTP ${status}`. Sain.
- `credit-form.tsx:184-196` : `alert(json.error)` natif sur DELETE échec. Mineur (UI laide mais fonctionnel). Pas de feedback réseau.
- `quick-actuals-entry.tsx:137-140` : try/catch + setError. Sain.
- Routes API : aucune n'a de `try/catch` global. Une exception inattendue (parsing, supabase down) remonte directement → 500 Next.js générique côté serveur. La couche `withAuth` masque peut-être ; non vérifié ici. Acceptable mais à uniformiser.
- Géocodage indisponible : `geocoding.ts:74-77` retourne `null` + console.warn. La carte (`portfolio/property-map.tsx`) doit afficher les biens géolocalisés et un compteur « X non géolocalisés » — pas vérifié ici, voir Points à clarifier.

## 3.4 Race conditions
- Wizard soumission : `setLoading(true)` (l.258) mais le bouton est `<Button type="submit" loading={loading}>` (l.788). Si `Button` désactive bien le clic quand `loading=true` (à confirmer dans `components/ui/button.tsx` que je n'ai pas pu lire — file not found via Grep), double-clic protégé. Sinon faille.
- Modal édition événement `add-event-modal.tsx:282-287` : `disabled={saving}` sur Annuler + `loading={saving}` sur Submit + `onClose={() => { if (!saving) onClose() }}` (l.135). Bien.
- Credit-form : `useForm` gère `loading`. À supposer que `handleSubmit` rejette les double-clics.
- DELETE credit (`credit-form.tsx:184-196`) : `setDeleting(true)` mais le bouton est dans le footer (l.411), `disabled={deleting}`. Bon.
- What-if slider : pas de débouncing, mais c'est un `useMemo` synchrone full-client (commentaire ligne 8 : « < 50 ms typiquement »). Pas de risque réel. Sain.
- Quick-actuals (`quick-actuals-entry.tsx`) : `loading` état global mais les 3 boutons d'onglet partagent la même variable → si l'utilisateur change d'onglet pendant un submit, l'état `loading` reste figé. Mineur.

## Bugs critiques

### ROB-001 — Wizard de création : pas de rollback ni d'erreur si crédit ou lot échouent
- Fichier : `app/(app)/immobilier/nouveau/page.tsx:294-350`
- Cas qui déclenche : POST `/api/real-estate` OK → property créée. Puis PUT `/api/real-estate/{id}/credit` ou POST `/lots` échoue (réseau coupé, 500 supabase, RLS).
- Impact : bien créé en base sans crédit ni lot ; aucune erreur affichée à l'utilisateur ; le user atterrit sur la page détail avec données incohérentes (incompleteData=true silencieusement).
- Correction recommandée : vérifier `res.ok && !json.error` pour chaque fetch ; en cas d'échec, soit afficher un toast non-bloquant « bien créé mais le crédit n'a pas pu être ajouté, ajoutez-le depuis la fiche », soit redirect avec un flag `?warn=credit_failed`.

### ROB-002 — Kinds courte durée rejetés systématiquement par l'API events
- Fichier : `app/api/real-estate/[id]/events/route.ts:18-21,82-83`
- Cas qui déclenche : utilisateur ouvre `AddEventModal` sur un bien `short_term_rental`, choisit l'un des 5 kinds proposés (`booking_cancellation`, `platform_payout`, `guest_damage`, `platform_dispute`, `seasonal_closure`) → POST → l'API renvoie 400 `kind must be one of: rent_unpaid, vacancy, rent_revision, exceptional_charge, unplanned_works, insurance_claim, rent_paid_late, other`.
- Impact : impossible de saisir AUCUN événement de suivi réel sur les biens courte durée. Régression fonctionnelle silencieuse.
- Correction recommandée : ajouter les 5 valeurs au tableau `ALLOWED_KINDS` ; idéalement importer la liste de kinds depuis `types/database.types.ts` pour avoir une source unique.

### ROB-003 — Métriques GET property cassées si une colonne charges est null
- Fichier : `app/api/real-estate/[id]/route.ts:42-45`
- Cas qui déclenche : un row `property_charges` créé avant la migration 040 ou via INSERT partiel laisse certaines colonnes (`taxe_fonciere`, `insurance`, `accountant`, `cfe`, `condo_fees`, `maintenance`, `other`) à `NULL` au lieu de `0`.
- Impact : `annualCharges = NaN` → `net_yield = NaN` → l'API renvoie un JSON avec `metrics.net_yield: null` (JSON ne sérialise pas NaN, le serializer le convertit en null) ou `"NaN"` selon l'implémentation, et toutes les `metrics` dérivées sont fausses. Pas un crash, mais valeurs trompeuses.
- Correction recommandée : remplacer par `(charges.taxe_fonciere ?? 0) + (charges.insurance ?? 0) + ...` (le pattern `num = v => Math.max(0, v ?? 0)` est déjà utilisé dans `build-from-db.ts:271`, à factoriser).

## Bugs mineurs

### ROB-101 — Pas de validation croisée date acquisition / date début prêt
- Fichier : `app/(app)/immobilier/nouveau/page.tsx:222-227`
- Aucun garde-fou : on peut saisir un prêt qui démarre 5 ans **avant** l'acquisition. Les amortissements seront calculés sur une période incohérente.
- Suggestion : ajouter `if (draft.loan_start_date < draft.acquisition_date) return 'Le prêt ne peut pas démarrer avant l\'acquisition'`.

### ROB-102 — Pas de cap supérieur sur les taux
- Fichiers : `app/(app)/immobilier/nouveau/page.tsx:597-612`, `components/real-estate/credit-form.tsx:286-298`
- `min={0}` mais `max` absent sur `interest_rate` et `insurance_rate`. On peut saisir 500 %.
- Suggestion : `max={25}` sur taux nominal, `max={5}` sur assurance.

### ROB-103 — Période événement inversée acceptée
- Fichier : `components/real-estate/add-event-modal.tsx:164-191` + `app/api/real-estate/[id]/events/route.ts:78-128`
- `period_end < period_start` est calculée comme `null` côté preview mais le POST passe quand même. L'event est enregistré avec une période négative.
- Suggestion : validation côté client (HTML `min` attribute) + côté serveur.

### ROB-104 — DELETE credit utilise alert() natif
- Fichier : `components/real-estate/credit-form.tsx:191`
- `alert(json.error)` — incohérent avec le reste de l'app qui affiche `text-danger bg-danger-muted`.

### ROB-105 — What-if slider inutilisable si rent ou currentValue = 0
- Fichier : `components/real-estate/what-if-simulator.tsx:124-146`
- Quand `baseValues.monthlyRent=0` (bien vacant), les ranges `monthlyRent` ont min=max=0 → slider gelé. Pareil pour `currentValue=0`.
- Suggestion : forcer un range minimum (`max: Math.max(baseValues.monthlyRent * 1.3, 1000)`).

### ROB-106 — PATCH avec body vide retourne succès silencieux
- Fichier : `app/api/real-estate/[id]/route.ts:67-109`
- `await Promise.all([])` ne fait rien et retourne 200. Devrait retourner 400 ou ne pas être permis.

### ROB-107 — quick-actuals-entry partage un seul `loading` entre 3 onglets
- Fichier : `components/real-estate/quick-actuals-entry.tsx:69,114,144,175`
- Changer d'onglet pendant un submit ne reset pas `loading` → boutons inactifs visuellement sur un onglet où il n'y a pas de requête.

## Points à clarifier

1. Le composant `Button` (`components/ui/button.tsx`) supporte-t-il vraiment l'attribut `loading` en désactivant `onClick` ? Le Grep n'a rien trouvé — à confirmer pour valider la protection double-clic du wizard et de credit-form.
2. La carte `portfolio/property-map.tsx` affiche-t-elle un message « X biens non géolocalisés » ? Non vérifié, mais `geocoding.ts` est défensif côté backend.
3. La géocodage est-il appelé synchrone à la sauvegarde du bien ou en background (`/api/real-estate/geocode-missing`) ? À vérifier — si synchrone, latence × bien.
4. `app/api/real-estate/[id]/events/[eventId]/route.ts:46-52` resynchronise `rent_amount` du lot sur une révision PATCH. Mais si le PATCH déplace l'event sur **un autre lot** (`body.lot_id` différent de `existing.lot_id`), on met à jour l'ancien lot avec le nouveau montant — comportement probablement erroné, à confirmer.