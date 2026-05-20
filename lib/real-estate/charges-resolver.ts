/**
 * Résolution des charges immobilières.
 *
 * Une partie des charges peut être exprimée soit en € (montant fixe annuel)
 * soit en % des loyers HC annuels (GLI, frais d'agence). Ce helper résout
 * tout en € pour alimenter les calculatrices fiscales aval.
 *
 * Convention :
 *  - Si le champ `*_pct` > 0 : prévaut sur le `*_eur` correspondant
 *  - Sinon : on prend le `*_eur` directement
 *
 * Pure fonction — testable isolément.
 */

export interface RawChargesRow {
  // Migration 001 (existant)
  taxe_fonciere?:           number | null
  insurance?:               number | null   // = PNO
  accountant?:              number | null
  cfe?:                     number | null
  condo_fees?:              number | null   // = courantes
  maintenance?:             number | null   // = routine
  other?:                   number | null
  // Migration 040 (nouvelles)
  taxe_habitation?:         number | null
  taxe_logements_vacants?:  number | null
  teom?:                    number | null
  insurance_gli_eur?:       number | null
  insurance_gli_pct?:       number | null
  insurance_mrh?:           number | null
  condo_fees_works?:        number | null
  condo_special_fund?:      number | null
  management_agency_eur?:   number | null
  management_agency_pct?:   number | null
  management_airbnb_pct?:   number | null
  management_booking_pct?:  number | null
  management_cleaning?:     number | null
  management_concierge?:    number | null
  maintenance_major?:       number | null
  repairs_provision?:       number | null
  legal_fees?:              number | null
  diagnostics_fees?:        number | null
  utilities_internet?:      number | null
  utilities_electricity?:   number | null
  utilities_water?:         number | null
}

export interface ResolvedCharges {
  /** Totaux par catégorie (€/an). */
  taxesLocalesTotal:     number
  assurancesTotal:       number
  coproTotal:            number
  gestionTotal:          number
  travauxTotal:          number
  professionalTotal:     number
  utilitiesTotal:        number
  otherTotal:            number

  /** Détail GLI résolu (€/an, qu'elle soit issue de % ou de fixe). */
  gliResolvedEur:        number
  /** Détail frais agence résolu (€/an). */
  agencyFeesResolvedEur: number

  /** Total annuel toutes catégories confondues. */
  totalAnnualEur:        number
}

const num = (v: number | null | undefined): number => Math.max(0, v ?? 0)

/**
 * @param charges      Ligne `property_charges` (peut être incomplète).
 * @param annualRentHC Loyer annuel HC réel — utilisé pour convertir les % en €.
 */
export function resolveCharges(
  charges:      RawChargesRow | null | undefined,
  annualRentHC: number,
): ResolvedCharges {
  const c = charges ?? {}
  const annual = Math.max(0, annualRentHC)

  // GLI : si pct > 0 → prévaut sur le montant fixe
  const gliResolvedEur = num(c.insurance_gli_pct) > 0
    ? annual * num(c.insurance_gli_pct) / 100
    : num(c.insurance_gli_eur)

  // Frais agence : si pct > 0 → prévaut
  const agencyFeesResolvedEur = num(c.management_agency_pct) > 0
    ? annual * num(c.management_agency_pct) / 100
    : num(c.management_agency_eur)

  // Plateformes courte durée (toujours en %)
  const airbnbFees  = annual * num(c.management_airbnb_pct)  / 100
  const bookingFees = annual * num(c.management_booking_pct) / 100

  const taxesLocalesTotal = num(c.taxe_fonciere) + num(c.taxe_habitation)
                          + num(c.taxe_logements_vacants) + num(c.teom)

  const assurancesTotal = num(c.insurance) + gliResolvedEur + num(c.insurance_mrh)

  const coproTotal = num(c.condo_fees) + num(c.condo_fees_works) + num(c.condo_special_fund)

  const gestionTotal = agencyFeesResolvedEur + airbnbFees + bookingFees
                     + num(c.management_cleaning) + num(c.management_concierge)

  const travauxTotal = num(c.maintenance) + num(c.maintenance_major) + num(c.repairs_provision)

  const professionalTotal = num(c.accountant) + num(c.cfe)
                          + num(c.legal_fees) + num(c.diagnostics_fees)

  const utilitiesTotal = num(c.utilities_internet) + num(c.utilities_electricity)
                       + num(c.utilities_water)

  const otherTotal = num(c.other)

  const totalAnnualEur =
    taxesLocalesTotal + assurancesTotal + coproTotal + gestionTotal +
    travauxTotal + professionalTotal + utilitiesTotal + otherTotal

  return {
    taxesLocalesTotal,
    assurancesTotal,
    coproTotal,
    gestionTotal,
    travauxTotal,
    professionalTotal,
    utilitiesTotal,
    otherTotal,
    gliResolvedEur,
    agencyFeesResolvedEur,
    totalAnnualEur,
  }
}
