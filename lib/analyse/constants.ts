/**
 * Constantes centrales pour les calculs d'analyse patrimoniale et FIRE.
 *
 * Source unique de verite pour :
 *   - Prelevements sociaux (PS) et fiscalite financiere
 *   - Fallback TMI quand le profil utilisateur ne renseigne pas
 *   - Taux de retrait SWR par type de FIRE (lean / standard / fat)
 *
 * Avant cet hub, ces valeurs etaient duplicees dans 3 fichiers
 * (fiscaliteImmo.ts, optimiseurFiscal.ts, projectionFIRE.ts), avec
 * des fallbacks TMI differents (0 vs 30) qui creaient des incoherences
 * entre l'optimiseur fiscal et l'estimation de cashflow net.
 *
 * En cas de changement legislatif (PS, TMI, plafonds), modifier ICI puis
 * verifier les tests via `npx vitest run`.
 */

// ── Fiscalite financiere ─────────────────────────────────────────────

/** Prelevements sociaux (CSG/CRDS + solidarite + maladie). */
export const PRELEVEMENTS_SOCIAUX_PCT = 17.2

/** Prelevement Forfaitaire Unique (flat tax) = PFU IR 12,8 + PS 17,2. */
export const PFU_PCT = 30

/** Assurance Vie >= 8 ans : IR 7,5 + PS 17,2 (apres abattement). */
export const AV_LONG_TERME_PCT = 24.7

/** Abattement annuel AV >= 8 ans, contribuable seul (€). */
export const AV_ABATTEMENT_CELIBATAIRE = 4_600

/** Abattement annuel AV >= 8 ans, couple commun (€). */
export const AV_ABATTEMENT_COUPLE = 9_200

// ── TMI ───────────────────────────────────────────────────────────────

/**
 * Fallback TMI quand le profil utilisateur ne renseigne pas `tmi_rate`.
 * Choix conservateur a 30% : le PFU et le TMI median francais convergent
 * autour de cette valeur, ca evite de sous-estimer les impots immo et
 * de masquer des opportunites fiscales en mode "tmi=0".
 *
 * NB : l'agregateur expose un flag `tmiEstime` quand ce fallback s'applique,
 * pour que l'UI puisse alerter l'utilisateur.
 */
export const TMI_FALLBACK_PCT = 30

// ── SWR par type de FIRE ──────────────────────────────────────────────

/** SWR (Safe Withdrawal Rate) lean FIRE = 3,5%. */
export const SWR_LEAN_PCT = 3.5

/** SWR standard FIRE = 4% (regle de Bengen / Trinity). */
export const SWR_STANDARD_PCT = 4.0

/** SWR fat FIRE = 3,0% (plus conservateur car horizon plus long). */
export const SWR_FAT_PCT = 3.0

/**
 * Retourne le SWR en % selon le type de FIRE renseigne dans le profil.
 * Fallback standard (4%) si type inconnu.
 */
export function swrPctFromFireType(fireType: string | null | undefined): number {
  switch (fireType) {
    case 'lean': return SWR_LEAN_PCT
    case 'fat':  return SWR_FAT_PCT
    case 'coast':
    case 'barista':
    case 'standard':
    default:
      return SWR_STANDARD_PCT
  }
}

// ── Cible patrimoniale FIRE (I9 — formule unifiée) ───────────────────

/**
 * Cible patrimoine FIRE = revenu annuel cible × (1 + inflation)^N / SWR.
 *
 * Formule unique, à appeler depuis aggregateur, projectionFIRE et scores
 * pour éviter les 3 implémentations divergentes pré-audit :
 *   - aggregateur : `revenu × 12 / swr × (1 + i)^y`
 *   - projectionFIRE : `revenu × (1 + i)^y × 12 / swrFraction`
 *   - scores : `revenu × 12 × 25` (sans inflation, SWR figé 4 %)
 *
 * @param revenuMensuelCible   Revenu passif mensuel cible en € (montant actuel)
 * @param anneesJusquaFIRE     Années entre maintenant et l'âge cible (0 = aujourd'hui)
 * @param inflationAnnuellePct Taux d'inflation annuel en % (ex. 2 = 2 %)
 * @param swrPct               Safe Withdrawal Rate en % (ex. 4 = 4 %)
 * @returns Patrimoine total nécessaire à l'âge cible (€)
 */
export function calculerCiblePatrimoine(
  revenuMensuelCible:   number,
  anneesJusquaFIRE:     number,
  inflationAnnuellePct: number,
  swrPct:               number,
): number {
  if (swrPct <= 0) return 0
  const swrFraction     = swrPct / 100
  const facteurInflation = Math.pow(1 + inflationAnnuellePct / 100, Math.max(0, anneesJusquaFIRE))
  return (revenuMensuelCible * 12 / swrFraction) * facteurInflation
}

// ── Rendements par classe d'actif (I10 — source unique) ──────────────

/**
 * Rendements annuels estimés par classe d'actif (en décimal, ex. 0.07 = 7 %).
 * Source : données historiques long terme (MSCI World, JPM Guide to Markets,
 * Banque de France IRL). À réviser annuellement (cf. NEXT_ACTIONS.md).
 *
 * Avant l'audit, 3 fichiers définissaient leurs propres taux :
 *   - projectionFIRE : cash 3 %, immo 6 %, stock 7 %
 *   - aggregateur :    cash 1 %, stock 5 %, crypto 0 %
 *   - scores :         7 % en dur (anneesPourAtteindre)
 * Désormais tous lisent ces constantes.
 */
export const RENDEMENT_PAR_CLASSE = {
  cash:        0.03,
  obligataire: 0.03,
  immo:        0.06,
  actions:     0.07,
  etf:         0.07,
  crypto:      0.05,
  scpi:        0.045,
  metaux:      0.02,
} as const

export type ClasseActif = keyof typeof RENDEMENT_PAR_CLASSE

/** Lookup avec fallback `actions` quand la classe n'existe pas. */
export function rendementParClasse(classe: ClasseActif | string): number {
  return (RENDEMENT_PAR_CLASSE as Record<string, number>)[classe]
    ?? RENDEMENT_PAR_CLASSE.actions
}

