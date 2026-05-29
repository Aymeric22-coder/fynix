/**
 * Test integration `getPatrimoineComplet` (Sprint 2 — D8).
 *
 * On construit un fake Supabase client minimal qui repond aux requetes
 * faites par les 4 loaders internes (loadImmo / loadCash / loadProfile +
 * getEnrichedPositions). Les enrichissements FX et ISIN externes sont
 * mockes pour eviter tout appel reseau.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Fake Supabase client ──────────────────────────────────────────────

function buildSupabaseMock(tables: Record<string, unknown[]>) {
  function tableBuilder(_table: string, rows: unknown[]) {
    const data = { rows }
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq:     () => builder,
      neq:    () => builder,
      in:     () => builder,
      not:    () => builder,
      gte:    () => builder,
      lte:    () => builder,
      gt:     () => builder,
      lt:     () => builder,
      order:  () => builder,
      limit:  () => builder,
      range:  () => builder,
      maybeSingle: async () => ({ data: data.rows[0] ?? null, error: null }),
      single:      async () => ({ data: data.rows[0] ?? null, error: null }),
      // Permet `await supabase.from(...).select(...)`
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: data.rows, error: null }).then(resolve),
    }
    return builder
  }
  return {
    from: (table: string) => tableBuilder(table, tables[table] ?? []),
  }
}

// ── Mocks dependencies ────────────────────────────────────────────────

const supabaseTables: Record<string, unknown[]> = {}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => buildSupabaseMock(supabaseTables)),
  createServiceClient: vi.fn(() => buildSupabaseMock(supabaseTables)),
}))

vi.mock('@/lib/providers/fx', () => ({
  toEur: async (amount: number) => amount,
  getFxRate: async () => 1,
}))

vi.mock('../enrichPositions', () => ({
  getEnrichedPositions: vi.fn(async () => ({
    positions:  [],
    totalValue: 0,
  })),
}))

vi.mock('../isinBatch', () => ({
  enrichMultipleISIN: async () => new Map(),
}))

import { getPatrimoineComplet } from '../aggregateur'

// ── Helpers ───────────────────────────────────────────────────────────

function setupTables(over: Partial<Record<string, unknown[]>> = {}) {
  // Reset
  for (const k of Object.keys(supabaseTables)) delete supabaseTables[k]
  // Defaults : profil minimal complet, le reste vide.
  Object.assign(supabaseTables, {
    profiles: [{
      id: 'u-1', tmi_rate: 30, fire_type: 'standard',
      age: 35, age_cible: 50,
      epargne_mensuelle: 1000, revenu_passif_cible: 3000,
      revenu_mensuel_total: 5000, charges_mensuelles: 2000,
      enveloppes: ['PEA', 'Assurance-vie'],
      stabilite_revenus: 'cdi', priorite: 'liberte',
      situation_familiale: 'celibataire', enfants: '0',
      risk_1: 3, risk_2: 3, risk_3: 3, risk_4: 3,
      questionnaire_bourse: 3, questionnaire_crypto: 3, questionnaire_immo: 3,
      experience_pct: 50,
      prenom: 'Test',
      actions_eu_value: 0,
    }],
    real_estate_properties: [],
    real_estate_lots:       [],
    debts:                  [],
    cash_accounts:          [],
    property_charges:       [],
    real_estate_valuations: [],
    transactions:           [],
    ...over,
  })
}

beforeEach(() => { setupTables() })

describe('getPatrimoineComplet — structure', () => {
  it('retourne les cles attendues meme avec patrimoine vide', async () => {
    const p = await getPatrimoineComplet('u-1')
    expect(p).toHaveProperty('fireInputs')
    expect(p).toHaveProperty('biens')
    expect(p).toHaveProperty('positions')
    expect(p).toHaveProperty('comptes')
    expect(p).toHaveProperty('projectionFIRESnapshot')
    expect(p).toHaveProperty('scores')
    expect(p).toHaveProperty('recommandations')
    expect(p.fireInputs).toHaveProperty('tmi_estime')
  })

  it('totalNet = 0 quand toutes les sources sont vides', async () => {
    const p = await getPatrimoineComplet('u-1')
    expect(p.totalNet).toBe(0)
    expect(p.totalBrut).toBe(0)
    expect(p.totalImmo).toBe(0)
    expect(p.totalCash).toBe(0)
  })
})

describe('getPatrimoineComplet — TMI fallback (D8 #3)', () => {
  it('tmi_rate null sur le profil → tmi_estime=true dans fireInputs', async () => {
    setupTables({
      profiles: [{
        id: 'u-1', tmi_rate: null, fire_type: 'standard',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [],
        prenom: null,
      }],
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.tmi_rate).toBeNull()
    expect(p.fireInputs.tmi_estime).toBe(true)
  })

  it('tmi_rate renseigne → tmi_estime=false', async () => {
    setupTables({
      profiles: [{
        id: 'u-1', tmi_rate: 41, fire_type: 'standard',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [], prenom: null,
      }],
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.tmi_rate).toBe(41)
    expect(p.fireInputs.tmi_estime).toBe(false)
  })
})

describe('getPatrimoineComplet — fire_type → SWR (D8 #4)', () => {
  it('fire_type=lean propage dans fireInputs', async () => {
    setupTables({
      profiles: [{
        id: 'u-1', tmi_rate: 30, fire_type: 'lean',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [], prenom: null,
      }],
    })
    const p = await getPatrimoineComplet('u-1')
    // fire_type est ajoute en plus du type strict via cast cote agregateur.
    expect((p.fireInputs as unknown as { fire_type: string }).fire_type).toBe('lean')
  })

  it('lean vs standard : cible FIRE differente (SWR 3.5 vs 4)', async () => {
    // Standard → cible × 25 inflation-adjusted
    setupTables({
      profiles: [{
        id: 'u-1', tmi_rate: 30, fire_type: 'standard',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [], prenom: null,
      }],
    })
    const std = await getPatrimoineComplet('u-1')

    setupTables({
      profiles: [{
        id: 'u-1', tmi_rate: 30, fire_type: 'lean',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [], prenom: null,
      }],
    })
    const lean = await getPatrimoineComplet('u-1')

    const cibleStd  = std.projectionFIRESnapshot?.patrimoine_fire_cible ?? 0
    const cibleLean = lean.projectionFIRESnapshot?.patrimoine_fire_cible ?? 0
    expect(cibleStd).toBeGreaterThan(0)
    expect(cibleLean).toBeGreaterThan(cibleStd)  // SWR plus bas → cible plus haute
  })
})

describe('getPatrimoineComplet — idempotence (D8 #5)', () => {
  it('deux appels successifs avec les memes donnees retournent des valeurs identiques', async () => {
    const p1 = await getPatrimoineComplet('u-1')
    const p2 = await getPatrimoineComplet('u-1')
    expect(p1.totalNet).toBe(p2.totalNet)
    expect(p1.totalPortefeuille).toBe(p2.totalPortefeuille)
    expect(p1.totalImmo).toBe(p2.totalImmo)
    expect(p1.fireInputs.tmi_estime).toBe(p2.fireInputs.tmi_estime)
    expect(p1.projectionFIRESnapshot?.patrimoine_fire_cible)
      .toBe(p2.projectionFIRESnapshot?.patrimoine_fire_cible)
  })
})

// ─────────────────────────────────────────────────────────────────────
// QW2 — Fallback stabilite_revenus depuis statut_pro
// ─────────────────────────────────────────────────────────────────────

describe('getPatrimoineComplet — QW2 stabilité effective', () => {
  /** Lit la stabilité effective exposée dans fireInputs (champ étendu via cast). */
  function stabilite(p: Awaited<ReturnType<typeof getPatrimoineComplet>>): string | null {
    return (p.fireInputs as unknown as { stabilite_revenus?: string | null }).stabilite_revenus ?? null
  }

  /** Construit une fixture profil minimale avec statut_pro + stabilite_revenus.
   *  Inclut un compte cash pour que totalBrut > 0 (sinon calculerSolidite
   *  retourne insufficientData et n'expose pas le détail de stabilité). */
  function profilQW2(statut_pro: string | null, stabilite_revenus: string | null) {
    return {
      profiles: [{
        id: 'u-1', tmi_rate: 30, fire_type: 'standard',
        age: 35, age_cible: 50,
        epargne_mensuelle: 1000, revenu_passif_cible: 3000,
        revenu_mensuel: 5000, revenu_mensuel_total: 5000, charges_mensuelles: 2000,
        enveloppes: [],
        statut_pro, stabilite_revenus,
        situation_familiale: 'celibataire', enfants: '0',
        prenom: null,
      }],
      cash_accounts: [{
        id: 'c1', account_type: 'livret_a', balance: 20000,
        currency: 'EUR', bank_name: 'Test', asset: null,
      }],
    }
  }

  it('Salarié + stabilite null → fallback cdi', async () => {
    setupTables(profilQW2('Salarié', null))
    const p = await getPatrimoineComplet('u-1')
    expect(stabilite(p)).toBe('cdi')
  })

  it('Indépendant + stabilite null → fallback independant', async () => {
    setupTables(profilQW2('Indépendant / Freelance', null))
    const p = await getPatrimoineComplet('u-1')
    expect(stabilite(p)).toBe('independant')
  })

  it('Retraité + stabilite null → fallback retraite', async () => {
    setupTables(profilQW2('Retraité', null))
    const p = await getPatrimoineComplet('u-1')
    expect(stabilite(p)).toBe('retraite')
  })

  it('saisie explicite NON écrasée : Salarié + stabilite "Chômage" → chomage', async () => {
    setupTables(profilQW2('Salarié', 'Chômage longue durée'))
    const p = await getPatrimoineComplet('u-1')
    expect(stabilite(p)).toBe('chomage')
  })

  it("Chef d'entreprise + stabilite null → null (pas de fallback ambigu)", async () => {
    setupTables(profilQW2("Chef d'entreprise", null))
    const p = await getPatrimoineComplet('u-1')
    expect(stabilite(p)).toBeNull()
  })

  it('impact concret score Solidité : Indépendant ayant skippé étape 2 → −5 pts vs neutre', async () => {
    // AVANT QW2 : stabilite null → 0 pt (neutre). APRÈS : fallback independant → −5 pts.
    // On vérifie que le fallback est bien pris en compte par calculerSolidite
    // en comparant le détail "Stabilité des revenus" exposé dans l'explication.
    setupTables(profilQW2('Indépendant / Freelance', null))
    const p = await getPatrimoineComplet('u-1')
    const ligneStab = p.scores.solidite.explanation?.inputs
      .find((i) => i.label === 'Stabilité des revenus')
    expect(ligneStab).toBeDefined()
    // Le libellé doit refléter l'id "independant" et le malus -5 (pas "Non renseignée").
    expect(ligneStab!.value).toContain('independant')
    expect(ligneStab!.value).toContain('-5')
  })
})
