/**
 * Loader Supabase pour le pipeline Dashboard (V1.1).
 *
 * Reproduit fidèlement les requêtes du Server Component
 * `app/(app)/dashboard/page.tsx:40-93`, sans les appels relatifs aux widgets
 * « pipeline B » (FIRE Hero, Actions du mois, Calendrier fiscal) qui restent
 * pilotés par `getPatrimoineComplet` côté page jusqu'aux sous-étapes
 * V1.2 / V1.3 du plan de migration.
 *
 * **Note V1.1 :** ce loader n'est PAS encore branché sur la page. Il est
 * exposé pour servir de point d'entrée propre à `buildDashboardData()` et
 * pour permettre une bascule progressive (étape 3 du plan 5.3).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPortfolioFromDb } from '@/lib/portfolio/build-from-db'
import { computeRealEstatePortfolio } from '@/lib/real-estate/portfolio'
import type { TransactionForTwr } from '@/lib/portfolio/transaction-segments'
import type { DashboardPipelineInputs } from './types'

interface TransactionRow {
  position_id:        string | null
  transaction_type:   string
  quantity:           number | string | null
  unit_price:         number | string | null
  amount:             number | string | null
  fx_rate_to_ref:     number | string | null
  executed_at:        string
}

interface PositionMetaRow {
  id:               string
  quantity:         number | string | null
  average_price:    number | string | null
  acquisition_date: string | null
  /** V2.4 P0.7 — Enveloppe rattachée (PEA / CTO / AV / wallet_crypto…). */
  envelope_id:      string | null
}

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Charge tous les inputs Supabase nécessaires à `computeDashboardData()`. */
export async function loadDashboardInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId:   string,
): Promise<DashboardPipelineInputs> {
  // ── Requêtes principales en parallèle (page.tsx:40-69) ──────────────
  const [
    assetsRes, debtsRes, snapshotsRes,
    portfolioResult, realEstatePortfolio,
    transactionsRes, positionsMetaRes,
    cashAccountsRes,
    envelopesRes, realEstatePropsRes,
  ] = await Promise.all([
    // V2.4 P0.7 — on récupère aussi `acquisition_date` pour le filtre 90 j immobilier.
    supabase
      .from('assets')
      .select('id,name,asset_type,current_value,acquisition_price,confidence,last_valued_at,acquisition_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('asset_type', ['real_estate', 'cash', 'other']),
    supabase
      .from('debts')
      .select('asset_id,capital_remaining,monthly_payment')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('wealth_snapshots')
      .select('snapshot_date,patrimoine_net,patrimoine_brut,total_dettes')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(13),
    buildPortfolioFromDb(supabase, userId),
    computeRealEstatePortfolio(supabase, userId, { withActuals: true }),
    // V1.4 — Transactions append-only pour le moteur TWR (cf. lib/portfolio/transaction-segments.ts).
    // On ne sélectionne que les colonnes utiles à TWR + on borne aux positions actives via position_id non null.
    supabase
      .from('transactions')
      .select('position_id,transaction_type,quantity,unit_price,amount,fx_rate_to_ref,executed_at')
      .eq('user_id', userId)
      .not('position_id', 'is', null)
      .in('transaction_type', ['purchase', 'sale', 'dividend'])
      .order('executed_at', { ascending: true }),
    // V1.4 — Méta positions pour alimenter currentQuantity / acquisitionDate / averagePriceEur (fallback TWR legacy).
    // V2.4 P0.7 — on ajoute `envelope_id` pour rattacher chaque position à son enveloppe.
    supabase
      .from('positions')
      .select('id,quantity,average_price,acquisition_date,envelope_id')
      .eq('user_id', userId),
    // V2.1-BIS — `cash_accounts` pour la ligne compacte Cash. On agrège
    // avec `assets.cash` côté `calc.ts` (dédup par `asset_id`).
    // V2.4 P0.7 — on ajoute interest_rate + created_at + bank_name pour Z8.5.
    supabase
      .from('cash_accounts')
      .select('id,asset_id,balance,currency,account_type,interest_rate,created_at,bank_name')
      .eq('user_id', userId),
    // V2.4 P0.7 — Méta enveloppes (libellé + type) pour Z8.5.
    supabase
      .from('financial_envelopes')
      .select('id,name,envelope_type')
      .eq('user_id', userId),
    // V2.4 P0.7 — Lien property_id → asset_id pour récupérer acquisition_date côté asset.
    supabase
      .from('real_estate_properties')
      .select('id,asset_id')
      .eq('user_id', userId),
  ])

  // ── Normalisation snapshots (page.tsx:75-80) ────────────────────────
  const snapshotsRaw = snapshotsRes.data ?? []
  const snapshots = snapshotsRaw.map((s) => ({
    snapshot_date:     s.snapshot_date as string,
    total_net_value:   Number(s.patrimoine_net   ?? 0),
    total_gross_value: Number(s.patrimoine_brut  ?? 0),
    total_debt:        Number(s.total_dettes     ?? 0),
  }))

  // ── Mapping portfolio (extrait du `PortfolioResult` complet) ────────
  const portfolioSummary = {
    totalMarketValue:        portfolioResult.summary.totalMarketValue,
    totalCostBasis:          portfolioResult.summary.totalCostBasis,
    totalCostBasisValued:    portfolioResult.summary.totalCostBasisValued,
    totalUnrealizedPnL:      portfolioResult.summary.totalUnrealizedPnL,
    totalUnrealizedPnLPct:   portfolioResult.summary.totalUnrealizedPnLPct,
    positionsCount:          portfolioResult.summary.positionsCount,
    valuedPositionsCount:    portfolioResult.summary.valuedPositionsCount,
    freshnessRatio:          portfolioResult.summary.freshnessRatio,
    allocationByClass:       portfolioResult.summary.allocationByClass.map((s) => ({
      assetClass: s.assetClass,
      value:      s.value,
    })),
  }

  // ── V1.4 — Enrichissement positions avec quantity / acquisition_date / average_price ──
  const positionsMeta = (positionsMetaRes.data ?? []) as PositionMetaRow[]
  const metaById = new Map(positionsMeta.map((m) => [m.id, m]))

  const portfolioPositions = portfolioResult.positions.map((p) => {
    const meta = metaById.get(p.positionId)
    return {
      positionId:  p.positionId,
      name:        p.name,
      assetClass:  p.assetClass,
      status:      p.status,
      marketValue: p.marketValue,
      costBasis:   p.costBasis,
      priceStale:  p.priceStale,
      // V1.4 P0.3 — Champs requis par le moteur TWR + fallback legacy.
      currentQuantity:  meta ? num(meta.quantity) : undefined,
      acquisitionDate:  meta?.acquisition_date ?? undefined,
      averagePriceEur:  meta ? num(meta.average_price) : undefined,
      // V2.4 P0.7 — Rattachement à l'enveloppe (pour le TWR par enveloppe).
      envelopeId:       meta?.envelope_id ?? null,
    }
  })

  // ── V1.4 — Mapping transactions → sous-ensemble dédié au TWR ────────
  const transactionsRows = (transactionsRes.data ?? []) as TransactionRow[]
  const transactionsPortefeuille: TransactionForTwr[] = transactionsRows
    .filter((t): t is TransactionRow & { position_id: string } => t.position_id !== null)
    .map((t) => {
      const fxRate    = num(t.fx_rate_to_ref) || 1
      const quantity  = num(t.quantity)
      const unitPrice = num(t.unit_price) * fxRate
      const amount    = Math.abs(num(t.amount)) * fxRate
      return {
        executedAt:   t.executed_at,
        type:         t.transaction_type as TransactionForTwr['type'],
        positionId:   t.position_id,
        quantity,
        unitPriceEur: unitPrice,
        amountEur:    amount > 0 ? amount : quantity * unitPrice,
      }
    })

  // ── Mapping real estate portfolio ───────────────────────────────────
  // V2.4 P0.7 — On enrichit chaque bien avec netNetYield (pour le ranking
  // immobilier Z8.5) et acquisitionDate (lue côté `assets`, cf. select ci-dessus).
  const assetsById = new Map((assetsRes.data ?? []).map((a) => [a.id as string, a]))
  const realEstate = {
    properties: realEstatePortfolio.properties.map((p) => {
      const asset = assetsById.get(p.assetId)
      const acquisitionDate = (asset as { acquisition_date?: string | null } | undefined)?.acquisition_date ?? null
      return {
        propertyId:   p.propertyId,
        propertyName: p.propertyName,
        assetId:      p.assetId,
        // Force boolean : `incompleteData` peut être `undefined` côté
        // PropertySimResult ; le bloc inline le traite comme falsy via `!`.
        simulation: {
          incompleteData: !!p.simulation.incompleteData,
          netNetYieldPct: p.simulation.kpis?.netNetYield,
        },
        acquisitionDate,
        driftAlerts:  p.driftAlerts ?? [],
      }
    }),
    totalCapitalRemaining: realEstatePortfolio.totalCapitalRemaining,
    totalMonthlyCFYear1:   realEstatePortfolio.totalMonthlyCFYear1,
  }

  // ── V2.4 P0.7 — Méta enveloppes (libellé + type) pour Z8.5 ──────────
  const envelopes = (envelopesRes.data ?? []).map((e) => ({
    id:           e.id as string,
    name:         e.name as string,
    envelopeType: e.envelope_type as string,
  }))
  // realEstatePropsRes n'est plus exploitée directement ici (les biens
  // viennent déjà de computeRealEstatePortfolio). Conservée dans la
  // chaîne `await` pour fail fast en cas d'erreur Supabase.
  void realEstatePropsRes

  return {
    assets:              assetsRes.data ?? [],
    debts:               debtsRes.data  ?? [],
    snapshots,
    portfolioSummary,
    portfolioPositions,
    realEstatePortfolio: realEstate,
    cashAccounts:        cashAccountsRes.data ?? [],
    envelopes,
    transactionsPortefeuille,
    asOfDate: new Date(),
  }
}
