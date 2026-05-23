/**
 * Construit le tableau année-par-année de réduction d'impôt pour un
 * dispositif fiscal donné (Pinel / Pinel+ / Denormandie / Loc'Avantages).
 *
 * Le tableau est consommé par la projection (`incentiveReductionPerYear`)
 * qui applique : `taxPaid = max(0, taxPaid − reduction)` pour chaque année.
 *
 * Convention : la projection commence à l'année calendaire courante
 * (l'année simulée 1 = `new Date().getUTCFullYear()`).
 * - Pinel / Pinel+ / Denormandie : fenêtre [start_year, start_year + duration − 1]
 * - Loc'Avantages : fenêtre [convention_start.year, convention_end.year]
 * - Malraux / MH / Censi-Bouvard : mécanisme différent (déduction sur revenu
 *   global, pas réduction d'IR) — retourne un tableau de zéros, traité ailleurs.
 */

import { computePinel, GLOBAL_TAX_NICHE_CAP, type PinelDuration, type PinelZone } from './pinel'
import { computeDenormandie } from './denormandie'
import { LOC_AVANTAGES_RATES, type LocAvantagesConvention } from './loc-avantages'
import type { PropertyInput, RentInput } from '../../types'

/** Sous-ensemble de la row property_tax_incentives utile pour cette fonction. */
export interface IncentiveScheduleRow {
  kind:            string
  duration_years:  number | null
  zone:            string | null
  start_year:      number | null
  works_amount:    number | null
  is_pinel_plus:   boolean | null
  // Loc'Avantages
  convention_type?:  string | null
  convention_start?: string | null   // ISO date
  convention_end?:   string | null
}

export function buildIncentiveReductionPerYear(
  incentive:    IncentiveScheduleRow | null | undefined,
  property:     PropertyInput,
  rent:         RentInput,
  tmiPct:       number,
  horizonYears: number,
): number[] {
  if (!incentive) return []

  const calendarYear1 = new Date().getUTCFullYear()

  // ── Loc'Avantages — CGI art. 199 tricies ─────────────────────────────
  // Réduction = loyers HC EFFECTIVEMENT PERÇUS × taux convention
  // (15 / 35 / 65 %). Fenêtre = [convention_start.year, convention_end.year],
  // par défaut 6 ans.
  //
  // V8.1 — BUG-006 : on prend les loyers réellement perçus (nets de vacance)
  // et non le loyer théorique (12 × monthlyRent). CGI art. 199 tricies parle
  // explicitement de "loyers perçus dans l'année".
  if (incentive.kind === 'loc_avantages') {
    const conventionType = (incentive.convention_type ?? 'loc1') as LocAvantagesConvention
    const rate = LOC_AVANTAGES_RATES[conventionType] ?? 0
    const perceivedMonths = Math.max(0, 12 - (rent.vacancyMonths ?? 0))
    const annualRentPerceived = rent.monthlyRent * perceivedMonths
    const annualReduction = annualRentPerceived * rate

    const startYear = incentive.convention_start
      ? new Date(incentive.convention_start).getUTCFullYear()
      : (incentive.start_year ?? calendarYear1)
    const endYear = incentive.convention_end
      ? new Date(incentive.convention_end).getUTCFullYear()
      : startYear + 5   // fallback : 6 ans (minimum légal)

    return Array.from({ length: horizonYears }, (_, i) => {
      const calYear = calendarYear1 + i
      return (calYear >= startYear && calYear <= endYear) ? annualReduction : 0
    })
  }

  // ── Pinel / Pinel+ / Denormandie — CGI art. 199 novovicies ───────────
  if (
    incentive.kind !== 'pinel' &&
    incentive.kind !== 'pinel_plus' &&
    incentive.kind !== 'denormandie'
  ) {
    return []
  }
  if (incentive.duration_years == null || incentive.start_year == null) {
    return []
  }

  const duration = incentive.duration_years as PinelDuration
  const zone     = (incentive.zone ?? 'A') as PinelZone

  // Calcule la réduction annuelle via Pinel ou Denormandie.
  // Note : `reduction-schedule` ne valide PAS l'éligibilité loyer/surface
  // (c'est le rôle des panels UI Pinel/Denormandie qui appellent les
  // fonctions directement). Ici on veut UNIQUEMENT `taxReductionPerYear`
  // qui ne dépend que du prix d'acquisition et du plafond 300 000 € /
  // 5 500 €/m². On passe donc :
  //   - surfaceM2 = 1000 (très large : 5500 × 1000 = 5,5 M€ > 300k cap)
  //   - annualRentHC = 0 (court-circuite la vérification de plafond loyer)
  // Le calcul reste correct car taxReductionPerYear = base × taux où
  // base = min(prix, 300k, 5500 × surface).
  const BYPASS_SURFACE = 1_000
  let annualReduction = 0
  if (incentive.kind === 'denormandie') {
    const r = computeDenormandie({
      duration,
      zone,
      purchasePrice: property.purchasePrice,
      worksAmount:   incentive.works_amount ?? property.worksAmount ?? 0,
      surfaceM2:     BYPASS_SURFACE,
      startYear:     incentive.start_year,
      annualRentHC:  0,
      tmiPct,
    })
    annualReduction = r.taxReductionPerYear   // pas de filtre eligible (cf. note)
  } else {
    const r = computePinel({
      isPinelPlus:   incentive.kind === 'pinel_plus' || !!incentive.is_pinel_plus,
      duration,
      zone,
      purchasePrice: property.purchasePrice,
      surfaceM2:     BYPASS_SURFACE,
      startYear:     incentive.start_year,
      annualRentHC:  0,
      tmiPct,
    })
    annualReduction = r.taxReductionPerYear
  }

  // V8.1 — BUG-004 : plafond global niches fiscales (CGI art. 200-0 A) =
  // 10 000 €/an. `computePinel` plafonne déjà dans `yearByYear[i].reductionIR`,
  // mais on consomme `taxReductionPerYear` (brut) → on ré-applique le cap ici
  // pour garantir la cohérence du plafond par bien (l'agrégation au niveau
  // FOYER est une amélioration séparée, future V8.x).
  const cappedAnnualReduction = Math.min(annualReduction, GLOBAL_TAX_NICHE_CAP)

  // Construit le tableau année par année avec la fenêtre temporelle.
  // Année 1 simulée = année calendaire courante (calendarYear1 défini en haut).
  const incentiveStart  = incentive.start_year
  const incentiveEnd    = incentiveStart + duration - 1

  return Array.from({ length: horizonYears }, (_, i) => {
    const calYear = calendarYear1 + i
    if (calYear >= incentiveStart && calYear <= incentiveEnd) {
      return cappedAnnualReduction
    }
    return 0
  })
}
