/**
 * Calcul du Capital Restant Dû (CRD) et des Indemnités de
 * Remboursement Anticipé (IRA) lors d'une revente immobilière.
 *
 * - CRD : formule d'amortissement standard (PMT inversée).
 * - IRA : plafond légal art. L313-47 du Code de la consommation,
 *   `min(3 % du CRD, 6 mois d'intérêts au taux du prêt)`.
 *
 * Fonctions PURES, testables isolément (cf. credit.test.ts).
 */

export interface CRDResult {
  /** Capital restant dû à la date de cession (€, arrondi entier). */
  crd:                 number
  /** Nombre de mensualités déjà payées entre dateDebut et dateCession. */
  mensualitesPaees:    number
  /** Mensualités restantes jusqu'à la fin du crédit. */
  mensualitesRestantes: number
  /** true si le crédit est terminé à la date de cession. */
  creditSolde:         boolean
}

/** Méthode légale retenue pour le calcul des IRA. */
export type IraMethode = 'pct_crd' | 'mois_interets' | 'exonere'

export interface IRAResult {
  /** Montant IRA effectivement dû (€, arrondi entier). */
  ira:     number
  /** Méthode retenue (formule la moins-disante ou exonération). */
  methode: IraMethode
  /** Libellé pédagogique du calcul retenu. */
  detail:  string
}

/**
 * Nombre entier de mensualités écoulées entre `dateDebut` et `dateCession`,
 * en mois pleins (différence year×12 + month, sans fraction de mois).
 */
function moisEntreDates(dateDebut: Date, dateCession: Date): number {
  const months = (dateCession.getUTCFullYear() - dateDebut.getUTCFullYear()) * 12
    + (dateCession.getUTCMonth() - dateDebut.getUTCMonth())
  return Math.max(0, months)
}

/**
 * Calcule le CRD à la date `dateCession` pour un crédit immobilier à
 * mensualité constante (amortissement classique).
 *
 *   CRD(N) = capital × [(1+r)^totalMois − (1+r)^N] / [(1+r)^totalMois − 1]
 *
 * avec r = tauxAnnuel / 12 et N = mensualités déjà payées.
 *
 * Cas particuliers :
 *  - Taux 0 (PTZ)        → amortissement linéaire `capital × restantes / total`.
 *  - Cession après fin   → crd = 0, creditSolde = true.
 *  - Cession avant début → mensualitesPaees = 0, crd = capital initial.
 */
export function calculerCRD(
  capitalInitial:   number,
  tauxAnnuelPct:    number,
  dureeTotaleMois:  number,
  dateDebut:        Date,
  dateCession:      Date,
): CRDResult {
  if (capitalInitial <= 0 || dureeTotaleMois <= 0) {
    return { crd: 0, mensualitesPaees: 0, mensualitesRestantes: 0, creditSolde: true }
  }

  const mensualitesPaees = moisEntreDates(dateDebut, dateCession)

  // Crédit déjà soldé à la date de cession
  if (mensualitesPaees >= dureeTotaleMois) {
    return {
      crd:                 0,
      mensualitesPaees:    dureeTotaleMois,
      mensualitesRestantes: 0,
      creditSolde:         true,
    }
  }

  const tauxMensuel = tauxAnnuelPct / 100 / 12
  let crd: number

  if (tauxMensuel === 0) {
    // PTZ — amortissement linéaire
    crd = capitalInitial * (dureeTotaleMois - mensualitesPaees) / dureeTotaleMois
  } else {
    const pTotale = Math.pow(1 + tauxMensuel, dureeTotaleMois)
    const pN      = Math.pow(1 + tauxMensuel, mensualitesPaees)
    crd = capitalInitial * (pTotale - pN) / (pTotale - 1)
  }

  return {
    crd:                  Math.max(0, Math.round(crd)),
    mensualitesPaees,
    mensualitesRestantes: dureeTotaleMois - mensualitesPaees,
    creditSolde:          false,
  }
}

/**
 * Calcule les IRA (Indemnités de Remboursement Anticipé) dues à la banque.
 *
 * Plafond légal art. L313-47 du Code de la consommation :
 *   IRA = min(3 % du CRD, 6 mois d'intérêts sur le CRD au taux du prêt).
 *
 * Cas d'exonération légale (mutation pro, licenciement, décès du
 * co-emprunteur, ou clause contractuelle « sans IRA ») : passer
 * `iraExonere=true` → renvoie 0.
 */
export function calculerIRA(
  crd:           number,
  tauxAnnuelPct: number,
  iraExonere:    boolean = false,
): IRAResult {
  if (iraExonere) {
    return {
      ira:     0,
      methode: 'exonere',
      detail:  'IRA exonérées (mutation pro, licenciement, décès ou clause contractuelle)',
    }
  }
  if (crd <= 0) {
    return { ira: 0, methode: 'exonere', detail: 'Aucun capital restant — pas d\'IRA' }
  }

  const optionA = crd * 0.03
  const optionB = crd * (tauxAnnuelPct / 100 / 12) * 6

  if (optionA <= optionB) {
    return {
      ira:     Math.max(0, Math.round(optionA)),
      methode: 'pct_crd',
      detail:  `3 % du capital restant dû (${Math.round(optionA).toLocaleString('fr-FR')} €)`,
    }
  }
  return {
    ira:     Math.max(0, Math.round(optionB)),
    methode: 'mois_interets',
    detail:  `6 mois d'intérêts au taux du prêt (${Math.round(optionB).toLocaleString('fr-FR')} €)`,
  }
}
