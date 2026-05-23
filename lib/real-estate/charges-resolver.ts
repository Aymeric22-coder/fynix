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

/** V6 — Options de résolution des charges. */
export interface ResolveChargesOptions {
  /**
   * Quand `true`, les 4 postes spécifiques à la location courte durée
   * (`management_airbnb_pct`, `management_booking_pct`, `management_cleaning`,
   * `management_concierge`) sont traités comme 0 dans `gestionTotal`.
   *
   * Pourquoi : pour un lot `short_term`/`mixed`, le revenu mensuel équivalent
   * (`computeMonthlyRentForLot`) est déjà calculé NET des commissions
   * plateformes + frais opérationnels (cf. `computeShortTermRevenue` →
   * `netOwnerRevenueTotal`). Si l'utilisateur saisit aussi ces 4 colonnes
   * dans `property_charges`, on les déduirait une 2ᵉ fois → double comptage
   * (BUG-001 de l'audit, ~12 k€/an d'écart sur un Airbnb à 50 k€).
   *
   * Limite connue : si un lot short_term n'a PAS ses commissions saisies au
   * niveau lot (`platform_*_pct = null/0`) mais que l'utilisateur saisit les
   * commissions UNIQUEMENT dans `property_charges`, cette option les
   * zéroterait → sous-estimation. Le formulaire UI court terme doit pousser
   * la saisie au niveau lot (pratique correcte) ; ce cas est marginal.
   *
   * Default `false` (rétro-compat : tous les frais comptés).
   */
  excludeShortTermPlatformFees?: boolean
}

/**
 * @param charges      Ligne `property_charges` (peut être incomplète).
 * @param annualRentHC Loyer annuel HC réel — utilisé pour convertir les % en €.
 * @param opts         Options (cf. {@link ResolveChargesOptions}).
 */
export function resolveCharges(
  charges:      RawChargesRow | null | undefined,
  annualRentHC: number,
  opts:         ResolveChargesOptions = {},
): ResolvedCharges {
  const c = charges ?? {}
  const annual = Math.max(0, annualRentHC)
  const stripShortTermFees = opts.excludeShortTermPlatformFees === true

  // GLI : si pct > 0 → prévaut sur le montant fixe
  const gliResolvedEur = num(c.insurance_gli_pct) > 0
    ? annual * num(c.insurance_gli_pct) / 100
    : num(c.insurance_gli_eur)

  // Frais agence : si pct > 0 → prévaut. NB : `management_agency_pct` est la
  // gestion locative classique (long terme), pas une commission plateforme —
  // on la conserve même en mode short-term (ex. un mandat de gestion local
  // peut coexister avec Airbnb pour la sous-location courte durée).
  const agencyFeesResolvedEur = num(c.management_agency_pct) > 0
    ? annual * num(c.management_agency_pct) / 100
    : num(c.management_agency_eur)

  // Plateformes courte durée (toujours en %). En mode strip, zéroées
  // pour éviter le double comptage (cf. ResolveChargesOptions).
  const airbnbFees  = stripShortTermFees ? 0 : annual * num(c.management_airbnb_pct)  / 100
  const bookingFees = stripShortTermFees ? 0 : annual * num(c.management_booking_pct) / 100
  // Ménage + conciergerie : idem, déjà déduits dans netOwnerRevenueTotal au
  // niveau lot pour les biens short_term.
  const cleaningFee   = stripShortTermFees ? 0 : num(c.management_cleaning)
  const conciergeFee  = stripShortTermFees ? 0 : num(c.management_concierge)

  const taxesLocalesTotal = num(c.taxe_fonciere) + num(c.taxe_habitation)
                          + num(c.taxe_logements_vacants) + num(c.teom)

  const assurancesTotal = num(c.insurance) + gliResolvedEur + num(c.insurance_mrh)

  const coproTotal = num(c.condo_fees) + num(c.condo_fees_works) + num(c.condo_special_fund)

  const gestionTotal = agencyFeesResolvedEur + airbnbFees + bookingFees
                     + cleaningFee + conciergeFee

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
