/**
 * Actions du mois — 3 propositions concrètes basées sur les dérives
 * constatées dans le patrimoine.
 *
 * Tâche C.2. Pure (pas d'I/O), 100 % testable. L'UI consomme la sortie
 * dans un panel dédié (à brancher plus tard côté front).
 *
 * 3 règles :
 *   1. Drift d'allocation > 5 % vs benchmark patrimoine
 *      → "Rebalancer X € de [classe surpondérée] vers [classe sous-pondérée]"
 *   2. Cash > N mois de dépenses (par défaut 12)
 *      → "Vous avez X € de cash dormant — envisagez d'investir Y €"
 *   3. Aucune position ajoutée depuis 60 jours (si la date est fournie)
 *      → "Rappel : votre DCA mensuel de X € est en retard"
 *
 * Les seuils sont des constantes documentées en haut du fichier pour
 * faciliter le tuning métier.
 */

import type { PatrimoineComplet } from '@/types/analyse'
import { formatEur } from '@/lib/utils/format'
import { BENCHMARK_CLASSES_PATRIMOINE } from './benchmarks'
import type { OpportuniteFiscale } from './optimiseurFiscal'

// ─────────────────────────────────────────────────────────────────
// Seuils
// ─────────────────────────────────────────────────────────────────

/** Écart minimum (en points de %) entre allocation réelle et benchmark
 *  pour déclencher la reco de rebalancing. */
export const DRIFT_SEUIL_PCT = 5

/** Cash dormant maximum exprimé en mois de charges courantes. Au-delà,
 *  on suggère de réinvestir. */
export const CASH_SEUIL_MOIS = 12

/** Délai (en jours) sans ajout/modif de position avant de déclencher la
 *  reco "DCA en retard". */
export const DCA_SEUIL_JOURS = 60

// ─────────────────────────────────────────────────────────────────
// V2.2-BIS — Plafond de réalisme mensuel
// ─────────────────────────────────────────────────────────────────

/** % du patrimoine net annualisé utilisé en fallback quand
 *  `epargne_mensuelle` du profil est nul ou inconnu. 5 %/an → /12 = ~0,42 %/mois. */
export const FALLBACK_PLAFOND_ANNUEL_PCT = 5

/** Au-delà de ce % du patrimoine NET, un mouvement de rebalancement est
 *  considéré comme structurellement irréalisable (vente d'actif majeur,
 *  cas typique : sortie d'un bien immo). La reco est alors **supprimée**
 *  plutôt qu'étalée — recommander l'irréalisable dégrade la confiance. */
export const SEUIL_MOUVEMENT_STRUCTUREL_PCT = 10

/**
 * Plafond du montant mensuellement actionnable par l'utilisateur :
 *   max(epargne_mensuelle_profil, FALLBACK_PLAFOND_ANNUEL_PCT % du net / 12)
 *
 * Sert à savoir si une reco doit être étalée sur plusieurs mois plutôt que
 * proposée en bloc. Retourne 0 si patrimoine + épargne tous inconnus.
 */
export function computePlafondMensuelRealiste(p: PatrimoineComplet): number {
  const epargne = Math.max(0, p.fireInputs.epargne_mensuelle ?? 0)
  const netAnnuel = Math.max(0, p.totalNet ?? 0) * (FALLBACK_PLAFOND_ANNUEL_PCT / 100)
  const fallback  = netAnnuel / 12
  return Math.max(epargne, fallback)
}

/**
 * Politique d'ajustement d'une reco au plafond réaliste.
 *
 * `kind` :
 *   - `'monthlyPlan'` : étaler en N mensualités du plafond (cas reco > plafond)
 *   - `'keep'`        : montant raisonnable, libellé naturel conservé
 *   - `'suppress'`    : mouvement structurel irréalisable (> 10 % net) —
 *                       UNIQUEMENT activé si le caller passe `allowStructuralSuppress`.
 *                       Le cash dormant est exempté : déployer du cash liquide
 *                       n'est jamais "irréalisable" comme l'est une vente d'actif.
 */
export type PlafonnementDecision =
  | { kind: 'suppress' }
  | { kind: 'monthlyPlan'; mensuel: number; mois: number }
  | { kind: 'keep' }

interface DecidePlafonnementOpts {
  /** Activé pour les recos de type « rebalance » : un mouvement > 10 %
   *  du patrimoine net implique de vendre un actif majeur, considéré
   *  comme structurellement irréaliste → action supprimée. */
  allowStructuralSuppress?: boolean
}

export function decidePlafonnement(
  montantNaturel: number,
  plafondMensuel: number,
  totalNet: number,
  opts: DecidePlafonnementOpts = {},
): PlafonnementDecision {
  if (montantNaturel <= 0) return { kind: 'keep' }
  if (opts.allowStructuralSuppress && totalNet > 0) {
    const pctNet = (montantNaturel / totalNet) * 100
    if (pctNet > SEUIL_MOUVEMENT_STRUCTUREL_PCT) return { kind: 'suppress' }
  }
  if (plafondMensuel > 0 && montantNaturel > plafondMensuel) {
    const mois = Math.max(2, Math.ceil(montantNaturel / plafondMensuel))
    return { kind: 'monthlyPlan', mensuel: Math.round(plafondMensuel), mois }
  }
  return { kind: 'keep' }
}

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export type ActionMensuelleType = 'rebalance' | 'invest_cash' | 'dca_retard' | 'fiscal'
export type ActionPriorite       = 'haute' | 'moyenne' | 'info'

export interface ActionMensuelle {
  id:          string
  type:        ActionMensuelleType
  titre:       string
  description: string
  /** Sprint 1 — I3 : priorite affichee dans l'UI (badge couleur). Defaut
   *  'moyenne' pour les 3 regles historiques, 'haute' pour les opportunites
   *  fiscales injectees. */
  priorite?:   ActionPriorite
  /** Montant suggéré en €, si applicable. */
  montant?:    number
  /** Classe d'actif source (rebalance) ou catégorie cash (invest_cash). */
  source?:     string
  /** Classe d'actif cible (rebalance). */
  cible?:      string
}

export interface RecoMensuellesOptions {
  /** Date ISO de la dernière position ajoutée/modifiée. Null = info
   *  indisponible, la règle "DCA en retard" est skippée. */
  lastPositionAddedAt?: string | null
  /** Date courante (injectable pour les tests). Défaut : new Date(). */
  today?: Date
  /** Override du seuil cash (mois). Défaut CASH_SEUIL_MOIS. */
  cashSeuilMois?: number
  /** Sprint 1 — I3 : top opportunites fiscales (issues de optimiseurFiscal).
   *  Les 2 meilleures par gain annuel sont converties en ActionMensuelle
   *  prioritaire. Doublons evites avec les regles drift/DCA. */
  opportunitesFiscales?: ReadonlyArray<OpportuniteFiscale>
  /** Plafond du nombre total d'actions retournees. Defaut 5. */
  maxActions?: number
  /**
   * V2.2-BIS — Signatures actuellement masquées par l'utilisateur (cf.
   * table `user_alert_dismissals`). Toute action dont `signatureFor(a)`
   * appartient à ce set est filtrée silencieusement avant retour. La
   * convention de signature est `reco:<action.id>`.
   */
  dismissedSignatures?: ReadonlySet<string>
}

/** Convention de signature stable pour les recos (masquage individuel). */
export function actionSignature(action: ActionMensuelle): string {
  return `reco:${action.id}`
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

/**
 * Génère jusqu'à 3 actions du mois, triées par priorité métier :
 *   1. cash dormant (impact patrimonial le plus large)
 *   2. drift d'allocation (touche au cœur de la stratégie)
 *   3. DCA en retard (rappel comportemental)
 *
 * Renvoie toujours au plus 3 actions (1 par règle). Liste vide si rien
 * à signaler — l'UI doit gérer ce cas explicitement.
 */
export function genererActionsMensuelles(
  p:    PatrimoineComplet,
  opts: RecoMensuellesOptions = {},
): ActionMensuelle[] {
  const out: ActionMensuelle[] = []

  // Règle 1 — cash dormant > N mois de charges.
  const cashAction = detectCashDormant(p, opts.cashSeuilMois ?? CASH_SEUIL_MOIS)
  if (cashAction) out.push(cashAction)

  // Règle 2 — drift d'allocation par classe > 5 %.
  const driftAction = detectDriftAllocation(p)
  if (driftAction) out.push(driftAction)

  // Règle 3 — DCA en retard (si lastPositionAddedAt fourni).
  const today = opts.today ?? new Date()
  const dcaAction = detectDcaRetard(p, opts.lastPositionAddedAt ?? null, today)
  if (dcaAction) out.push(dcaAction)

  // Sprint 1 — I3 : injection des top opportunites fiscales.
  // On prend les 2 plus gros gains annuels parmi les applicables, en
  // filtrant celles qui chevauchent une action drift/cash deja presente
  // (ex : drift "actions vers obligations" + opportunite "ouvrir PEA"
  // touchent la meme thematique).
  const opportunites = opts.opportunitesFiscales ?? []
  const topOpps = [...opportunites]
    .filter((o) => o.applicable && o.gain_annuel_eur > 0)
    .sort((a, b) => b.gain_annuel_eur - a.gain_annuel_eur)
    .slice(0, 2)

  for (const opp of topOpps) {
    if (overlapsExistingAction(opp, out)) continue
    out.push({
      id:          `fiscal-${opp.id}`,
      type:        'fiscal',
      priorite:    'haute',
      titre:       `${opp.titre} — gain ${formatEur(opp.gain_annuel_eur, { decimals: 0 })}/an`,
      description: opp.action_concrete,
      montant:     opp.gain_annuel_eur,
    })
  }

  // V2.2-BIS — Filtre des actions explicitement masquées par l'utilisateur.
  const dismissed = opts.dismissedSignatures
  const visible = (dismissed && dismissed.size > 0)
    ? out.filter((a) => !dismissed.has(actionSignature(a)))
    : out

  const max = opts.maxActions ?? 5
  return visible.slice(0, max)
}

/** Detecte si une opportunite fiscale fait doublon avec une action deja
 *  presente. Heuristique : on cherche un mot-cle de la categorie de
 *  l'opportunite (PEA, AV, PER, CTO, immo, ...) dans le titre/source d'une
 *  action existante. */
function overlapsExistingAction(
  opp:     OpportuniteFiscale,
  actions: ReadonlyArray<ActionMensuelle>,
): boolean {
  const keywords: string[] = []
  if (opp.titre.toLowerCase().includes('pea'))                       keywords.push('pea')
  if (opp.titre.toLowerCase().includes('assurance') ||
      opp.titre.toLowerCase().includes('av '))                       keywords.push('assurance')
  if (opp.titre.toLowerCase().includes('per'))                       keywords.push('per')
  if (opp.categorie === 'immo' ||
      opp.titre.toLowerCase().includes('immobil'))                   keywords.push('immobil')

  if (keywords.length === 0) return false
  for (const a of actions) {
    const haystack = `${a.titre} ${a.source ?? ''} ${a.cible ?? ''}`.toLowerCase()
    if (keywords.some((kw) => haystack.includes(kw))) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────
// Détecteurs (helpers pures)
// ─────────────────────────────────────────────────────────────────

function detectCashDormant(p: PatrimoineComplet, seuilMois: number): ActionMensuelle | null {
  const charges = p.fireInputs.charges_mensuelles
  if (charges <= 0 || p.totalCash <= 0) return null
  const moisCouverts = p.totalCash / charges
  if (moisCouverts <= seuilMois) return null

  // On suggère d'investir l'EXCEDENT au-delà du coussin de sécurité
  // (par défaut 6 mois — borne inférieure de la fourchette classique).
  const coussinCible  = charges * 6
  const aInvestir     = Math.max(0, Math.round(p.totalCash - coussinCible))
  if (aInvestir < 500) return null  // pas la peine pour de petits montants

  // V2.2-BIS — Plafond réaliste. Réinvestir 80k€ d'un coup n'est pas
  // pragmatique : on étale plutôt que d'afficher un chiffre intimidant.
  // Pas de suppression structurelle ici : le cash est liquide par nature,
  // pas un actif à vendre. La règle « > 10 % net » ne s'applique qu'aux
  // rebalancements (cf. detectDriftAllocation).
  const plafond  = computePlafondMensuelRealiste(p)
  const decision = decidePlafonnement(aInvestir, plafond, p.totalNet)

  if (decision.kind === 'monthlyPlan') {
    return {
      id:    'invest-cash-dormant',
      type:  'invest_cash',
      titre: `Réinvestir ~${formatEur(decision.mensuel, { decimals: 0 })}/mois pendant ${decision.mois} mois`,
      description: `Votre coussin couvre ${moisCouverts.toFixed(0)} mois de charges (seuil ${seuilMois}). Cible : déployer ${formatEur(aInvestir, { decimals: 0 })} progressivement (~${formatEur(decision.mensuel, { decimals: 0 })}/mois sur ${decision.mois} mois), en gardant ~6 mois de charges sur Livret A.`,
      montant: decision.mensuel,
      source:  'cash',
    }
  }

  return {
    id:    'invest-cash-dormant',
    type:  'invest_cash',
    titre: `${formatEur(aInvestir, { decimals: 0 })} de cash dormant à mettre au travail`,
    description: `Votre coussin couvre ${moisCouverts.toFixed(0)} mois de charges (seuil ${seuilMois}). Conservez ~6 mois sur Livret A et investissez ~${formatEur(aInvestir, { decimals: 0 })} progressivement.`,
    montant: aInvestir,
    source:  'cash',
  }
}

function detectDriftAllocation(p: PatrimoineComplet): ActionMensuelle | null {
  if (p.totalBrut <= 0 || p.repartitionClasses.length === 0) return null

  // Calcule l'écart (en points de %) entre allocation réelle et benchmark
  // pour chaque classe. Positif = surpondéré, négatif = sous-pondéré.
  type Drift = { label: string; pct: number; benchmark: number; ecart: number; valeur: number }
  const drifts: Drift[] = p.repartitionClasses.map((c) => ({
    label:     c.label,
    pct:       c.pourcentage,
    benchmark: BENCHMARK_CLASSES_PATRIMOINE[c.label] ?? 0,
    ecart:     c.pourcentage - (BENCHMARK_CLASSES_PATRIMOINE[c.label] ?? 0),
    valeur:    c.valeur,
  }))

  // Plus grand écart positif (source) et plus grand écart négatif (cible)
  const sortedDesc = [...drifts].sort((a, b) => b.ecart - a.ecart)
  const source     = sortedDesc[0]
  const cible      = sortedDesc[sortedDesc.length - 1]
  if (!source || !cible) return null
  if (source.ecart < DRIFT_SEUIL_PCT) return null  // pas assez de drift
  if (cible.ecart  > -DRIFT_SEUIL_PCT) return null // pas de classe assez sous-pondérée

  // Montant à transférer : on rééquilibre uniquement le surplus de la
  // classe surpondérée (pas la totalité de l'écart négatif de la cible),
  // pour proposer un mouvement réaliste plutôt qu'un big-bang.
  const montant = Math.round((source.ecart / 100) * p.totalBrut)
  if (montant < 500) return null

  // V2.2-BIS — Plafond réaliste. Vendre un bien immo de 243 k€ en 1 mois
  // n'est ni faisable ni sérieux côté conseil pro.
  //   • Mouvement > 10 % du patrimoine net → SUPPRIMÉ (cas typique vente bien)
  //   • Mouvement > plafond mensuel       → reformulé en plan progressif
  const plafond  = computePlafondMensuelRealiste(p)
  const decision = decidePlafonnement(montant, plafond, p.totalNet, { allowStructuralSuppress: true })
  if (decision.kind === 'suppress') return null

  if (decision.kind === 'monthlyPlan') {
    return {
      id:    'rebalance-classes',
      type:  'rebalance',
      titre: `Réorienter progressivement ${source.label} → ${cible.label} (~${formatEur(decision.mensuel, { decimals: 0 })}/mois)`,
      description: `${source.label} pèse ${source.pct.toFixed(0)} % (benchmark ${source.benchmark} %), ${cible.label} ${cible.pct.toFixed(0)} % (benchmark ${cible.benchmark} %). Cible : réorienter ${formatEur(montant, { decimals: 0 })} sur ${decision.mois} mois (~${formatEur(decision.mensuel, { decimals: 0 })}/mois) pour réaligner sans mouvement brutal.`,
      montant: decision.mensuel,
      source:  source.label,
      cible:   cible.label,
    }
  }

  return {
    id:    'rebalance-classes',
    type:  'rebalance',
    titre: `Rebalancer ${formatEur(montant, { decimals: 0 })} de ${source.label} vers ${cible.label}`,
    description: `${source.label} pèse ${source.pct.toFixed(0)} % (benchmark ${source.benchmark} %), ${cible.label} ${cible.pct.toFixed(0)} % (benchmark ${cible.benchmark} %). Un mouvement de ~${formatEur(montant, { decimals: 0 })} réaligne votre allocation.`,
    montant,
    source: source.label,
    cible:  cible.label,
  }
}

function detectDcaRetard(
  p:    PatrimoineComplet,
  lastPositionAddedAt: string | null,
  today: Date,
): ActionMensuelle | null {
  const epargne = p.fireInputs.epargne_mensuelle
  if (epargne <= 0) return null
  if (!lastPositionAddedAt) return null

  const last = new Date(lastPositionAddedAt)
  if (isNaN(last.getTime())) return null

  const diffMs = today.getTime() - last.getTime()
  const diffJ  = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffJ < DCA_SEUIL_JOURS) return null

  return {
    id:    'dca-retard',
    type:  'dca_retard',
    titre: `DCA en retard de ${diffJ} jour${diffJ > 1 ? 's' : ''}`,
    description: `Vous n'avez ajouté/modifié aucune position depuis ${diffJ} jours (épargne mensuelle déclarée : ${formatEur(epargne, { decimals: 0 })}). Pensez à investir votre DCA du mois.`,
    montant: Math.round(epargne),
  }
}

