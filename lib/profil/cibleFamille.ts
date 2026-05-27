/**
 * QW9-bis — Détail structuré de l'ajustement de la cible FIRE à la
 * composition du foyer.
 *
 * La logique CHIFFRÉE est strictement identique à `adjustCibleFamille`
 * (lib/profil/calculs.ts, branchée par QW9). Ce module ajoute :
 *  - une décomposition par raison (enfants vs couple sans revenu conjoint)
 *    pour pouvoir EXPLIQUER l'ajustement à l'utilisateur ;
 *  - des labels d'affichage canoniques utilisés par toutes les surfaces
 *    (ProfilCard, Hero, score, slider, email, ARIA).
 *
 * Source unique des textes liés à l'ajustement famille. Aucun composant
 * UI ne formate de raison « à la main ».
 *
 * Garantie arrondi : `detail.ajuste = brut + adjustCibleFamille(p)` exact.
 * Les composants `enfantsDelta` + `coupleDelta` sont arrondis pour l'UI,
 * et si leur somme arrondie diffère du delta total (≤ 1 € en pratique),
 * le reste est absorbé par le composant le plus pertinent — JAMAIS d'items
 * affichés qui contredisent le total.
 */

import {
  COUT_MENSUEL_PAR_ENFANT_EUR,
  QUOTIENT_COUPLE_SANS_CONJOINT_REVENU,
  normalizeEnfants, normalizeSituationFamiliale,
} from './calculs'

/** Une raison d'ajustement affichable. */
export interface CibleFoyerRaison {
  /** Libellé canonique. Ex : "couple, un seul revenu déclaré", "2 enfants",
   *  "4 enfants ou plus" (cas DB "4+"). */
  label:   string
  /** Montant mensuel positif en €/mois, arrondi pour affichage. */
  montant: number
}

/** Détail complet de l'ajustement famille pour les composants UI. */
export interface CibleFoyerDetail {
  /** Cible saisie par l'utilisateur (€/mois, ≥ 0). */
  brut:          number
  /** Cible ajustée (€/mois) = brut + adjustCibleFamille(p) — strictement legacy. */
  ajuste:        number
  /** Composante enfants arrondie (€/mois). Garantie : entière. */
  enfantsDelta:  number
  /** Composante couple arrondie (€/mois). */
  coupleDelta:   number
  /** True ssi (enfantsDelta + coupleDelta) > 0. */
  hasAdjustment: boolean
  /** Raisons ordonnées : couple d'abord (si présent) puis enfants. */
  raisons:       CibleFoyerRaison[]
  /** Nombre d'enfants normalisé (0..5, 5 = cas "4+"). Utile pour les
   *  texts secondaires (email, ARIA) sans avoir à re-normaliser. */
  nbEnfants:     number
  /** True ssi le bonus couple est appliqué (couple marié/PACS + revenu_conjoint=0). */
  hasCoupleBonus: boolean
}

type ProfileInput = {
  enfants?:              string | null
  situation_familiale?:  string | null
  revenu_conjoint?:      number | null
  revenu_passif_cible?:  number | null
}

function n(v: number | null | undefined): number {
  return typeof v === 'number' && isFinite(v) ? v : 0
}

/** Construit le libellé canonique enfants selon la valeur DB stockée. */
function labelEnfants(rawEnfants: string | null | undefined, nbNorm: number): string {
  // Cas DB "4+" : on N'EXPOSE PAS le plafond technique (5) à l'utilisateur.
  // Le montant calculé reste sur 5 (= COUT × 5) en interne, mais le libellé
  // dit « 4 enfants ou plus ».
  if (typeof rawEnfants === 'string' && rawEnfants.trim().includes('+')) {
    return '4 enfants ou plus'
  }
  if (nbNorm === 1) return '1 enfant'
  return `${nbNorm} enfants`
}

/**
 * Décompose l'ajustement famille en composants UI.
 *
 * Sémantique IDENTIQUE à `adjustCibleFamille` (lib/profil/calculs.ts) :
 *   - 300 €/mois × nb_enfants normalisé (cap interne 5 pour DB "4+")
 *   - +50 % de la cible saisie si marié/PACS ET revenu_conjoint = 0
 *
 * Garantie : `enfantsDelta + coupleDelta === ajuste − brut` (source de
 * vérité = legacy). Si l'arrondi individuel des composants laisse un reste
 * (≤ 1 € en pratique), il est absorbé par le composant pertinent.
 */
export function adjustCibleFamilleDetail(p: ProfileInput): CibleFoyerDetail {
  const brut = Math.max(0, n(p.revenu_passif_cible))

  const nbEnfants = normalizeEnfants(p.enfants)
  const situ      = normalizeSituationFamiliale(p.situation_familiale)
  const hasConjointRevenue = n(p.revenu_conjoint) > 0
  const isCoupleEngage     = situ === 'marie' || situ === 'pacse'
  const hasCoupleBonus     = isCoupleEngage && !hasConjointRevenue

  // ── Calcul brut des composants (avant arrondi UI) ────────────────────
  const enfantsBrut = nbEnfants > 0 ? COUT_MENSUEL_PAR_ENFANT_EUR * nbEnfants : 0
  const coupleBrut  = hasCoupleBonus ? QUOTIENT_COUPLE_SANS_CONJOINT_REVENU * brut : 0
  const totalLegacy = Math.round(enfantsBrut + coupleBrut)   // == adjustCibleFamille(p)
  const ajuste      = brut + totalLegacy

  // ── Arrondi individuel pour affichage ────────────────────────────────
  let enfantsDelta = Math.round(enfantsBrut)
  let coupleDelta  = Math.round(coupleBrut)

  // ── Absorption du reste éventuel (garantit somme === totalLegacy) ────
  // Cas concret possible si revenu_passif_cible n'est pas entier : la
  // somme des composants arrondis indépendamment peut différer de
  // Math.round(somme) de ±1. On absorbe le delta dans coupleDelta s'il
  // existe (puisque c'est lui qui porte la fraction), sinon dans
  // enfantsDelta. JAMAIS d'items qui contredisent le total.
  const reste = totalLegacy - (enfantsDelta + coupleDelta)
  if (reste !== 0) {
    if (coupleDelta > 0 || hasCoupleBonus) coupleDelta  += reste
    else                                    enfantsDelta += reste
  }

  // ── Construction de la liste de raisons (ordre : couple, enfants) ────
  const raisons: CibleFoyerRaison[] = []
  if (coupleDelta > 0) {
    raisons.push({ label: 'couple, un seul revenu déclaré', montant: coupleDelta })
  }
  if (enfantsDelta > 0 && nbEnfants > 0) {
    raisons.push({ label: labelEnfants(p.enfants, nbEnfants), montant: enfantsDelta })
  }

  return {
    brut,
    ajuste,
    enfantsDelta,
    coupleDelta,
    hasAdjustment: (enfantsDelta + coupleDelta) > 0,
    raisons,
    nbEnfants,
    hasCoupleBonus,
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers texte court (email + ARIA)
// ────────────────────────────────────────────────────────────────────

/**
 * Construit le résumé parenthétique pour l'email mensuel — inclut
 * EXPLICITEMENT la valeur saisie pour éviter toute ambiguïté.
 * L'utilisateur voit le montant AJUSTÉ à côté (« 5 100 €/m visés »), et
 * on lui rappelle dans la parenthèse ce qu'il avait saisi (« 3 000 € saisi »).
 *
 * Format : ` ({brut formaté}, ajusté pour ton foyer : <composition>)`
 *
 * Exemples (sortie destinée à être collée APRÈS le montant ajusté) :
 *   - couple + 2 enfants → " (3 000 € saisi, ajusté pour ton foyer : couple + 2 enfants)"
 *   - couple seul        → " (3 000 € saisi, ajusté pour ton foyer : couple)"
 *   - 1 enfant seul      → " (3 000 € saisi, ajusté pour ton foyer : 1 enfant)"
 *   - 4+ enfants         → " (3 000 € saisi, ajusté pour ton foyer : 4 enfants ou plus)"
 *   - aucun ajustement   → ""
 *
 * @param fmtEur fonction de formatage des montants (injectée par l'appelant
 *   pour éviter une dépendance dure à lib/utils/format).
 */
export function buildCibleFoyerEmailLabel(
  detail: CibleFoyerDetail,
  fmtEur: (eur: number) => string,
): string {
  if (!detail.hasAdjustment) return ''
  const parts: string[] = []
  if (detail.hasCoupleBonus) parts.push('couple')
  if (detail.nbEnfants > 0) {
    // Cas DB "4+" → libellé canonique ; sinon "1 enfant"/"2 enfants"/...
    parts.push(detail.nbEnfants === 5
      ? '4 enfants ou plus'
      : labelEnfants(undefined, detail.nbEnfants))
  }
  return ` (${fmtEur(detail.brut)} saisi, ajusté pour ton foyer : ${parts.join(' + ')})`
}

/**
 * Construit le résumé parenthétique LONG pour les surfaces conversationnelles
 * où le montant brut a été affiché AVANT et où l'utilisateur a besoin de
 * comprendre l'ajustement chiffré (ARIA chat).
 *
 * Format : ` (ajusté pour ton foyer à {ajuste} €/mois — couple, 2 enfants)`
 *
 * Différences avec la version email :
 *   - inclut le MONTANT ajusté explicitement (l'utilisateur a vu le brut, on
 *     lui donne l'ajusté en clair)
 *   - sépare composition par virgule (pas "+")
 *
 * @param formatEur fonction de formatage des montants en euros (injectée par
 *   l'appelant pour éviter une dépendance dure à lib/utils/format).
 */
export function buildCibleFoyerAriaLabel(
  detail:    CibleFoyerDetail,
  formatEur: (eur: number) => string,
): string {
  if (!detail.hasAdjustment) return ''
  const parts: string[] = []
  if (detail.hasCoupleBonus) parts.push('couple')
  if (detail.nbEnfants > 0) {
    parts.push(detail.nbEnfants === 5
      ? '4 enfants ou plus'
      : labelEnfants(undefined, detail.nbEnfants))
  }
  return ` (ajusté pour ton foyer à ${formatEur(detail.ajuste)}/mois — ${parts.join(', ')})`
}
