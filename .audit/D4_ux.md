# DOMAINE 4 — UX ET LISIBILITÉ

## Score : 7/10
## Synthèse

La section immobilière est globalement bien structurée :
- helpers `formatCurrency` / `formatPercent` / `formatDate` centralisés dans `lib/utils/format.ts:3-58` et systématiquement utilisés pour les montants principaux ;
- couleurs sémantiques tirées des tokens `text-accent` / `text-danger` / `text-warning` / `text-secondary` dans la grande majorité des composants — aucune anomalie « positif en rouge » détectée ;
- empty states présents sur **tous** les onglets clés (liste vide, crédit absent, dispositif absent, événements suivi réel vides, lots vides, valuations vides, vue carte sans coordonnées) ;
- responsive Tailwind correct sur les conteneurs principaux (`grid-cols-2 md: lg:`, `overflow-x-auto` sur les tableaux).

Les principaux points faibles relèvent de l'aide contextuelle (pas de tooltip d'explication sur des sigles fiscaux comme TAEG, CFE, GLI, LMP, SCI IR/IS, micro-BIC dans les **onglets de la fiche bien** alors que le wizard a des help-text dédiés) et de quelques contournements de format / de palette (couleurs Tailwind hors-tokens dans `simulation-revente-modal`, `simulation-charts`, `credit-tab`).

---

## 4.1 Labels ambigus / techniques sans tooltip

Constat général : le wizard `app/(app)/immobilier/nouveau/page.tsx` propose `FISCAL_REGIME_DESCRIPTIONS` (lignes 131-146) et le `<Field hint=…>` est largement utilisé pour expliquer les acronymes. Mais **dans les onglets de la fiche bien**, les mêmes sigles apparaissent sans tooltip ni hint. Pas de composant `Tooltip` réutilisable dans `components/ui/`, et aucun `aria-describedby` détecté sur les libellés.

| Sigle / libellé | Localisation sans tooltip | Référence |
|---|---|---|
| **TAEG approx.** | KPI carte « Crédit » fiche bien, sub = « Nominal X % » (pas d'explication TAEG vs nominal) | `components/real-estate/credit-tab.tsx:193-198` ; idem dans le form crédit `components/real-estate/credit-form.tsx:378-379` |
| **CRD** | Header KPI portfolio + colonnes tableau + cartes property | `components/real-estate/portfolio/portfolio-kpis.tsx:48` ; `components/real-estate/portfolio/properties-table-view.tsx:65` ; `components/real-estate/portfolio/property-card.tsx:88-91` ; `components/real-estate/multi-credit-list.tsx:87,104` ; `components/real-estate/amortization-table.tsx:136,165` ; `app/(app)/immobilier/[id]/page.tsx:443` |
| **CFE** | Champ saisie charges (hint très court « Applicable LMNP / LMP / SCI ») et colonne historique | `components/real-estate/charges-form.tsx:264-266` ; `components/real-estate/year-end-report-panel.tsx:105` ; `components/real-estate/quick-actuals-entry.tsx:338` ; `components/real-estate/import-csv-modal.tsx:186` |
| **GLI** | Label « Garantie Loyers Impayés (GLI) » : OK pour le développé, mais pas de tooltip expliquant le pourquoi/coût typique au-delà du hint très court | `components/real-estate/charges-form.tsx:165` ; le placeholder modal-event `add-event-modal.tsx:270` mentionne « GLI déclenchée » sans tooltip |
| **micro-BIC / LMNP micro-BIC** | Affiché en bare label dans le sélecteur sans tooltip dans la fiche, alors que le wizard explique | `components/real-estate/simulation-panel.tsx:103,358` ; `components/real-estate/edit-property-panel.tsx:34,365` ; `components/real-estate/portfolio/portfolio-view.tsx:130-133` |
| **LMP** (« Loueur meublé professionnel ») | Option de select et badge sans aucune indication de seuil 23 k€ / cotisations SSI dans la fiche | `components/real-estate/simulation-panel.tsx:104` ; `components/real-estate/edit-property-panel.tsx:36` |
| **SCI IR / SCI IS** | Options sans tooltip dans `edit-property-panel` (le wizard explique). Sur la page bien, l'expression « SCI à l'IS » apparaît dans `SciDistribution` sans tooltip définissant IS | `components/real-estate/edit-property-panel.tsx:37-38` ; `components/real-estate/portfolio/portfolio-view.tsx:132-133` ; `components/real-estate/sci-distribution.tsx:18,98` |
| **PFU (Flat Tax 30 %)** | Label seul (développé entre parenthèses mais sans tooltip légal sur les 12,8 % IR + 17,2 % PS) | `components/real-estate/sci-distribution.tsx:98` ; `components/real-estate/simulation-revente-modal.tsx:679,714` |
| **BIC** | Sigle utilisé dans « micro-BIC » seulement, jamais expliqué (« Bénéfices industriels et commerciaux ») | `components/real-estate/charges-form.tsx:28` ; `components/real-estate/simulation-panel.tsx:103,358-364` ; `components/real-estate/short-term-lot-fields.tsx:190` |
| **IRA** (Indemnités de Remboursement Anticipé) | Label « IRA » dans modal revente — un tooltip explique la méthode mais pas le sigle | `components/real-estate/simulation-revente-modal.tsx:740-745` |
| **TMI** | Label sélecteur « TMI » sans explication « Tranche Marginale d'Imposition » | `components/real-estate/simulation-panel.tsx:323` ; `components/real-estate/regime-comparator.tsx:50` |
| **LTV** | Sub de KPI « LTV : 70 % » sans tooltip « Loan-to-Value = dette / valeur » | `components/real-estate/portfolio/portfolio-kpis.tsx:50` |
| **PNO** | Label `Assurance PNO (€/an)` — heureusement un hint inline explique « Propriétaire Non Occupant — obligatoire en locatif » | `components/real-estate/charges-form.tsx:157-158` (OK) |
| **TF / TEOM / TLV / THLV** | Saisis dans charges-form avec hints courts seulement | `components/real-estate/charges-form.tsx:141-150` |
| **DPE** | Sélecteur sans légende des classes A-G ni explication | `app/(app)/immobilier/nouveau/page.tsx:477-482` |
| **Net-net** / **Brut FAI** | Sub des cartes KPI : « Brut : X %, Net-net : Y % » sans aucune définition (différence entre rendement brut, brut FAI, net, net-net) | `components/real-estate/simulation-panel.tsx:512-517` ; `components/real-estate/portfolio/property-card.tsx:114-118` ; `components/real-estate/portfolio/properties-table-view.tsx:69-70` |
| **CCA** (Compte Courant d'Associé) | « Avec CCA optimisé », « saisis ton CCA » sans tooltip définissant CCA | `components/real-estate/simulation-revente-modal.tsx:717,722` ; `components/real-estate/sci-distribution.tsx:39` |
| **« taxReductionLost »** côté composant : variable interne (prop nommée en anglais) mais le **libellé affiché** est en français correct (« Réduction non utilisée ») | OK pour l'utilisateur, pas de fuite | `components/real-estate/tax-reduction-decomposition.tsx:11,49-53` |
| **« incompleteData »** : variable interne, libellé affiché « Données incomplètes » + détail | OK pour l'utilisateur | `components/real-estate/simulation-panel.tsx:288-298` |
| **VEFA / RIVP** | Non trouvés dans le frontend — pas de problème |  |
| **Déficit foncier reportable** | Mentionné dans les help-text du wizard `app/(app)/immobilier/nouveau/page.tsx:135,141,143` et dans la bannière LMP `app/(app)/immobilier/page.tsx:187` — explication systématique, pas isolé sans contexte. OK |  |
| **« RevPAN »** (Revenue Per Available Night) | Stat saisonnier sans aucune explication du sigle | `components/real-estate/short-term-lot-fields.tsx:396` |
| **Code TYPE de prêt** (« PTZ », « PEL », « Action Logement », « in fine ») | Bien développés dans le wizard, mais simples options dans `multi-credit-list` | `app/(app)/immobilier/nouveau/page.tsx:567-575` (OK wizard) ; à vérifier dans `components/real-estate/multi-credit-list.tsx` (non lu en détail) |
| **DPE class** | Lettre seule sans contexte | `app/(app)/immobilier/nouveau/page.tsx:480` |

**Recommandation** : créer un composant `<Tooltip>` réutilisable (manquant — pas trouvé dans `components/ui/`) ou un composant `<Glossary term="TAEG">` qui rendrait un info-bullet (icône `(?)`) accessible (aria-describedby) et harmoniserait toutes les définitions.

---

## 4.2 Cohérence des couleurs (vert favorable / rouge défavorable / gris neutre)

Aucune anomalie « montant négatif rendu en vert » ou « positif en rouge » détectée.

Les composants utilisent systématiquement la logique `value >= 0 ? 'text-accent' : 'text-danger'` :
- `app/(app)/immobilier/[id]/page.tsx:444,460,488` (cartes synthèse KPIs)
- `components/real-estate/portfolio/portfolio-kpis.tsx:25-28,44,58` (tones positive/negative/warning)
- `components/real-estate/portfolio/property-card.tsx:108,115,122` (cash-flow / rdt / PV latente)
- `components/real-estate/portfolio/properties-table-view.tsx:88-89,97-98,124` (CRD danger, CF accent/danger, ligne TOTAL)
- `components/real-estate/simulation-panel.tsx:607,610` (table CF cumulé accent ou secondary)
- `components/real-estate/real-tracking-panel.tsx:155,268,287` (cash-flow projeté, écart vs prévision)
- `components/real-estate/regime-comparator.tsx:91`
- `components/real-estate/credit-tab.tsx:42-47` (KpiCard accent/danger/warning)

**Couleurs Tailwind hors tokens du design system** (à harmoniser sur `text-accent`/`text-warning`/etc.) :
- `components/real-estate/simulation-revente-modal.tsx:578-581` `border-amber-400/40 bg-amber-500/5` + `text-amber-400` au lieu de `border-warning/…`
- `components/real-estate/simulation-revente-modal.tsx:607,684,756,759,823-824` `text-emerald-400` / `border-emerald-500/30` au lieu de `text-accent` / `border-accent/…`
- `components/real-estate/simulation-revente-modal.tsx:966` `bg-amber-500/70` (badge waterfall) — acceptable car couleur graphique pure, mais hors palette
- `components/real-estate/simulation-charts.tsx:12-20` : `COLORS.value` `#3b82f6` (bleu), `capital` `#f59e0b` (orange) — légitime pour Recharts (qui ne digère pas les classes Tailwind), mais pas tirés d'une source unique de tokens
- `components/real-estate/credit-tab.tsx:232-234` : Bar fill hexa direct `#10b981`/`#ef4444`/`#6b7280` — même contrainte Recharts
- `components/real-estate/amortization-table.tsx:104,110` : `bg-accent text-white` (au lieu de `text-bg` comme le Stepper ligne 37) — incohérence mineure

**Particularité à noter (pas un bug)** : dans la table année de `simulation-panel.tsx:602-613`, la colonne « Vacance » affiche `-{formatCurrency(…)}` (préfixe `-` manuel) alors que « Charges » et « Crédit » sont en `text-danger` mais **sans signe `-`** ; un utilisateur peut interpréter « Charges = 5 000 € » comme un encaissement. Recommandation : préfixer `-` ou rendre la colonne en `formatCurrency(-value, …)` pour cohérence.

---

## 4.3 Formatage des montants — contournements des helpers

Le helper `formatCurrency` gère le séparateur milliers FR (`fr-FR` toLocaleString) — les montants principaux respectent donc la convention « 200 000 € ». Aucun cas de « 200000 » ou « 6 décimales » trouvé. Aucun montant en `.toFixed(6)` non plus.

**Contournements observés** (`.toFixed()` direct, formatage maison) :

| Fichier:ligne | Pattern | Justification | Risque |
|---|---|---|---|
| `components/real-estate/simulation-panel.tsx:122-134` | `y.grossRent.toFixed(2)` ×13 lignes | Export CSV — séparateur `.` cohérent CSV | Acceptable (export machine) |
| `components/real-estate/amortization-table.tsx:48,60-62` | `n.toFixed(2).replace('.', ',')` + concaténation CSV | Export CSV au format FR | Acceptable |
| `components/real-estate/credit-tab.tsx:221` | `tickFormatter={v => v >= 1000 ? '${(v/1000).toFixed(0)}k' : String(v)}` | Tick axe Y Recharts | OK pour graphique |
| `components/real-estate/seasonality-chart.tsx:72,93,103,148` | `data.annualOccupancyPct.toFixed(0)} %`, `${v}€`, `${v}%`, `(${row.occupancy} %)` | Composant chart + ligne récap | Devrait passer par `formatPercent` (qui force `%` + tabular-nums) pour le 1er |
| `components/real-estate/simulation-charts.tsx:28-30` | `'${(v / 1_000_000).toFixed(1)} M€'` etc. | Ticks Y axis | OK (formatter Recharts) |
| `components/real-estate/short-term-lot-fields.tsx:352,395,396` | `mixTotal.toFixed(0)} %`, `preview.annualOccupancyPct.toFixed(0)} %`, `preview.revenuePerAvailableNight.toFixed(0)} €/nuit` | Stats + warning | Pour cohérence : utiliser `formatPercent` (option `decimals: 0`) et `formatCurrency` |
| `components/real-estate/simulation-revente-modal.tsx:652` | `result.tauxImpositionEffectifPct.toFixed(1)} %` | Sub note | À harmoniser via `formatPercent(v, {decimals: 1})` |
| `components/real-estate/simulation-revente-modal.tsx:685,708,939` | `tauxExonerationPct.toFixed(0)} %`, `tauxISPct.toFixed(0)} %`, `pct.toFixed(1)} %` | Idem | À harmoniser |
| `components/real-estate/what-if-simulator.tsx:213,372` | `formatBase={v => '${v.toFixed(2)} %'}`, `value.toFixed(decimals)` | Slider format | À harmoniser |
| `components/real-estate/incentives/denormandie-panel.tsx:43,49` | `(r.worksRatio * 100).toFixed(1)} %`, `'${Math.min(100, r.worksRatio * 100 * 4)}%'` | Pourcentage + width CSS | 1er à harmoniser, 2e OK (CSS) |
| `components/real-estate/import-csv-modal.tsx:264` | `'${r.confidence}%'` (sans espace avant `%`, contraire à la typo FR utilisée par `formatPercent` qui met `' %'`) | Modal import | Incohérence d'espacement |
| `components/real-estate/portfolio/properties-charts-view.tsx:106,124,155,181` | `.toFixed(0)} %`, `'${v}€'`, `'${Math.round(v / 1000)}k€'` | Charts | Tick formatters OK, sub-text à harmoniser |
| `components/real-estate/portfolio/portfolio-kpis.tsx:50` | `LTV : ${s.loanToValuePct.toFixed(0)} %` | Sub KPI | À harmoniser via `formatPercent(v, {decimals: 0})` |

**Signe `+` sur valeurs positives** : helpers `formatCurrency` et `formatPercent` exposent l'option `{sign: true}` largement utilisée (`property-card.tsx:123`, `portfolio-kpis.tsx:42,56,57`, `simulation-panel.tsx`, `real-tracking-panel.tsx`, etc.). Pour les valeurs négatives, le `-` est automatique via `toLocaleString`.

---

## 4.4 États vides (empty states)

| Onglet / surface | Présent ? | Référence |
|---|---|---|
| Page liste `/immobilier` sans bien | OUI — `EmptyState` avec icône `Building2` + CTA + ariaPrompt | `app/(app)/immobilier/page.tsx:162-168` |
| Liste filtrée vide (filtres trop stricts) | OUI — message texte simple | `components/real-estate/portfolio/portfolio-view.tsx:173-176` |
| Vue carte sans coordonnées | OUI — card warning « N biens non géolocalisés » + explication adresse | `components/real-estate/portfolio/property-map.tsx:162-175` |
| Vue carte chargement | OUI — spinner « Chargement de la carte… » | `components/real-estate/portfolio/property-map.tsx:127-132` |
| Onglet « Crédit » sans crédit | OUI — card centrée 12 padding + icône Banknote + CTA « Ajouter un crédit » | `components/real-estate/credit-tab.tsx:104-127` |
| Onglet « Crédit » avec crédit incomplet | OUI — card warning + CTA « Compléter » | `components/real-estate/credit-tab.tsx:130-157` |
| Onglet « Amortissement » sans crédit | OUI — `<div className="card p-8 text-center text-sm text-secondary">…</div>` | `app/(app)/immobilier/[id]/page.tsx:631-634` |
| Onglet « Dispositif fiscal » sans dispositif | OUI — message + sous-message + form pour en créer | `components/real-estate/incentives/incentive-tab.tsx:51-66` |
| Onglet « Suivi réel » sans événement | OUI — texte centré + sous-texte d'exemples | `components/real-estate/real-tracking-panel.tsx:191-201` |
| Onglet « Charges » sans charges | NON explicite — le `ChargesForm` s'affiche directement avec ses sections vides ; pas de message d'accueil « renseignez vos charges pour fiabiliser la projection » dédié à un état initial. La bannière `ChargesWarningBanner` existe au niveau page liste (`app/(app)/immobilier/page.tsx:171-178`) mais pas à l'intérieur de l'onglet | `components/real-estate/charges-form.tsx` ; à comparer avec page liste `app/(app)/immobilier/page.tsx:67-76,171-178` |
| Onglet « Synthèse » – Lots vides | OUI — « Aucun lot — ajoutez des unités locatives. » + CTA `PropertyLotActions` | `app/(app)/immobilier/[id]/page.tsx:514-516` |
| Onglet « Synthèse » – Valuations vides | OUI — « Aucune estimation enregistrée. » + CTA `PropertyValuationActions` | `app/(app)/immobilier/[id]/page.tsx:552-553` |
| RP sans lot locatif | OUI — message explicite « Résidence principale — pas de lots locatifs. » | `app/(app)/immobilier/[id]/page.tsx:502-505` |
| Régime fiscal manquant | OUI — bannière warning avec explication + suggestion | `app/(app)/immobilier/[id]/page.tsx:879-892` |
| Tableau de bord 0 biens | OUI mais sans illustration — juste l'`EmptyState` standard, pas d'image | `app/(app)/immobilier/page.tsx:162-168` |

**Points à améliorer** :
- Onglet « Charges » : ajouter un encart de bienvenue ou afficher la `ChargesWarningBanner` directement dans l'onglet pour les nouveaux utilisateurs.
- `EmptyState` global (`components/ui/empty-state.tsx:34-43`) — icône simple, pas d'illustration ; cohérent avec le reste de l'app, pas un blocage.

---

## 4.5 Responsive mobile

| Composant clé | Pattern responsive | OK ? | Référence |
|---|---|---|---|
| KPIs portfolio (6 cartes) | `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` | OUI — bonne dégradation | `components/real-estate/portfolio/portfolio-kpis.tsx:31` |
| KPIs synthèse fiche (6 cartes) | `grid-cols-2 lg:grid-cols-3` | OUI mais saut direct mobile (2) → desktop (3), pas de palier `md:` à 4 | `app/(app)/immobilier/[id]/page.tsx:434` |
| KPIs Crédit (6 cartes) | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` | OUI | `components/real-estate/credit-tab.tsx:176` |
| KPIs SimulationPanel (4 cartes) | `grid-cols-2 sm:grid-cols-4` | OUI | `components/real-estate/simulation-panel.tsx:501` |
| KPIs RealTracking (4 cartes) | `grid-cols-2 lg:grid-cols-4` | OUI | `components/real-estate/real-tracking-panel.tsx:123` |
| Cards property (3 colonnes intra-card) | `grid-cols-3 gap-3` — pas de `sm:` | À RISQUE — 3 colonnes même < 380 px, valeurs compactes mais peuvent se chevaucher | `components/real-estate/portfolio/property-card.tsx:82,105` |
| Tableau consolidé portfolio | `card overflow-x-auto` | OUI — scrollable | `components/real-estate/portfolio/properties-table-view.tsx:58` |
| Tableau amortissement | `overflow-x-auto max-h-[600px]` + sticky header | OUI | `components/real-estate/amortization-table.tsx:125` |
| Tableau charges historique | pas d'`overflow-x-auto` explicite (le `card` parent n'en a pas non plus) | RISQUE mobile sur < 6 colonnes | `app/(app)/immobilier/[id]/page.tsx:751-783` |
| Tableau projection 9 colonnes | `overflow-x-auto` présent | OUI | `components/real-estate/simulation-panel.tsx:589` |
| Tableau RegimeComparator (7 lignes × 6 cols) | `overflow-x-auto` | OUI | `components/real-estate/regime-comparator.tsx:76` |
| Wizard nouveau bien | `max-w-2xl mx-auto`, formulaire vertical, `FormGrid` se replie | OUI — bien | `app/(app)/immobilier/nouveau/page.tsx:387` |
| Stepper wizard (étapes) | Labels masqués sur mobile (`hidden sm:block`), seules les puces apparaissent | OUI mais l'utilisateur ne voit que des numéros — le sous-titre `{step}/5` au-dessus compense (`page.tsx:395-397`) | `components/ui/stepper.tsx:57,73,83` |
| SimulationPanel : panneau paramètres ↔ résultats | `grid-cols-1 lg:grid-cols-3` (1 col mobile, 3 cols desktop avec 2/3 pour résultats) | OUI | `components/real-estate/simulation-panel.tsx:303,498` |
| Charges form | `grid-cols-1 sm:grid-cols-2`, `sm:grid-cols-3` | OUI | `components/real-estate/charges-form.tsx:140,156,195,236,249,260` |
| Vue carte Leaflet | hauteur fixe 480 px, plein largeur card | OUI | `components/real-estate/portfolio/property-map.tsx:144` |
| Graphiques Recharts (cash-flow, capital vs intérêts, projection) | `ResponsiveContainer width="100%"` | OUI partout | `components/real-estate/credit-tab.tsx:216` ; `components/real-estate/simulation-charts.tsx` ; `components/real-estate/seasonality-chart.tsx` |
| Barre filtres portfolio-view | `flex flex-col lg:flex-row lg:items-center gap-3` + `flex-wrap` pour selects | OUI | `components/real-estate/portfolio/portfolio-view.tsx:107,119` |
| Toggle vues (Cartes/Tableau/Graphiques/Carte) | `basis-full lg:basis-auto justify-end` (passe sur sa propre ligne mobile) | OUI — explicitement géré (commentaire dans le code) | `components/real-estate/portfolio/portfolio-view.tsx:156` |

---

## Points de friction UX

### FRICTION-001 — Acronymes fiscaux/financiers non expliqués dans la fiche bien
- **Écran** : `/immobilier/[id]` — onglets Synthèse, Crédit, Charges, Rentabilité, Dispositif
- **Problème** : Les sigles TAEG, CRD, CFE, TMI, LTV, PFU, BIC, CCA, IRA, GLI, PNO, micro-BIC, LMNP/LMP, SCI IR/IS sont affichés bruts comme labels de KPI, options de select ou intitulés de tableau. Pas de composant `Tooltip` réutilisable dans le projet (`components/ui/` n'en contient pas). Le wizard `/immobilier/nouveau` propose pourtant un dictionnaire `FISCAL_REGIME_DESCRIPTIONS` (lignes 131-146) — incohérence d'expérience.
- **Correction suggérée** : créer un composant `<InfoTip term="TAEG">` ou `<Glossary>` qui rendrait une icône `(?)` accessible (`aria-describedby`) reliée à un dictionnaire centralisé (`lib/real-estate/glossary.ts`). À minima : ajouter `title="…"` sur les labels critiques.

### FRICTION-002 — Couleurs Tailwind hors tokens design
- **Écran** : modal simulation revente (`/immobilier/[id]` → bouton « Simuler la revente »)
- **Problème** : `components/real-estate/simulation-revente-modal.tsx:578-824` mélange `text-emerald-400` / `text-amber-400` / `bg-amber-500/5` au lieu de `text-accent` / `text-warning` / `bg-warning/5`. Si le design system évolue (changement de la palette emerald), ces écrans ne suivront pas.
- **Correction suggérée** : remplacement systématique par les tokens. Pour les couleurs purement graphiques (waterfall ligne 966, charts), créer un fichier `lib/design/chart-colors.ts` qui exporte une palette unique.

### FRICTION-003 — Colonne « Vacance » / « Charges » / « Crédit » sans signe `-`
- **Écran** : `/immobilier/[id]` → onglet « Rentabilité » → tableau annuel
- **Problème** : `components/real-estate/simulation-panel.tsx:603-605` rend `formatCurrency(y.vacancy, ...)` avec préfixe `-` manuel mais `y.charges` et `y.interest + ...` (crédit) sont en `text-danger` SANS signe `-`. L'utilisateur peut interpréter « Charges 5 000 € » comme un revenu de 5 000 €. Idem dans `regime-comparator.tsx` (colonnes « Charges/an », « Crédit/an »).
- **Correction suggérée** : appliquer la convention « toujours signer les flux sortants » → soit passer `-value` à `formatCurrency`, soit afficher entre parenthèses comme en comptabilité.

### FRICTION-004 — Onglet « Charges » sans empty-state d'accueil
- **Écran** : `/immobilier/[id]` → onglet « Charges » pour un bien nouveau
- **Problème** : `ChargesForm` affiche immédiatement ses 8 sections vides ; pas de message d'incitation contextualisé. La `ChargesWarningBanner` qui dit « renseignez la taxe foncière… » n'apparaît qu'au niveau de la liste (`app/(app)/immobilier/page.tsx:171-178`), jamais dans l'onglet.
- **Correction suggérée** : afficher l'avertissement « Aucune charge saisie cette année — projection à ±10 % » au-dessus du form quand `initial == null`.

### FRICTION-005 — Cards propriété : grid-cols-3 fixe sur très petit écran
- **Écran** : `/immobilier` — vue cartes en portrait < 380 px
- **Problème** : `components/real-estate/portfolio/property-card.tsx:82,105` utilisent `grid-cols-3 gap-3` sans palier `sm:`. Sur un iPhone SE ou similaire, 6 KPIs sur 2 lignes de 3 colonnes peuvent saturer (chiffres compacts type « 245 k€ » + label « PV latente » sur une seule ligne).
- **Correction suggérée** : `grid-cols-2 sm:grid-cols-3` pour les deux blocs.

### FRICTION-006 — TAEG affiché sans contraste pédagogique
- **Écran** : `/immobilier/[id]` → onglet « Crédit »
- **Problème** : `components/real-estate/credit-tab.tsx:193-198` affiche « TAEG approx. » avec sub « Nominal 3.50 % ». L'utilisateur novice ne sait pas que le TAEG inclut l'assurance et les frais (différence avec le taux nominal). De plus, classer le TAEG en `accent="success"` (vert) peut suggérer que c'est « bon » alors que c'est juste un indicateur.
- **Correction suggérée** : tooltip « TAEG = taux nominal + assurance + frais de dossier et garantie. Indicateur de coût réel du crédit. » et palette neutre.

### FRICTION-007 — Émojis dans bannière alertes
- **Écran** : `/immobilier` — bandeau alertes
- **Problème** : `components/real-estate/portfolio/portfolio-alerts-banner.tsx:67-69` utilise 🔴 🟡 🔵. Le projet a une consigne assistant « pas d'emojis » mais c'est de l'UX produit — à confirmer. Risque accessibilité (lecteurs d'écran peuvent les annoncer « gros cercle rouge »).
- **Correction suggérée** : badges colorés sémantiques (`<Badge variant="danger">3</Badge>`) au lieu d'emojis.

### FRICTION-008 — Tableau historique charges sans overflow-x-auto
- **Écran** : `/immobilier/[id]` → onglet « Charges » → tableau historique multi-années
- **Problème** : `app/(app)/immobilier/[id]/page.tsx:750-782` rend un `<table className="w-full text-xs">` directement dans un `card p-6` sans wrapper scroll. 6 colonnes sur mobile = compression sévère ou débordement.
- **Correction suggérée** : envelopper la table dans `<div className="overflow-x-auto -mx-6 px-6">`.

### FRICTION-009 — Stepper mobile : numéros sans labels
- **Écran** : `/immobilier/nouveau` sur mobile
- **Problème** : `components/ui/stepper.tsx:57,73` masque les labels d'étape (`hidden sm:block`). L'utilisateur voit `1—2—3—4—5` sans titre. Le compteur `{step}/5` au-dessus du stepper compense partiellement, mais perd l'info « j'arrive à l'étape Crédit ».
- **Correction suggérée** : afficher au moins le label de l'étape courante (`md:hidden` + texte unique au-dessus).

### FRICTION-010 — `import-csv-modal` : `${r.confidence}%` sans espace + pas formaté
- **Écran** : `/immobilier/[id]` → onglet « Suivi réel » (legacy) → import CSV
- **Problème** : `components/real-estate/import-csv-modal.tsx:264` `${r.confidence}%` brise la convention typographique FR utilisée partout ailleurs (`formatPercent` met `' %'`).
- **Correction suggérée** : `formatPercent(r.confidence, {decimals: 0})`.

---

## Points à clarifier

1. **Composant `Tooltip` global** : confirmer s'il existe ou s'il faut le créer. Aucune trace dans `components/ui/`. Si Radix UI ou autre lib est déjà dans `package.json`, privilégier `@radix-ui/react-tooltip` pour l'accessibilité (focus visible + ARIA).
2. **Politique emojis UI produit** : la consigne CLAUDE.md « pas d'emojis » s'applique-t-elle aux libellés visibles utilisateur ou seulement aux réponses assistant ? Le code emploie 🔴🟡🔵 dans `portfolio-alerts-banner.tsx`, ✓ ⚠ ↺ dans `real-tracking-panel.tsx`. À trancher.
3. **Couleurs Recharts** : les couleurs hex `#10b981` / `#ef4444` / `#3b82f6` répétées dans `simulation-charts.tsx`, `credit-tab.tsx`, `seasonality-chart.tsx` mériteraient un fichier `lib/design/chart-colors.ts` source unique de vérité, cohérent avec les tokens CSS de `globals.css`.
4. **« Net-net » vs « Brut FAI »** : termes maison du projet (cf. KPI `kpis.netNetYield`, `kpis.grossYieldFAI`). À documenter quelque part de visible pour l'utilisateur — actuellement aucune explication, ce qui crée de la friction même pour un investisseur initié.
5. **`incompleteData` / `missingFields`** affichés en `font-mono text-muted` (`simulation-panel.tsx:295`) — les noms internes (`monthlyRent`, `purchasePrice`…) peuvent fuiter à l'utilisateur. Vérifier qu'ils sont mappés sur des libellés FR avant rendu, ou intercepter via un dictionnaire.