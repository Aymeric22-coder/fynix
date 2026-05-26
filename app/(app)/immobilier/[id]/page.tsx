import { Metadata } from 'next'
import { notFound }   from 'next/navigation'
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Home, Banknote, Receipt, TrendingUp, FileSpreadsheet, Activity, AlertTriangle, Sparkles, Pencil } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }     from '@/components/shared/page-header'
import { Badge }          from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/shared/confidence-badge'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { PropertyLotActions, PropertyValuationActions } from '@/components/pages/property-detail-actions'
import { LotEditButton } from '@/components/pages/lot-edit-button'
import { SimulationPanel } from '@/components/real-estate/simulation-panel'
import { SeasonalityChart } from '@/components/real-estate/seasonality-chart'
import { WhatIfSimulator } from '@/components/real-estate/what-if-simulator'
import { computeShortTermKpisForProperty } from '@/lib/real-estate/short-term/kpis'
import { RegimeComparator } from '@/components/real-estate/regime-comparator'
import { SciDistribution } from '@/components/real-estate/sci-distribution'
import { IncentiveTabContent, type IncentiveRow } from '@/components/real-estate/incentives/incentive-tab'
import { buildIncentiveReductionPerYear } from '@/lib/real-estate/fiscal/incentives/reduction-schedule'
import { DeletePropertyButton } from '@/components/real-estate/delete-property-button'
import { ExportPdfButton } from '@/components/real-estate/export-pdf-button'
import { ChargesForm } from '@/components/real-estate/charges-form'
import { TaxReductionDecomposition } from '@/components/real-estate/tax-reduction-decomposition'
import { RealTrackingPanel } from '@/components/real-estate/real-tracking-panel'
import { WizardWarningBanner, type WizardWarningKind } from '@/components/real-estate/wizard-warning-banner'
// ActualVsSimulation / DriftAlerts / RevisedForecastSection : conservés en code
// mais désactivés dans l'UI (le nouveau RealTrackingPanel remplace tout).
// YearEndReportPanel reste utilisé pour les bilans des années passées.
import { YearEndReportPanel } from '@/components/real-estate/year-end-report-panel'
import { CreditTab } from '@/components/real-estate/credit-tab'
import { MultiCreditList } from '@/components/real-estate/multi-credit-list'
import { UnderRentAlerts } from '@/components/real-estate/under-rent-alerts'
import { detectUnderRentAlerts } from '@/lib/real-estate/under-rent'
import { AmortizationTable } from '@/components/real-estate/amortization-table'
import type { ExistingCredit } from '@/components/real-estate/credit-form'
import { loadActualData } from '@/lib/real-estate/actual'
import { compareActualToSimulation } from '@/lib/real-estate/compare'
import { buildYearEndReport } from '@/lib/real-estate/year-end-report'
import { buildAmortizationSchedule, computeRemainingCapitalAt } from '@/lib/real-estate/amortization'
import { aggregateLoans } from '@/lib/real-estate/multi-credit'
import { LOAN_KIND_LABELS, type LoanKind } from '@/types/database.types'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import { InfoTip } from '@/components/ui/info-tip'
import { LEXIQUE } from '@/lib/real-estate/lexique'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import type { LoanInput } from '@/lib/real-estate/types'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from '@/lib/real-estate/build-from-db'
import type { RealEstateProperty, PropertyUsageType } from '@/types/database.types'
import { isRentalUsage } from '@/types/database.types'

export const metadata: Metadata = { title: 'Détail bien' }

type Props = {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ warn?: string }>
}

const VALID_WIZARD_WARNINGS = ['credit', 'lots'] as const satisfies readonly WizardWarningKind[]

export default async function ImmobilierDetailPage({ params, searchParams }: Props) {
  const { id }   = await params
  const { warn } = await searchParams

  const wizardWarnings: WizardWarningKind[] = (warn ?? '')
    .split(',')
    .map(s => s.trim())
    .filter((w): w is WizardWarningKind =>
      (VALID_WIZARD_WARNINGS as readonly string[]).includes(w),
    )
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Bien immobilier complet ──────────────────────────────────────────────
  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id (*),
      lots:real_estate_lots (*),
      valuations:property_valuations ( id, valuation_date, value, price_per_m2, source, confidence ),
      charges:property_charges (*)
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .order('valuation_date', { referencedTable: 'valuations', ascending: false })
    .single()

  if (!prop) notFound()

  // Le client Supabase n'étant pas typé via le générique `Database`, `prop`
  // ressort en `any`. On l'aligne ici sur le type généré dans
  // types/database.types.ts (toutes les colonnes des migrations 005 et 006
  // y sont présentes) pour éliminer les casts `Record<string, unknown>`.
  const propTyped = prop as RealEstateProperty & typeof prop

  // Migration 033 : type d'usage du bien (résidence principale / secondaire /
  // locatif). Fallback `long_term_rental` pour les biens existants avant la
  // migration ou pour les rangs où la colonne n'est pas encore présente.
  const usageType: PropertyUsageType =
    (propTyped.usage_type as PropertyUsageType | undefined) ?? 'long_term_rental'
  const isRental    = isRentalUsage(usageType)
  const isPrimaryRP = usageType === 'primary_residence'

  // ── Dispositif fiscal (migration 038 — Pinel / Denormandie / MH / LocAv) ──
  const { data: incentiveRow } = await supabase
    .from('property_tax_incentives')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  // ── Crédits liés à cet asset (migration 034 : multi-crédit possible) ────
  // Note : on utilise select('*') plutôt que de lister les colonnes
  // explicitement, pour tolérer un environnement où les migrations 006
  // et 034 ne sont pas encore appliquées (loan_kind / insurance_base /
  // quotite / guarantee_type seront undefined, gérés par les ?? defaults).
  const { data: debtsRows } = await supabase
    .from('debts')
    .select('*')
    .eq('asset_id', prop.asset_id)
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  // Pour rétrocompat avec le code existant : on prend le "premier" crédit
  // comme crédit principal (typiquement le prêt principal). Le reste des
  // crédits est utilisé pour l'agrégation multi-prêt côté affichage.
  const allDebts = debtsRows ?? []
  const debtRow  = allDebts.find(d => (d.loan_kind ?? 'principal') === 'principal')
                ?? allDebts[0]
                ?? null

  // ── Profil utilisateur (TMI) ─────────────────────────────────────────────
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('tmi_rate')
    .eq('id', user!.id)
    .maybeSingle()

  // ── Charges de l'année courante ──────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const lots        = prop.lots ?? []
  const chargesAll  = prop.charges ?? []
  const charges     = chargesAll.find((c: { year: number }) => c.year === currentYear) ?? null

  // ── Calculs affichage ────────────────────────────────────────────────────
  // V6 — `monthlyRents` est conservé pour RealTrackingPanel (qui s'attend au
  // loyer brut perçu basé sur les lots loués). Les KPIs financiers de la
  // Synthèse (charges, rendements brut/net, cash-flow) sont désormais lus
  // depuis `simResult` plus bas pour garantir la cohérence avec la carte
  // de la liste et l'onglet Rentabilité (« le même chiffre partout »).
  const monthlyRents = lots
    .filter((l: { status: string }) => l.status === 'rented')
    .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0)
  // Conservé pour le dispositif fiscal (Pinel / Loc'Avantages) qui a
  // besoin du loyer annuel HC pour vérifier l'éligibilité (plafond €/m²).
  const annualRents = monthlyRents * 12
  // Prix de revient total — utilisé pour la plus-value latente (acqCost
  // complet incluant mobilier + frais bancaires/garantie). Note : pour les
  // rendements, on lit désormais `kpis.grossYieldFAI` / `kpis.netYield` du
  // moteur (dénominateur cohérent = kpis.totalCost).
  const acqCost =
    (prop.purchase_price ?? 0)
    + (prop.purchase_fees ?? 0)
    + (prop.works_amount  ?? 0)
    + (propTyped.furniture_amount ?? 0)
    + (debtRow?.bank_fees      ?? 0)
    + (debtRow?.guarantee_fees ?? 0)
  const currentVal  = prop.asset?.current_value ?? 0
  const latentGain  = currentVal - acqCost
  const latentPct   = acqCost > 0 ? (latentGain / acqCost) * 100 : 0

  const LOT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
    rented:         { label: 'Loué',    variant: 'success' },
    vacant:         { label: 'Vacant',  variant: 'warning' },
    owner_occupied: { label: 'Occupé',  variant: 'info' },
    works:          { label: 'Travaux', variant: 'muted' },
  }

  // ── Données typées pour SimulationPanel ─────────────────────────────────
  // Toutes les colonnes des migrations 005 / 006 sont déjà déclarées dans
  // RealEstateProperty (types/database.types.ts). On accède directement via
  // `propTyped` sans cast individuel.
  const dbProperty: DbProperty = {
    purchase_price:               propTyped.purchase_price,
    purchase_fees:                propTyped.purchase_fees,
    works_amount:                 propTyped.works_amount,
    furniture_amount:             propTyped.furniture_amount ?? 0,
    fiscal_regime:                propTyped.fiscal_regime,
    rental_index_pct:             propTyped.rental_index_pct ?? 2.0,
    charges_index_pct:            propTyped.charges_index_pct ?? 2.0,
    property_index_pct:           propTyped.property_index_pct ?? 1.0,
    land_share_pct:               propTyped.land_share_pct ?? 15,
    amort_building_years:         propTyped.amort_building_years ?? 30,
    amort_works_years:            propTyped.amort_works_years ?? 15,
    amort_furniture_years:        propTyped.amort_furniture_years ?? 7,
    gli_pct:                      propTyped.gli_pct ?? 0,
    management_pct:               propTyped.management_pct ?? 0,
    vacancy_months:               propTyped.vacancy_months ?? 0,
    lmp_ssi_rate:                 propTyped.lmp_ssi_rate ?? 35,
    acquisition_fees_treatment:   propTyped.acquisition_fees_treatment ?? 'expense_y1',
    lmnp_micro_abattement_pct:    propTyped.lmnp_micro_abattement_pct ?? 50,
    assumed_total_rent:           propTyped.assumed_total_rent ?? null,
  }

  const dbAsset: DbAsset | null = prop.asset ? { current_value: prop.asset.current_value } : null

  const dbLots: DbLot[] = lots.map((l: Record<string, unknown>) => ({
    rent_amount: (l.rent_amount as number | null) ?? null,
    status:      l.status as string | undefined,
    // ── Migration 042 — Courte durée (preserves les colonnes courte durée) ──
    rental_type:              l.rental_type as string | null | undefined,
    nightly_rate_low:         l.nightly_rate_low as number | null | undefined,
    nightly_rate_mid:         l.nightly_rate_mid as number | null | undefined,
    nightly_rate_high:        l.nightly_rate_high as number | null | undefined,
    occupancy_rate_pct:       l.occupancy_rate_pct as number | null | undefined,
    cleaning_fee_per_stay:    l.cleaning_fee_per_stay as number | null | undefined,
    avg_stay_nights:          l.avg_stay_nights as number | null | undefined,
    platform_airbnb_pct:      l.platform_airbnb_pct as number | null | undefined,
    platform_booking_pct:     l.platform_booking_pct as number | null | undefined,
    platform_other_pct:       l.platform_other_pct as number | null | undefined,
    platform_airbnb_mix_pct:  l.platform_airbnb_mix_pct as number | null | undefined,
    platform_booking_mix_pct: l.platform_booking_mix_pct as number | null | undefined,
    platform_direct_mix_pct:  l.platform_direct_mix_pct as number | null | undefined,
    concierge_fee_pct:        l.concierge_fee_pct as number | null | undefined,
    cleaning_cost_per_stay:   l.cleaning_cost_per_stay as number | null | undefined,
    linen_cost_per_stay:      l.linen_cost_per_stay as number | null | undefined,
    seasonality_coefficients: l.seasonality_coefficients as DbLot['seasonality_coefficients'],
  }))

  // KPIs courte duree agreges (utilise pour afficher SeasonalityChart)
  const shortTermKpis = computeShortTermKpisForProperty(dbLots)

  const dbCharges: DbCharges | null = charges ? {
    taxe_fonciere: charges.taxe_fonciere,
    insurance:     charges.insurance,
    accountant:    charges.accountant,
    cfe:           charges.cfe,
    condo_fees:    charges.condo_fees,
    maintenance:   charges.maintenance,
    other:         charges.other,
  } : null

  // V3.1 — Multi-crédit : on transmet TOUS les crédits actifs aux composants
  // SimulationPanel / WhatIfSimulator. Pour un bien mono-crédit, ce tableau
  // a 1 élément et les KPIs sont strictement identiques à l'ancien chemin
  // (cf. multi-credit-consistency.test.ts).
  const allDbDebts: DbDebt[] = allDebts.map(d => ({
    initial_amount:    d.initial_amount,
    interest_rate:     d.interest_rate,
    insurance_rate:    d.insurance_rate,
    duration_months:   d.duration_months,
    start_date:        d.start_date,
    bank_fees:         d.bank_fees ?? 0,
    guarantee_fees:    d.guarantee_fees ?? 0,
    amortization_type: d.amortization_type ?? 'constant',
    deferral_type:     d.deferral_type     ?? 'none',
    deferral_months:   d.deferral_months   ?? 0,
    insurance_base:    d.insurance_base    ?? 'capital_initial',
    insurance_quotite: d.insurance_quotite ?? 100,
    guarantee_type:    d.guarantee_type    ?? 'caution',
    loan_kind:         d.loan_kind         ?? 'principal',
  }))

  const dbProfile: DbProfile | null = profileRow ? { tmi_rate: profileRow.tmi_rate } : null

  // ── Crédit "shape ExistingCredit" pour CreditTab ────────────────────────
  const creditForTab: ExistingCredit | null = debtRow ? {
    id:                 debtRow.id,
    name:               debtRow.name ?? 'Crédit',
    lender:             debtRow.lender,
    loan_kind:          (debtRow.loan_kind ?? 'principal') as LoanKind,
    initial_amount:     debtRow.initial_amount,
    interest_rate:      debtRow.interest_rate,
    insurance_rate:     debtRow.insurance_rate ?? 0,
    duration_months:    debtRow.duration_months,
    start_date:         debtRow.start_date,
    deferral_type:      (debtRow.deferral_type     ?? 'none') as 'none' | 'partial' | 'total',
    deferral_months:    debtRow.deferral_months   ?? 0,
    bank_fees:          debtRow.bank_fees         ?? 0,
    guarantee_fees:     debtRow.guarantee_fees    ?? 0,
    amortization_type:  (debtRow.amortization_type ?? 'constant') as 'constant' | 'linear' | 'in_fine',
    insurance_base:     (debtRow.insurance_base    ?? 'capital_initial') as 'capital_initial' | 'capital_remaining',
    insurance_quotite:  debtRow.insurance_quotite ?? 100,
    guarantee_type:     (debtRow.guarantee_type    ?? 'caution') as 'hypotheque' | 'caution' | 'ppd' | 'autre',
    notes:              debtRow.notes,
  } : null

  // ── Multi-crédit (migration 034 / V3.2) ─────────────────────────────────
  // Note V3.2 : l'ancien `loanForCalc` (crédit principal seul, utilisé pour
  // le tableau d'amortissement mono et RegimeComparator mono) a été
  // supprimé. Tous les consommateurs passent désormais par enrichedLoans /
  // allLoansForCalc / multiCredit.
  // On enrichit chaque crédit avec son schedule, sa mensualité totale
  // (capital + intérêts + assurance) et son CRD à date — tous calculés via
  // `buildAmortizationSchedule` / `computeRemainingCapitalAt`. Cette structure
  // unifiée alimente :
  //   - MultiCreditList (monthly + CRD par ligne, cohérents avec l'agrégat)
  //   - AmortizationTable (onglets multi : Tous + un par crédit)
  //   - aggregateLoans (somme des schedules → multiCredit.totalMonthly etc.)
  //
  // Garantie : `sum(enrichedLoans[i].monthly) === multiCredit.totalMonthly`
  // (cf. lib/real-estate/__tests__/multi-credit.test.ts).
  const todayRef = new Date()
  const enrichedLoans = allDebts
    .filter(d =>
      d.initial_amount != null &&
      d.interest_rate  != null &&
      d.duration_months != null,
    )
    .map(d => {
      const loan: LoanInput = {
        principal:           d.initial_amount!,
        annualRatePct:       d.interest_rate!,
        durationYears:       d.duration_months! / 12,
        insuranceRatePct:    d.insurance_rate ?? 0,
        bankFees:            d.bank_fees      ?? 0,
        guaranteeFees:       d.guarantee_fees ?? 0,
        ...(d.start_date ? { startDate: new Date(d.start_date) } : {}),
        deferralType:        (d.deferral_type     ?? 'none')             as 'none' | 'partial' | 'total',
        deferralMonths:      d.deferral_months   ?? 0,
        insuranceBase:       (d.insurance_base    ?? 'capital_initial') as 'capital_initial' | 'capital_remaining',
        insuranceQuotitePct: d.insurance_quotite ?? 100,
      }
      const indSchedule = buildAmortizationSchedule(loan)
      const indCrd      = computeRemainingCapitalAt(loan, todayRef)
      return {
        debtRow:  d,
        loan,
        loanKind: (d.loan_kind ?? 'principal') as LoanKind,
        schedule: indSchedule,
        monthly:  indSchedule.totalMonthly,  // capital + intérêts + assurance moy.
        crd:      indCrd,
      }
    })

  const allLoansForCalc: LoanInput[] = enrichedLoans.map(x => x.loan)
  const multiCredit = aggregateLoans(allLoansForCalc, todayRef)
  // CRD à date — total tous prêts actifs confondus.
  const crdNow = enrichedLoans.length > 0
    ? multiCredit.totalRemainingCapital
    : 0

  // ── Alertes sous-loyer (migration 035) ──────────────────────────────────
  // Compare lot.rent_amount à lot.market_rent. Les lots sans market_rent
  // ou sans rent_amount sont ignorés (filtre fait par detectUnderRentAlerts).
  const underRentAlerts = isRental
    ? detectUnderRentAlerts(
        lots.map((l: {
          id: string; name: string;
          rent_amount: number | null;
          market_rent?: number | null;
        }) => ({
          id:          l.id,
          name:        l.name,
          rent_amount: l.rent_amount,
          market_rent: l.market_rent ?? null,
        })),
      )
    : []

  // ── Simulation moteur (source unique des KPIs financiers) ──────────────
  // V6 — Le bloc simInput/simResult est désormais calculé AVANT les KPIs
  // d'affichage de la Synthèse pour pouvoir lire les bonnes valeurs (kpis +
  // projection[0]) depuis la même source que la carte de la liste et
  // l'onglet Rentabilité. Avant V6, la Synthèse calculait ses propres
  // charges/grossYield/netYield/cash-flow à la main avec :
  //   - charges partielles (ignorait gli_pct, management_pct, mig 040)
  //     → BUG-D1-M04
  //   - cash-flow sans impôt, sans différé, sans vacance → divergent de
  //     la carte (864 € pour Tandoori) et de la Rentabilité (idem).
  // V3.1 — Apport = coût acquisition - somme des capitaux empruntés (multi-crédit).
  const totalBorrowed = allDbDebts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
  const downPayment   = Math.max(0, acqCost - totalBorrowed)
  const simInput      = buildSimulationInputFromDb(
    dbProperty, dbAsset, dbLots, dbCharges, allDbDebts, dbProfile,
    { downPayment },
  )

  // ── Réduction d'impôt annuelle (Pinel / Denormandie) ───────────────────
  // On construit le tableau d'imputation année par année à partir du
  // dispositif fiscal actif (table property_tax_incentives).
  // Hors fenêtre [start_year, start_year + duration - 1] → 0.
  const incentiveReductionPerYear = buildIncentiveReductionPerYear(
    incentiveRow,
    simInput.property,
    simInput.rent,
    dbProfile?.tmi_rate ?? 30,
    simInput.horizonYears ?? 25,
  )
  const simInputWithIncentive = { ...simInput, incentiveReductionPerYear }
  const simResult = runSimulation(simInputWithIncentive)

  // ── Synthèse : KPIs financiers globaux (lus depuis le moteur — V6) ─────
  // Tous les chiffres ci-dessous sont strictement identiques à ceux affichés
  // par la carte de la liste et l'onglet Rentabilité, par construction.
  //   - `annualCharges` = `projection[0].charges` (inclut PNO + taxe foncière
  //     + cfe + accountant + condoFees + maintenance + other + GLI %
  //     + management % + mig 040 résolues via charges-resolver).
  //   - `grossYield`    = `kpis.grossYieldFAI` (= dénominateur coût FAI complet).
  //     Même valeur que carte/Rentabilité.
  //   - `netYield`      = `kpis.netYield` (= (loyer − charges) / coût FAI,
  //     sans crédit ni impôt). Sémantique historique de la Synthèse
  //     préservée (≠ net-net affiché sur la carte ; v7 unifiera).
  //   - `monthlyCashFlow` (rental) = `kpis.monthlyCashFlowYear1`
  //     (= après impôts, vacance comprise, différé crédit pris en compte,
  //     multi-crédit agrégé). Cohérent carte + Rentabilité.
  //   - Pour les non-rental (RP, secondaire) : pas de loyer donc pas de
  //     fiscalité locative à appliquer. Le "coût mensuel de possession" =
  //     `−(monthlyCharges + monthlyLoanPayment)` est la bonne sémantique.
  //     `monthlyCharges` vient quand même du moteur (cohérent avec la
  //     projection : `fixedCharges` est calculé même quand `netRent=0` —
  //     taxe foncière, copro, etc. restent à payer).
  const annualCharges      = simResult.projection[0]?.charges ?? 0
  const grossYield         = simResult.kpis.grossYieldFAI
  const netYield           = simResult.kpis.netYield
  const monthlyLoanPayment = multiCredit.totalMonthly
  const monthlyCharges     = annualCharges / 12
  const monthlyCashFlow    = isRental
    ? simResult.kpis.monthlyCashFlowYear1
    : -(monthlyCharges + monthlyLoanPayment)
  const annualCashFlow     = monthlyCashFlow * 12
  const netPropertyValue   = currentVal - crdNow

  const actualData  = await loadActualData(
    supabase, user!.id, prop.asset_id, prop.id, debtRow?.id ?? null,
  )

  // ── Événements suivi réel (migration 041) ──────────────────────────────
  // Filtre par année courante. Le nouveau RealTrackingPanel utilise cette
  // liste avec la base (loyers + charges + crédit) pour calculer le réel.
  const trackingYear = new Date().getUTCFullYear()
  const { data: eventsRows } = await supabase
    .from('property_events')
    .select('*')
    .eq('property_id', prop.id)
    .eq('user_id', user!.id)
    .gte('event_date', `${trackingYear}-01-01`)
    .lte('event_date', `${trackingYear}-12-31`)
    .order('event_date', { ascending: false })
  const propertyEvents = (eventsRows ?? []) as import('@/types/database.types').PropertyEvent[]

  const simStartYear = debtRow?.start_date
    ? new Date(debtRow.start_date).getUTCFullYear()
    : (actualData.firstYear ?? new Date().getUTCFullYear())

  // Legacy : ces calculs alimentaient ActualVsSimulation / DriftAlerts /
  // RevisedForecast — désactivés dans l'UI (nouveau RealTrackingPanel).
  // Le `comparison` reste utilisé par YearEndReportPanel pour les bilans
  // d'années passées. Les variables driftAlerts / revisedForecast ne sont
  // plus consommées — voir hist commit pour rétablir si besoin.
  const comparison = compareActualToSimulation(simResult, actualData, simStartYear)
  void comparison   // explicitement marqué utilisé pour ne pas casser le calcul

  const reportCutoffYear = new Date().getUTCFullYear()
  const yearEndReports = actualData.years
    .filter((a) => a.year < reportCutoffYear)
    .sort((a, b) => b.year - a.year)
    .map((a) => {
      const projForYear = simResult.projection.find((p) => p.year === a.year - simStartYear + 1) ?? null
      return buildYearEndReport(
        a.year,
        prop.id,
        prop.asset?.name,
        (dbProperty.fiscal_regime ?? 'foncier_nu') as Parameters<typeof buildYearEndReport>[3],
        projForYear,
        a,
        simResult.amortization,
        simStartYear,
      )
    })

  // ─── Onglets ──────────────────────────────────────────────────────────────

  const tabs: TabItem[] = [
    // ── 1. Synthèse ─────────────────────────────────────────────────────────
    {
      id:    'synthese',
      label: 'Synthèse',
      icon:  <Home size={14} />,
      content: (
        <div className="space-y-6">
          {/* KPIs principaux : 6 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest">Valeur estimée</p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(currentVal, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">{formatDate(prop.asset?.last_valued_at, 'medium')}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1.5">
                Capital restant dû
                <InfoTip text={LEXIQUE.remainingCapital} />
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${crdNow > 0 ? 'text-danger' : 'text-secondary'}`}>
                {crdNow > 0 ? formatCurrency(crdNow, 'EUR', { compact: true }) : '—'}
              </p>
              <p className="text-xs text-secondary mt-1">à aujourd&apos;hui</p>
            </div>
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest">Patrimoine net</p>
              <p className="text-xl font-semibold financial-value text-accent mt-2">
                {formatCurrency(netPropertyValue, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">valeur − CRD</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1.5">
                {isRental ? 'Cash-flow mensuel' : 'Coût mensuel de possession'}
                {isRental && <InfoTip text={LEXIQUE.monthlyCashFlow} />}
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${monthlyCashFlow >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(monthlyCashFlow, 'EUR')}
              </p>
              <p className="text-xs text-secondary mt-1">
                {isRental ? 'après impôts /mois' : 'charges + crédit'}
              </p>
            </div>
            {isRental ? (
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1.5">
                  Rendement brut
                  <InfoTip text={LEXIQUE.grossYield} />
                </p>
                <p className="text-xl font-semibold financial-value text-primary mt-2">
                  {grossYield > 0 ? formatPercent(grossYield) : '—'}
                </p>
                <p className="text-xs text-secondary mt-1 flex items-center gap-1">
                  Net : {netYield > 0 ? formatPercent(netYield) : '—'}
                  <InfoTip text={LEXIQUE.netYield} iconSize={11} />
                </p>
              </div>
            ) : (
              // V12 — RP/RS : remplace "Type d'usage" (vide d'info) par le
              // capital déjà remboursé = principal initial total − CRD courant.
              // Mesure tangible de la progression patrimoniale ; renseigne
              // aussi que le bien est sans crédit (« — ») quand applicable.
              (() => {
                const totalPrincipalInitial = enrichedLoans.reduce(
                  (s, x) => s + x.loan.principal, 0,
                )
                const capitalRepaid = Math.max(0, totalPrincipalInitial - crdNow)
                const repaidPct = totalPrincipalInitial > 0
                  ? (capitalRepaid / totalPrincipalInitial) * 100
                  : 0
                return (
                  <div className="card p-5">
                    <p className="text-xs text-secondary uppercase tracking-widest">
                      Capital remboursé
                    </p>
                    <p className="text-xl font-semibold financial-value text-accent mt-2">
                      {totalPrincipalInitial > 0
                        ? formatCurrency(capitalRepaid, 'EUR', { compact: true })
                        : '—'}
                    </p>
                    <p className="text-xs text-secondary mt-1">
                      {totalPrincipalInitial > 0
                        ? `${formatPercent(repaidPct)} du principal initial`
                        : 'Sans crédit — achat comptant'}
                    </p>
                  </div>
                )
              })()
            )}
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1.5">
                Plus-value latente
                <InfoTip text={LEXIQUE.latentGain} />
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
              </p>
              <p className="text-xs text-secondary mt-1">{formatPercent(latentPct, { sign: true })}</p>
            </div>
          </div>

          {/* Alertes sous-loyer (migration 035) */}
          {underRentAlerts.length > 0 && (
            <UnderRentAlerts alerts={underRentAlerts} />
          )}

          {/* Lots + Historique valorisations */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {isPrimaryRP ? (
              <div className="lg:col-span-3 card p-6 text-sm text-secondary">
                Résidence principale — pas de lots locatifs.
              </div>
            ) : (
            <div className="lg:col-span-3 card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-primary">
                  Lots locatifs {monthlyRents > 0 && <span className="text-accent ml-1">{formatCurrency(monthlyRents, 'EUR')} / mois</span>}
                </h2>
                <PropertyLotActions propertyId={prop.id} />
              </div>
              {!lots.length ? (
                <p className="text-sm text-secondary">Aucun lot — ajoutez des unités locatives.</p>
              ) : (
                <div className="space-y-2">
                  {lots.map((lot: {
                    id: string; name: string; lot_type: string | null; surface_m2: number | null;
                    status: string; rent_amount: number | null; charges_amount: number | null;
                    market_rent: number | null;
                    tenant_name: string | null; lease_start_date: string | null; lease_end_date: string | null
                  }) => {
                    const statusInfo = LOT_STATUS[lot.status] ?? { label: lot.status, variant: 'muted' as const }
                    return (
                      <div key={lot.id} className="flex items-center gap-4 p-3 bg-surface-2 rounded-lg group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-primary font-medium">{lot.name}</p>
                          {lot.tenant_name && <p className="text-xs text-secondary">{lot.tenant_name}</p>}
                        </div>
                        {lot.surface_m2 && <p className="text-xs text-secondary">{lot.surface_m2} m²</p>}
                        {lot.rent_amount && (
                          <p className="text-sm financial-value text-accent">
                            {formatCurrency(lot.rent_amount, 'EUR')}
                          </p>
                        )}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <LotEditButton lot={lot} propertyId={prop.id} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            )}

            <div className="lg:col-span-2 card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-primary">Historique des estimations</h2>
                <PropertyValuationActions propertyId={prop.id} surfaceM2={prop.surface_m2} />
              </div>
              {!(prop.valuations ?? []).length ? (
                <p className="text-sm text-secondary">Aucune estimation enregistrée.</p>
              ) : (
                <div className="space-y-3">
                  {(prop.valuations ?? []).slice(0, 6).map((v: {
                    id: string; valuation_date: string; value: number;
                    price_per_m2: number | null; confidence: string
                  }, i: number) => {
                    const prev  = (prop.valuations ?? [])[i + 1]
                    const delta = prev ? v.value - prev.value : null
                    return (
                      <div key={v.id} className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm financial-value text-primary">{formatCurrency(v.value, 'EUR', { compact: true })}</p>
                          <p className="text-xs text-secondary">{formatDate(v.valuation_date, 'medium')}</p>
                        </div>
                        {delta !== null && (
                          <p className={`text-xs flex items-center gap-0.5 ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {formatCurrency(Math.abs(delta), 'EUR', { compact: true })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },

    // ── 2. Crédit ──────────────────────────────────────────────────────────
    {
      id:    'credit',
      label: 'Crédit',
      icon:  <Banknote size={14} />,
      content: (
        <div className="space-y-6">
          {/* Vue d'ensemble multi-crédit (migration 034 / V3.2) */}
          {/* On utilise enrichedLoans pour bénéficier des monthly + crd
              pré-calculés, cohérents avec multiCredit.totalMonthly. */}
          {enrichedLoans.length > 0 && (
            <MultiCreditList
              propertyId={prop.id}
              credits={enrichedLoans.map(x => ({
                id:               x.debtRow.id,
                loan_kind:        x.loanKind,
                lender:           x.debtRow.lender ?? null,
                initial_amount:   x.loan.principal,
                interest_rate:    x.loan.annualRatePct,
                insurance_rate:   x.loan.insuranceRatePct,
                duration_months:  Math.round(x.loan.durationYears * 12),
                start_date:       x.debtRow.start_date,
                monthly:          x.monthly,   // V3.2 — assurance incluse
                crd:              x.crd,
              }))}
              totalMonthly={multiCredit.totalMonthly}
              totalRemainingCapital={multiCredit.totalRemainingCapital}
            />
          )}

          {/* Formulaire d'édition du crédit principal (création / modification) */}
          <CreditTab
            propertyId={prop.id}
            propertyName={prop.asset?.name}
            credit={creditForTab}
          />
        </div>
      ),
    },

    // ── 3. Tableau d'amortissement (V3.2 — multi-crédit) ─────────────────
    // Si plusieurs crédits actifs, AmortizationTable affiche des onglets
    // « Tous / Principal / PTZ / … ». Le schedule principal affiché par
    // défaut est l'agrégat (= multiCredit.schedule). Les schedules
    // individuels (perLoanSchedules) alimentent les onglets sub. Avec 1
    // seul crédit ou aucun schedules: le composant retombe sur le mode
    // mono historique (pas de tabs visibles).
    {
      id:    'amortissement',
      label: 'Amortissement',
      icon:  <FileSpreadsheet size={14} />,
      content: enrichedLoans.length > 0 ? (
        <AmortizationTable
          schedule={multiCredit.schedule}
          startDate={enrichedLoans[0]!.loan.startDate ?? null}
          schedules={enrichedLoans.length > 1
            ? enrichedLoans.map(x => ({
                label:     LOAN_KIND_LABELS[x.loanKind] ?? x.loanKind,
                schedule:  x.schedule,
                startDate: x.loan.startDate ?? null,
              }))
            : undefined
          }
          propertyName={prop.asset?.name}
        />
      ) : (
        <div className="card p-8 text-center text-sm text-secondary">
          Aucun crédit configuré — l&apos;onglet « Crédit » permet d&apos;en ajouter un.
        </div>
      ),
    },

    // ── 4. Rentabilité & Cash-flow ────────────────────────────────────────
    {
      id:    'rentabilite',
      label: 'Rentabilité & Cash-flow',
      icon:  <TrendingUp size={14} />,
      content: (
        <div className="space-y-6">
          <SimulationPanel
            propertyId={prop.id}
            property={dbProperty}
            asset={dbAsset}
            lots={dbLots}
            charges={dbCharges}
            debts={allDbDebts}
            profile={dbProfile}
          />

          {/* Saisonnalite courte duree — un graphique par lot short_term / mixed */}
          {shortTermKpis.hasShortTermLots && shortTermKpis.perLot.map(entry => {
            const lot = lots[entry.lotIndex] as { name?: string } | undefined
            return (
              <div key={entry.lotIndex} className="space-y-1">
                {shortTermKpis.perLot.length > 1 && lot?.name && (
                  <p className="text-xs uppercase tracking-wider text-muted px-1">
                    Lot : {lot.name}
                  </p>
                )}
                <SeasonalityChart data={entry.revenue} />
              </div>
            )
          })}

          {/* Simulateur what-if interactif */}
          <WhatIfSimulator
            property={dbProperty}
            asset={dbAsset}
            lots={dbLots}
            charges={dbCharges}
            debts={allDbDebts}
            profile={dbProfile}
            isShortTerm={shortTermKpis.hasShortTermLots}
          />

          {/* Décomposition fiscale Y1 — si dispositif Pinel/Denormandie/LocAv actif */}
          {simResult.projection[0] && simResult.projection[0].taxReductionTotal > 0 && (
            <TaxReductionDecomposition
              taxBeforeReduction={
                simResult.projection[0].taxPaid + simResult.projection[0].taxReductionApplied
              }
              taxReductionTotal={simResult.projection[0].taxReductionTotal}
              taxReductionApplied={simResult.projection[0].taxReductionApplied}
              taxReductionLost={simResult.projection[0].taxReductionLost}
              taxPaid={simResult.projection[0].taxPaid}
              incentiveLabel={
                incentiveRow?.kind === 'pinel'         ? 'Pinel' :
                incentiveRow?.kind === 'pinel_plus'    ? 'Pinel+' :
                incentiveRow?.kind === 'denormandie'   ? 'Denormandie' :
                incentiveRow?.kind === 'loc_avantages' ?
                  `Loc'Avantages ${(incentiveRow.convention_type ?? '').toUpperCase()}` :
                undefined
              }
            />
          )}

          {/* Distribution SCI IS — uniquement si régime sci_is */}
          {propTyped.fiscal_regime === 'sci_is' && simResult.projection[0] && (
            <SciDistribution
              netProfitAfterIS={
                // V7 — BUG-D1-M05 : on passe le VRAI bénéfice comptable
                // distribuable, plancher à 0.
                //   netProfitAfterIS = max(0, fiscalResult − taxPaid)
                // Avant V7, on passait `cashFlowAfterTax + principalRepaid`,
                // qui mélangeait :
                //   - de la trésorerie (cashFlowAfterTax)
                //   - du capital remboursé (qui rembourse une DETTE, pas
                //     un bénéfice distribuable).
                // Ce proxy gonflait artificiellement le distribuable. La
                // bonne sémantique comptable : bénéfice après IS = résultat
                // fiscal − IS payé (plancher 0 — on ne distribue pas un
                // déficit, qui est reporté indéfiniment par calculateSciIs).
                Math.max(
                  0,
                  simResult.projection[0].fiscalResult - simResult.projection[0].taxPaid,
                )
              }
              ccaAmount={propTyped.cca_amount ?? 0}
              tmiPct={dbProfile?.tmi_rate ?? 30}
            />
          )}

          {isRental && !simResult.incompleteData && (
            <RegimeComparator
              base={{
                property:    simInput.property,
                // V3.2 — multi-crédit : on passe tous les prêts actifs.
                // `compareRegimes` (lib/real-estate/fiscal/) consomme
                // `SimulationInput.loans` depuis V3.1.
                loans:       allLoansForCalc,
                rent:        simInput.rent,
                charges:     simInput.charges,
                downPayment: simInput.downPayment,
                horizonYears: simInput.horizonYears,
              }}
              defaultTmiPct={dbProfile?.tmi_rate ?? 30}
            />
          )}
        </div>
      ),
    },

    // ── 5. Charges ─────────────────────────────────────────────────────────
    {
      id:    'charges',
      label: 'Charges',
      icon:  <Receipt size={14} />,
      content: (
        <div className="space-y-4">
          <ChargesForm
            propertyId={prop.id}
            year={currentYear}
            monthlyRent={monthlyRents}
            usageType={usageType}
            fiscalRegime={propTyped.fiscal_regime}
            initial={charges ?? null}
          />

          {/* Historique multi-années */}
          {chargesAll.length > 1 && (
            <div className="card p-6">
              <h2 className="text-sm font-medium text-primary mb-4">Historique des charges</h2>
              <table className="w-full text-xs">
                <thead className="bg-surface-2">
                  <tr className="text-muted uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Année</th>
                    <th className="px-3 py-2 text-right">Taxe fonc.</th>
                    <th className="px-3 py-2 text-right">Assurance</th>
                    <th className="px-3 py-2 text-right">Copro</th>
                    <th className="px-3 py-2 text-right">Autres</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...chargesAll].sort((a, b) => b.year - a.year).map((c: {
                    year: number; taxe_fonciere: number; insurance: number; accountant: number;
                    cfe: number; condo_fees: number; maintenance: number; other: number
                  }) => {
                    const tot = c.taxe_fonciere + c.insurance + c.accountant + c.cfe + c.condo_fees + c.maintenance + c.other
                    return (
                      <tr key={c.year} className="hover:bg-surface-2/50">
                        <td className="px-3 py-2 text-secondary font-medium">{c.year}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.taxe_fonciere, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.insurance, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.condo_fees, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.accountant + c.cfe + c.maintenance + c.other, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-primary font-medium">{formatCurrency(tot, 'EUR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    },

    // ── 6. Suivi réel — refonte modèle base + événements (migration 041) ──
    {
      id:    'suivi-reel',
      label: 'Suivi réel',
      icon:  <Activity size={14} />,
      content: (
        <div className="space-y-6">
          <RealTrackingPanel
            propertyId={prop.id}
            year={trackingYear}
            lots={lots.map((l: { id: string; name: string; rent_amount: number | null; status: string }) => ({
              id:          l.id,
              name:        l.name,
              rent_amount: l.rent_amount,
            }))}
            monthlyRent={monthlyRents}
            annualCharges={annualCharges}
            monthlyLoanPayment={multiCredit.totalMonthly}
            events={propertyEvents}
            hasShortTermLots={shortTermKpis.hasShortTermLots}
          />

          {/* Vues complémentaires (legacy) — laissé en arrière-plan pour
              ceux qui ont déjà des transactions. À supprimer dans un sprint
              ultérieur une fois le nouveau modèle validé. */}
          {yearEndReports.length > 0 && (
            <div className="border-t border-border pt-6">
              <YearEndReportPanel reports={yearEndReports} />
            </div>
          )}
        </div>
      ),
    },

    // ── 7. Dispositif fiscal ────────────────────────────────────────────────
    {
      id:    'dispositif',
      label: 'Dispositif fiscal',
      icon:  <Sparkles size={14} />,
      content: <IncentiveTabContent
        propertyId={prop.id}
        incentive={incentiveRow as IncentiveRow | null}
        annualRentHC={annualRents}
        purchasePrice={prop.purchase_price ?? 0}
        surfaceM2={prop.surface_m2 ?? 0}
        tmiPct={dbProfile?.tmi_rate ?? 30}
      />,
    },

    // CF / annualCashFlow utilisé pour les calculs internes uniquement (visible dans Synthèse)
  ]

  // Petite garde TS : éviter l'erreur "annualCashFlow declared but unused" si on ne l'affiche pas
  void annualCashFlow

  const fiscalRegimeMissing = !prop.fiscal_regime

  // V12 — CAS-RP-001 : pour un bien non-locatif (RP/RS), masquer les onglets
  // qui n'ont pas de sens (Rentabilité, Suivi réel des loyers, Dispositif
  // fiscal locatif). Le composant Tabs retombe automatiquement sur le 1er
  // onglet si `?tab=…` pointe vers un onglet absent — pas besoin de fallback
  // explicite ici, mais on documente l'invariant.
  const RENTAL_ONLY_TAB_IDS = new Set(['rentabilite', 'suivi-reel', 'dispositif'])
  const visibleTabs = isRental
    ? tabs
    : tabs.filter(t => !RENTAL_ONLY_TAB_IDS.has(t.id))

  return (
    <div className="space-y-6">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l&apos;immobilier
      </Link>

      <PageHeader
        title={prop.asset?.name ?? 'Bien immobilier'}
        subtitle={[prop.address_zip, prop.address_city].filter(Boolean).join(' ') || undefined}
        action={
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={prop.asset?.confidence ?? 'medium'} />
            <ExportPdfButton
              propertyId={prop.id}
              acquisitionDate={prop.asset?.acquisition_date ?? null}
            />
            <Link
              href={`/immobilier/${prop.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-secondary hover:text-primary border border-border hover:border-accent/40 rounded-lg transition-colors"
              title="Modifier le bien"
            >
              <Pencil size={13} />
              Modifier
            </Link>
            <DeletePropertyButton
              propertyId={prop.id}
              propertyName={prop.asset?.name ?? 'ce bien'}
              redirectTo="/immobilier"
            />
          </div>
        }
      />

      {wizardWarnings.length > 0 && (
        <WizardWarningBanner warnings={wizardWarnings} />
      )}

      {fiscalRegimeMissing && (
        <div className="card border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-primary">Régime fiscal non défini</p>
            <p className="text-secondary mt-1">
              La rentabilité nette et l&apos;impôt estimé affichés ci-dessous ne peuvent
              pas être calculés de manière fiable tant qu&apos;un régime fiscal n&apos;est
              pas associé à ce bien. Recréez ce bien en sélectionnant un régime
              (LMNP, SCI à l&apos;IS, foncier réel, etc.) pour obtenir une projection exacte.
            </p>
          </div>
        </div>
      )}

      <Tabs tabs={visibleTabs} urlParam="tab" />
    </div>
  )
}
