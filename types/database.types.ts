// ⚠️ FICHIER MAINTENU À LA MAIN — NE PAS RÉGÉNÉRER ⚠️
//
// Ce fichier n'est PAS auto-généré. Il contient :
//   - Les types miroirs du schéma Supabase (interfaces Row + Insert/Update)
//   - Des helpers, enums, labels FR et constants (LOAN_KIND_LABELS,
//     PROPERTY_EVENT_LABELS, USAGE_TYPE_LABELS, SHORT_TERM_EVENT_KINDS,
//     isRentalUsage, etc.) qui sont consommés partout dans le code.
//
// Lancer `supabase gen types typescript` ÉCRASERAIT tous ces helpers FR
// et casserait massivement les imports. NE PAS le faire.
//
// Pour ajouter une colonne après une migration : éditer ce fichier à la
// main, ajouter la colonne dans l'interface concernée (Row + cohérence
// Insert/Update implicite via Omit), et lancer `npx tsc --noEmit`.

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

// ── Migration 034 — Type de prêt (multi-crédit par bien) ─────────
export type LoanKind =
  | 'principal'
  | 'ptz'
  | 'travaux'
  | 'pel'
  | 'action_logement'
  | 'relais'
  | 'in_fine'
  | 'autre'

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  principal:       'Prêt principal',
  ptz:             'PTZ (Prêt à Taux Zéro)',
  travaux:         'Prêt travaux',
  pel:             'PEL / CEL',
  action_logement: 'Action Logement',
  relais:          'Prêt relais',
  in_fine:         'Prêt in fine',
  autre:           'Autre',
}

// ── Migration 041 — Événements ponctuels sur un bien ─────────────
// (+ Migration 042 — événements spécifiques courte durée)
export type PropertyEventKind =
  | 'rent_unpaid'
  | 'vacancy'
  | 'rent_revision'
  | 'exceptional_charge'
  | 'unplanned_works'
  | 'insurance_claim'
  | 'rent_paid_late'
  | 'other'
  | 'booking_cancellation'
  | 'platform_payout'
  | 'guest_damage'
  | 'platform_dispute'
  | 'seasonal_closure'

export const PROPERTY_EVENT_LABELS: Record<PropertyEventKind, string> = {
  rent_unpaid:          'Loyer impayé',
  vacancy:              'Vacance locative',
  rent_revision:        'Révision de loyer',
  exceptional_charge:   'Charge exceptionnelle',
  unplanned_works:      'Travaux imprévus',
  insurance_claim:      'Sinistre / remboursement',
  rent_paid_late:       'Loyer payé en retard',
  other:                'Autre',
  booking_cancellation: 'Annulation de réservation',
  platform_payout:      'Virement plateforme',
  guest_damage:         'Dégradation voyageur',
  platform_dispute:     'Litige plateforme',
  seasonal_closure:     'Fermeture saisonnière',
}

/** Types d'événements spécifiques à la location courte durée. */
export const SHORT_TERM_EVENT_KINDS: readonly PropertyEventKind[] = [
  'booking_cancellation',
  'platform_payout',
  'guest_damage',
  'platform_dispute',
  'seasonal_closure',
] as const

export interface PropertyEvent {
  id:              string
  property_id:     string
  lot_id:          string | null
  user_id:         string
  kind:            PropertyEventKind
  event_date:      string         // ISO date
  period_start:    string | null
  period_end:      string | null
  amount_eur:      number | null
  is_resolved:     boolean
  resolved_date:   string | null
  resolution_note: string | null
  label:           string | null
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export type PropertyEventInsert = Omit<PropertyEvent, 'id' | 'created_at' | 'updated_at'>
export type PropertyEventUpdate = Partial<Omit<PropertyEventInsert, 'user_id' | 'property_id'>>

// ── Migration 033 — Type d'usage d'un bien immobilier ─────────────
export type PropertyUsageType =
  | 'primary_residence'
  | 'secondary_residence'
  | 'long_term_rental'
  | 'short_term_rental'
  | 'mixed_use'

export const USAGE_TYPE_LABELS: Record<PropertyUsageType, string> = {
  primary_residence:    'Résidence principale',
  secondary_residence:  'Résidence secondaire',
  long_term_rental:     'Investissement locatif — longue durée',
  short_term_rental:    'Investissement locatif — courte durée (saisonnier)',
  mixed_use:            'Usage mixte (occupé + loué)',
}

/** Renvoie true si l'usage_type est un investissement locatif (loyers attendus). */
export function isRentalUsage(usage: PropertyUsageType | null | undefined): boolean {
  return usage === 'long_term_rental'
      || usage === 'short_term_rental'
      || usage === 'mixed_use'
}
export type DataSource = 'manual' | 'api' | 'estimation' | 'import'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'BTC' | 'ETH'
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
  // CS1+consolidation 1 — `fiscal_situation` DROP COLUMN (migration 052).
  // Colonne morte (était lue uniquement par /parametres, retirée en CS1).
  created_at: string
  updated_at: string

  // ── Migration 015 — Questionnaire de profil investisseur ───────────
  // Toutes les colonnes sont nullable : un profile cree avant la migration
  // 015 (ou par un user qui n'a pas encore rempli le wizard) renvoie null.
  prenom:               string | null
  age:                  number | null
  situation_familiale:  string | null
  enfants:              string | null      // "0".."4+"
  statut_pro:           string | null

  revenu_mensuel:       number | null
  revenu_conjoint:      number | null
  autres_revenus:       number | null
  stabilite_revenus:    string | null

  loyer:                number | null
  autres_credits:       number | null
  charges_fixes:        number | null
  depenses_courantes:   number | null

  epargne_mensuelle:    number | null
  // QW1+consolidation 1 — `invest_mensuel` DROP COLUMN (migration 052).
  // Champ mort en aval depuis QW1, retiré du wizard puis de la DB.
  enveloppes:           string[] | null

  quiz_bourse:          number[] | null
  quiz_crypto:          number[] | null
  quiz_immo:            number[] | null
  /** CS3 — Domaines auto-déclarés expert (bouton "Je connais déjà"). */
  quiz_self_declared_domains: string[] | null

  risk_1:               string | null
  risk_2:               string | null
  risk_3:               string | null
  risk_4:               string | null
  fire_type:            string | null
  revenu_passif_cible:  number | null
  age_cible:            number | null
  // CS4 — `priorite` LEGACY conservée (lecture fallback uniquement, plus
  // d'écriture). Le moteur consomme `objectifs_axes` en priorité.
  priorite:             string | null
  // CS4 — Boussole d'objectifs 4 axes (rendement, securite, optimisation,
  // transmission) valeurs 0..100. NULL = pas encore migré.
  objectifs_axes:       { rendement: number; securite: number; optimisation: number; transmission: number } | null

  /** Sentinel : si null, le wizard n'a jamais ete soumis. */
  profile_completed_at: string | null

  // ── Migration 019 / 047 / 050 ────────────────────────────────────
  /** Numero de la derniere etape (0..10) completee dans le wizard.
   *  0 = jamais commence, 10 = wizard termine. Utilise pour proposer
   *  "Reprendre a l etape X" quand l utilisateur revient sans avoir fini.
   *  - CHECK <= 8 en 019
   *  - CHECK <= 9 en 047 (CS1 ajout Step9 fiscalité)
   *  - CHECK <= 10 en 050 (CS5 ajout Step10 projets de vie) */
  wizard_step_completed: number

  // ── Migration 050 — CS5 statut propriétaire RP ────────────────────
  /** Pilote l'affichage du bloc Achat RP dans Step10. NULL = pas encore
   *  répondu. Cf. PROPRIETAIRE_RP_STATUS_VALUES dans lifeEventsConstants. */
  proprietaire_rp_status: 'oui_actuel' | 'non_prevu' | 'non_pas_prevu' | null

  // ── Migration 031 — Onboarding 60 secondes ────────────────────────
  /** Sentinel : true dès la première soumission de /bienvenue
   *  (3 inputs). Bloque la re-navigation vers /bienvenue. */
  onboarding_quick_done:       boolean
  /** Snapshot des 3 inputs onboarding pour pré-remplir le wizard si
   *  l'utilisateur choisit ensuite d'affiner. */
  onboarding_quick_data:       Json | null

  // ── Migration 022 — Préférences email ────────────────────────────
  /** Opt-in rapport patrimonial mensuel par email (default true). */
  email_monthly_report:        boolean
  /** Token unique utilisé dans le lien public de désinscription. */
  email_unsubscribe_token:     string
  /** Date du dernier rapport mensuel envoyé avec succès. */
  last_monthly_report_sent_at: string | null

  // ── Migration 036 — Contexte foyer fiscal (LMP detection + QF) ───
  /** Revenus professionnels annuels du foyer (salaires nets imposables,
   *  BNC, BIC pro, pensions). Hors revenus locatifs. Sert à détecter LMP. */
  professional_income_eur: number | null
  /** Nombre de parts fiscales du foyer (quotient familial). */
  foyer_fiscal_parts:      number | null
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
  // ── Migration 039 — Plus-value réalisée (E4) ──
  // Renseignée uniquement pour `transaction_type = 'sale'` :
  // realized_pnl = (unitPrice − oldPru) × soldQty, en devise de référence.
  // NULL pour les achats et les dividendes.
  realized_pnl: number | null
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
  // ── Migration 034 — Multi-crédit par bien ────────────────────
  /** Type de prêt (principal / PTZ / travaux / PEL / Action Logement /
   *  relais / in fine / autre). Permet de distinguer plusieurs crédits
   *  actifs sur un même bien. NOT NULL DEFAULT 'principal'. */
  loan_kind: LoanKind
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
  // ── Migration 033 — Type d'usage du bien ────────────────────
  usage_type: PropertyUsageType
  // ── Migration 037 — Compte courant d'associé SCI ────────────
  /** Comptes courants d'associés SCI (avances). Leur remboursement
   *  est fiscalement neutre (CGI art. 200 A). */
  cca_amount: number | null
  // ── Migration 043 — Coordonnées géocodées ───────────────────
  /** Latitude géocodée via api-adresse.data.gouv.fr (~1 cm précision).
   *  Null si géocodage échoué ou pas encore tenté. */
  latitude:    number | null
  /** Longitude géocodée. Null si géocodage échoué ou pas encore tenté. */
  longitude:   number | null
  /** Date du dernier géocodage réussi (re-géocodage si adresse change). */
  geocoded_at: string | null
  created_at: string
  updated_at: string
}

export type RentalType = 'long_term' | 'short_term' | 'mixed'

export type TourismClassification =
  | 'non_classe'
  | 'classe_1_2'
  | 'classe_3_4_5'
  | 'chambre_hotes'

/**
 * Saisonnalite mensuelle d'un lot courte duree.
 * Cles "1".."12" (Jan..Dec).
 */
export type SeasonalityMap = Partial<Record<
  '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12',
  {
    occupancyRatePct: number
    nightlyRate?: number
    blockedDays?: number
  }
>>

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
  /** Migration 035 — loyer de marché estimé (HC mensuel) */
  market_rent: number | null
  market_rent_updated_at: string | null
  tenant_name: string | null
  lease_start_date: string | null
  lease_end_date: string | null
  notes: string | null
  // ── Migration 042 — Location courte duree ─────────────────
  rental_type: RentalType
  nightly_rate_low: number | null
  nightly_rate_mid: number | null
  nightly_rate_high: number | null
  occupancy_rate_pct: number | null
  cleaning_fee_per_stay: number | null
  avg_stay_nights: number | null
  platform_airbnb_pct: number | null
  platform_booking_pct: number | null
  platform_other_pct: number | null
  platform_airbnb_mix_pct: number | null
  platform_booking_mix_pct: number | null
  platform_direct_mix_pct: number | null
  concierge_fee_pct: number | null
  cleaning_cost_per_stay: number | null
  linen_cost_per_stay: number | null
  tourism_classification: TourismClassification | null
  seasonality_coefficients: SeasonalityMap | null
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
  // ── Colonnes historiques (mig 001/005) ────────────────────────
  taxe_fonciere: number
  insurance: number     // = PNO (Propriétaire Non Occupant) — conservé
  accountant: number
  cfe: number
  condo_fees: number    // courantes — conservé
  maintenance: number   // routine — conservé
  other: number
  vacancy_rate: number
  notes: string | null
  // ── Migration 040 — Charges exhaustives ───────────────────────
  // Toutes nullable avec defaut 0 en DB — typées number | null pour
  // refléter qu'un INSERT partiel/row pré-mig 040 peut laisser null.
  // Taxes locales
  taxe_habitation:        number | null
  taxe_logements_vacants: number | null
  teom:                   number | null
  // Assurances complémentaires
  insurance_gli_eur:      number | null
  insurance_gli_pct:      number | null
  insurance_mrh:          number | null
  // Copropriété complémentaire
  condo_fees_works:       number | null
  condo_special_fund:     number | null
  // Gestion locative
  management_agency_eur:  number | null
  management_agency_pct:  number | null
  management_airbnb_pct:  number | null
  management_booking_pct: number | null
  management_cleaning:    number | null
  management_concierge:   number | null
  // Travaux & entretien
  maintenance_major:      number | null
  repairs_provision:      number | null
  // Charges professionnelles complémentaires
  legal_fees:             number | null
  diagnostics_fees:       number | null
  // Abonnements
  utilities_internet:     number | null
  utilities_electricity:  number | null
  utilities_water:        number | null
  // Note libre liée à "other"
  other_note:             string | null
  created_at: string
  updated_at: string
}

// ── Migration 038 — Dispositifs fiscaux incitatifs ──────────────
// Table 1-N (1 dispositif actif max par bien, voir index unique).
// Couvre Pinel/Pinel+, Denormandie, Malraux, MH, Loc'Avantages, Censi-Bouvard.
// Colonnes spécifiques nullables, utilisées selon le `kind`.

export type PropertyTaxIncentiveKind =
  | 'pinel'
  | 'pinel_plus'
  | 'denormandie'
  | 'malraux'
  | 'monuments_historiques'
  | 'loc_avantages'
  | 'censi_bouvard'

export type PropertyTaxIncentiveZone = 'A_bis' | 'A' | 'B1' | 'B2' | 'C'

export type LocAvantagesConvention = 'loc1' | 'loc2' | 'loc3'

export interface PropertyTaxIncentive {
  id:          string
  property_id: string
  user_id:     string
  kind:        PropertyTaxIncentiveKind

  // Pinel / Pinel+ / Denormandie
  duration_years:   6 | 9 | 12 | null
  zone:             PropertyTaxIncentiveZone | null
  start_year:       number | null
  rent_cap_monthly: number | null
  is_pinel_plus:    boolean | null

  // Denormandie spécifique
  works_amount: number | null

  // Malraux / MH
  classification:        string | null
  occupancy:             string | null
  works_start_year:      number | null
  works_end_year:        number | null
  conservation_end_year: number | null
  reduction_rate_pct:    number | null

  // Loc'Avantages
  convention_type:    LocAvantagesConvention | null
  convention_start:   string | null
  convention_end:     string | null
  market_rent_annual: number | null

  notes:      string | null
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

// Migration 031 : tables d'investissement programmé supprimées.
// Les interfaces correspondantes sont retirées (feature jamais activée).

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

export type PropertyTaxIncentiveInsert = Omit<PropertyTaxIncentive, 'id' | 'created_at' | 'updated_at'>
export type PropertyTaxIncentiveUpdate = Partial<Omit<PropertyTaxIncentiveInsert, 'user_id' | 'property_id'>>

// Migration 012 : ScpiAssetInsert/Update, ScpiDividendInsert,
// FinancialAssetInsert/Update supprimés (tables droppées).

export type FinancialEnvelopeInsert = Omit<FinancialEnvelope, 'id' | 'created_at' | 'updated_at'>
export type FinancialEnvelopeUpdate = Partial<Omit<FinancialEnvelopeInsert, 'user_id'>>

export type CashAccountInsert = Omit<CashAccount, 'id' | 'created_at' | 'updated_at'>
export type CashAccountUpdate = Partial<Omit<CashAccountInsert, 'user_id' | 'asset_id'>>

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
  // ── Migration 045 — Preuve de vie cron / refresh manuel ──
  // Horodatage de la dernière TENTATIVE de refresh (succès, skip ou échec).
  // Distinct de `instrument_prices.priced_at` qui est la date de validité
  // marché. Permet à l'UI de distinguer "prix vieux car marché ne bouge pas"
  // (priced_at ancien + last_refresh récent) de "cron cassé" (les deux anciens).
  last_refresh_attempted_at: string | null
  // ── Migration 046 — Benchmark (indice de référence) ──
  // TRUE = indice tracké pour comparaison de performance, jamais détenu.
  // Filtré des listes utilisateur, inclus dans le refresh cron.
  is_benchmark: boolean
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

// ─── Migration 017 — Acquisitions immobilieres futures simulees ──────────────

export type FutureAcquisitionType = 'locatif' | 'RP'

export interface FutureAcquisitionRow {
  id:                          string
  user_id:                     string
  nom:                         string
  dans_combien_annees:         number
  prix_achat:                  number
  frais_notaire_pct:           number
  apport:                      number
  taux_interet:                number
  duree_credit_ans:            number
  type:                        FutureAcquisitionType
  loyer_brut_mensuel:          number
  taux_vacance_pct:            number
  charges_mensuelles:          number
  appreciation_annuelle_pct:   number
  created_at:                  string
  updated_at:                  string
}

export type FutureAcquisitionInsert = Omit<FutureAcquisitionRow, 'id' | 'created_at' | 'updated_at'>
export type FutureAcquisitionUpdate = Partial<Omit<FutureAcquisitionInsert, 'user_id'>>

// ─── Sprint 2 — D5 : tables manquantes ajoutees manuellement ─────────────────
// (a regenerer via `npx supabase gen types typescript --local > types/database.types.ts`
// quand la CLI sera configuree).

/** Migration 020 — Snapshots quotidiens du patrimoine global. */
export interface WealthSnapshot {
  id:                     string
  user_id:                string
  snapshot_date:          string                  // YYYY-MM-DD
  patrimoine_brut:        number
  patrimoine_net:         number
  total_portefeuille:     number
  total_immo:             number
  total_cash:             number
  total_dettes:           number
  revenu_passif_mensuel:  number
  progression_fire_pct:   number | null
  created_at:             string
}
export type WealthSnapshotInsert = Omit<WealthSnapshot, 'id' | 'created_at'>

/** Migration 030 — Recommandations marquées « Fait » par l'utilisateur. */
export interface RecoDone {
  id:         string
  user_id:    string
  reco_key:   string
  done_at:    string
  undone_at:  string | null
}
export type RecoDoneInsert = Omit<RecoDone, 'id' | 'done_at' | 'undone_at'> & {
  done_at?:   string
  undone_at?: string | null
}

/** Migration 021 — Erreurs de signup loguees par fn_handle_new_user. */
export interface SignupError {
  id:             string
  user_id:        string | null
  error_message:  string
  sqlstate:       string | null
  created_at:     string
}

/** Migration 022/023 — Logs d'envois email (rapport mensuel). */
export interface EmailLog {
  id:             string
  user_id:        string
  email_type:     string
  sent_at:        string
  success:        boolean
  error_message:  string | null
  message_id:     string | null
}
export type EmailLogInsert = Omit<EmailLog, 'id' | 'sent_at'> & { sent_at?: string }

/** Migration 016 — Cache global ISIN → metadonnees. Lecture/ecriture authentifiee. */
export interface IsinCache {
  isin:               string
  name:               string | null
  asset_type:         string | null
  ticker:             string | null
  exchange:           string | null
  currency:           string | null
  sector:             string | null
  geography:          string | null
  source:             string | null
  confidence:         string | null
  fetched_at:         string
  cache_expires_at:   string
}

/** Migration 011 — Snapshots du portefeuille financier uniquement. */
export interface PortfolioSnapshot {
  id:                     string
  user_id:                string
  snapshot_date:          string
  total_market_value:     number
  total_cost_basis:       number
  total_unrealized_pnl:   number | null
  positions_count:        number
  freshness_ratio:        number | null
  created_at:             string
  // ── Migration 044 — Snapshots par enveloppe ──
  // NULL = snapshot global du portefeuille entier (comportement historique).
  // Non-NULL = snapshot d'une enveloppe specifique (PEA, CTO, AV...).
  // Les deux coexistent pour la meme date — cf. index uniques partiels.
  envelope_id:            string | null
}

/** Sprint 1 — Migration 025 : dedup imports CSV par SHA-256. */
export interface ImportHistory {
  id:           string
  user_id:      string
  file_hash:    string
  imported_at:  string
  row_count:    number
  broker_hint:  string | null
}
export type ImportHistoryInsert = Omit<ImportHistory, 'id' | 'imported_at'> & { imported_at?: string }

// ─── Migration 049 — CS5 évènements de vie ───────────────────────────────────
//
// Cf. lib/profil/lifeEventsConstants.ts pour la source unique des types et
// libellés.

export type LifeEventType = 'retraite' | 'capital_exceptionnel' | 'achat_rp' | 'naissance'

/** Payload `meta` par type — typé par sous-interface pour discriminer. */
export type LifeEventMeta =
  | { /* retraite */              [k: string]: never }
  | { /* capital_exceptionnel */  preset?: 'heritage' | 'vente_entreprise' | 'autre' }
  | { /* achat_rp */              apport?: number; mensualite?: number; duree_credit_annees?: number }
  | { /* naissance */             nb_enfants?: number }
  | Record<string, never>

export interface LifeEventRow {
  id:              string
  user_id:         string
  type:            LifeEventType
  is_active:       boolean
  occurrence_date: string            // 'YYYY-MM-01'
  montant:         number | null
  label:           string | null
  meta:            Json
  created_at:      string
  updated_at:      string
}

export type LifeEventInsert = Omit<LifeEventRow, 'id' | 'created_at' | 'updated_at'>
export type LifeEventUpdate = Partial<Omit<LifeEventInsert, 'user_id'>>
