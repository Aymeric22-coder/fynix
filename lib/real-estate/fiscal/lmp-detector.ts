/**
 * Détection automatique du statut LMP (Loueur en Meublé Professionnel).
 *
 * Référentiel légal : CGI art. 151 septies, BOI-BIC-CHAMP-40-20.
 * Dernière mise à jour réglementaire utilisée : 2024.
 *
 * Conditions cumulatives pour être LMP (sinon LMNP non pro) :
 *   1. Recettes locatives meublées du foyer > 23 000 € / an (seuil strict).
 *   2. Recettes meublées > revenus professionnels du foyer
 *      (salaires nets imposables, BNC, BIC pro, pensions).
 *
 * ⚠️ Estimation — consultez un expert-comptable pour votre cas précis.
 */

export interface FoyerFiscalContext {
  /** Revenus professionnels annuels du foyer (€) — hors revenus locatifs. */
  professionalIncomeEur: number
}

export interface LmpDetectionResult {
  isLmp:                bool
  condition1Met:        bool   // recettes meublées > 23 000 €
  condition2Met:        bool   // recettes meublées > revenus pro
  totalMeubleeRevenues: number
  professionalIncome:   number
  threshold:            23_000
  recommendation:       string
}

type bool = boolean

/** Seuil légal de recettes meublées pour la qualification LMP. */
export const LMP_REVENUE_THRESHOLD = 23_000 as const   // CGI art. 151 septies

/**
 * Renvoie le statut LMP / LMNP et un message pédagogique.
 *
 * Convention : la comparaison est STRICTE (>), donc 23 000 € pile = LMNP.
 *
 * @param meubleeRevenues  Total annuel des recettes meublées du foyer (€).
 * @param foyerContext     Revenus professionnels du foyer (€/an).
 */
export function detectLmpStatus(
  meubleeRevenues: number,
  foyerContext:    FoyerFiscalContext,
): LmpDetectionResult {
  const condition1Met = meubleeRevenues > LMP_REVENUE_THRESHOLD
  const condition2Met = meubleeRevenues > foyerContext.professionalIncomeEur
  const isLmp         = condition1Met && condition2Met

  const eur = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €'

  let recommendation: string
  if (isLmp) {
    recommendation =
      `Recettes meublées ${eur(meubleeRevenues)} > 23 000 € ET > revenus ` +
      `professionnels ${eur(foyerContext.professionalIncomeEur)}. ` +
      `Vous êtes LMP — déficit imputable sans plafond mais cotisations SSI obligatoires.`
  } else if (condition1Met) {
    recommendation =
      `Recettes meublées ${eur(meubleeRevenues)} > 23 000 € mais ≤ revenus ` +
      `professionnels ${eur(foyerContext.professionalIncomeEur)}. ` +
      `Vous restez LMNP non professionnel.`
  } else {
    recommendation =
      `Recettes meublées ${eur(meubleeRevenues)} ≤ 23 000 € — LMNP non professionnel.`
  }

  return {
    isLmp,
    condition1Met,
    condition2Met,
    totalMeubleeRevenues: meubleeRevenues,
    professionalIncome:   foyerContext.professionalIncomeEur,
    threshold:            LMP_REVENUE_THRESHOLD,
    recommendation,
  }
}

/**
 * Helper : à partir d'une liste de biens, somme les recettes meublées.
 * Un bien contribue si son régime déclaré est LMNP réel, LMNP micro ou LMP
 * (le bien est exploité en meublé).
 */
export interface PropertyForLmp {
  fiscal_regime: string | null
  /** Recettes annuelles brutes (loyers + charges récupérées) — €. */
  annualMeubleeRevenues: number
}

export function sumMeubleeRevenues(props: PropertyForLmp[]): number {
  return props
    .filter(p =>
      p.fiscal_regime === 'lmnp_reel' ||
      p.fiscal_regime === 'lmnp_micro' ||
      p.fiscal_regime === 'lmp',
    )
    .reduce((s, p) => s + (p.annualMeubleeRevenues || 0), 0)
}
