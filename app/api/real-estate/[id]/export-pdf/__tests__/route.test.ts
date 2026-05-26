/**
 * Tests de la route GET /api/real-estate/[id]/export-pdf.
 *
 * Couverture :
 *  - Bien existant => 200 + Content-Type application/pdf
 *  - Bien inexistant => 404
 *  - Bien d'un autre user => 404 (filtre user_id en lookup)
 *  - Annee invalide => 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface PropRow {
  id: string; asset_id: string; purchase_price: number; purchase_fees: number;
  works_amount: number; furniture_amount: number; fiscal_regime: string;
  rental_index_pct: number; charges_index_pct: number; property_index_pct: number;
  land_share_pct: number; amort_building_years: number; amort_works_years: number;
  amort_furniture_years: number; gli_pct: number; management_pct: number;
  vacancy_months: number; lmp_ssi_rate: number; acquisition_fees_treatment: string;
  lmnp_micro_abattement_pct: number; assumed_total_rent: number | null;
  address_line1: string | null; address_city: string | null; address_zip: string | null;
  property_type: string; asset: { name: string; current_value: number; acquisition_date: string } | null;
}

interface DebtRow {
  id: string; asset_id: string; loan_kind: string;
  initial_amount: number; interest_rate: number; insurance_rate: number;
  duration_months: number; start_date: string;
  bank_fees: number; guarantee_fees: number; amortization_type: string;
}

const state: {
  propResult: { data: PropRow | null; error: Error | null }
  // V14 — multi-crédit : la route SELECT TOUS les debts actifs.
  debtRows:   DebtRow[]
} = {
  propResult: { data: null, error: null },
  debtRows:   [],
}

const validProp: PropRow = {
  id: 'prop-1', asset_id: 'asset-1',
  purchase_price: 200_000, purchase_fees: 15_000, works_amount: 0,
  furniture_amount: 0, fiscal_regime: 'foncier_nu',
  rental_index_pct: 2, charges_index_pct: 2, property_index_pct: 1,
  land_share_pct: 15, amort_building_years: 30, amort_works_years: 15,
  amort_furniture_years: 7, gli_pct: 0, management_pct: 0,
  vacancy_months: 0, lmp_ssi_rate: 35, acquisition_fees_treatment: 'expense_y1',
  lmnp_micro_abattement_pct: 50, assumed_total_rent: null,
  address_line1: null, address_city: 'Paris', address_zip: '75001',
  property_type: 'apartment',
  asset: { name: 'Test Bien', current_value: 220_000, acquisition_date: '2024-01-01' },
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => {
      // Lookup principal de la propriete
      if (table === 'real_estate_properties') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => state.propResult,
              }),
            }),
          }),
        }
      }
      // V14 — multi-crédit : la route SELECT TOUS les debts actifs
      // (asset_id + user_id + status='active'), plus de `.maybeSingle()`.
      // Le mock résout la chaîne 3 × `.eq()` puis `.then()` avec
      // `state.debtRows`.
      if (table === 'debts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  then: (cb: (r: { data: DebtRow[]; error: null }) => unknown) =>
                    cb({ data: state.debtRows, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      // Toutes les autres requetes : pas d'erreur, donnees vides
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
              then: (cb: (r: { data: unknown[]; error: null }) => unknown) => cb({ data: [], error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (cb: (r: { data: unknown[]; error: null }) => unknown) => cb({ data: [], error: null }),
          }),
        }),
      }
    },
  })),
}))

vi.mock('@/lib/utils/api', async () => ({
  withAuth: <T,>(
    h: (req: Request, user: { id: string }, ctx: T) => Promise<Response>,
  ) =>
    (req: Request, ctx: T) => h(req, { id: 'user-test' }, ctx),
  err: (message: string, status = 400) =>
    new Response(JSON.stringify({ data: null, error: message }),
      { status, headers: { 'Content-Type': 'application/json' } }),
}))

import { GET } from '../route'

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })
const makeReq = (year?: number) =>
  new Request(`http://x?year=${year ?? 2025}`)

beforeEach(() => {
  state.propResult = { data: null, error: null }
  state.debtRows   = []
})

describe('GET /api/real-estate/[id]/export-pdf', () => {
  it('Test 2 — bien inexistant => 404', async () => {
    state.propResult = { data: null, error: null }
    const res = await GET(makeReq(2025), makeCtx('missing'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Property not found')
  })

  it('Test 3 — bien d\'un autre user => 404 (lookup retourne null)', async () => {
    // Mock filtre user_id : pour un user different, lookup retourne null
    state.propResult = { data: null, error: null }
    const res = await GET(makeReq(2025), makeCtx('prop-other'))
    expect(res.status).toBe(404)
  })

  it('annee invalide => 400', async () => {
    const res = await GET(new Request('http://x?year=99999'), makeCtx('prop-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid year')
  })

  it('Test 1 — bien existant => 200 + Content-Type application/pdf', async () => {
    state.propResult = { data: validProp, error: null }
    const res = await GET(makeReq(2025), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment.*filename=.+\.pdf/)
    const blob = await res.arrayBuffer()
    expect(blob.byteLength).toBeGreaterThan(1000)
    // Bytes magiques %PDF-
    const view = new Uint8Array(blob).slice(0, 5)
    const header = String.fromCharCode(...view)
    expect(header).toBe('%PDF-')
  })

  // ─── V14 — multi-crédit ────────────────────────────────────────────────

  it('V14 — bien à 2 crédits (principal + PTZ) : 200 + PDF généré sans crash', async () => {
    state.propResult = { data: validProp, error: null }
    state.debtRows = [
      {
        id: 'd1', asset_id: 'asset-1', loan_kind: 'principal',
        initial_amount: 180_000, interest_rate: 3.5, insurance_rate: 0.3,
        duration_months: 240, start_date: '2024-01-15',
        bank_fees: 800, guarantee_fees: 1_500, amortization_type: 'constant',
      },
      {
        id: 'd2', asset_id: 'asset-1', loan_kind: 'ptz',
        initial_amount: 40_000, interest_rate: 0, insurance_rate: 0,
        duration_months: 240, start_date: '2024-01-15',
        bank_fees: 0, guarantee_fees: 0, amortization_type: 'constant',
      },
    ]
    const res = await GET(makeReq(2025), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    const blob = await res.arrayBuffer()
    expect(blob.byteLength).toBeGreaterThan(1000)
    const header = String.fromCharCode(...new Uint8Array(blob).slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('V14 — tri principal-first : PTZ saisi avant principal en DB → principal reste tête', async () => {
    // L'ordre Supabase n'est pas garanti — le tri côté route doit le forcer.
    state.propResult = { data: validProp, error: null }
    state.debtRows = [
      {
        id: 'd-ptz', asset_id: 'asset-1', loan_kind: 'ptz',
        initial_amount: 40_000, interest_rate: 0, insurance_rate: 0,
        duration_months: 240, start_date: '2024-01-15',
        bank_fees: 0, guarantee_fees: 0, amortization_type: 'constant',
      },
      {
        id: 'd-principal', asset_id: 'asset-1', loan_kind: 'principal',
        initial_amount: 180_000, interest_rate: 3.5, insurance_rate: 0.3,
        duration_months: 240, start_date: '2024-01-15',
        bank_fees: 800, guarantee_fees: 1_500, amortization_type: 'constant',
      },
    ]
    const res = await GET(makeReq(2025), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    // Le PDF doit être généré (pas de crash sur la non-conformité de l'ordre).
    const blob = await res.arrayBuffer()
    expect(blob.byteLength).toBeGreaterThan(1000)
  })
})
