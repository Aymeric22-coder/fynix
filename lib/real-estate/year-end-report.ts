/**
 * Rapport annuel par bien (Phase 2).
 *
 * Synthétise pour une année close toutes les données nécessaires à la
 * déclaration fiscale (2044 foncier, 2031 BIC, etc.) :
 *   - Revenus locatifs réels
 *   - Charges déductibles par catégorie
 *   - Détail crédit (intérêts + capital + assurance)
 *   - Amortissements (régimes réels uniquement)
 *   - Résultat fiscal calculé
 *   - Régime fiscal et spécificités
 *
 * Sortie pure (pas d'I/O), prête à être affichée et/ou exportée en CSV.
 */

import type { ProjectionYear, FiscalRegime, AmortizationSchedule } from './types'
import type { ActualYearData } from './actual'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChargesCategoryBreakdown {
  taxeFonciere:    number
  insurance:       number    // PNO
  accountant:      number
  cfe:             number
  condoFees:       number
  maintenance:     number
  other:           number
  /** Cotisations SSI (LMP uniquement). */
  ssiCotisations?: number
  total:           number
}

export interface LoanBreakdown {
  /** Intérêts payés sur l'année (déductibles dans tous les régimes réels). */
  interestPaid:    number
  /** Assurance emprunteur (déductible). */
  insurancePaid:   number
  /** Capital remboursé (non déductible mais utile pour le suivi). */
  principalRepaid: number
  /** Total versé (somme des trois). */
  totalPaid:       number
  /** Capital restant dû à fin d'année. */
  remainingCapital: number
}

export interface YearEndReport {
  year:            number
  propertyId:      string
  propertyName?:   string
  fiscalRegime:    FiscalRegime['kind']

  // ── REVENUS ──────────────────────────────────────────────────────────────
  rentReceived:    number     // réel
  rentSimulated:   number     // prévu
  rentVariance:    number

  // ── CHARGES ──────────────────────────────────────────────────────────────
  chargesActual:    ChargesCategoryBreakdown
  chargesSimulated: number
  chargesVariance:  number

  // ── CRÉDIT ───────────────────────────────────────────────────────────────
  loan:            LoanBreakdown | null

  // ── AMORTISSEMENT (régimes réels uniquement) ─────────────────────────────
  amortizationBuilding:  number   // non utilisé pour foncier_nu
  amortizationWorks:     number
  amortizationFurniture: number
  amortizationTotal:     number

  // ── CALCUL FISCAL (théorique) ────────────────────────────────────────────
  /**
   * Résultat fiscal = revenus - charges déductibles - intérêts/assurance crédit - amortissements
   * Pour les régimes réels. Pour micro-BIC/micro-foncier : résultat = revenus × (1 - abattement).
   */
  fiscalResult:    number
  /** Base imposable simulée (depuis la projection). */
  taxableBase:     number
  /** Impôt théorique selon régime + TMI (depuis simulation). */
  taxEstimated:    number

  // ── CASH-FLOW NET ────────────────────────────────────────────────────────
  cashFlowReal:    number    // ce qui est resté en poche après tout
  cashFlowSimulated: number

  /** True si certaines données sont incomplètes (charges non saisies, etc.). */
  hasGaps:         boolean
  /** Liste des champs manquants. */
  gaps:            string[]
}

// ─── Helper principal ──────────────────────────────────────────────────────

/**
 * Construit le rapport annuel pour un bien donné.
 *
 * @param year             Année calendaire (ex: 2024)
 * @param propertyId       ID du bien
 * @param propertyName     Nom de l'asset (optionnel)
 * @param fiscalRegime     Régime fiscal de la simulation
 * @param projection       Projection simulée pour l'année (ProjectionYear)
 * @param actual           Données réelles pour l'année (ou null si non suivie)
 * @param schedule         Tableau d'amortissement du crédit (optionnel)
 * @param simulationStartYear   Année 1 de la simulation (pour aligner le schedule)
 */
export function buildYearEndReport(
  year:                number,
  propertyId:          string,
  propertyName:        string | undefined,
  fiscalRegime:        FiscalRegime['kind'],
  projection:          ProjectionYear | null,
  actual:              ActualYearData | null,
  schedule:            AmortizationSchedule | null,
  simulationStartYear: number,
): YearEndReport {
  const gaps: string[] = []

  // ── REVENUS ─────
  const rentReceived  = actual?.rentReceived ?? 0
  const rentSimulated = projection?.netRent  ?? 0
  if (!actual)                  gaps.push('aucune transaction de loyer')
  else if (rentReceived === 0)  gaps.push('loyer reçu = 0')

  // ── CHARGES ─────
  const cb = actual?.chargesPaid ?? {
    taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0,
    condoFees: 0, maintenance: 0, other: 0, total: 0,
  }
  const chargesActual: ChargesCategoryBreakdown = {
    taxeFonciere: cb.taxeFonciere,
    insurance:    cb.insurance,
    accountant:   cb.accountant,
    cfe:          cb.cfe,
    condoFees:    cb.condoFees,
    maintenance:  cb.maintenance,
    other:        cb.other,
    total:        cb.total,
  }
  const chargesSimulated = projection?.charges ?? 0
  if (actual && !actual.chargesRecorded) gaps.push('charges détaillées non saisies')

  // ── CRÉDIT ─────
  let loan: LoanBreakdown | null = null
  if (schedule) {
    // Année du schedule = year - simulationStartYear + 1 (1-indexé)
    const yearIndex = year - simulationStartYear + 1
    const yearAgg = schedule.years.find((y) => y.year === yearIndex)
    if (yearAgg) {
      loan = {
        interestPaid:     yearAgg.interest,
        insurancePaid:    yearAgg.insurance,
        principalRepaid:  yearAgg.principal,
        totalPaid:        yearAgg.totalPayment + yearAgg.insurance,
        remainingCapital: yearAgg.remainingCapital,
      }
    }
  }
  // Si on a aussi du réel, on peut alerter sur l'écart
  if (loan && actual && Math.abs(actual.loanPaid - loan.totalPaid) > 100) {
    gaps.push(`écart mensualités réel/théorique : ${(actual.loanPaid - loan.totalPaid).toFixed(0)} €`)
  }

  // ── AMORTISSEMENT (depuis projection si dispo) ─────
  const amortTotal = projection?.amortizations ?? 0
  // On ne décompose pas building/works/furniture séparément ici — c'est dans la projection agrégée.
  const amortizationBuilding  = amortTotal   // approximation
  const amortizationWorks     = 0
  const amortizationFurniture = 0

  // ── CALCUL FISCAL ─────
  const fiscalResult     = projection?.fiscalResult ?? 0
  const taxableBase      = projection?.taxableBase  ?? 0
  const taxEstimated     = projection?.taxPaid      ?? 0

  // ── CASH-FLOW ─────
  const cashFlowReal      = actual?.cashFlowReal      ?? 0
  const cashFlowSimulated = projection?.cashFlowAfterTax ?? 0

  return {
    year,
    propertyId,
    propertyName,
    fiscalRegime,
    rentReceived,
    rentSimulated,
    rentVariance:    rentReceived - rentSimulated,
    chargesActual,
    chargesSimulated,
    chargesVariance: chargesActual.total - chargesSimulated,
    loan,
    amortizationBuilding,
    amortizationWorks,
    amortizationFurniture,
    amortizationTotal: amortTotal,
    fiscalResult,
    taxableBase,
    taxEstimated,
    cashFlowReal,
    cashFlowSimulated,
    hasGaps:         gaps.length > 0,
    gaps,
  }
}

// ─── Export CSV ────────────────────────────────────────────────────────────

/**
 * Sérialise un rapport en CSV (séparateur ;) compatible Excel FR.
 * Une ligne par catégorie avec 3 colonnes : libellé, montant, note.
 */
export function reportToCsv(report: YearEndReport): string {
  const lines: string[] = []
  const sep = ';'

  // Encode une valeur pour CSV (échappe ; et ")
  const esc = (v: string | number): string => {
    const s = String(v)
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const fmt = (n: number) => n.toFixed(2).replace('.', ',')   // décimal FR pour Excel FR

  // En-tête
  lines.push(`Rapport annuel ${report.year}`)
  lines.push(`Bien${sep}${esc(report.propertyName ?? report.propertyId)}`)
  lines.push(`Régime fiscal${sep}${report.fiscalRegime}`)
  lines.push('')

  lines.push(`Catégorie${sep}Montant (€)${sep}Note`)

  // REVENUS
  lines.push(`REVENUS${sep}${sep}`)
  lines.push(`Loyers perçus${sep}${fmt(report.rentReceived)}${sep}réel`)
  lines.push(`Loyers prévus${sep}${fmt(report.rentSimulated)}${sep}simulation`)
  lines.push(`Écart loyers${sep}${fmt(report.rentVariance)}${sep}`)
  lines.push('')

  // CHARGES
  lines.push(`CHARGES${sep}${sep}`)
  lines.push(`Taxe foncière${sep}${fmt(report.chargesActual.taxeFonciere)}${sep}déductible`)
  lines.push(`Assurance PNO${sep}${fmt(report.chargesActual.insurance)}${sep}déductible`)
  lines.push(`Expert-comptable${sep}${fmt(report.chargesActual.accountant)}${sep}déductible`)
  lines.push(`CFE${sep}${fmt(report.chargesActual.cfe)}${sep}déductible`)
  lines.push(`Charges copropriété${sep}${fmt(report.chargesActual.condoFees)}${sep}déductible`)
  lines.push(`Entretien / réparations${sep}${fmt(report.chargesActual.maintenance)}${sep}déductible`)
  lines.push(`Autres charges${sep}${fmt(report.chargesActual.other)}${sep}`)
  lines.push(`Total charges${sep}${fmt(report.chargesActual.total)}${sep}`)
  lines.push('')

  // CRÉDIT
  if (report.loan) {
    lines.push(`CRÉDIT${sep}${sep}`)
    lines.push(`Intérêts d'emprunt${sep}${fmt(report.loan.interestPaid)}${sep}déductible`)
    lines.push(`Assurance emprunteur${sep}${fmt(report.loan.insurancePaid)}${sep}déductible`)
    lines.push(`Capital remboursé${sep}${fmt(report.loan.principalRepaid)}${sep}non déductible`)
    lines.push(`Total mensualités${sep}${fmt(report.loan.totalPaid)}${sep}`)
    lines.push(`Capital restant dû${sep}${fmt(report.loan.remainingCapital)}${sep}fin d'année`)
    lines.push('')
  }

  // AMORTISSEMENTS
  if (report.amortizationTotal > 0) {
    lines.push(`AMORTISSEMENTS${sep}${sep}`)
    lines.push(`Total amortissements${sep}${fmt(report.amortizationTotal)}${sep}déductible (régime réel)`)
    lines.push('')
  }

  // RÉSULTAT FISCAL
  lines.push(`RÉSULTAT FISCAL${sep}${sep}`)
  lines.push(`Résultat fiscal${sep}${fmt(report.fiscalResult)}${sep}`)
  lines.push(`Base imposable${sep}${fmt(report.taxableBase)}${sep}`)
  lines.push(`Impôt estimé${sep}${fmt(report.taxEstimated)}${sep}TMI + PS`)
  lines.push('')

  // CASH-FLOW
  lines.push(`CASH-FLOW${sep}${sep}`)
  lines.push(`Cash-flow réel${sep}${fmt(report.cashFlowReal)}${sep}encaissé`)
  lines.push(`Cash-flow simulé${sep}${fmt(report.cashFlowSimulated)}${sep}prévu`)

  if (report.gaps.length > 0) {
    lines.push('')
    lines.push(`ALERTES${sep}${sep}`)
    for (const g of report.gaps) lines.push(`${esc(g)}${sep}${sep}`)
  }

  // BOM UTF-8 pour Excel FR (sinon caractères accentués cassés)
  return '﻿' + lines.join('\n')
}
