// Auto-maintenu manuellement — régénérer avec `supabase gen types typescript`
// après chaque migration pour rester synchronisé.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type AssetType = 'real_estate' | 'scpi' | 'stock' | 'etf' | 'crypto' | 'gold' | 'cash' | 'other'
export type AssetStatus = 'active' | 'sold' | 'closed'
export type TransactionType =
  | 'purchase' | 'sale' | 'rent_income' | 'dividend' | 'interest'
  | 'loan_payment' | 'deposit' | 'withdrawal' | 'fee' | 'tax' | 'transfer'
export type DebtType = 'mortgage' | 'consumer' | 'professional'
export type DebtStatus = 'active' | 'paid_off' | 'restructured'
export type DeferralType = 'none' | 'partial' | 'total'
export type AmortizationType = 'constant' | 'linear' | 'in_fine'
export type AcquisitionFeesTreatment = 'expense_y1' | 'amortized'
// ── Migration 006 ───────────────────────────────────────────────
export type InsuranceBase = 'capital_initial' | 'capital_remaining'
export type GuaranteeType = 'hypotheque' | 'caution' | 'ppd' | 'autre'
export type EnvelopeType = 'pea' | 'cto' | 'assurance_vie' | 'per' | 'wallet_crypto' | 'other'
export type HoldingMode = 'direct' | 'assurance_vie' | 'sci' | 'other'
export type LotStatus = 'rented' | 'vacant' | 'owner_occupied' | 'works'
export type FiscalRegime = 'lmnp_reel' | 'lmnp_micro' | 'lmp' | 'sci_is' | 'sci_ir' | 'foncier_nu' | 'foncier_micro'
export type DataSource = 'manual' | 'api' | 'estimation' | 'import'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'BTC' | 'ETH'
export type DcaStatus = 'pending' | 'validated' | 'skipped' | 'cancelled'
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

// ── Migration 007 — Portefeuille universel ─────────────────────
export type AssetClass =
  | 'equity' | 'etf' | 'fund' | 'crypto' | 'scpi' | 'reit' | 'bond' | 'metal'
  | 'private_equity' | 'crowdfunding' | 'private_debt' | 'structured'
  | 'opci' | 'siic' | 'derivative' | 'defi' | 'other'

export type PositionStatus = 'active' | 'closed' | 'pending'

// Migration 013 — fréquence de valorisation par instrument
export type ValuationFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'manual'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string | null
  reference_currency: CurrencyCode
  tmi_rate: number | null
  fiscal_situation: string | null
  created_at: string
  updated_at: string
}

export interface Asset {
  id: string
  user_id: string
  name: string
  asset_type: AssetType
  status: AssetStatus
  currency: CurrencyCode
  acquisition_date: string | null
  acquisition_price: number | null
  current_value: number | null
  notes: string | null
  data_source: DataSource
  confidence: ConfidenceLevel
  last_valued_at: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  asset_id: string | null
  debt_id: string | null
  transaction_type: TransactionType
  amount: number
  currency: CurrencyCode
  fx_rate_to_ref: number
  executed_at: string
  value_date: string | null
  label: string | null
  notes: string | null
  data_source: DataSource
  external_ref: string | null
  created_at: string
  // ── Migration 007 — Portefeuille universel ──
  position_id: string | null
  instrument_id: string | null
  quantity: number | null
  unit_price: number | null
  fees: number
}

export interface Debt {
  id: string
  user_id: string
  /**
   * Asset rattaché. NOT NULL depuis migration 006 (1 crédit max par asset,
   * FK CASCADE — la suppression du bien supprime le crédit).
   */
  asset_id: string
  name: string
  debt_type: DebtType
  status: DebtStatus
  lender: string | null
  initial_amount: number
  currency: CurrencyCode
  /** Taux nominal annuel en %. Nullable depuis migration 005 (saisie step-by-step). */
  interest_rate: number | null
  insurance_rate: number
  /** Durée en mois. Nullable depuis migration 005. */
  duration_months: number | null
  /** Date de début du crédit. Nullable depuis migration 005. */
  start_date: string | null
  deferral_type: DeferralType
  deferral_months: number
  /** Cache mensualité (capital + intérêts hors assurance) — recalculé à chaque write. */
  monthly_payment: number | null
  /** Cache CRD à date — recalculé à chaque write. */
  capital_remaining: number | null
  notes: string | null
  // ── Migration 005 ─────────────────────────────────────────────
  bank_fees: number
  guarantee_fees: number
  amortization_type: AmortizationType
  // ── Migration 006 ─────────────────────────────────────────────
  /** Base de calcul mensuelle de l'assurance emprunteur. */
  insurance_base: InsuranceBase
  /** Quotité d'assurance en %. 100 par défaut. */
  insurance_quotite: number
  /** Type de garantie du prêt. */
  guarantee_type: GuaranteeType
  created_at: string
  updated_at: string
}

// Migration 006 : la table debt_amortization a ete supprimee. Les rows ne
// sont plus persistees, le tableau d'amortissement est calcule a la volee
// via lib/real-estate/amortization.ts (buildAmortizationSchedule).

export interface RealEstateProperty {
  id: string
  asset_id: string
  user_id: string
  property_type: string
  address_line1: string | null
  address_city: string | null
  address_zip: string | null
  address_country: string
  surface_m2: number | null
  land_surface_m2: number | null
  construction_year: number | null
  dpe_class: string | null
  purchase_price: number | null
  purchase_fees: number
  works_amount: number
  fiscal_regime: FiscalRegime | null
  is_multi_lot: boolean
  notes: string | null
  // ── Ajoutés en migration 005 — paramètres de simulation ───────
  rental_index_pct: number
  charges_index_pct: number
  property_index_pct: number
  land_share_pct: number
  amort_building_years: number
  amort_works_years: number
  amort_furniture_years: number
  furniture_amount: number
  /** Override loyer total. NULL = utiliser la somme des lots. */
  assumed_total_rent: number | null
  gli_pct: number
  management_pct: number
  vacancy_months: number
  lmp_ssi_rate: number
  acquisition_fees_treatment: AcquisitionFeesTreatment
  lmnp_micro_abattement_pct: number
  created_at: string
  updated_at: string
}

export interface RealEstateLot {
  id: string
  property_id: string
  user_id: string
  name: string
  lot_type: string | null
  surface_m2: number | null
  status: LotStatus
  rent_amount: number | null
  charges_amount: number
  tenant_name: string | null
  lease_start_date: string | null
  lease_end_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PropertyValuation {
  id: string
  property_id: string
  user_id: string
  valuation_date: string
  value: number
  price_per_m2: number | null
  source: DataSource
  confidence: ConfidenceLevel
  notes: string | null
  created_at: string
}

export interface PropertyCharges {
  id: string
  property_id: string
  user_id: string
  year: number
  taxe_fonciere: number
  insurance: number
  accountant: number
  cfe: number
  condo_fees: number
  maintenance: number
  other: number
  vacancy_rate: number
  notes: string | null
  created_at: string
  updated_at: string
}

// Migration 012 : ScpiAsset, ScpiDividend, FinancialAsset interfaces supprimees
// (tables droppees, remplacees par positions + instruments).

export interface FinancialEnvelope {
  id: string
  user_id: string
  name: string
  envelope_type: EnvelopeType
  broker: string | null
  currency: CurrencyCode
  opening_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PriceHistory {
  id: string
  ticker: string
  price_date: string
  close_price: number
  open_price: number | null
  high_price: number | null
  low_price: number | null
  volume: number | null
  currency: CurrencyCode
  source: DataSource
  created_at: string
}

export interface MarketPriceCache {
  ticker: string
  price: number
  currency: CurrencyCode
  change_24h: number | null
  market_cap: number | null
  source: string
  fetched_at: string
  expires_at: string
}

export interface CashAccount {
  id: string
  asset_id: string
  user_id: string
  account_type: string
  bank_name: string | null
  interest_rate: number
  balance: number
  balance_date: string | null
  currency: CurrencyCode
  created_at: string
  updated_at: string
}

export interface CashBalanceHistory {
  id: string
  cash_account_id: string
  user_id: string
  balance_date: string
  balance: number
  source: DataSource
  created_at: string
}

export interface FxRate {
  id: string
  base_currency: CurrencyCode
  quote_currency: CurrencyCode
  rate_date: string
  rate: number
  source: string
  created_at: string
}

export interface PatrimonySnapshot {
  id: string
  user_id: string
  snapshot_date: string
  total_gross_value: number
  total_debt: number
  total_net_value: number
  real_estate_value: number
  scpi_value: number
  financial_value: number
  cash_value: number
  other_value: number
  monthly_cashflow: number | null
  confidence_score: number | null
  notes: string | null
  created_at: string
}

export interface DcaPlan {
  id: string
  user_id: string
  asset_id: string | null
  envelope_id: string | null
  name: string
  ticker: string
  amount_per_period: number
  currency: CurrencyCode
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
  start_date: string
  end_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DcaOccurrence {
  id: string
  dca_plan_id: string
  user_id: string
  scheduled_date: string
  planned_amount: number
  actual_amount: number | null
  actual_price: number | null
  actual_quantity: number | null
  status: DcaStatus
  validated_at: string | null
  transaction_id: string | null
  deviation_note: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  table_name: string
  record_id: string
  action: AuditAction
  old_data: Json | null
  new_data: Json | null
  changed_at: string
  ip_address: string | null
}

// ─── Insert types (omit server-generated fields) ─────────────────────────────

export type AssetInsert = Omit<Asset, 'id' | 'created_at' | 'updated_at'>
export type AssetUpdate = Partial<Omit<AssetInsert, 'user_id'>>

export type TransactionInsert = Omit<Transaction, 'id' | 'created_at'>

export type DebtInsert = Omit<Debt, 'id' | 'created_at' | 'updated_at'>
export type DebtUpdate = Partial<Omit<DebtInsert, 'user_id'>>

export type RealEstatePropertyInsert = Omit<RealEstateProperty, 'id' | 'created_at' | 'updated_at'>
export type RealEstatePropertyUpdate = Partial<Omit<RealEstatePropertyInsert, 'user_id' | 'asset_id'>>

export type RealEstateLotInsert = Omit<RealEstateLot, 'id' | 'created_at' | 'updated_at'>
export type RealEstateLotUpdate = Partial<Omit<RealEstateLotInsert, 'user_id' | 'property_id'>>

export type PropertyValuationInsert = Omit<PropertyValuation, 'id' | 'created_at'>

export type PropertyChargesInsert = Omit<PropertyCharges, 'id' | 'created_at' | 'updated_at'>
export type PropertyChargesUpdate = Partial<Omit<PropertyChargesInsert, 'user_id' | 'property_id' | 'year'>>

// Migration 012 : ScpiAssetInsert/Update, ScpiDividendInsert,
// FinancialAssetInsert/Update supprimés (tables droppées).

export type FinancialEnvelopeInsert = Omit<FinancialEnvelope, 'id' | 'created_at' | 'updated_at'>
export type FinancialEnvelopeUpdate = Partial<Omit<FinancialEnvelopeInsert, 'user_id'>>

export type CashAccountInsert = Omit<CashAccount, 'id' | 'created_at' | 'updated_at'>
export type CashAccountUpdate = Partial<Omit<CashAccountInsert, 'user_id' | 'asset_id'>>

export type DcaPlanInsert = Omit<DcaPlan, 'id' | 'created_at' | 'updated_at'>
export type DcaPlanUpdate = Partial<Omit<DcaPlanInsert, 'user_id'>>

export type DcaOccurrenceInsert = Omit<DcaOccurrence, 'id' | 'created_at' | 'updated_at'>

// ─── Migration 007 — Portefeuille universel ──────────────────────────────────

export interface Instrument {
  id: string
  name: string
  ticker: string | null
  isin: string | null
  asset_class: AssetClass
  asset_subclass: string | null
  currency: CurrencyCode
  sector: string | null
  geography: string | null
  provider_id: string | null
  data_source: DataSource
  /** Migration 013 : cadence de valorisation. Défaut 'daily'. */
  valuation_frequency: ValuationFrequency
  metadata: Json
  created_at: string
  updated_at: string
}

export interface Position {
  id: string
  user_id: string
  instrument_id: string
  envelope_id: string | null
  quantity: number
  average_price: number
  currency: CurrencyCode
  broker: string | null
  acquisition_date: string | null
  status: PositionStatus
  notes: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export interface InstrumentPrice {
  id: string
  instrument_id: string
  price: number
  currency: CurrencyCode
  priced_at: string
  source: string
  confidence: ConfidenceLevel
  metadata: Json
  created_at: string
}

export interface PriceProvider {
  id: string
  code: string
  display_name: string
  api_key_env: string | null
  is_active: boolean
  priority: number
  supported_classes: AssetClass[]
  rate_limit_per_minute: number | null
  base_url: string | null
  notes: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type InstrumentInsert = Omit<Instrument, 'id' | 'created_at' | 'updated_at'>
export type InstrumentUpdate = Partial<InstrumentInsert>

export type PositionInsert = Omit<Position, 'id' | 'created_at' | 'updated_at'>
export type PositionUpdate = Partial<Omit<PositionInsert, 'user_id' | 'instrument_id'>>

export type InstrumentPriceInsert = Omit<InstrumentPrice, 'id' | 'created_at'>
