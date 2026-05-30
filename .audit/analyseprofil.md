# Analyse approfondie — Section « Profil » de FIRECORE

> **Périmètre** : section `/profil` (wizard 8 étapes + carte de synthèse) + onboarding `/bienvenue` (formulaire 60 s).
> **Cadre d'évaluation** : porte d'entrée de l'app, point névralgique de la personnalisation aval (analyse, scores, recos, FIRE).
> **Posture** : designer produit + expert onboarding fintech. Pas de complaisance.
> **Aucune ligne de code modifiée — livrable purement analytique.**

---

## 1. État des lieux

### 1.1 Architecture du parcours

Le parcours actuel est en **deux étages disjoints** :

| Étage | Route | Forme | Champs captés | Statut obligatoire |
|---|---|---|---|---|
| Onboarding rapide « 60 s » | `/bienvenue` | 3 inputs + projection animée + 2 CTAs | `age`, `patrimoineActuel`, `revenuMensuelNet` | Optionnel — peut être sauté |
| Wizard détaillé | `/profil` | 8 étapes + carte synthèse | ~30 champs (cf. ci-dessous) | **Optionnel** explicitement (lien « accède au dashboard directement » dès l'étape 1) |
| Réglages fiscaux | `/parametres` | Formulaire long | `tmi_rate`, `fiscal_situation`, `professional_income_eur`, `foyer_fiscal_parts`, `display_name` | Indépendant — JAMAIS rappelé depuis le wizard |

**Constat structurel n°1** : le « profil utilisateur » est éclaté sur 3 surfaces (`/bienvenue` + `/profil` + `/parametres`) avec **chevauchements** (situation familiale présente dans `/profil` ET `/parametres` sous deux noms différents) et **angles morts** (TMI, parts fiscales, revenus pro foyer existent uniquement dans `/parametres` mais ne sont jamais évoqués au cours du wizard, alors qu'ils sont consommés par 3 scores et 4 recos).

### 1.2 Le wizard 8 étapes — inventaire complet

| # | Étape | Champs | Format | Obligatoire | Skippable |
|---|---|---|---|---|---|
| 1 | Situation personnelle | `prenom`, `age`, `enfants` (0/1/2/3/4+), `situation_familiale` (4 valeurs), `statut_pro` (5 valeurs) | Texte / chips / select | **Oui** (âge, situation, statut) | Non |
| 2 | Revenus | `revenu_mensuel`, `revenu_conjoint`, `autres_revenus`, `stabilite_revenus` (4 valeurs) | Inputs nombre + chips | Non | **Oui** |
| 3 | Charges | `loyer`, `autres_credits`, `charges_fixes`, `depenses_courantes` | 4 inputs nombre | Non | **Oui** |
| 4 | Capacité | `epargne_mensuelle`, `invest_mensuel`, `enveloppes` (8 chips multi) | Inputs + chips | Non | Non |
| 5 | Quiz Bourse | `quiz_bourse` (4 QCM) | QCM 4 options | Non | Non |
| 6 | Quiz Crypto | `quiz_crypto` (4 QCM) | QCM 4 options | Non | **Oui** |
| 7 | Quiz Immo | `quiz_immo` (3 QCM) | QCM 4 options | Non | **Oui** |
| 8 | Risque & FIRE | `risk_1..4` (radios), `fire_type` (5 cartes), `revenu_passif_cible`, `age_cible`, `priorite` (5 chips) | Radios + cartes + inputs + chips | **Oui** (fire_type, cible, age_cible) | Non |

**Reprise** : un bandeau « Tu as complété N étapes sur 8 » s'affiche si le wizard a été abandonné — bon point.
**Persistance** : `PATCH /api/profile` est appelé à chaque transition d'étape (fire-and-forget). Pas de perte au refresh.
**Validation finale** : `PUT /api/profile` marque `profile_completed_at = NOW()` et fige `wizard_step_completed = 8`.

### 1.3 Modèle de données

Toutes les colonnes du wizard vivent dans la table `profiles` (migration `015_profile_questionnaire.sql`). Pas de table dédiée. Tableaux Postgres pour `enveloppes` (TEXT[]) et les `quiz_*` (INTEGER[]). RLS standard (`id = auth.uid()`).

```
profiles  ← migration 001
  + 28 colonnes wizard (migration 015)
  + wizard_step_completed (migration 019)
  + onboarding_quick_done, onboarding_quick_data (migration 031)
  + professional_income_eur, foyer_fiscal_parts (migration 036)
  + email_monthly_report, unsubscribe_token (migration 022)
```

### 1.4 Carte aval

| # | Champ DB | Capté dans | Consommé par | Verdict |
|---|---|---|---|---|
| 1 | `prenom` | Wizard étape 1 | Hero ProfilCard + Dashboard Hero | Cosmétique |
| 2 | `age` | Wizard 1 + Onboarding | `projectionFIRE`, `calculerProgressionFIRE`, `computeProfileMetrics`, recos #3/#7, optimiseurFiscal (donation NP) | **Pilier** |
| 3 | `situation_familiale` | Wizard 1 | `adjustCibleFamille` (lib/profil — appelée uniquement par computeProfileMetrics de la carte) + `aggregateur` la passe en `fireInputs` mais **aucun consommateur aval ne s'en sert** | **Demi-mort** (cf. doublon avec `/parametres > fiscal_situation`) |
| 4 | `enfants` | Wizard 1 | Idem `situation_familiale` (carte uniquement) + 1 mention dans `optimiseurFiscal.ts` (formulation de description, pas de logique) | **Demi-mort** |
| 5 | `statut_pro` | Wizard 1 | Affichage hero ProfilCard uniquement | **Mort fonctionnel** |
| 6 | `revenu_mensuel` | Wizard 2 | `revenu_mensuel_total` → score Solidité (taux d'effort), reco coussin cash | Pilier |
| 7 | `revenu_conjoint` | Wizard 2 | `revenu_mensuel_total` → Solidité + `adjustCibleFamille` (carte) | Utile |
| 8 | `autres_revenus` | Wizard 2 | `revenu_mensuel_total` → Solidité | Utile |
| 9 | `stabilite_revenus` | Wizard 2 | Score Solidité (`+5/-5/-15` selon CDI/indépendant/chômage) | Utile |
| 10 | `loyer` | Wizard 3 | `charges_mensuelles` → coussin Solidité, reco cash insuffisant | Pilier |
| 11 | `autres_credits` | Wizard 3 | `charges_mensuelles` → Solidité | Utile |
| 12 | `charges_fixes` | Wizard 3 | `charges_mensuelles` → Solidité | Utile |
| 13 | `depenses_courantes` | Wizard 3 | `charges_mensuelles` → Solidité | Utile |
| 14 | `epargne_mensuelle` | Wizard 4 | Projection FIRE, Progression FIRE, reco #7, snapshot dashboard, sliders | **Pilier critique** |
| 15 | `invest_mensuel` | Wizard 4 | **Aucune lecture en dehors du type/migration** | **MORT** |
| 16 | `enveloppes[]` | Wizard 4 | Score Efficience Fiscale (booléens PEA/AV/PER), recos fiscales | Pilier |
| 17 | `quiz_bourse[]` | Wizard 5 | `experienceScore` → profilType, score risk_score, Cohérence Profil | Utile (mais réduction perte d'info — cf. §2.2) |
| 18 | `quiz_crypto[]` | Wizard 6 | Idem | Utile |
| 19 | `quiz_immo[]` | Wizard 7 | Idem | Utile |
| 20-23 | `risk_1..risk_4` | Wizard 8 | `riskScore` (moyenne 0-100) → Cohérence Profil, profilType | Utile (mais valeurs individuelles perdues — cf. §2.2) |
| 24 | `fire_type` | Wizard 8 | `swrPctFromFireType` → projection FIRE, snapshot dashboard | **Pilier** |
| 25 | `revenu_passif_cible` | Wizard 8 | Projection FIRE, Progression FIRE, recos #3/#7 | **Pilier** |
| 26 | `age_cible` | Wizard 8 | Idem | **Pilier** |
| 27 | `priorite` | Wizard 8 | `PRIORITE_BOOST` → re-tri des recos | Utile |

**Champs capturés AILLEURS qui devraient logiquement être dans Profil** :

| Champ | Localisation actuelle | Importance aval |
|---|---|---|
| `tmi_rate` | `/parametres` (chips 0/11/30/41/45 + « Non renseigné ») | Score Efficience Fiscale (PER si TMI>30), fiscaliteImmo, optimiseurFiscal, recos PER | **Critique** |
| `fiscal_situation` | `/parametres` (single/married/pacs) | Fiscalité immo, quotient familial | Critique (et **doublon** avec `situation_familiale` du wizard) |
| `professional_income_eur` | `/parametres` | Détection LMP automatique (CGI art. 151 septies) | Critique pour profils immo |
| `foyer_fiscal_parts` | `/parametres` | Quotient familial → fiscalité immo | Critique pour profils familiaux |
| `patrimoine_actuel` (par classe) | `/bienvenue` (1 chiffre global) + saisi ailleurs (positions, biens, comptes) | Projection FIRE | Mécanique différente — pas un défaut mais une fragmentation |

### 1.5 Verdict consommation aval

- **Champs réellement consommés pour calibrer l'app** : 16 / 27 (~59 %).
- **Champs mort ou demi-mort** : 4 (`invest_mensuel`, `statut_pro`, `situation_familiale`/`enfants` dont l'ajustement existant via `adjustCibleFamille` n'est jamais branché dans la projection FIRE aval).
- **Champs cosmétiques** : 1 (`prenom`).
- **Champs critiques manquants du wizard mais cruciaux pour la calibration** : 4 (TMI, fiscal_situation, parts fiscales, revenus pro foyer).
- **Champs critiques absents du modèle de données** : voir §4.

---

## 2. Évaluation multi-axes

### 2.1 Tableau récapitulatif

| Axe | Note /10 | Synthèse |
|---|---|---|
| 1. Complétude des données | 5,5 | Patrimoine, fiscalité poussée et préférences ESG absents ; statut LMNP existant, régime matrimonial, héritage attendu, capacité d'emprunt non captés |
| 2. Exploitation / calibration | 5,0 | 4 champs morts ou demi-morts, TMI/parts/revenus pro non captés par le wizard, quiz individuels écrasés en 1 score |
| 3. UX & temps de complétion | 6,5 | 8 étapes raisonnables, skip + reprise OK, mais 11 quiz QCM verbeux et frustrants pour qui sait déjà |
| 4. Engagement / immersion | 4,5 | Très formulaire-administratif après le « wow » des 60 s, peu de feedback live, pas de gamification |
| 5. Captation des objectifs | 5,5 | 5 types de FIRE bien définis mais 1 seul à choisir + 5 priorités vagues ; transmission/défisc/sécurisation mal cernés |
| 6. Personnalisation du parcours | 3,5 | Parcours IDENTIQUE pour tout le monde — pas de branchements selon situation, ni de skip intelligent des quiz |
| 7. Différenciation marché | 4,5 | Wizard standard banque en ligne ; le calcul SWR variable par type FIRE et la projection animée 60 s sont des atouts, mais noyés |
| 8. Technique (data model, validation, persistance) | 7,0 | Persistance/reprise solides, RLS + check constraints OK, mais tableaux d'index quiz (`number[]` avec `-1` pour "non répondu") + colonnes plates au lieu d'un JSONB structuré |
| **Note globale** | **5,3 / 10** | Solide pour un MVP, en deçà de l'état de l'art annoncé |

### 2.2 Analyse détaillée par axe

**Axe 1 — Complétude (5,5)**
- **Couvert** : identité de surface, revenus, charges, capacité d'épargne déclarée, enveloppes ouvertes, 3 quiz de connaissances, 4 questions de risque, objectif FIRE typé.
- **Trous béants** :
  - Patrimoine actuel détaillé par classe (le `patrimoineActuel` de l'onboarding 60 s est un seul chiffre noyé).
  - Aucune captation **fiscale dans le wizard** : TMI, fiscal_situation, parts, revenus pro foyer sont relégués à `/parametres` (que l'utilisateur peut très bien ignorer).
  - Profil immobilier existant non typé (déjà propriétaire de sa RP ? bailleur LMNP ? SCPI ?).
  - Aucune question sur la **transmission** (testament, donation, assurance-vie bénéficiaires).
  - Aucune captation des **convictions ESG / exclusions sectorielles** (alcool, armement, fossiles, secteurs souhaités).
  - **Horizon réel et tolérance à la perte concrète** absents — `risk_2` plafonne à « >15 ans » sans distinguer 16 de 35 ans.
  - Capacité d'emprunt restante, dispositifs collectifs (PEE/PERCO, actionnariat salarié, stock options).
  - Évènements de vie anticipés (achat RP, naissance, retraite, héritage).

**Axe 2 — Exploitation (5,0)**
- `invest_mensuel` : **strictement aucun lecteur dans `lib/`** — captation pure. Coût utilisateur sans contrepartie.
- `situation_familiale` / `enfants` : `adjustCibleFamille` existe dans `lib/profil/calculs.ts` (et est testée) mais n'est **jamais appelée par la projection FIRE de `/analyse`** ; seule la carte de profil l'utilise. Conséquence : un couple avec 3 enfants voit la même cible patrimoine qu'un célibataire à revenus identiques.
- `statut_pro` : alimente uniquement le sous-titre du hero — la logique aval s'appuie sur `stabilite_revenus`.
- Quiz : les **réponses individuelles** (savoir ce qu'est un PEA mais pas un DCA) sont écrasées dans 1 score `experiencePct`. Aucun mini-onboarding pédagogique ciblé sur les concepts ratés.
- Doublon : `situation_familiale` (wizard, libellés FR) vs `fiscal_situation` (paramètres, codes EN). Deux champs pour la même information, jamais unifiés.

**Axe 3 — UX & temps (6,5)**
- **Bons points** : barre de progression + 8 points, bandeau « profil optionnel » dès l'étape 1, calcul live du « reste à vivre » à l'étape 4 (très bonne mécanique), reprise par bandeau dédié, skip explicite sur étapes 2/3/6/7.
- **Frictions** :
  - Les 3 quiz successifs (étapes 5-6-7) totalisent **11 QCM** — long, fastidieux, peu motivant pour un investisseur déjà confirmé. Pas de « test out » (« je connais déjà, niveau expert direct »).
  - Étape 8 surchargée : 4 radios de risque + 5 cartes FIRE + 2 inputs + 1 chip priorité = 12 décisions sur un seul écran.
  - Saisies numériques sans **slider** ni **formats lisibles** (« 3500 » sans séparateur).
  - Aucun **bouton « Je ne sais pas »** ni d'aide contextuelle sur les questions techniques (PER, SWR, TMI).
  - Champs « enveloppes » saisis en chips déclaratives alors que `financial_envelopes` existe en DB — l'utilisateur risque de saisir 2 fois.

**Axe 4 — Engagement / immersion (4,5)**
- L'onboarding 60 s **est très bon** (headline « tu pourrais être libre à X ans », graphique trajectoire, accordéon hypothèses, 2 CTAs clairs) — c'est l'unique vrai moment immersif.
- Le wizard ensuite est **un formulaire administratif** : pas d'animations entre les étapes, pas de feedback intermédiaire (« avec ce que tu as renseigné, tu es déjà classé Dynamique »), pas de jalon célébré, pas de récap visuel évolutif.
- La carte finale (ProfilCard) est **très bien designée** (hero + triptyque + duo) mais s'affiche **uniquement à la fin** — l'utilisateur ne goûte pas à la valeur en cours de route.
- Aucune **gamification** : pas de badges, pas de niveau (« débutant → averti → stratège »), pas de score qui s'affine en live.
- Pas de **storytelling** : pas de pourquoi (« tu remplis ça parce que ça va débloquer X »).

**Axe 5 — Captation des objectifs (5,5)**
- 5 types de FIRE bien pensés (lean/classic/fat/coast/barista) avec des descriptions correctes → c'est **mieux que la moyenne du marché**.
- Mais :
  - **Un seul type sélectionnable**, alors qu'un utilisateur peut viser « coast jusqu'à 50, fat ensuite ».
  - **Pas de captation explicite** de : défiscalisation comme objectif principal, transmission/donation, sécurisation patrimoniale, **revenus passifs vs valorisation pure**, projet entrepreneur.
  - `priorite` (5 chips : Liberté de temps / Arrêter de travailler / Voyager / Transmettre un patrimoine / Sécurité famille) est **vague et mal cartographié** : 3 sur 5 (« liberté », « arrêter », « voyager ») retombent toutes sur `equilibre` dans le normalizer — aucune différenciation aval.
  - `revenu_passif_cible` est une saisie sèche en euros — pas de calibration par « % de mon revenu actuel », pas d'option « j'ai juste besoin de couvrir les charges » qui auto-calculerait.

**Axe 6 — Personnalisation du parcours (3,5)**
- Le parcours est **identique pour 100 % des utilisateurs**, indépendamment de leur âge, situation, statut, objectif. Un jeune locataire passe par les 11 QCM, un retraité aussi.
- Aucun **branchement conditionnel** : un utilisateur qui déclare « 0 enfant » à l'étape 1 voit quand même l'option `+enfants` ; un utilisateur qui sélectionne `fire_type=coast` à l'étape 8 voit quand même `revenu_passif_cible` (alors que coast = capital qui fructifie seul).
- Aucune **adaptation des quiz** : le quiz Crypto reste affiché à quelqu'un qui a déclaré 0 € de crypto, 0 PEA en enveloppes et un statut « Retraité ».
- Aucun **mode rapide** vs **mode expert** vs **mode pédagogique**.
- Aucune **mémoire inter-session** « tu nous avais dit l'an dernier que… veux-tu mettre à jour ? ».

**Axe 7 — Différenciation marché (4,5)**
- **Atouts FIRECORE** : la projection 60 s « tu pourrais être libre à X ans » est forte, la typologie FIRE en 5 catégories est précise, la carte synthèse finale est belle, le SWR variable par type est sérieux.
- **Mais** le wizard lui-même ressemble à n'importe quel formulaire d'agrégateur (Yomoni / Linxea / Nalo) : 8 étapes, des chips, des QCM. Sans la dimension immersive, il ne se distingue pas.
- **Concurrence à observer** : Mint (US, ouverture compte agrégé), Nutmeg/Wealthfront (questionnaire 5-7 questions ultra-fluides avec déduction directe), Nordic Trustly + Tink (open banking pré-rempli), Mojito/Goalsetter (gamification pure pour milléniaux), Lifesight (storytelling et avatars).
- Pas d'**avatar/visualisation du soi futur** (l'app de banque privée Goalry teste l'imagerie générative de « toi à 65 ans »).
- Pas de **comparatif anonymisé** (« 73 % des profils similaires épargnent plus que toi »).
- Pas d'**import bancaire** (Bridge / Powens / Tink) pour pré-remplir revenus et charges automatiquement.

**Axe 8 — Technique (7,0)**
- **Solide** : 1 seule source de vérité (table `profiles`), RLS strict, check constraints (`age 0-120`, montants `>=0`), validation pure testable (`wizardValidation.ts`), 491 tests Vitest dont une bonne couverture de `calculs.ts`.
- **Persistance** : PATCH par étape + PUT final, `wizard_step_completed` pour reprise — propre.
- **Mais** :
  - Tableaux `quiz_*` codés en `number[]` avec sentinel `-1` (« non répondu ») : pollution sémantique, fragile.
  - Colonnes plates au lieu d'un JSONB structuré → multiplie les ALTER TABLE à chaque évolution.
  - `enveloppes` stockées en `TEXT[]` libre : pas de FK vers `financial_envelopes`, pas de normalisation des libellés (`"PEA"` vs `"pea"`).
  - **Aucune validation côté API** (cf. commentaire dans `app/api/profile/route.ts` : « pas de validation exhaustive »).
  - Pas de **chiffrement applicatif** des données sensibles (revenus, patrimoine) — seul le chiffrement at-rest Postgres protège.
  - Mobile : le wizard est responsive mais sans optimisation mobile-first (chips qui débordent sur Step1, étape 8 chargée).
  - Accessibilité : `aria-label` sur l'onboarding 60 s OK ; le wizard ne respecte pas systématiquement le pattern radiogroup (Step8 utilise des `<button>` au lieu de `<input type=radio>`).

---

## 3. Test par 8 personas

> Convention : chaque persona décrit son contexte, déroule mentalement les 8 étapes telles qu'elles existent, et conclut sur la calibration aval de l'app.

### a) Primo-investisseur jeune actif (Thomas, 28 ans)

- **Contexte** : locataire à Paris, 2 500 €/mois nets, 4 000 € d'épargne sur Livret A, aucune position bourse/crypto, veut commencer à investir.
- **Vécu** :
  - Onboarding 60 s : aha-moment positif (« 56 ans ? OK ce n'est pas si loin ! »). Continue vers `/profil`.
  - Étape 1 : OK 30 s.
  - Étape 2-3 : remplit, ne sait pas combien il dépense vraiment → estime au doigt mouillé.
  - Étape 4 : voit le « reste à vivre = 800 € » — utile. Coche `Livret A` et… c'est tout. Frustré : l'app suggère 7 autres enveloppes qu'il n'a pas.
  - Étapes 5-6-7 : 11 QCM. Il sait ce qu'est un ETF mais bloque sur PER/PEA/SCPI. Score « Débutant » partout — démotivant.
  - Étape 8 : choisit `classic`, met `2500 €/mois` (= son revenu actuel) et `45 ans`.
- **Ce qui marche** : reprise, reste à vivre live, projection initiale.
- **Ce qui manque** : un parcours **« je débute, fais-moi gagner du temps »** ; le quiz Crypto inutile ; aucune **action concrète proposée à la fin** (« ouvre un PEA ce mois-ci »).
- **Verdict calibration** : l'app va lui recommander d'ouvrir un PEA (reco fiscale OK), mais elle ignore qu'il est totalement débutant et ne lui propose **aucun parcours d'apprentissage** ni séquencement. Note calibration : **5/10**.

### b) Investisseur aguerri multi-biens (Sophie, 45 ans)

- **Contexte** : SCI familiale, 3 biens locatifs (LMNP réel), portefeuille 80 k€ PEA + 30 k€ CTO + 15 k€ crypto, veut arbitrer.
- **Vécu** :
  - Onboarding 60 s : trop simpliste, elle skip.
  - Étape 1 : OK.
  - Étape 2 : doit additionner mentalement ses revenus locatifs nets en `autres_revenus` → imprécis ; pas de différenciation entre BIC, foncier, dividendes.
  - Étape 3 : ne sait pas où mettre la taxe foncière, les charges de copro non récupérables, l'expert-comptable LMNP.
  - Étape 4 : capacité d'épargne difficile à isoler quand on a 3 biens. Coche les enveloppes — comme c'est déclaratif, elle est étonnée de devoir re-saisir alors qu'elle a tout dans `/immobilier` et `/portefeuille`.
  - Étape 5 : niveau Expert (40 s). Étape 6 : 40 s. Étape 7 : trouve les questions trop basiques.
  - Étape 8 : `fat` ou `coast` ? Elle hésite — pas d'aide contextuelle. Priorité : aucune ne correspond à son cas (« arbitrer mon patrimoine », « réduire ma TMI à 41 % » → absent).
- **Ce qui manque** : **prise en compte du LMP** (CGI 151 septies — Profile capture `professional_income_eur` mais dans `/parametres` qu'elle n'a pas visité) ; pas d'option « test out » pour les quiz ; pas de captation TMI dans le wizard.
- **Verdict calibration** : 4 champs critiques (TMI, parts, revenus pro, fiscal_situation) absents → fiscaliteImmo et optimiseurFiscal vont utiliser le fallback **30 % TMI** alors qu'elle est à 41 %. Les recos vont sous-estimer le gain PER d'environ 25 %. Note : **3/10**.

### c) Cadre fortement fiscalisé (Marc, 52 ans, TMI 41 %)

- **Contexte** : 8 000 €/mois nets, vise la défiscalisation, n'a jamais ouvert de PER.
- **Vécu** :
  - Onboarding 60 s : âge 52 ans → projection à 78 ans peut-être ; il continue par curiosité.
  - Étapes 1-4 : OK.
  - Étape 5-7 : il connaît la bourse mais pas la crypto → ses scores reflètent mal son expertise.
  - Étape 8 : choisit `fat` et `priorite=Sécurité famille`.
  - **Sort du wizard sans avoir saisi sa TMI**. L'app n'a aucun moyen de savoir qu'il est à 41 %.
- **Ce qui manque** : **aucune étape « optimisation fiscale »** dans le wizard. Les recos fiscales arrivent sans demander TMI/parts/dispositifs déjà détenus. Aucune captation des projets de défisc envisagés (Pinel, Denormandie, LMNP).
- **Verdict calibration** : la reco PER ne s'active que si TMI > 30 — or TMI=`null` côté wizard. Le potentiel client défiscalisation est **complètement raté** sauf s'il pense à aller dans `/parametres`. Note : **2/10**.

### d) Aspirant FIRE (Léo, 35 ans)

- **Contexte** : ingénieur, 5 500 €/mois, vise indépendance financière à 50 ans, sait ce qu'est le SWR.
- **Vécu** : c'est le persona pour lequel l'app **est calibrée**. Tout fonctionne. `fire_type=classic`, `revenu_passif_cible=3500`, `age_cible=50`.
- **Ce qui manque** : impossibilité de modéliser une **trajectoire mixte** (coast jusqu'à 45 puis lean) ; impossibilité de **figer un budget FIRE en % du revenu actuel** ; aucun **comparatif anonymisé** avec d'autres FIRE wannabes.
- **Verdict calibration** : **7,5/10**. Bon mais pourrait être un « 10 » avec des objectifs composites et un panel comparatif.

### e) Couple avec enfants (Famille Bernard, 40 ans, 2 enfants)

- **Contexte** : conjoints salariés, 7 000 €/mois cumulés, propriétaires RP, veulent transmettre, financer études.
- **Vécu** :
  - Onboarding 60 s : un seul utilisateur saisit — pas de notion de « couple » → projection forcément individuelle.
  - Étape 1 : `enfants=2`, `situation_familiale=Marié(e) / PACS`.
  - Étape 2 : `revenu_conjoint` OK — bon point.
  - Étape 8 : `priorite=Transmettre un patrimoine`. Le normalizer va le router vers `croissance` (pas `transmission`, qui n'existe pas comme priorité native).
- **Ce qui manque** : **financement études** (combien, à quelle date) non capté ; **donations programmées** (abattement 100 k€ tous les 15 ans) non évoquées ; **assurance-vie bénéficiaires** absente ; régime matrimonial (séparation/communauté) jamais demandé alors qu'il pilote la fiscalité ; `adjustCibleFamille` (qui ajouterait 600 €/mois pour 2 enfants) **n'est pas branché dans la projection FIRE aval** (cf. §1.4).
- **Verdict calibration** : la cible FIRE affichée par `/analyse` ignore complètement les 2 enfants. Note : **3,5/10**.

### f) Proche de la retraite (Annie, 60 ans)

- **Contexte** : cadre, 5 500 €/mois, retraite dans 4 ans, veut compléter retraite + préparer transmission.
- **Vécu** :
  - Onboarding 60 s : le clamp `age 18-70` la fait passer, mais l'horizon de simulation `ageMax=80` ne lui laisse que 20 ans → projection peu lisible.
  - Étape 8 : `fire_type=coast`? `barista`? — aucune option dédiée « préparer la retraite ». `priorite=Arrêter de travailler` retombe sur `equilibre`.
- **Ce qui manque** : prise en compte de la **date de liquidation de droits**, des **estimations Agirc-Arrco**, d'un **dispositif PER de sortie en rente vs capital**, d'un **patrimoine à transmettre déjà constitué**.
- **Verdict calibration** : la projection FIRE est forcée à fonctionner sur une mécanique inadaptée à un horizon court. Note : **3/10**.

### g) Indépendant à revenus irréguliers (Karim, 33 ans, freelance)

- **Contexte** : développeur freelance, revenus 3-7 k€/mois, veut se constituer un patrimoine.
- **Vécu** :
  - Étape 1 : `statut_pro=Indépendant / Freelance`.
  - Étape 2 : doit saisir UN chiffre dans `revenu_mensuel` → il met la moyenne, perd l'info de volatilité ; `stabilite_revenus=Très variables`.
  - Reste du wizard standard.
- **Ce qui marche** : le score Solidité applique -5 pts (indépendant), -15 si chômage — encore que `Très variables` n'est pas dans le mapping (`STABILITE_REVENUS_PTS` accepte `cdi/retraite/independant/chomage`, et `normalizeStabiliteRevenus` mappe « variable » sur `independant`).
- **Ce qui manque** : **min/max/médiane** des revenus (pas juste une moyenne), captation **trésorerie pro à mettre de côté**, **TVA / charges sociales** non isolées, statut LMNP propice à un freelance pas évoqué.
- **Verdict calibration** : 5/10 — les recos sont un peu plus prudentes mais sans modélisation de la volatilité.

### h) Profil prudent / averse au risque (Hélène, 48 ans)

- **Contexte** : aversion forte au risque, déteste l'idée de perdre, peu de dette.
- **Vécu** :
  - Étape 8 : `risk_1=Vendre`, `risk_2=<3ans`, `risk_3=3-5%`, `risk_4=<10%` → `riskScore ≈ 4/100`. `fire_type=lean` (frugalité).
- **Ce qui marche** : score Cohérence Profil va alerter si elle a 30 % de crypto.
- **Ce qui manque** : **aucune question sur les expériences traumatisantes passées** (« as-tu déjà perdu de l'argent en bourse / en immo ? »), **aucune question sur la liquidité souhaitée** (besoin d'accès rapide ou pas), **aucune ouverture vers les placements garantis** (fonds euros AV, livrets boostés) — toutes les recos partent du principe qu'elle veut investir.
- **Verdict calibration** : 4,5/10. Profil correctement classé Conservateur mais aucun produit garanti recommandé.

### Synthèse personas

| Persona | Verdict calibration |
|---|---|
| a) Primo-investisseur | 5/10 |
| b) Investisseur aguerri | 3/10 |
| c) Cadre fiscalisé | 2/10 |
| d) Aspirant FIRE | 7,5/10 |
| e) Couple/enfants | 3,5/10 |
| f) Proche retraite | 3/10 |
| g) Indépendant | 5/10 |
| h) Prudent | 4,5/10 |
| **Moyenne** | **4,2/10** |

**L'app est en réalité calibrée pour UN seul persona (l'aspirant FIRE 35 ans).** Les 7 autres sont mal servis — ce qui contredit l'ambition annoncée « se démarquer du marché ».

---

## 4. Axes d'amélioration priorisés

Légende effort : **S** = < 1 j, **M** = 1-3 j, **L** = > 3 j.

### Quick wins (S, impact immédiat)

| # | Problème | Direction | Impact | Effort |
|---|---|---|---|---|
| QW1 | `invest_mensuel` capté mais mort | Le supprimer du wizard OU le brancher (épargne_objectif → reco « tu peux passer de X à Y ») | Réduction friction | S |
| QW2 | `statut_pro` non utilisé aval | Brancher sur le score Solidité (déjà via `stabilite_revenus` mais cohérence à raffiner) ou retirer du wizard et le déduire | Cohérence | S |
| QW3 | Bouton « Je connais déjà, passe à l'expert » sur étapes 5/6/7 | CTA secondaire « Niveau Expert (skip quiz) » qui flag `quiz_*=[max]` | -2-3 min pour 30 % users | S |
| QW4 | `priorite` mal mappée (3/5 valeurs retombent sur `equilibre`) | Étendre `normalizePriorite` + ajouter `transmission`, `defiscalisation`, `securite_famille` distincts + nouveaux PRIORITE_BOOST | Recos plus pertinentes | S |
| QW5 | Pas d'aide contextuelle sur termes techniques | Tooltip `info-tip` sur PEA/PER/SWR/TMI dans Step4 et Step8 | Réduction abandon | S |
| QW6 | Doublon `situation_familiale` / `fiscal_situation` | Unifier dans le wizard (1 seul champ, 2 colonnes synchronisées), retirer la duplication `/parametres` | Cohérence donnée | S |
| QW7 | Carte de profil affichée seulement à la fin | Mini-aperçu live à droite du wizard (« voici déjà ce qu'on sait de toi ») | Engagement | M (en réalité, on a déjà ProfilCard prêt) |
| QW8 | `revenu_passif_cible` saisie sèche | Toggle « % de mon revenu actuel » (70 % par défaut, comme dans quickProjection) | Friction | S |
| QW9 | Branchement absent de `adjustCibleFamille` dans la projection aval | Brancher la fonction (déjà testée) dans `aggregateur.ts > computeProjectionSnapshot` | Calibration famille | S |
| QW10 | Aucune cible d'apprentissage post-quiz | Sur les quiz, marquer les questions ratées et exposer 3 « ressources à lire » dans la carte | Engagement + différenciation | S |

### Chantiers structurels (M-L)

| # | Problème | Direction | Impact | Effort |
|---|---|---|---|---|
| CS1 | **Volet fiscal absent du wizard** | Ajouter une étape « Ta fiscalité » (TMI, parts, revenus pro foyer, dispositifs déjà détenus) — éventuellement ré-aspirer les valeurs de `/parametres` ou inverser le sens (Profil pilote, paramètres lit) | Calibration critique persona c/e/b | M |
| CS2 | **Patrimoine actuel non capté dans le wizard** | Étape « Patrimoine actuel par classe » (5 chiffres : épargne, bourse, crypto, immo RP, immo locatif) — pré-remplie via l'onboarding 60 s | Calibration FIRE | M |
| CS3 | **Parcours unique** | Branchements selon répondes : skip étapes immobilier si patrimoine immo=0, skip quiz crypto si déclaré 0, raccourcir parcours pour retraités | Personnalisation | L |
| CS4 | **Objectifs multi-dimensionnels** | Au lieu d'1 fire_type + 1 priorité, capturer une **carte d'objectifs** (sliders d'importance sur 6 axes : revenu passif, liberté, sécurisation, défisc, transmission, valorisation) | Différenciation | L |
| CS5 | **Aucune captation des évènements de vie** | Mini-section « Projets dans les 10 ans » : RP, naissance, retraite, héritage, vente entreprise. Influence calibration projection. | Différenciation + précision | M |
| CS6 | **Quiz à information binaire** | Stocker les réponses individuelles dans un JSONB structuré, exploiter les ratés pour suggérer des micro-leçons (« On dirait que le PEA n'est pas clair — 30 s pour comprendre ? ») | Pédagogie + engagement | M |
| CS7 | **Saisie déclarative des enveloppes** | Lier la sélection à la table `financial_envelopes` (« je n'ai pas encore créé celle-ci — la créer maintenant ? ») | Cohérence + un-stop-shop | M |
| CS8 | **Pas de pré-remplissage** | Brancher un import Bridge/Powens optionnel : revenus, charges, soldes pré-remplis ; permet de remplir tout le wizard en 2 minutes | Game-changer marché FR | L (mais ROI conversion énorme) |
| CS9 | **Pas de comparatif anonymisé** | Pour chaque score affiché en carte, ajouter « 64 % des profils 30-35 ans Salarié ont moins » | Différenciation forte | M |
| CS10 | **Aucune dimension émotionnelle / story** | Découper le wizard en 3 « chapitres » thématiques (Toi, Ton aujourd'hui, Ton demain) avec illustration et transition narrée + carte évolutive en live | État de l'art onboarding fintech | L |
| CS11 | **Modèle de données plat** | Migration vers une colonne JSONB `wizard_state` versionnée, plus extensible que 28 colonnes ALTER-friendly | Tech debt | L |
| CS12 | **Pas de revisite proactive** | Notification annuelle « 1 an depuis ton profil — viens mettre à jour, je te remontre les changements » + diff visuel | Rétention | M |

### Priorisation absolue (mes 3 chantiers prioritaires)

1. **CS1 — Internaliser la fiscalité dans le wizard** (TMI/parts/revenus pro). Sans ça, 3 personas sur 8 sont mal servis et la valeur fiscale de l'app reste théorique.
2. **CS2 + QW9 — Connecter le profil au patrimoine réel**. La projection FIRE de `/analyse` doit utiliser `adjustCibleFamille` ET un patrimoine initial reflétant la réalité (pas juste l'épargne actuelle additionnée).
3. **CS3 — Brancher le parcours sur les réponses**. Le parcours unique est l'antithèse de la promesse « immersif, personnalisé ». Au minimum : skip intelligent des quiz selon enveloppes possédées et statut pro.

---

## 5. Synthèse

### 5.1 Note globale et tableau récapitulatif

| Axe | /10 |
|---|---|
| 1. Complétude des données | 5,5 |
| 2. Exploitation / calibration | 5,0 |
| 3. UX & temps | 6,5 |
| 4. Engagement / immersion | 4,5 |
| 5. Captation des objectifs | 5,5 |
| 6. Personnalisation du parcours | 3,5 |
| 7. Différenciation marché | 4,5 |
| 8. Technique | 7,0 |
| **Note globale** | **5,3 / 10** |
| Verdict personas (moyenne) | **4,2 / 10** |

### 5.2 Verdict produit

La section Profil est un **MVP solide techniquement** (RLS, reprise, tests, pure functions, types) mais **un produit ordinaire en termes d'expérience** : c'est un formulaire bancaire avec un wrapper de progression et une carte finale. Le moment magique de l'onboarding 60 s n'est jamais reproduit dans le wizard ; l'utilisateur passe d'un état immersif à un état administratif sans transition. Surtout, **la promesse « calibrer toute l'app au profil » est tenue à 60 %** : sur 27 champs captés, ~16 calibrent vraiment l'app, 4 sont morts/demi-morts, et **4 champs critiques (TMI, parts, revenus pro, fiscal_situation) sont relégués hors du wizard** alors qu'ils déclenchent les recos fiscales — la fonction la plus différenciante du produit.

### 5.3 Les 3 priorités absolues

1. **Réintégrer le volet fiscal dans le wizard** (TMI + parts + revenus pro + dispositifs déjà détenus) — sans ça, 3 profils sur 8 sont mal calibrés et toute la valeur fiscale est théorique.
2. **Brancher `adjustCibleFamille` et le patrimoine actuel sur la projection FIRE aval** — quick win + impact direct sur la précision affichée à l'utilisateur sur sa page principale.
3. **Personnaliser le parcours selon les réponses** — branchements (skip quiz crypto si 0 €, ajout étape transmission si âge>55, mode expert pour test out des quiz) — c'est ce qui différenciera l'app du formulaire générique.

### 5.4 Vision cible — à quoi ressemble une section Profil « de pointe »

**Principe directeur** : le profil n'est pas un formulaire, c'est **une conversation initiale qui forge l'avatar financier**, et qui revient dans l'app pour évoluer avec l'utilisateur.

```
┌───────────────────────────────────────────────────────────────────┐
│  AVATAR PATRIMONIAL VIVANT                                        │
│  (carte qui se construit à chaque réponse, à droite du wizard)    │
└───────────────────────────────────────────────────────────────────┘

  Chapitre 1 — Toi (90 s)
  ▸ Identité, situation, statut, fiscalité (TMI + parts) — 1 écran
    avec storytelling « parle-moi de toi » et import bancaire optionnel
    (pré-remplit revenus + charges).

  Chapitre 2 — Ton aujourd'hui (60 s)
  ▸ Patrimoine actuel par classe, pré-rempli via l'onboarding 60 s,
    enrichissable plus tard via /portefeuille et /immobilier.
  ▸ Enveloppes : sélection ↔ table financial_envelopes liée.

  Chapitre 3 — Ta connaissance (auto-évaluation)
  ▸ Slider auto-évalué « Bourse / Crypto / Immo » sur 5 niveaux,
    + option « teste-moi » qui ouvre le quiz.
  ▸ Quiz conditionnel : crypto skippé si pas d'enveloppe crypto et
    pas d'aversion explicite.
  ▸ Réponses individuelles stockées en JSONB pour micro-leçons aval.

  Chapitre 4 — Tes objectifs (multi-dimensionnels)
  ▸ Boussole d'objectifs : 6 sliders (revenu passif / liberté /
    sécurité / défisc / transmission / valorisation), pas un seul
    fire_type.
  ▸ Évènements de vie : RP, enfants, retraite, héritage.
  ▸ Tolérance à la perte concrète : simulateur visuel
    (« Voici un krach -30 % sur ton patrimoine, ça donne ça
     en € ; tu fais quoi ? »).

  Sortie : carte de profil + 3 actions immédiates personnalisées,
  + score « profil renseigné à 73 % » avec call-to-action pour
  compléter plus tard (parcours non-tout-ou-rien).

  Comparaison anonymisée injectée partout (« 64 % des profils
  similaires épargnent plus »).

  Revisite annuelle proactive + diff visuel.
```

**3 différentiateurs forts** par rapport au marché FR (Yomoni / Linxea / Boursorama / Ramify) :
1. **Carte avatar vivante** mise à jour en temps réel pendant le wizard (jamais vu en FR).
2. **Boussole d'objectifs multi-dimensionnelle** au lieu d'1 type FIRE + 1 priorité (correspond à la vraie psyché : on veut souvent plusieurs choses).
3. **Conversation initiale + revisite annuelle** au lieu d'un one-shot oublié — fait du profil un actif vivant et un levier de rétention.

---

*Rapport produit le 2026-05-27 — analyse à code constant, aucune modification du code source effectuée.*
