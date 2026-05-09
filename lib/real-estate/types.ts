/**
 * Types pour le module de simulation immobilière.
 * Tout est pur, sans dépendance UI ni DB. Sérialisable.
 */

// ─────────────────────────────────────────────────────────────────────
//  Régimes fiscaux (union discriminée)
// ─────────────────────────────────────────────────────────────────────

export type FiscalRegimeKind =
  | 'sci_is'
  | 'sci_ir'
  | 'lmnp_reel'
  | 'lmnp_micro'
  | 'lmp'
  | 'foncier_nu'      // foncier réel
  | 'foncier_micro'

export const FISCAL_REGIME_LABELS: Record<FiscalRegimeKind, string> = {
  sci_is:        'SCI à l’IS',
  sci_ir:        'SCI à l’IR',
  lmnp_reel:     'LMNP réel',
  lmnp_micro:    'LMNP micro-BIC',
  lmp:           'LMP',
  foncier_nu:    'Foncier réel',
  foncier_micro: 'Micro-foncier',
}

/**
 * Paramètres communs aux régimes "réels" (déduction de charges, amortissements).
 */
export interface RealRegimeParams {
  /** Part du prix d’acquisition imputable au terrain (non amortissable). En %, ex 15 */
  landSharePct:           number
  /** Durée d’amortissement du bâti (hors terrain). En années */
  amortBuildingYears:     number
  /** Durée d’amortissement des travaux. En années */
  amortWorksYears:        number
  /** Durée d’amortissement du mobilier (LMNP/LMP uniquement). En années */
  amortFurnitureYears:    number
  /** Montant du mobilier amorti (LMNP/LMP). Optionnel, défaut 0 */
  furnitureAmount?:       number
  /**
   * Traitement des frais d’acquisition (notaire + bancaires + garantie) :
   *  - 'expense_y1'  → passés en charges année 1 (génère du déficit)
   *  - 'amortized'   → intégrés au coût d’acquisition et amortis comme le bâti
   * Pour foncier_nu : frais NON déductibles (le réglage est ignoré).
   */
  acquisitionFeesTreatment: 'expense_y1' | 'amortized'
}

export interface FiscalRegimeSciIs extends RealRegimeParams {
  kind: 'sci_is'
}

export interface FiscalRegimeSciIr {
  kind:        'sci_ir'
  /** TMI de l’associé en %, ex 30 */
  tmiPct:      number
}

export interface FiscalRegimeLmnpReel extends RealRegimeParams {
  kind:        'lmnp_reel'
  tmiPct:      number
}

export interface FiscalRegimeLmnpMicro {
  kind:        'lmnp_micro'
  tmiPct:      number
  /** 50 % standard, 71 % pour meublé de tourisme classé */
  abattementPct: number
}

export interface FiscalRegimeLmp extends RealRegimeParams {
  kind:        'lmp'
  tmiPct:      number
  /** Taux indicatif des cotisations SSI sur le résultat positif. Défaut 35 */
  ssiRatePct:  number
}

export interface FiscalRegimeFoncierNu {
  kind:        'foncier_nu'
  tmiPct:      number
}

export interface FiscalRegimeFoncierMicro {
  kind:        'foncier_micro'
  tmiPct:      number
}

export type FiscalRegime =
  | FiscalRegimeSciIs
  | FiscalRegimeSciIr
  | FiscalRegimeLmnpReel
  | FiscalRegimeLmnpMicro
  | FiscalRegimeLmp
  | FiscalRegimeFoncierNu
  | FiscalRegimeFoncierMicro

// ─────────────────────────────────────────────────────────────────────
//  Bien immobilier (input simulation)
// ─────────────────────────────────────────────────────────────────────

export interface PropertyInput {
  /** Prix d’acquisition hors frais */
  purchasePrice:          number
  /** Frais de notaire */
  notaryFees:             number
  /** Coût des travaux */
  worksAmount:            number
  /** Valeur estimée actuelle du bien (si différente du prix d’acquisition + travaux) */
  currentEstimatedValue?: number
  /** Indexation annuelle de la valeur du bien (en %) */
  propertyIndexPct:       number
}

// ─────────────────────────────────────────────────────────────────────
//  Emprunt (optionnel — achat cash possible)
// ─────────────────────────────────────────────────────────────────────

export interface LoanInput {
  /** Montant emprunté. Si 0 ou non fourni → pas de crédit */
  principal:        number
  /** Taux annuel nominal (%, ex 3.76) */
  annualRatePct:    number
  /** Durée en années */
  durationYears:    number
  /** Taux annuel de l’assurance emprunteur (%, ex 0.2) calculé sur le capital initial */
  insuranceRatePct: number
  /** Frais de dossier banque */
  bankFees:         number
  /** Frais de garantie (hypothèque/caution) */
  guaranteeFees:    number
  /**
   * Date de début du crédit. Optionnel — si absent on considère "à la date de simulation".
   * Utilisé pour calculer le capital restant dû à date.
   */
  startDate?:       Date
  /** Type d’amortissement. Phase 1 : seul 'constant' est supporté (échéances constantes). */
  amortizationType?: 'constant' | 'linear' | 'in_fine'
}

// ─────────────────────────────────────────────────────────────────────
//  Charges et revenus
// ─────────────────────────────────────────────────────────────────────

export interface RentInput {
  /** Loyer mensuel total brut (somme des lots) */
  monthlyRent:        number
  /** Vacance locative en mois équivalent par an (ex 0.3 = ~9 jours) */
  vacancyMonths:      number
  /** Indexation annuelle des loyers (IRL) en % */
  rentalIndexPct:     number
}

export interface ChargesInput {
  /** Assurance PNO annuelle */
  pno:                number
  /** GLI en % des loyers nets */
  gliPct:             number
  /** Taxe foncière annuelle */
  propertyTax:        number
  /** CFE annuelle (LMNP/LMP/SCI) */
  cfe:                number
  /** Comptable / expert-comptable annuel */
  accountant:         number
  /** Charges de copropriété non récupérables (annuelles) */
  condoFees:          number
  /** Frais de gestion locative en % des loyers */
  managementPct:      number
  /** Provisions travaux et entretien (annuelles) */
  maintenance:        number
  /** Autres charges annuelles */
  other:              number
  /** Indexation annuelle des charges en % */
  chargesIndexPct:    number
}

// ─────────────────────────────────────────────────────────────────────
//  Sortie : amortissement
// ─────────────────────────────────────────────────────────────────────

export interface AmortizationMonth {
  monthIndex:        number     // 1, 2, ... n
  payment:           number     // capital + intérêts (hors assurance)
  interest:          number
  principal:         number     // capital remboursé
  insurance:         number     // assurance fixe sur capital initial
  remainingCapital:  number     // après cette mensualité
}

export interface AmortizationYear {
  year:              number     // 1, 2, ...
  totalPayment:      number     // somme mensualités (capital + intérêts) — hors assurance
  interest:          number     // somme intérêts dans l’année
  principal:         number     // somme capital remboursé dans l’année
  insurance:         number     // somme assurance dans l’année
  remainingCapital:  number     // capital restant dû en fin d’année
}

export interface AmortizationSchedule {
  monthlyPayment:    number     // mensualité crédit (hors assurance)
  monthlyInsurance:  number     // assurance mensuelle (constante)
  totalMonthly:      number     // monthlyPayment + monthlyInsurance
  totalInterest:     number
  totalCost:         number     // somme des paiements
  months:            AmortizationMonth[]
  years:             AmortizationYear[]
}

// ─────────────────────────────────────────────────────────────────────
//  Sortie : projection annuelle
// ─────────────────────────────────────────────────────────────────────

export interface ProjectionYear {
  year:              number
  // Exploitation
  grossRent:         number     // loyers bruts
  vacancy:           number     // perte vacance (positif = montant perdu)
  netRent:           number     // loyers encaissés
  charges:           number     // total charges (hors crédit)
  // Crédit
  interest:          number
  principalRepaid:   number
  insurance:         number
  loanPayment:       number     // intérêts + capital + assurance
  // Fiscal
  amortizations:     number     // amortissements comptables (régimes réels)
  fiscalResult:      number     // résultat fiscal de l’année (peut être négatif)
  taxableBase:       number     // base imposable après imputation des déficits
  taxPaid:           number     // IS / IR + PS / SSI selon régime
  // Cash flow
  cashFlowBeforeTax: number     // (loyers nets) − charges − mensualité crédit
  cashFlowAfterTax:  number     // cashFlowBeforeTax − taxPaid
  cumulativeCashFlow: number    // cumul depuis le début (apport en négatif au départ)
  // Patrimoine
  remainingCapital:   number    // capital restant dû en fin d’année
  estimatedValue:     number    // valeur estimée du bien en fin d’année (avec indexation)
  netPropertyValue:   number    // estimatedValue − remainingCapital
}

// ─────────────────────────────────────────────────────────────────────
//  KPIs (cards en haut de page)
// ─────────────────────────────────────────────────────────────────────

export interface PropertyKPIs {
  totalCost:                number   // coût total opération
  borrowedAmount:           number   // montant emprunté
  downPayment:              number   // apport
  monthlyPayment:           number   // mensualité totale (capital + intérêts + assurance)
  monthlyInsurance:         number
  // Rentabilités
  grossYieldOnPrice:        number   // loyers annuels bruts / prix d’acquisition
  grossYieldFAI:            number   // loyers annuels bruts / coût total opération
  netYield:                 number   // (loyers nets − charges) / coût total opération
  netNetYield:              number   // CF après impôt + capital remboursé / coût total opération
  // Cash flow année 1
  monthlyCashFlowYear1:     number
  annualCashFlowYear1:      number
  // Patrimoine
  currentNetPropertyValue:  number   // valeur estimée actuelle − capital restant dû à date
  leverageRatio:            number   // valeur nette / apport
  // Année de retour sur apport (cumul ≥ 0). null si jamais.
  paybackYear:              number | null
}

// ─────────────────────────────────────────────────────────────────────
//  Container global (input complet pour la simulation)
// ─────────────────────────────────────────────────────────────────────

export interface SimulationInput {
  property:        PropertyInput
  loan?:           LoanInput        // optionnel : achat cash possible
  rent:            RentInput
  charges:         ChargesInput
  regime:          FiscalRegime
  /** Apport personnel (pour cumul cash flow et levier) */
  downPayment:     number
  /**
   * Horizon de projection en années. Si non fourni : max(loan.durationYears, 25).
   * Si pas de prêt : 25 par défaut.
   */
  horizonYears?:   number
  /** Date de simulation (défaut : aujourd’hui). Sert au calcul du capital restant dû à date. */
  simulationDate?: Date
}

export interface SimulationResult {
  amortization:    AmortizationSchedule | null  // null si pas de prêt
  projection:      ProjectionYear[]
  kpis:            PropertyKPIs
}
