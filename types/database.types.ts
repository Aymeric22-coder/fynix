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
export type EnvelopeType = 'pea' | 'cto' | 'assurance_vie' | 'per' | 'wallet_crypto' | 'other'
export type HoldingMode = 'direct' | 'assurance_vie' | 'sci' | 'other'
export type LotStatus = 'rented' | 'vacant' | 'owner_occupied' | 'works'
export type FiscalRegime = 'lmnp_reel' | 'lmnp_micro' | 'lmp' | 'sci_is' | 'sci_ir' | 'foncier_nu' | 'foncier_micro'
export type DataSource = 'manual' | 'api' | 'estimation' | 'import'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'BTC' | 'ETH'
export type DcaStatus = 'pending' | 'validated' | 'skipped' | 'cancelled'
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

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
}

export interface Debt {
  id: string
  user_id: string
  asset_id: string | null
  name: string
  debt_type: DebtType
  status: DebtStatus
  lender: string | null
  initial_amount: number
  currency: CurrencyCode
  interest_rate: number
  insurance_rate: number
  duration_months: number
  start_date: string
  deferral_type: DeferralType
  deferral_months: number
  monthly_payment: number | null
  capital_remaining: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DebtAmortization {
  id: string
  debt_id: string
  user_id: string
  period_number: number
  payment_date: string
  payment_total: number
  payment_capital: number
  payment_interest: number
  payment_insurance: number
  capital_remaining: number
  is_deferred: boolean
}

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

export interface ScpiAsset {
  id: string
  asset_id: string
  user_id: string
  scpi_name: string
  scpi_code: string | null
  holding_mode: HoldingMode
  envelope_name: string | null
  nb_shares: number
  subscription_price: number | null
  current_share_price: number | null
  withdrawal_price: number | null
  distribution_rate: number | null
  created_at: string
  updated_at: string
}

export interface ScpiDividend {
  id: string
  scpi_asset_id: string
  user_id: string
  payment_date: string
  amount: number
  per_share: number | null
  nb_shares_at_date: number | null
  fiscal_year: number | null
  notes: string | null
  created_at: string
}

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

export interface FinancialAsset {
  id: string
  asset_id: string
  user_id: string
  envelope_id: string | null
  ticker: string | null
  isin: string | null
  name: string
  quantity: number
  average_price: number
  current_price: number | null
  current_price_at: string | null
  currency: CurrencyCode
  data_source: DataSource
  confidence: ConfidenceLevel
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

export type ScpiAssetInsert = Omit<ScpiAsset, 'id' | 'created_at' | 'updated_at'>
export type ScpiAssetUpdate = Partial<Omit<ScpiAssetInsert, 'user_id' | 'asset_id'>>

export type ScpiDividendInsert = Omit<ScpiDividend, 'id' | 'created_at'>

export type FinancialEnvelopeInsert = Omit<FinancialEnvelope, 'id' | 'created_at' | 'updated_at'>
export type FinancialEnvelopeUpdate = Partial<Omit<FinancialEnvelopeInsert, 'user_id'>>

export type FinancialAssetInsert = Omit<FinancialAsset, 'id' | 'created_at' | 'updated_at'>
export type FinancialAssetUpdate = Partial<Omit<FinancialAssetInsert, 'user_id' | 'asset_id'>>

export type CashAccountInsert = Omit<CashAccount, 'id' | 'created_at' | 'updated_at'>
export type CashAccountUpdate = Partial<Omit<CashAccountInsert, 'user_id' | 'asset_id'>>

export type DcaPlanInsert = Omit<DcaPlan, 'id' | 'created_at' | 'updated_at'>
export type DcaPlanUpdate = Partial<Omit<DcaPlanInsert, 'user_id'>>

export type DcaOccurrenceInsert = Omit<DcaOccurrence, 'id' | 'created_at' | 'updated_at'>
