# Audit Produit FIRECORE
> Angle : expérience utilisateur + stratégie produit
> Date : 2026-05-18

---

## Résumé exécutif

FIRECORE est un **moteur d'analyse patrimoniale très solide** posé sur une **expérience produit encore brouillonne**. Le code calcule beaucoup (5 scores commentés, 8 opportunités fiscales chiffrées, 6 stress tests, projection FIRE multi-composantes, expansion ETF en micro-expositions, optimisation par profil) — mais l'utilisateur navigue dans **8 onglets dans /analyse**, doit ressaisir manuellement chaque ligne (pas d'agrégation bancaire), et tombe sur des chiffres bruts avec un langage d'expert-comptable.

L'app a **trois différenciateurs réels vs Finary** : l'optimiseur fiscal chiffré en €/an, les stress tests interactifs, ARIA (assistant IA conversationnel avec tool-calling sur les données patrimoniales). Aucun n'est mis en avant dans le parcours nouvel utilisateur.

Le problème central n'est pas le manque de features — c'est l'**inflation fonctionnelle** : trop d'onglets, trop de scores, trop de KPIs simultanés. Pour Thomas (débutant), c'est intimidant. Pour Julie (52 ans), c'est imbuvable. Seul Marc (patrimoine complexe) y trouve son compte tel quel.

Priorité 1 : **rabattre /analyse de 8 onglets à 3 récits clairs** (Où j'en suis / Quoi faire / Et si…) et **mettre l'optimiseur fiscal + stress tests en première ligne**. Priorité 2 : **un onboarding 60 secondes** qui montre une projection FIRE crédible avec 3 inputs au lieu d'un wizard à 8 étapes. Priorité 3 : **trancher la promesse** (agrégateur vs simulateur) — sans synchronisation bancaire, l'app ne peut pas tenir une promesse d'agrégateur face à Finary.

---

## Score par profil utilisateur

| Profil | Onboarding | Valeur sem. 1 | Valeur mensuelle | Raison de payer | Note globale |
|---|---|---|---|---|---|
| **A — Thomas, 28 ans, débute** | 3/10 — wizard 8 étapes intimidant, quiz bourse/crypto/immo avant d'avoir vu un chiffre | 4/10 — scores en « gris/Données insuffisantes » tant qu'il n'a rien saisi | 4/10 — peu d'évolution à voir avec un patrimoine 0-5 k€ | 2/10 — n'identifie pas pourquoi payer ; Boursorama suffit | **3/10** |
| **B — Sophie, 35 ans, 80 k€** | 5/10 — friction de re-saisie manuelle de tout son portefeuille déjà sur Finary | 7/10 — voit vraiment ses scores, projection FIRE, optimisations LMNP | 6/10 — itère sur le simulateur, ajoute des bien futurs | 5/10 — Finary fait l'agrégation auto, FIRECORE fait mieux l'analyse mais elle doit choisir un seul outil | **6/10** |
| **C — Marc, 45 ans, patrimoine complexe** | 6/10 — accepte la saisie manuelle car valeur perçue justifie l'effort | 9/10 — optimiseur fiscal chiffré + stress tests + projection multi-composantes = vraie nouveauté | 8/10 — outil indispensable de pilotage trimestriel | 8/10 — l'optimiseur fiscal seul vaut 200 €/an chez un CGP | **8/10** |
| **D — Julie, 52 ans, peu tech** | 2/10 — vocabulaire FIRE / DCA / TMI / SWR / tracking error la perd dès le wizard | 3/10 — ne comprend pas les scores, n'ose pas cliquer sur les modales d'explication | 3/10 — pas d'angle « retraite » lisible | 1/10 — aucune raison perçue | **2/10** |

L'app est aujourd'hui calibrée pour **Marc**. Sophie est borderline (perd face à Finary). Thomas et Julie ne sont pas servis.

---

## Architecture actuelle — cartographie complète

### Navigation principale (sidebar)
1. **Profil** — wizard 8 étapes (situation, revenus, charges, capacité, quiz bourse, quiz crypto, quiz immo, FIRE + risque) ou carte de synthèse si rempli
2. **Dashboard** — FIRE Hero + Actions du mois + Évolution patrimoine + Alertes + KPIs + simulation immo + récap portefeuille + 2 graphes + top actifs
3. **Portefeuille** — onglets par classe (Global / Bourse / ETF / Crypto / SCPI / Métaux / Obligataire), KPIs, évolution, performance historique (TWR/MWR/Sharpe/drawdown), liste positions
4. **Immobilier** — KPIs portefeuille immo, liste cartes biens + détail par bien (charges, crédit, lots, valuations)
5. **Cash** — liste comptes + total + intérêts annuels par compte
6. **Analyse** — **8 onglets** : Global / Portefeuille (6 sous-onglets) / Immo physique / Cash / Scores & Projection / Simulateur / Recommandations / Optimisation fiscale
7. **Paramètres** (footer sidebar) — TMI, situation fiscale, opt-in email mensuel
8. **ARIA** (bouton flottant global) — chatbot IA avec 6 tools, mémoire conversationnelle, nudges proactifs

### Routes auth
- `/login`, `/signup` (email/password, pas d'OAuth)
- `/admin/aria-feedback` (gated par ADMIN_EMAIL)

### Tables Supabase importantes mais sans UI visible
- `dca_plans` / `dca_occurrences` — plans DCA programmés (UI retirée en navigation)
- `transactions` — alimentent les cashflows portefeuille mais aucune page de listing
- `aria_conversations` / `aria_messages` / `aria_user_insights` — mémoire ARIA

---

## Problèmes critiques d'architecture

### 1. /analyse est devenue une décharge (8 onglets)
[app/(app)/analyse/analyse-client.tsx:38-57](app/(app)/analyse/analyse-client.tsx) ajoute conditionnellement Global, Portefeuille, Immo, Cash, Scores & Projection, **Simulateur**, **Recommandations**, **Optimisation fiscale**. Un nouvel utilisateur n'identifie pas quelle est la valeur unique de chaque onglet, et plusieurs (Portefeuille / Immo / Cash) **dupliquent** le contenu des pages dédiées de la sidebar. C'est le problème n°1 d'architecture.

### 2. Duplication Dashboard ↔ Analyse > Global
Le donut d'allocation + KPIs patrimoine + revenu passif apparaissent **deux fois** (dashboard ET /analyse onglet Global). L'utilisateur ne sait plus où est la source de vérité.

### 3. Profil = porte d'entrée mais cul-de-sac
`/profil` est le premier item de la sidebar (positionnement clé) mais n'apporte aucune valeur après remplissage : carte statique avec les réponses du quiz. Aucune projection, aucun chiffre dynamique. L'utilisateur ne revient jamais. Pourtant c'est là que se logent les **inputs critiques** (revenu, charges, risque, FIRE cible) qui pilotent tout le reste.

### 4. Optimiseur fiscal et Stress tests enterrés
Deux features très différenciantes : l'optimiseur fiscal est le **8e onglet** d'/analyse. Les stress tests vivent à mi-chemin dans `ProjectionFIRE.tsx` (composant `StressTestPanel`), tout en bas de l'onglet "Scores & Projection". Un utilisateur normal ne descend pas jusqu'à là.

### 5. ARIA est partout mais nulle part
Bouton flottant, nudges proactifs, mémoire conversationnelle — l'investissement technique est énorme. Mais ARIA n'est jamais mentionnée dans l'onboarding, l'empty state du dashboard, ou les écrans vides des sections. L'utilisateur ne sait pas qu'elle peut littéralement répondre à « explique-moi mon score de solidité » ou « simule un krach ».

### 6. Charge cognitive maximale au premier écran
Dashboard authentifié vide affiche un empty state correct. Dashboard avec données : FIRE Hero + Actions du mois + Évolution patrimoine + Alertes + Récap drift + KpiGrid + Récap immo simulation + Récap portefeuille + 2 grands graphiques + Top actifs = **~10 sections empilées**. C'est un dump, pas un dashboard.

---

## Architecture recommandée

### Sidebar simplifiée (5 sections + ARIA)

```
1. Ma situation        ← fusion Dashboard + /analyse > Global, narration "où j'en suis"
2. Mon patrimoine      ← fusion Portefeuille + Immobilier + Cash en arborescence
3. Mes objectifs       ← Profil + Projection FIRE + Simulateur (fusion)
4. Optimisations       ← Recommandations + Optimiseur fiscal + Stress tests
5. Mes paramètres      ← (footer)

[ARIA] toujours présent en flottant, mentionnée dans chaque empty state
```

Rationale :
- L'utilisateur pense « ce que j'ai » (patrimoine) puis « où je vais » (objectifs) puis « que faire » (optimisations). Pas « bourse / immo / cash » qui est une vision interne au code.
- **Mon patrimoine** unifié : un seul écran arborescent avec sous-sections Financier (actions/ETF/crypto/SCPI), Immobilier, Cash. La navigation par classe d'actif devient un filtre, pas une page.
- **Mes objectifs** : la projection FIRE devient le cœur du produit (c'est aussi le marketing). Le profil n'est plus un wizard isolé mais une side-card éditable depuis cette page.
- **Optimisations** = la salle des machines. C'est là que se loge la valeur perçue maximum (« voici 1 200 €/an que tu laisses sur la table »).

### /analyse disparaît
Tout son contenu est redistribué. Le mot "analyse" est trop abstrait pour un utilisateur.

---

## Analyse par section

### Profil (wizard 8 étapes + carte synthèse)
- **Promesse** : « Quelques minutes pour calibrer ton accompagnement FIRECORE ».
- **Réalité** : 8 étapes, ~5-8 min, beaucoup de saisie chiffrée (revenus, charges, capacité), 11 questions de quiz, sliders de risque. La carte de fin est statique.
- **Manque** : pas de feedback live « voilà ce qu'on calcule avec ce que tu viens de saisir » à chaque étape. Le quiz n'a pas de score motivant. Aucune validation que l'effort en valait la peine.
- **Polish** : fonctionnel, validation par étape, reprise après abandon — bon travail technique. Mais l'**UX promet 2 min et coûte 8 min**.

### Dashboard
- **Promesse** : vue d'ensemble actionnable.
- **Réalité** : empilement de ~10 cartes sans hiérarchie narrative claire.
- **Manque** : un seul chiffre primaire qui donne envie d'ouvrir l'app chaque semaine (ex : « +1 320 € cette semaine » ou « 3 ans 2 mois de FIRE »).
- **Polish** : excellent, mais surchargé.

### Portefeuille
- **Promesse** : suivi unifié actions/ETF/crypto/SCPI/métaux/obligataire.
- **Réalité** : très bon. KPIs, évolution sur 90 jours, analytics TWR/MWR/drawdown/Sharpe, fraîcheur prix, refresh manuel.
- **Manque** : performance « vs MSCI World cette semaine », alerte « ton ETF S&P a publié des résultats », pas de notification de dividende.
- **Polish** : **excellent**. C'est la section la plus mûre de l'app.

### Immobilier
- **Promesse** : suivi valorisation + rendement + cashflow.
- **Réalité** : KPIs détaillés (CRD, cashflow après impôts Y1, rendement net-net, payback, taux d'effort fiscal), simulation avec drift alerts, calcul amortissement.
- **Manque** : projection 20 ans par bien (juste un chiffre Y1), comparaison « si je vendais ce bien et reinvestissais en ETF », simulation revente avec PV imposable.
- **Polish** : excellent côté chiffres, mais le **détail par bien est très long** à remplir (charges, crédit, lots, valuations historiques).

### Cash & Livrets
- **Promesse** : centraliser livrets et CC.
- **Réalité** : liste de comptes + total + intérêts annuels.
- **Manque** : **aucune valeur ajoutée par rapport à une feuille Excel**. Pas de saturation Livret A/LDDS/LEP signalée, pas de comparaison de taux, pas de suggestion « ton Livret A est plein, ouvre un LDDS ».
- **Polish** : minimal. C'est la section la plus pauvre.

### /analyse > Global
- **Promesse** : score global investisseur + KPIs + donut.
- **Réalité** : 5 KPIs (Net / Portef / Immo / Cash / Revenu passif) + donut classes + score global moyenne arithmétique des 5 scores.
- **Manque** : 100 % duplication avec le Dashboard.
- **Polish** : à supprimer.

### /analyse > Portefeuille (6 sous-onglets)
- **Promesse** : analyse sectorielle/géo par classe d'actif avec MSCI.
- **Réalité** : très bon. Expansion ETF en micro-expositions (29 ETFs mappés), classification deviation vs MSCI World/ACWI, tracking error.
- **Manque** : explication du « +15 pts vs MSCI World en techno = surpondéré » en langage clair. La modal de score le fait, mais on ne sait pas qu'elle est cliquable.
- **Polish** : excellent côté maths, jargon élevé côté UX.

### /analyse > Immo physique
- **Promesse** : synthèse biens + KPIs.
- **Réalité** : 70 % duplication avec la page Immobilier.
- **Polish** : à fusionner.

### /analyse > Cash
- **Promesse** : répartition cash + rendement.
- **Réalité** : doublon partiel avec /cash. Ajoute la couverture des charges en mois (utile).
- **Polish** : à fusionner.

### /analyse > Scores & Projection
- **Promesse** : 5 scores d'intelligence + projection FIRE multi-composantes.
- **Réalité** : **le cœur du produit**. 5 scores cliquables avec modal d'explication détaillée, projection stacked area 4 composantes (financier, immo existant, immo futur, cash), 5 sliders interactifs, simulateur d'acquisitions futures, stress tests en bas.
- **Manque** : la projection FIRE devrait être **la première chose** que voit l'utilisateur, pas dans le 5e onglet d'/analyse.
- **Polish** : excellent contenu, mauvais emplacement.

### /analyse > Simulateur (What-if)
- **Promesse** : simuler épargne / acquisition / allocation.
- **Réalité** : redondant avec les sliders de la projection FIRE et le simulateur d'acquisitions futures.
- **Polish** : doublon. À fusionner dans la projection FIRE.

### /analyse > Recommandations
- **Promesse** : actions priorisées + disclaimer AMF.
- **Réalité** : 3-6 recos avec impact € + mois gagnés FIRE.
- **Manque** : pas de tracking « j'ai fait cette reco », pas d'historique des recos.
- **Polish** : bon, mais devrait remonter sur le Dashboard (déjà partiel via `ActionsDuMois`).

### /analyse > Optimisation fiscale
- **Promesse** : 8 opportunités fiscales chiffrées en € + 5 ans + action concrète.
- **Réalité** : différenciateur majeur. Chiffre PEA, AV, PER, déficit foncier, démembrement, holding, etc.
- **Manque** : **enterré dans le 8e onglet**. Devrait être un module héro.
- **Polish** : excellent fond, emplacement catastrophique.

### Paramètres
- **Promesse** : profil fiscal + préférences email.
- **Réalité** : nom, TMI, situation fiscale, opt-in email mensuel + envoi test.
- **Manque** : tout. Pas de gestion mot de passe, pas d'export RGPD, pas de suppression compte, pas de toggle thème (dark seulement).
- **Polish** : embryonnaire.

---

## Calculs cachés — valeur sous-exploitée

Liste de tout ce que le code calcule mais ne montre pas (ou mal) à l'utilisateur :

1. **`unmappedAll` / `unmappedEtfs`** ([types/analyse.ts:371](types/analyse.ts:371)) — positions sans data exploitable. Pourrait alimenter un panel « complète tes ISIN manquants pour passer de 78 % à 100 % de fiabilité » avec gamification.
2. **`projectionFIRESnapshot.age_fire_optimiste/median/pessimiste`** — intervalle de confiance affiché juste dans le Hero. Mériterait sa propre dataviz « voilà ton tunnel de probabilité ».
3. **`jalons` / `JalonFIRE` avec historique** ([lib/analyse/jalonsHistorique.ts](lib/analyse/jalonsHistorique.ts)) — date à laquelle tu as franchi 100k, 500k, 1M€. Affiché seulement comme ReferenceLine sur le graphique. Devrait être un **mur de trophées** sur le dashboard.
4. **`taux_effort_fiscal` par bien** — pourcentage du loyer qui part en impôt. Calculé pour chaque bien. Affiché comme une ligne dans le détail bien. Devrait être une alerte agressive si > 40 %.
5. **`cashflow_net_fiscal` mensuel par bien** — cashflow réel après impôts. Métrique cruciale. Présente dans la page Immo mais pas mise en avant en KPI hero.
6. **`risqueImmoGlobal` (0-75)** — risque pondéré du parc immo. Présent dans le score Cohérence mais jamais exposé en KPI propre.
7. **`tauxPressionFiscaleEstime`** — taux d'imposition projeté sur les retraits FIRE. Calculé dans `projectionGlobale`. Jamais affiché en clair (« quand tu seras FIRE à 50 ans, l'État prendra ~22 % de tes retraits »).
8. **`ciblePatrimoineAjusteeInflation`** — cible FIRE en € futurs avec inflation. Présente dans le Hero mais sans explication pédagogique « pourquoi 1 M€ aujourd'hui ne suffit pas dans 15 ans ».
9. **`computeHistoricalAnalytics` — TWR/MWR/Drawdown/Sharpe** ([lib/portfolio/historical-analytics](lib/portfolio/historical-analytics)) — métriques pro affichées dans une carte en bas du Portefeuille. Sans explication pour Thomas/Julie.
10. **`DCA en retard` (60 jours)** ([lib/analyse/recoMensuelles.ts:39](lib/analyse/recoMensuelles.ts:39)) — règle existante, mais pas de notification push, pas d'email. Juste une carte si l'utilisateur ouvre le Dashboard.
11. **Stress tests 6 scénarios** — `crash_marches, vacance_locative, perte_emploi, hausse_taux, inflation_forte, double_peine` — sous-utilisés. Le scénario par défaut est nul (`selectedId: null`) donc l'utilisateur doit cliquer pour activer.
12. **`scoreDiversificationSectorielle` / `scoreDiversificationGeo`** — calculs séparés de la déviation MSCI. Affichés dans les sous-onglets de /analyse > Portefeuille. Pas réutilisés sur le dashboard.
13. **`quiz_bourse/crypto/immo`** (de profil) — réponses aux quiz stockées en DB mais aucun score global de « niveau investisseur » n'est jamais affiché à l'utilisateur. Pourrait alimenter du contenu éducatif personnalisé.
14. **`aria_user_insights`** — insights persistants extraits par ARIA des conversations. Pourrait alimenter un fil « ARIA a remarqué que… » dans le dashboard.
15. **`wealth_snapshots` quotidiens + `portfolio_snapshots` 90 jours** — historique riche, sous-exploité. Pas de graphique « gains depuis le 1er janvier », pas de « meilleure semaine », pas de comparaison année N-1.
16. **`dca_plans` / `dca_occurrences`** — tables Supabase actives, UI retirée de la navigation. Code mort visible.
17. **`monthly-report` email** — rapport mensuel automatique (Sprint 6). Mais l'utilisateur ne sait pas qu'il existe avant de recevoir le premier. Pas de preview dans /paramètres.

### Langage
Le langage utilisé est **expert** : FIRE, DCA, SWR, TWR, MWR, Drawdown, Sharpe Ratio, tracking error, déviation, surpondération, lean FIRE, fat FIRE, LMNP réel, foncier nu micro, démembrement, déficit foncier. Pour Marc c'est rassurant. Pour Thomas/Julie c'est un mur.

---

## Analyse concurrentielle

| Critère | FIRECORE aujourd'hui | Finary | Copilot Money | Projection |
|---|---|---|---|---|
| **Agrégation bancaire auto** | ❌ saisie manuelle | ✅ Bridge/Powens | ✅ Plaid (US) | ❌ |
| **Multi-classes (immo + financier + crypto)** | ✅ complet | ✅ complet | ⚠️ pas immo physique | ⚠️ FIRE-only |
| **Stress tests interactifs** | ✅ **6 scénarios** | ❌ | ❌ | ⚠️ basique |
| **Optimiseur fiscal chiffré €/an** | ✅ **8 règles** | ⚠️ informatif | ❌ | ❌ |
| **Assistant IA conversationnel** | ✅ **ARIA + tool-calling** | ⚠️ chatbot basique | ✅ Copilot AI | ❌ |
| **Projection FIRE multi-composantes** | ✅ **4 composantes** | ⚠️ basique | ❌ | ✅ |
| **Analyse sectorielle vs MSCI** | ✅ avec expansion ETF | ⚠️ basique | ❌ | ❌ |
| **Suivi LMNP / régime fiscal immo** | ✅ détaillé | ⚠️ basique | ❌ | ❌ |
| **App mobile native** | ❌ (web only) | ✅ iOS + Android | ✅ | ❌ |
| **Notifications push** | ❌ email mensuel | ✅ | ✅ | ❌ |
| **Onboarding < 60 sec** | ❌ wizard 8 étapes | ✅ Connect bank | ✅ Plaid + IA setup | ⚠️ |
| **Gratuit utilisable** | ✅ tout gratuit | ⚠️ free tier limité | ❌ payant | ✅ |
| **Communauté / social** | ❌ | ⚠️ basique | ✅ Discord | ❌ |
| **Pricing premium** | — | 9,99 €/mois | 13 $/mois | — |

### Ce que FIRECORE fait mieux que tous
- **Optimiseur fiscal chiffré en €** : ni Finary, ni Copilot, ni Projection ne quantifient le manque à gagner fiscal en euros annualisés sur 5 ans avec action concrète.
- **Stress tests interactifs** : 6 scénarios avec graphique comparatif baseline/stressée. Différenciateur fort.
- **Projection FIRE 4 composantes** (financier + immo existant + immo futur + cash, avec amortissement crédit année par année et acquisitions futures simulées).
- **ARIA avec tool-calling** : capacité de simuler/chercher/expliquer en langage naturel, avec mémoire long-terme. Tech-stack moderne (streaming Anthropic SDK).
- **Analyse sectorielle vs MSCI World** avec expansion ETF en micro-expositions (29 ETFs mappés).

### Ce que les concurrents font mieux
- **Finary** : agrégation bancaire, app mobile, base utilisateurs FR énorme, communauté.
- **Copilot Money** : design exceptionnel, catégorisation IA des transactions, app mobile-first.
- **Projection** : focus laser sur FIRE, simplicité, communauté FIRE engagée.

### Où personne n'est encore bon
- **Pédagogie progressive** : aucun outil n'enseigne réellement. Tous balancent des chiffres en jargon.
- **Décisions concrètes auto-exécutables** : aucun n'a un bouton « rééquilibrer mon PEA » avec passage d'ordre direct (régulation).
- **Optimisation transmission** : démembrement, donation, IFI, assurance-vie post-70 ans — terrain quasi vierge sur les apps grand public.
- **Suivi conjoint** : aucun outil ne gère bien un patrimoine commun avec parts indivises, communauté réduite aux acquêts, etc.
- **Simulation retraite réaliste** : intégration CNAV + complémentaire + capital restant — terrain ouvert (Julie est mal servie partout).

---

## Boucles d'engagement existantes et manquantes

### Existantes
1. **Rapport mensuel par email** (Sprint 6) — bonne boucle. Mais l'opt-in est dans /paramètres, et l'utilisateur ne sait pas ce que contient l'email avant de le recevoir.
2. **Actions du mois** (Dashboard) — affichées à chaque visite si dérives détectées. Bonne idée, mais sans tracking « j'ai fait » / « j'ignore ».
3. **Nudges ARIA proactifs** (`useAriaProactive`) — détection d'idle sur une section pour proposer une simulation. Très bonne idée, peu visible.
4. **Évolution patrimoine** — graphique historique. Pousse à revenir pour voir « combien ça a bougé ».

### Manquantes (critiques)
1. **Aucune notification push** — pas d'app mobile, pas de webpush, pas de SMS. L'utilisateur n'est jamais rappelé.
2. **Pas de gamification** — pas de progression visible, pas de badges sur les jalons FIRE déjà franchis, pas de score d'investisseur qui monte.
3. **Pas de comparaison anonyme** — « les utilisateurs de ton âge/revenu épargnent X €/mois en moyenne » n'existe pas. Levier fort de rétention.
4. **Pas d'alertes événementielles** — dividende reçu, ATH portefeuille, drawdown -10 %, ETF qui a changé de composition.
5. **Pas de tracking objectif** — l'utilisateur fixe une cible FIRE mais ne reçoit pas de mise à jour mensuelle « tu es à 12,3 % de ta cible, +0,4 % ce mois ».
6. **Pas d'historique des recos appliquées** — l'utilisateur ne peut pas voir « j'ai ouvert un PEA grâce à FIRECORE, ça m'a rapporté X € depuis ».

### Pourquoi un utilisateur revient chaque semaine ?
**Aujourd'hui : il ne revient pas systématiquement.** Les triggers principaux sont :
- Curiosité « combien j'ai aujourd'hui » → résolu par n'importe quel agrégateur, FIRECORE demande une re-saisie qui frictionne.
- Rapport mensuel email → 1 visite/mois max.
- Désir de simuler une décision (« et si j'achète ce bien ? ») → résolu par /analyse > Simulateur, mais utilisateur revient seulement quand il a une décision à prendre, donc 2-3 fois/an.

**Manque le « pourquoi je reviens même quand je n'ai rien à faire »** — c'est là que FIRECORE est faible.

---

## Fonctionnalités recommandées

Format : Nom · Profil servi · Pourquoi ça crée de la rétention · Effort · Différenciation

### 🥇 Quick wins (impact fort, effort faible/moyen)

1. **Hero unique « Score FIRE » sur le Dashboard**
   *Profil :* tous · *Rétention :* un chiffre unique évolutif, addictif (cf. score crédit, FICO score)
   Remplacer le Hero actuel par un score 0-100 composite (basé sur les 5 existants) avec delta hebdomadaire visible. *Effort : S · Diff : moyenne*

2. **« Économies fiscales potentielles » en KPI de tête**
   *Profil :* Sophie, Marc · *Rétention :* curiosité « combien je laisse sur la table »
   Remonter le résultat de l'optimiseur fiscal en première ligne du Dashboard avec « + de 2 400 €/an récupérables → voir ».  *Effort : S · Diff : forte*

3. **Onboarding 60 secondes en 3 inputs**
   *Profil :* Thomas, Julie · *Rétention :* le wizard 8 étapes est le principal point de fuite
   Remplacer le wizard pré-rempli par : « Âge / Patrimoine actuel / Revenu mensuel » → projection FIRE immédiate avec hypothèses par défaut. Le profil complet devient incrémental.  *Effort : M · Diff : moyenne (Finary fait similaire)*

4. **Notifications push / web push minimales**
   *Profil :* tous · *Rétention :* le levier #1 manquant aujourd'hui
   3 triggers : ATH patrimoine, drawdown > 5 %, dividende reçu. Web push first (sans app native).  *Effort : M · Diff : faible*

5. **Mur des jalons franchis (« Mes trophées »)**
   *Profil :* tous, surtout Thomas (motivation) · *Rétention :* récompense visible
   Réutiliser `jalonsHistorique` (déjà calculé !) pour afficher « tu as franchi 50 k€ le 12 mars 2025 ». Carte dédiée sur Dashboard.  *Effort : S · Diff : moyenne*

6. **Bouton ARIA en empty states**
   *Profil :* Thomas, Julie · *Rétention :* fait découvrir ARIA
   Sur chaque empty state (« Aucun bien immobilier »…), ajouter un bouton « Demande à ARIA d'estimer ton scénario » avec prompt pré-rempli.  *Effort : S · Diff : forte*

### 🥈 Moyen terme (1-2 mois)

7. **Connecteur agrégation bancaire (Powens FR)**
   *Profil :* Sophie · *Rétention :* défaite face à Finary aujourd'hui
   Intégration Powens (ex-Budget Insight) ou Bridge pour PEA, AV, comptes courants. Coût : ~0,80 €/utilisateur/mois côté Powens. Conditionne l'adoption Sophie. *Effort : XL · Diff : faible (Finary aussi) mais bloquant si absent*

8. **Mode « Retraite » dédié pour Julie**
   *Profil :* Julie · *Rétention :* nouveau segment
   Onboarding alternatif « je veux savoir quand je peux arrêter de travailler » avec langage adapté (pas de FIRE, pas de DCA), intégration estimation CNAV + complémentaire.  *Effort : L · Diff : forte*

9. **Comparaison anonyme « les gens comme toi »**
   *Profil :* tous · *Rétention :* boucle sociale, addictif
   « Patrimoine médian à 28 ans / 35 ans / 45 ans = X € — tu es dans le top Y % ». Données agrégées internes ou INSEE.  *Effort : M · Diff : moyenne (Finary l'a partiellement)*

10. **Tracking des recommandations appliquées**
    *Profil :* Marc · *Rétention :* sentiment de progression
    Bouton « J'ai fait ça » sur chaque reco → historique « depuis FIRECORE tu as économisé X € ».  *Effort : M · Diff : forte*

11. **Calendrier fiscal et événementiel**
    *Profil :* Marc, Sophie · *Rétention :* rappels à valeur
    « Déclaration 2042 au 10 mai », « PEA franchit 5 ans le 12 août → exonération PS », « ton bien à Bordeaux : taxe foncière en octobre ».  *Effort : M · Diff : forte (personne ne le fait bien)*

12. **Simulation revente immobilière**
    *Profil :* Sophie, Marc · *Rétention :* nouveau cas d'usage
    « Si tu revends ce bien dans 2 ans, voilà la PV imposable, le net empoché, l'impact sur ta date FIRE ».  *Effort : M · Diff : forte*

### 🥉 Long terme (vision)

13. **Décisions semi-automatiques via partenariats brokers**
    *Profil :* Marc · *Rétention :* lock-in fort
    Bouton « rééquilibrer mon PEA » qui pré-prépare l'ordre chez Boursorama via API. Régulation à clarifier (statut CIF).  *Effort : XL · Diff : très forte*

14. **Mode « famille / couple »**
    *Profil :* tous mariés/pacsés · *Rétention :* lock-in dans le compte couple
    Gestion patrimoine commun + parts indivises + régime matrimonial.  *Effort : XL · Diff : très forte*

15. **Briefings IA hebdomadaires personnalisés**
    *Profil :* tous · *Rétention :* boucle hebdo
    ARIA rédige automatiquement un résumé « cette semaine » avec analyse personnalisée. Visible le lundi matin.  *Effort : L · Diff : moyenne*

16. **Simulation transmission / donation / IFI**
    *Profil :* Marc · *Rétention :* nouveau segment > 1 M€
    Démembrement, abattements donations, IFI, assurance-vie pre/post 70 ans.  *Effort : XL · Diff : très forte (vraiment vierge)*

17. **App mobile native avec widget patrimoine**
    *Profil :* tous · *Rétention :* visibilité quotidienne
    React Native ou natif. Widget iOS lockscreen.  *Effort : XL · Diff : faible (rattrapage)*

---

## Onboarding — chemin critique

### Parcours actuel (mesuré sur le code)

| Étape | Action | Temps | Friction |
|---|---|---|---|
| 1 | `/signup` email/password + confirmation mail | 1 min | OK |
| 2 | Redirect `/profil` → wizard 8 étapes | **5-8 min** | **HAUTE** — quiz bourse/crypto/immo, sliders risque, choix FIRE type |
| 3 | Atterrissage Dashboard | 0 | « 0 € partout », empty state OK mais peu engageant |
| 4 | Saisie premier actif (`/portefeuille` ou `/cash`) | 2-5 min/actif | Formulaire long (ISIN, broker, devise, date acquisition, notes) |
| 5 | Refresh prix manuel pour voir une valeur | 30 sec | Bouton à trouver |
| 6 | Retour Dashboard, voir le FIRE Hero | 0 | « aha » potentiel ici, mais seulement si profil rempli |

**Temps cumulé jusqu'à première valeur :** 10-15 minutes minimum.

### Frictions inutiles
- Quiz bourse/crypto/immo avant d'avoir vu un seul chiffre — pourrait être différé (« optionnel, prends 2 min plus tard pour calibrer »).
- Champ « devise » sur chaque position alors que 95 % sont en EUR — devrait être collapsible.
- Pas de import CSV mis en avant (existe via `/api/portfolio/import` mais découvrable seulement via une astuce textuelle).
- Pas d'option « je n'ai rien encore, montre-moi une simulation type » — Thomas est laissé sans porte d'entrée.

### « Aha moment » actuel
**Imprécis.** Probablement la première fois où l'utilisateur ajuste un slider de la projection FIRE et voit l'âge d'indépendance bouger. Mais c'est dans /analyse > Scores & Projection (5e onglet d'/analyse, dans la 6e section de l'app). Difficile à atteindre.

### « Aha moment » recommandé
Dès l'écran 2 du nouveau onboarding court : âge + patrimoine + revenu → **« Tu peux être indépendant financièrement à 47 ans »** avec graphique animé. Sans avoir saisi un seul ISIN.

### Trigger pour revenir le lendemain
Aujourd'hui : aucun. Pas d'email J+1, pas de push.
À ajouter : email « voilà ce que je peux faire pour toi » avec 1 simulation interactive ARIA pré-remplie.

---

## Recommandations monétisation

### Tier gratuit (proposé)
Tout ce que l'app fait aujourd'hui **sauf** :
- Pas d'agrégation bancaire (manuel uniquement)
- Limite à 5 positions financières + 1 bien immobilier
- Stress tests : 2 scénarios sur 6
- Optimiseur fiscal : 3 règles affichées sur 8 (les 5 autres montrent juste le gain estimé floutés)
- ARIA : 10 messages par mois
- Rapport mensuel email : oui

### Tier Premium — 7,99 € / mois ou 79 €/an

Inclus :
- Agrégation bancaire illimitée (Powens FR)
- Positions et biens illimités
- **8 opportunités fiscales chiffrées** + simulations sur-mesure
- **6 stress tests** + comparaisons
- ARIA illimitée + briefings hebdomadaires personnalisés
- Notifications push
- Calendrier fiscal personnalisé
- Tracking objectifs + jalons
- Export PDF / Excel mensuel
- Support email prioritaire

**Pourquoi 7,99 €** : Finary à 9,99 € a une perception « cher pour de l'agrégation ». FIRECORE se positionne 20 % moins cher mais avec plus de valeur analytique. Cible : 4-6 % de conversion gratuit→premium = 50-100 k€ ARR sur 1 000 utilisateurs payants.

### Tier Patrimoine — 19,99 € / mois ou 199 €/an (pour Marc)
- Tout Premium +
- **Simulation transmission / IFI / démembrement** (à construire)
- Mode couple / famille
- Conseil fiscal annuel par un partenaire CGP (lead-gen avec partage de revenu)
- Multi-comptes (jusqu'à 3 utilisateurs par foyer)

### Levier indirect : referral 1 mois offert
1 ami inscrit = 1 mois Premium offert pour les deux. Très bon levier dans la cible Marc qui a un cercle d'investisseurs.

---

## Plan d'action priorisé

### Quick wins (< 1 semaine)
1. **Fusionner /analyse > Global avec le Dashboard** (suppression doublon donut + KPIs).
2. **Remonter l'optimiseur fiscal en module Dashboard** avec un KPI « X €/an récupérables ».
3. **Ajouter ARIA dans tous les empty states** avec prompt pré-rempli.
4. **Carte « Mes trophées »** sur Dashboard utilisant `jalonsHistorique` (déjà calculé, jamais affiché).
5. **Renommer « FIRE » en « Indépendance financière »** partout dans l'UI publique. Garder FIRE dans les tooltips/docs.
6. **CTA explicite « Importer un export CSV »** dans `/portefeuille` (n'apparaît qu'en empty state).

### Moyen terme (1-2 mois)
7. **Refactoriser /analyse en 3 onglets max** : « Où j'en suis » (scores + global) / « Simuler » (projection + what-if + stress) / « Optimiser » (recos + fiscal).
8. **Onboarding court 60 sec en 3 inputs** avec projection FIRE immédiate. Wizard 8 étapes devient incrémental ensuite.
9. **Notifications web push** : ATH, drawdown, dividende.
10. **Tracking d'objectif mensuel** avec email récap court (différent du rapport mensuel actuel).
11. **Simulation revente immobilière** (PV + impact FIRE).
12. **Tier Premium et page pricing** + paywall sur 5 features ciblées.
13. **Calendrier fiscal personnalisé** (déclarations, échéances PEA 5 ans, AV 8 ans).
14. **Comparaison anonyme « les gens comme toi »** (médianes par âge / revenu).

### Vision long terme (3-12 mois)
15. **Connecteur Powens FR** — l'investissement le plus structurant. Conditionne l'adoption Sophie.
16. **Mode Retraite** pour le segment Julie — language adapté, intégration CNAV.
17. **Briefings hebdomadaires ARIA** personnalisés.
18. **App mobile native** (React Native) avec widgets iOS.
19. **Mode couple / patrimoine partagé**.
20. **Module transmission / IFI / démembrement** pour le tier Patrimoine.
21. **Partenariats brokers** pour décisions semi-automatiques (statut CIF à clarifier).

---

## Verdict final

FIRECORE dispose **techniquement de tout ce qu'il faut** pour battre Finary sur l'analyse et Projection sur le FIRE. Le moteur de calcul est plus mature que la moyenne du marché. Le frein n'est pas dans le code — il est dans la **mise en scène** : trop d'écrans, trop de jargon, pas de récit utilisateur clair, pas de boucles d'engagement hebdomadaires.

**La question stratégique à trancher** : FIRECORE veut-elle être un **agrégateur** (alors connecteur Powens obligatoire) ou un **simulateur expert** (alors assumer la saisie manuelle et viser Marc) ? Le code actuel essaie les deux, et l'expérience en pâtit. Choisir l'angle « simulateur expert + IA » est plus défendable à court terme et différencie mieux. L'agrégation peut venir en V2.

Si une seule recommandation devait être appliquée : **remonter l'optimiseur fiscal en première page** avec « X € que tu laisses sur la table chaque année ». C'est la promesse unique que personne ne tient en France aujourd'hui, et c'est déjà calculé.
