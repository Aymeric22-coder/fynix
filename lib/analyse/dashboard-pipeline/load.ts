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
  ] = await Promise.all([
    supabase
      .from('assets')
      .select('id,name,asset_type,current_value,acquisition_price,confidence,last_valued_at')
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
    supabase
      .from('positions')
      .select('id,quantity,average_price,acquisition_date')
      .eq('user_id', userId),
    // V2.1-BIS — `cash_accounts` pour la ligne compacte Cash. On agrège
    // avec `assets.cash` côté `calc.ts` (dédup par `asset_id`).
    supabase
      .from('cash_accounts')
      .select('id,asset_id,balance,currency,account_type')
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
  const realEstate = {
    properties: realEstatePortfolio.properties.map((p) => ({
      propertyId:   p.propertyId,
      propertyName: p.propertyName,
      assetId:      p.assetId,
      // Force boolean : `incompleteData` peut être `undefined` côté
      // PropertySimResult ; le bloc inline le traite comme falsy via `!`.
      simulation: { incompleteData: !!p.simulation.incompleteData },
      driftAlerts:  p.driftAlerts ?? [],
    })),
    totalCapitalRemaining: realEstatePortfolio.totalCapitalRemaining,
    totalMonthlyCFYear1:   realEstatePortfolio.totalMonthlyCFYear1,
  }

  return {
    assets:              assetsRes.data ?? [],
    debts:               debtsRes.data  ?? [],
    snapshots,
    portfolioSummary,
    portfolioPositions,
    realEstatePortfolio: realEstate,
    cashAccounts:        cashAccountsRes.data ?? [],
    transactionsPortefeuille,
    asOfDate: new Date(),
  }
}
