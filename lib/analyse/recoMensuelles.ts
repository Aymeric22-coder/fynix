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
import { BENCHMARK_CLASSES_PATRIMOINE } from './benchmarks'

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
// Types publics
// ─────────────────────────────────────────────────────────────────

export type ActionMensuelleType = 'rebalance' | 'invest_cash' | 'dca_retard'

export interface ActionMensuelle {
  id:          string
  type:        ActionMensuelleType
  titre:       string
  description: string
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

  return out
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

  return {
    id:    'invest-cash-dormant',
    type:  'invest_cash',
    titre: `${formatEur(aInvestir)} de cash dormant à mettre au travail`,
    description: `Votre coussin couvre ${moisCouverts.toFixed(0)} mois de charges (seuil ${seuilMois}). Conservez ~6 mois sur Livret A et investissez ~${formatEur(aInvestir)} progressivement.`,
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

  return {
    id:    'rebalance-classes',
    type:  'rebalance',
    titre: `Rebalancer ${formatEur(montant)} de ${source.label} vers ${cible.label}`,
    description: `${source.label} pèse ${source.pct.toFixed(0)} % (benchmark ${source.benchmark} %), ${cible.label} ${cible.pct.toFixed(0)} % (benchmark ${cible.benchmark} %). Un mouvement de ~${formatEur(montant)} réaligne votre allocation.`,
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
    description: `Vous n'avez ajouté/modifié aucune position depuis ${diffJ} jours (épargne mensuelle déclarée : ${formatEur(epargne)}). Pensez à investir votre DCA du mois.`,
    montant: Math.round(epargne),
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatEur(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`
}
