/**
 * Calcul des revenus de location courte duree (Airbnb / Booking / direct).
 *
 * Prend en compte :
 *  - la saisonnalite mensuelle (taux d'occupation + tarif nuit + jours bloques)
 *  - les commissions plateformes ponderees par leur part dans le mix
 *  - les frais factures au voyageur (revenus) vs ceux a charge du proprio
 *  - les charges operationnelles (menage, linge, conciergerie)
 *
 * Sortie : 12 lignes mensuelles + totaux annuels + KPIs hoteliers
 * (taux d'occupation effectif, RevPAN, tarif moyen pondere).
 */

export interface ShortTermSeasonalityEntry {
  /** Taux d'occupation specifique a ce mois (0-100). */
  occupancyRatePct: number
  /** Tarif nuit specifique a ce mois (sinon : tarif de base low). */
  nightlyRate?: number
  /** Jours bloques sur le mois (usage perso, travaux). */
  blockedDays?: number
}

export interface ShortTermRevenueParams {
  // Tarification
  nightlyRateLow:    number
  nightlyRateMid?:   number
  nightlyRateHigh?:  number

  // Occupation
  occupancyRatePct:  number
  avgStayNights:     number

  /** Saisonnalite mensuelle (1..12). Si absente : tarif et occupation uniformes. */
  seasonality?: Partial<Record<number, ShortTermSeasonalityEntry>>

  // Commissions et mix plateformes
  /** Commission Airbnb (% du CA voyageur). */
  platformAirbnbPct:  number
  /** Commission Booking (% du CA voyageur). */
  platformBookingPct: number
  /** Commission "autre" plateforme (Vrbo, Abritel…). */
  platformOtherPct?:  number

  /** Part du CA passant par Airbnb (0-100). */
  platformAirbnbMixPct:  number
  /** Part du CA passant par Booking (0-100). */
  platformBookingMixPct: number
  /** Part du CA en direct (0-100). */
  platformDirectMixPct:  number

  /** Frais menage refactures au voyageur (revenu). */
  cleaningFeePerStay:   number

  // Charges a charge du proprietaire
  cleaningCostPerStay:  number
  linenCostPerStay:     number
  /** Conciergerie : % du CA net (apres commission plateforme). */
  conciergeFeePct:      number
}

export interface MonthlyRevenue {
  month:                number   // 1-12
  daysAvailable:        number
  occupiedDays:         number
  nbStays:              number

  grossRevenueNights:   number   // tarif nuit x jours occupes
  grossRevenueCleaning: number   // frais menage x nb sejours
  grossRevenueTotal:    number

  platformCommission:   number
  netRevenue:           number   // apres commission plateforme

  cleaningCost:         number
  linenCost:            number
  conciergeFee:         number

  netOwnerRevenue:      number   // net proprio apres charges ope
}

export interface AnnualShortTermRevenue {
  monthly:                MonthlyRevenue[]

  // Totaux annuels
  totalDaysAvailable:     number
  totalOccupiedDays:      number
  totalNbStays:           number
  annualOccupancyPct:     number   // taux reel calcule

  grossRevenueTotal:        number
  platformCommissionTotal:  number
  netRevenueTotal:          number

  operationalCostsTotal:    number
  netOwnerRevenueTotal:     number

  // KPIs hoteliers
  revenuePerAvailableNight: number   // RevPAN
  avgNightlyRate:           number
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * Renvoie un tarif "par defaut" pour un mois donne quand la saisonnalite
 * n'est pas configuree explicitement.
 *
 * Heuristique simple (hemisphere nord) :
 *  - Hiver (dec-fev) : tarif low
 *  - Printemps (mar-mai) + automne (sep-nov) : tarif mid (sinon low)
 *  - Ete (jui-aou) : tarif high (sinon mid sinon low)
 */
function defaultNightlyRateForMonth(
  month: number,
  params: ShortTermRevenueParams,
): number {
  const { nightlyRateLow, nightlyRateMid, nightlyRateHigh } = params
  if (month >= 6 && month <= 8) {
    return nightlyRateHigh ?? nightlyRateMid ?? nightlyRateLow
  }
  if ((month >= 3 && month <= 5) || (month >= 9 && month <= 11)) {
    return nightlyRateMid ?? nightlyRateLow
  }
  return nightlyRateLow
}

/**
 * Commission plateforme effective ponderee par le mix de distribution.
 *
 * Ex : 60 % Airbnb (15 %) + 30 % Booking (15 %) + 10 % direct (0 %)
 *    = 0,60*15 + 0,30*15 + 0,10*0 = 13,5 %
 */
function effectivePlatformCommissionPct(params: ShortTermRevenueParams): number {
  const airbnb  = (params.platformAirbnbMixPct  / 100) * params.platformAirbnbPct
  const booking = (params.platformBookingMixPct / 100) * params.platformBookingPct
  const other   = (params.platformOtherPct ?? 0) > 0
    ? ((100 - params.platformAirbnbMixPct - params.platformBookingMixPct - params.platformDirectMixPct) / 100)
      * (params.platformOtherPct ?? 0)
    : 0
  return (airbnb + booking + other) / 100
}

export function computeShortTermRevenue(
  params: ShortTermRevenueParams,
): AnnualShortTermRevenue {
  const effCommission = effectivePlatformCommissionPct(params)
  const monthly: MonthlyRevenue[] = []

  for (let m = 1; m <= 12; m++) {
    const daysInMonth = DAYS_PER_MONTH[m - 1]!
    const season      = params.seasonality?.[m]

    const blockedDays   = Math.max(0, season?.blockedDays ?? 0)
    const daysAvailable = Math.max(0, daysInMonth - blockedDays)
    const occupancyRate = Math.min(100, Math.max(0,
      season?.occupancyRatePct ?? params.occupancyRatePct,
    )) / 100
    const nightlyRate   = season?.nightlyRate
      ?? defaultNightlyRateForMonth(m, params)

    const occupiedDays  = Math.round(daysAvailable * occupancyRate)
    const nbStays       = occupiedDays > 0
      ? Math.max(1, Math.round(occupiedDays / Math.max(1, params.avgStayNights)))
      : 0

    const grossNights    = occupiedDays * nightlyRate
    const grossCleaning  = nbStays * params.cleaningFeePerStay
    const grossTotal     = grossNights + grossCleaning

    const platformComm   = grossTotal * effCommission
    const netRevenue     = grossTotal - platformComm

    const cleaningCost   = nbStays * params.cleaningCostPerStay
    const linenCost      = nbStays * params.linenCostPerStay
    const conciergeFee   = netRevenue * (params.conciergeFeePct / 100)

    const netOwner = netRevenue - cleaningCost - linenCost - conciergeFee

    monthly.push({
      month: m,
      daysAvailable,
      occupiedDays,
      nbStays,
      grossRevenueNights:   grossNights,
      grossRevenueCleaning: grossCleaning,
      grossRevenueTotal:    grossTotal,
      platformCommission:   platformComm,
      netRevenue,
      cleaningCost,
      linenCost,
      conciergeFee,
      netOwnerRevenue:      netOwner,
    })
  }

  const sum = (key: keyof MonthlyRevenue): number =>
    monthly.reduce((s, m) => s + (m[key] as number), 0)

  const totalDaysAvailable = sum('daysAvailable')
  const totalOccupiedDays  = sum('occupiedDays')
  const grossRevenueTotal  = sum('grossRevenueTotal')
  const netRevenueTotal    = sum('netRevenue')
  const operationalCosts   = sum('cleaningCost') + sum('linenCost') + sum('conciergeFee')

  return {
    monthly,
    totalDaysAvailable,
    totalOccupiedDays,
    totalNbStays:             sum('nbStays'),
    annualOccupancyPct:       totalDaysAvailable > 0
      ? (totalOccupiedDays / totalDaysAvailable) * 100
      : 0,
    grossRevenueTotal,
    platformCommissionTotal:  sum('platformCommission'),
    netRevenueTotal,
    operationalCostsTotal:    operationalCosts,
    netOwnerRevenueTotal:     netRevenueTotal - operationalCosts,
    revenuePerAvailableNight: totalDaysAvailable > 0
      ? grossRevenueTotal / totalDaysAvailable
      : 0,
    avgNightlyRate:           totalOccupiedDays > 0
      ? sum('grossRevenueNights') / totalOccupiedDays
      : 0,
  }
}

/**
 * Construit un `ShortTermRevenueParams` depuis une ligne RealEstateLot DB.
 * Renvoie null si le lot n'est pas configure pour la courte duree
 * (rental_type != 'short_term' ou nightly_rate_low manquant).
 */
export function buildShortTermParamsFromLot(lot: {
  rental_type?:                string | null
  nightly_rate_low?:           number | null
  nightly_rate_mid?:           number | null
  nightly_rate_high?:          number | null
  occupancy_rate_pct?:         number | null
  avg_stay_nights?:            number | null
  cleaning_fee_per_stay?:      number | null
  platform_airbnb_pct?:        number | null
  platform_booking_pct?:       number | null
  platform_other_pct?:         number | null
  platform_airbnb_mix_pct?:    number | null
  platform_booking_mix_pct?:   number | null
  platform_direct_mix_pct?:    number | null
  concierge_fee_pct?:          number | null
  cleaning_cost_per_stay?:     number | null
  linen_cost_per_stay?:        number | null
  seasonality_coefficients?:   Record<string, ShortTermSeasonalityEntry> | null
}): ShortTermRevenueParams | null {
  if (lot.rental_type !== 'short_term' && lot.rental_type !== 'mixed') return null
  if (lot.nightly_rate_low == null) return null

  const seasonality: Record<number, ShortTermSeasonalityEntry> = {}
  if (lot.seasonality_coefficients) {
    for (const [k, v] of Object.entries(lot.seasonality_coefficients)) {
      const m = Number(k)
      if (Number.isInteger(m) && m >= 1 && m <= 12 && v) seasonality[m] = v
    }
  }

  return {
    nightlyRateLow:       lot.nightly_rate_low,
    nightlyRateMid:       lot.nightly_rate_mid       ?? undefined,
    nightlyRateHigh:      lot.nightly_rate_high      ?? undefined,
    occupancyRatePct:     lot.occupancy_rate_pct     ?? 70,
    avgStayNights:        lot.avg_stay_nights        ?? 3,
    seasonality:          Object.keys(seasonality).length > 0 ? seasonality : undefined,
    platformAirbnbPct:    lot.platform_airbnb_pct    ?? 15,
    platformBookingPct:   lot.platform_booking_pct   ?? 15,
    platformOtherPct:     lot.platform_other_pct     ?? 0,
    platformAirbnbMixPct: lot.platform_airbnb_mix_pct  ?? 60,
    platformBookingMixPct:lot.platform_booking_mix_pct ?? 30,
    platformDirectMixPct: lot.platform_direct_mix_pct  ?? 10,
    cleaningFeePerStay:   lot.cleaning_fee_per_stay  ?? 0,
    cleaningCostPerStay:  lot.cleaning_cost_per_stay ?? 0,
    linenCostPerStay:     lot.linen_cost_per_stay    ?? 0,
    conciergeFeePct:      lot.concierge_fee_pct      ?? 0,
  }
}
