# Quick Wins — Sprint produit Fynix

> Date : 2026-05-18
> Tests : **966 → 977** (+11)
> TypeScript : silencieux · ESLint : 0 warning

---

## Vue d'ensemble

| # | Bloc | Statut |
|---|------|--------|
| 1 | KPI fiscal sur le Dashboard | ✅ |
| 2 | ARIA dans tous les empty states | ✅ |
| 3 | Carte « Mes trophées » sur le Dashboard | ✅ |
| 4 | Renommage FIRE → « Indépendance financière » | ✅ |
| 5 | CTA Import CSV visible dans /portefeuille | ✅ |

Infra de test étendue : `jsdom` + `@testing-library/react` + `@vitejs/plugin-react` ajoutés pour permettre les tests `.test.tsx` (le projet n'avait que des tests `lib/` en environnement Node).

---

## BLOC 1 — KPI fiscal Dashboard ✅

**Créé :**
- `components/dashboard/fiscal-kpi-banner.tsx` (composant)
- `components/dashboard/__tests__/fiscal-kpi-banner.test.tsx` (3 tests)

**Modifié :**
- `app/(app)/dashboard/page.tsx` : import + insertion entre `FIREProgressHero` et `ActionsDuMois`, conditionné à `!isEmpty`.

**Logique :**
- Somme `gain_annuel_eur` de toutes les opportunités **applicables**.
- Affiche bandeau amber « 💡 X €/an récupérables » + sous-texte 5 ans + lien `/analyse?tab=optimiser` quand `gainAnnuel > 0`.
- `return null` quand gain = 0, undefined, vide ou que rien n'est applicable.

**Tests :** total 2400 €/an → "2 400 €/an" + "12 000" + lien `/analyse?tab=optimiser` · liste vide → render vide · opportunités non-applicables/gain 0 → render vide.

---

## BLOC 2 — ARIA dans les empty states ✅

**Créé :**
- `lib/aria/openAria.ts` : helper `openAriaWithPrompt(prompt)` + constante `ARIA_OPEN_EVENT = 'fynix:aria-open'`. Mécanisme léger via `CustomEvent` sur `window` (zéro context provider à ajouter).
- `components/ui/__tests__/empty-state.test.tsx` (3 tests).

**Modifié :**
- `components/aria/AriaLauncher.tsx` : ajoute un `useEffect` qui s'abonne à `fynix:aria-open` et ouvre le panneau avec le prompt fourni.
- `components/ui/empty-state.tsx` : nouveau prop optionnel `ariaPrompt?: string`. Quand fourni, affiche un bouton secondaire « 💬 Demander à ARIA » qui dispatche l'event.
- 5 empty states reçoivent un `ariaPrompt` adapté :
  - `app/(app)/portefeuille/page.tsx` — ETF World + small caps avec 500 €/mois
  - `app/(app)/immobilier/page.tsx` — achat locatif 200 000 €
  - `app/(app)/cash/page.tsx` — épargne de précaution
  - `app/(app)/analyse/analyse-client.tsx` (bandeau « Patrimoine vide ») — projection 2 000 €/mois revenu + 300 €/mois épargne
  - `components/dashboard/empty-state.tsx` — onboarding « par où commencer »

**Tests :** présence du bouton quand `ariaPrompt` fourni · absence sans · dispatch du CustomEvent avec le bon `detail.prompt`.

---

## BLOC 3 — Carte « Mes trophées » ✅

**Créé :**
- `components/dashboard/trophees-card.tsx` (composant)
- `components/dashboard/__tests__/trophees-card.test.tsx` (3 tests)

**Modifié :**
- `app/(app)/dashboard/page.tsx` :
  - Chargement complet des `wealth_snapshots` (sans LIMIT) côté serveur pour permettre la détection du **premier** franchissement de chaque seuil.
  - Tableau de jalons standards `[10k, 25k, 50k, 100k, 250k, 500k, 1M, 2M]` enrichi via `enrichJalonsAvecHistorique` (déjà existant dans `lib/analyse/jalonsHistorique.ts`, **non touché**).
  - `<TropheesCard>` inséré après `<PatrimoineEvolutionChart>`, avant les alertes.

**Comportement :**
- Aucun jalon `atteint` → `return null` (pas de carte vide).
- Affiche les 4 plus récents (tri par `date_atteinte` décroissant) en badges emerald arrondis avec icône `Trophy` + montant + mois/année.
- Au-delà de 4 atteints → chip « +N autres » en fin de ligne.

**Tests :** 0 atteint → null · 2 atteints → 2 badges + dates « mars 2024 » / « août 2024 » + compteur « (2 sur 3) » · 6 atteints → 4 badges les plus récents + « +2 autres ».

---

## BLOC 4 — Renommage FIRE → « Indépendance financière » ✅

**Stratégie :** ne toucher QUE les chaînes JSX visibles. Conserver intacts les commentaires, les types (`JalonFIRE`, `FireHeroData`), les imports/props (`projectionFIRE`, `fireInputs`, `FIREProgressHero`), les paramètres URL et tout le code de `lib/`.

**Modifié (10 textes UI) :**
- `components/dashboard/fire-progress-hero.tsx` : « Définis ton objectif FIRE » → « … d'indépendance » ; « Définir mon objectif FIRE » → idem ; tooltip « Cible FIRE indexée… » → « Objectif patrimonial indexé… » ; titre « Ta trajectoire FIRE » → « Ta trajectoire vers l'indépendance » (et suppression du sous-titre redondant).
- `components/dashboard/patrimoine-evolution-chart.tsx` : label graphique « Cible FIRE » → « Objectif » ; tooltip « Progression FIRE » → « Progression vers l'indépendance ».
- `components/dashboard/empty-state.tsx` : « projection FIRE » → « trajectoire d'indépendance ».
- `components/profil/ProfilCard.tsx` : « Objectif FIRE » → « Objectif d'indépendance » ; « Âge FIRE » → « Âge d'indépendance ».
- `components/profil/steps/Step8.tsx` : « Type de FIRE visé » → « Type d'indépendance visé » ; « Âge cible FIRE » → « Âge cible d'indépendance ».
- `components/analyse/ScoresBand.tsx` : titre du score « Progression FIRE » → « Progression vers l'indépendance ».
- `components/analyse/ProjectionFIRE.tsx` : 4 textes (titre principal, fallback profil incomplet, message acquisitions vides, badge « Impact FIRE » sur les acquisitions).
- `components/analyse/Recommandations.tsx` : chip « gagnés sur le FIRE » → « gagnés sur l'indépendance ».
- `components/aria/AriaPanel.tsx` : message d'accueil « ta projection FIRE » → « ta trajectoire d'indépendance ».
- `app/api/aria/chat/route.ts` : message d'erreur user-facing « age FIRE cible » → « age d'indépendance cible ».
- `lib/email/templates/monthly-report.ts` : section « Votre trajectoire FIRE » → « Votre trajectoire vers l'indépendance ».

**Conservé volontairement (commentaires + code) :** noms de composants, types, props (`JalonFIRE`, `projectionFIRESnapshot`, `FIREProgressHero`, `FIRE_TYPES`), commentaires (`// FIRE Hero —…`, `* projection FIRE`).

---

## BLOC 5 — Import CSV permanent ✅

**Constat :** le bouton « Importer CSV » existait DÉJÀ dans `components/pages/portefeuille-actions.tsx` et était rendu dans le header de `/portefeuille` (donc déjà toujours visible, indépendamment de l'empty state).

**Modifié :**
- `components/pages/portefeuille-actions.tsx` :
  - Ajout d'un tooltip `title=` sur le bouton + d'un texte d'aide discret `text-[10px] text-muted` sous la rangée de boutons (caché en mobile pour ne pas surcharger).
  - Liste brokers issue de `import-csv-modal.tsx` (Trade Republic, Degiro, Boursorama, Crédit Agricole, Lynx/IBKR, Fortuneo, Linxea).

**Créé :**
- `components/pages/__tests__/portefeuille-actions.test.tsx` (2 tests) : présence du bouton « Importer CSV » + son texte d'aide brokers ; présence du bouton « Ajouter une position ». Les modales sont mockées pour isoler le test.

---

## Infra de test ajoutée

Pour permettre les tests `.test.tsx` (le projet n'avait que des tests `.test.ts` en environnement Node) :

- **Dependencies** : `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitejs/plugin-react` (devDeps).
- `vitest.config.ts` : plugin React activé, includes étendus à `components/**/*.test.tsx`, `setupFiles` pointant vers `vitest.setup.ts`.
- `vitest.setup.ts` : import `@testing-library/jest-dom/vitest` (matchers `toBeInTheDocument`, etc.).
- Chaque fichier de test React déclare `/* @vitest-environment jsdom */` en première ligne (l'env par défaut reste `node` pour ne pas ralentir les tests `lib/`).

---

## Compteur de tests final

```
Test Files  70 passed (70)
     Tests  977 passed (977)
```

Détail des nouveaux tests (+11) :
- `fiscal-kpi-banner.test.tsx` : 3
- `empty-state.test.tsx` : 3
- `trophees-card.test.tsx` : 3
- `portefeuille-actions.test.tsx` : 2

Vérifications passantes :
- `npx vitest run` → 977/977 ✅
- `npx tsc --noEmit` → silencieux ✅
- `npx eslint . --max-warnings 0` → 0 erreur 0 warning ✅

---

## Ce qui n'a PAS été fait (et pourquoi)

1. **Détection automatique des `lean FIRE` / `fat FIRE` / `standard FIRE` dans l'UI** — ces termes n'apparaissent **pas** dans le code visible (vérifié par grep). Ils existent uniquement dans `lib/profil/calculs.ts` (FIRE_TYPES qui pilote les ids `lean` / `standard` / `fat`), ce qui est interdit de toucher (`lib/`). Le rendu utilisateur affiche `f.name` (« FIRE frugal », « FIRE équilibré », « FIRE confortable ») qui devrait idéalement être renommé — mais c'est dans `lib/profil/calculs.ts` donc hors scope.

2. **Renommage dans `lib/analyse/`** — explicitement interdit par la consigne. Plusieurs `details` et `explanation.lecture` des scores parlent encore de « FIRE » dans les modales — à traiter dans un sprint dédié si souhaité.

3. **Tests fonctionnels du wiring Dashboard ↔ TropheesCard** — la carte est testée isolément avec des jalons mock. Le wiring complet (charge Supabase → enrichJalons → render) n'est pas couvert par un test d'intégration (nécessiterait un setup Supabase mock côté Node, hors scope d'un quick win).

4. **Tooltip riche pour le bouton « Importer CSV »** — utilisation du `title=` HTML standard plutôt qu'un composant Tooltip dédié (n'existe pas dans le design system actuel, et créer un composant Tooltip aurait débordé du scope).
