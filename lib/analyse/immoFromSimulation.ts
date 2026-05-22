/**
 * V4 — Helper pur qui mappe un `PropertySimResult` (sortie du moteur
 * `lib/real-estate/portfolio.ts > computeRealEstatePortfolio`) vers le
 * type `BienImmo` consommé par la page /analyse (et tous ses dérivés :
 * scores, recommandations, projection FIRE, ARIA).
 *
 * Pourquoi ce helper existe :
 *   Avant V4, /analyse calculait ses propres KPIs via `calculerKPIsBien`
 *   + `calculerImpotFoncier` (lib/analyse/) — un moteur fiscal séparé,
 *   sans amortissement multi-année, sans carry-forward, sans différé,
 *   sans multi-crédit. Résultat : `cashflow_net_fiscal` de /analyse ≠
 *   `monthlyCashFlowYear1` de la fiche détail (bugs BUG-007/008,
 *   INCOH-002/003/004 dans .audit/AUDIT_ETAT_ACTUEL.md).
 *
 *   V4 fait converger /analyse sur le moteur unique en réutilisant
 *   `computeRealEstatePortfolio` (déjà multi-crédit depuis V3.1).
 *   Ce helper est la passerelle qui formate sa sortie au type historique
 *   `BienImmo` pour ne pas casser scores.ts / projectionFIRE.ts / etc.
 *
 * Garanties :
 *   - Pour un même bien, `BienImmo.cashflow_net_fiscal × 12` est strictement
 *     égal à `PropertySimResult.simulation.kpis.annualCashFlowYear1`
 *     (lui-même calculé par runSimulation, identique à la fiche détail).
 *   - `BienImmo.credit_restant` = `PropertySimResult.capitalRemaining`
 *     (CRD analytique multi-crédit à aujourd'hui).
 *   - `BienImmo.rendement_brut` = `kpis.grossYieldFAI` (dénominateur = coût
 *     FAI complet, cohérent fiche détail / liste).
 *   - Test de cohérence garanti dans
 *     `lib/analyse/__tests__/immoFromSimulation.test.ts`.
 */

import type { PropertySimResult } from '@/lib/real-estate/portfolio'
import type { BienImmo } from '@/types/analyse'

/** Méta-données non extractibles depuis `PropertySimResult` —
 *  doivent être chargées séparément par le caller (loadImmo). */
export interface BienImmoMeta {
  /** Libellé d'affichage du type d'usage (« Résidence principale »,
   *  « Locatif (LMNP) », « SCPI », …). Préfère cette valeur au régime
   *  fiscal brut, l'UI affiche cette étiquette. */
  uiType:               string
  city:                 string | null
  country:              string | null
  /** Régime fiscal saisi (string brut DB), null si non renseigné. */
  fiscal_regime:        string | null
  /** Date d'acquisition (ISO) — utilisée pour neutraliser le malus risque
   *  cashflow négatif sur les biens récents (< 24 mois). */
  acquisitionDate:      string | null
  /** True si aucune ligne `property_charges` n'existe → charges = 0
   *  par défaut (le moteur retourne donc un CF surévalué, le user a
   *  validé en V4 le « mode strict » : pas de fallback sur des
   *  default charges côté /analyse). Le flag reste pour l'affichage. */
  chargesEstimated:     boolean
  /** Taux nominal annuel du crédit principal en % (depuis debts.interest_rate
   *  filtré `loan_kind='principal'`). Sert à `taux_interet_estime` pour la
   *  projection FIRE. Default 3 % si pas de crédit principal. */
  principalRatePct:     number
  /** Durée totale du crédit principal en mois (depuis debts.duration_months
   *  filtré `loan_kind='principal'`). Sert à calculer `duree_restante_mois`.
   *  0 si pas de crédit. */
  principalDurationMonths: number
  /** Date de début du crédit principal (ISO) — sert au calcul de la durée
   *  restante. null si pas de crédit ou pas de start_date. */
  principalStartDate:   string | null
}

/**
 * Construit un `BienImmo` à partir de la sortie du moteur.
 *
 * @param sim   Le `PropertySimResult` produit par `computeRealEstatePortfolio`.
 * @param meta  Les méta-données complémentaires (cf. {@link BienImmoMeta}).
 * @returns     Un `BienImmo` strictement cohérent avec la fiche détail.
 */
export function buildBienImmoFromSimulation(
  sim:  PropertySimResult,
  meta: BienImmoMeta,
): BienImmo {
  const { simulation } = sim
  const { kpis, projection, incompleteData } = simulation
  const y1 = projection[0]   // peut être undefined si incompleteData

  // Valeur du bien (au sens « valeur de marché ») =
  // valeur estimée (current_value) si renseignée, sinon fallback
  // purchase_price + works (cf. kpis.ts : currentNetPropertyValue est
  // calculé sur `initialEstimatedValue` qui retombe sur ce fallback).
  //   currentNetPropertyValue = initialEstimatedValue − remainingCapitalNow
  // Donc : valeur = currentNetPropertyValue + capitalRemaining.
  const valeur = kpis.currentNetPropertyValue + sim.capitalRemaining

  // Loyer mensuel (Y1, indexation neutre) — extrait de la projection.
  // Pour incompleteData, projection est vide → loyer = 0 (BienImmo
  // garde la trace via donnees_completes=false).
  const loyerMensuel  = y1 ? y1.grossRent / 12 : 0
  const loyersAnnuels = loyerMensuel * 12

  // Charges Y1 issues du moteur (incluent fixedCharges + GLI + management,
  // résolus depuis charges-resolver qui couvre la mig 040).
  const chargesAnnuelles = y1?.charges ?? 0

  // Cashflow brut (BienImmo.cashflow_mensuel = sémantique « brut, avant
  // impôt » par convention historique) et net fiscal (après impôt).
  const cashflowMensuelBrut    = y1 ? y1.cashFlowBeforeTax / 12 : 0
  const cashflowMensuelNetFisc = kpis.monthlyCashFlowYear1   // = cashFlowAfterTax/12
  const impotMensuel           = y1 ? y1.taxPaid / 12 : 0
  const tauxEffortFiscal       = loyersAnnuels > 0 ? (y1!.taxPaid / loyersAnnuels) * 100 : 0

  // LTV sur la valeur (cohérent fiche : ratio dette / valeur estimée)
  const ltv = valeur > 0 ? (sim.capitalRemaining / valeur) * 100 : 0

  // Durée restante du crédit principal — approximation depuis (durée totale)
  // moins (mois écoulés depuis start_date). 0 si pas de crédit.
  const dureeRestanteMois = computeDureeRestanteMois(
    meta.principalDurationMonths,
    meta.principalStartDate,
  )

  // Risque + niveau de levier — logique pure reprise de l'ancien
  // `calculerKPIsBien` (LTV-based + malus cashflow neg si bien ≥ 24 mois).
  // Conservée à l'identique pour ne pas changer la sémantique des scores.
  const niveauLevier = computeNiveauLevier(ltv, sim.capitalRemaining)
  const risqueImmo   = computeRisqueImmo(ltv, cashflowMensuelBrut, meta.acquisitionDate, sim.capitalRemaining)

  return {
    id:                  sim.propertyId,
    nom:                 sim.propertyName ?? meta.city ?? 'Bien',
    ville:               meta.city,
    pays:                meta.country,
    type:                meta.uiType,
    valeur,
    loyer_mensuel:       loyerMensuel,
    credit_restant:      sim.capitalRemaining,           // ✅ analytique multi-crédit
    mensualite_credit:   kpis.monthlyPayment,            // ✅ avec assurance + multi
    charges_annuelles:   chargesAnnuelles,
    charges_are_estimated: meta.chargesEstimated,
    equity:              kpis.currentNetPropertyValue,
    rendement_brut:      kpis.grossYieldFAI,             // ✅ dénominateur FAI (INCOH-002)
    rendement_net:       kpis.netYield,                  // ✅ idem
    cashflow_mensuel:    cashflowMensuelBrut,
    cashflow_net_fiscal: cashflowMensuelNetFisc,         // ✅ moteur complet (BUG-007)
    impot_mensuel_estime: impotMensuel,
    taux_effort_fiscal:  tauxEffortFiscal,
    ltv,
    niveau_levier:       niveauLevier,
    risque_immo:         risqueImmo,
    donnees_completes:   !incompleteData,
    taux_interet_estime: meta.principalRatePct,
    duree_restante_mois: dureeRestanteMois,
    fiscal_regime:       meta.fiscal_regime,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internes — purs, repris de l'ancien `calculerKPIsBien`.
// On garde la sémantique exacte des scores (la migration vers le moteur
// ne doit changer QUE les KPIs financiers, pas le scoring de risque).
// ─────────────────────────────────────────────────────────────────────

function computeNiveauLevier(
  ltv:             number,
  creditRestant:   number,
): BienImmo['niveau_levier'] {
  if (creditRestant === 0) return 'Sans crédit'
  if (ltv >= 75)           return 'Fort'
  if (ltv >= 60)           return 'Modéré'
  return 'Faible'
}

/**
 * Score de risque immobilier (5-85) basé sur la LTV.
 * Cf. calculerKPIsBien (Sprint 2 recalibrage) :
 *   LTV = 0    → 5   (immo cash = stable)
 *   LTV < 70   → 15
 *   LTV 70-89  → 30  (norme française)
 *   LTV ≥ 90   → 50  (sur-endettement)
 *   +10 si cashflow < 0 ET bien ≥ 24 mois (acquisition récente = effort
 *   structurel d'un crédit jeune, pas un signal).
 */
function computeRisqueImmo(
  ltv:             number,
  cashflowMensuel: number,
  acquisitionDate: string | null,
  creditRestant:   number,
): number {
  let risque: number
  if      (creditRestant === 0) risque = 5
  else if (ltv < 70)            risque = 15
  else if (ltv < 90)            risque = 30
  else                          risque = 50

  if (cashflowMensuel < 0) {
    const young = isAcquiredWithinMonths(acquisitionDate, 24)
    if (!young) risque += 10
  }
  return Math.max(0, Math.min(85, risque))
}

function isAcquiredWithinMonths(
  acquisitionDate: string | null,
  monthsBack:      number,
  now: Date = new Date(),
): boolean {
  if (!acquisitionDate) return false
  const d = new Date(acquisitionDate)
  if (isNaN(d.getTime())) return false
  const threshold = new Date(now)
  threshold.setMonth(threshold.getMonth() - monthsBack)
  return d >= threshold
}

/**
 * Durée restante du crédit principal en mois.
 * Renvoie 0 si pas de crédit ou pas de start_date.
 */
function computeDureeRestanteMois(
  totalMonths: number,
  startDate:   string | null,
  now: Date = new Date(),
): number {
  if (totalMonths <= 0 || !startDate) return 0
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return totalMonths
  const monthsElapsed = (now.getFullYear() - d.getFullYear()) * 12
                      + (now.getMonth() - d.getMonth())
  return Math.max(0, totalMonths - monthsElapsed)
}
