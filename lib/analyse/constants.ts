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
