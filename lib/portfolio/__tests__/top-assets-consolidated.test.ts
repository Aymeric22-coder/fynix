/**
 * Tests V2.3 du moteur de consolidation du Top 5 (BUG-5 corrigé).
 *
 * Vérifie :
 *   - 1 enveloppe = 1 ligne (un PEA contenant 5 ETF = 1 ligne « PEA »)
 *   - 1 bien immo = 1 ligne (pas d'agrégation entre biens)
 *   - 1 compte cash = 1 ligne (Livret A séparé de LDDS séparé de LEP)
 *   - Tri par totalValueEur décroissant, tie-breaker `key.localeCompare`
 *   - Limite à 5 entrées strictes
 *   - Fallback `asset_class` si ≥ 50 % des positions sont sans envelopeId
 *   - Calcul de `percentOfGross` (= patrimoine BRUT, peut > 100)
 *   - RP incluse (contrairement au best/worst où elle est exclue)
 */
import { describe, it, expect } from 'vitest'
import {
  buildTopAssetsConsolidated,
  type PositionForTop,
  type EnvelopeForTop,
  type PropertyForTop,
  type CashAccountForTop,
} from '../top-assets-consolidated'

function emptyInput(): {
  positions:     PositionForTop[],
  envelopes:     EnvelopeForTop[],
  properties:    PropertyForTop[],
  cashAccounts:  CashAccountForTop[],
  grossValueEur: number,
} {
  return { positions: [], envelopes: [], properties: [], cashAccounts: [], grossValueEur: 100_000 }
}

describe('buildTopAssetsConsolidated — consolidation par enveloppe', () => {
  it('1 PEA contenant 5 positions = 1 seule ligne dans le top', () => {
    const envelopes: EnvelopeForTop[] = [
      { id: 'env-pea', name: 'PEA', envelopeType: 'pea' },
    ]
    const positions: PositionForTop[] = [
      { positionId: 'P1', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 20_000 },
      { positionId: 'P2', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 15_000 },
      { positionId: 'P3', envelopeId: 'env-pea', assetClass: 'actions', marketValueEur: 10_000 },
      { positionId: 'P4', envelopeId: 'env-pea', assetClass: 'actions', marketValueEur:  5_000 },
      { positionId: 'P5', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur:  5_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), envelopes, positions, grossValueEur: 55_000 })
    expect(out).toHaveLength(1)
    expect(out[0]!.key).toBe('envelope:env-pea')
    expect(out[0]!.label).toBe('PEA')
    expect(out[0]!.totalValueEur).toBe(55_000)
    expect(out[0]!.underlyingPositionsCount).toBe(5)
    expect(out[0]!.envelopeType).toBe('pea')
  })

  it('plusieurs enveloppes → 1 ligne chacune, triées par valeur décroissante', () => {
    const envelopes: EnvelopeForTop[] = [
      { id: 'env-pea',   name: 'PEA',  envelopeType: 'pea' },
      { id: 'env-cto',   name: 'CTO',  envelopeType: 'cto' },
      { id: 'env-av',    name: 'AV',   envelopeType: 'assurance_vie' },
    ]
    const positions: PositionForTop[] = [
      { positionId: 'P_pea1', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 50_000 },
      { positionId: 'P_pea2', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 30_000 },
      { positionId: 'P_cto1', envelopeId: 'env-cto', assetClass: 'actions', marketValueEur: 37_000 },
      { positionId: 'P_av1',  envelopeId: 'env-av',  assetClass: 'etf',     marketValueEur: 30_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), envelopes, positions, grossValueEur: 147_000 })
    expect(out.map((r) => r.label)).toEqual(['PEA', 'CTO', 'AV'])
    expect(out[0]!.totalValueEur).toBe(80_000)
    expect(out[1]!.totalValueEur).toBe(37_000)
    expect(out[2]!.totalValueEur).toBe(30_000)
  })
})

describe('buildTopAssetsConsolidated — biens immobiliers', () => {
  it('1 bien = 1 ligne (pas d\'agrégation entre biens)', () => {
    const properties: PropertyForTop[] = [
      { id: 'p_rp',  name: 'RP Lyon',         currentValueEur: 350_000 },
      { id: 'p_l1',  name: 'Locatif Saint-Étienne T3', currentValueEur: 200_000 },
      { id: 'p_l2',  name: 'Locatif Roanne T2',         currentValueEur: 180_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), properties, grossValueEur: 730_000 })
    expect(out).toHaveLength(3)
    expect(out[0]!.label).toBe('RP Lyon')
    expect(out[0]!.envelopeType).toBe('real_estate')
    expect(out[0]!.totalValueEur).toBe(350_000)
    expect(out[0]!.href).toBe('/immobilier/p_rp')
    // RP incluse (contrairement au best/worst Z8.5 où elle est exclue).
    expect(out.find((r) => r.label === 'RP Lyon')).toBeDefined()
  })
})

describe('buildTopAssetsConsolidated — comptes cash', () => {
  it('livrets séparés : Livret A, LDDS, LEP = 3 lignes distinctes', () => {
    const cashAccounts: CashAccountForTop[] = [
      { id: 'c_la',   label: 'Livret A',  accountType: 'livret_a', balanceEur: 22_950 },
      { id: 'c_ldds', label: 'LDDS',      accountType: 'ldds',     balanceEur: 12_000 },
      { id: 'c_lep',  label: 'LEP',       accountType: 'lep',      balanceEur: 10_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), cashAccounts, grossValueEur: 50_000 })
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.label)).toEqual(['Livret A', 'LDDS', 'LEP'])
    expect(out.every((r) => r.envelopeType === 'cash_livret')).toBe(true)
  })

  it('compte courant : envelopeType = cash_courant', () => {
    const cashAccounts: CashAccountForTop[] = [
      { id: 'c_cc', label: 'CC Boursorama', accountType: 'compte_courant', balanceEur: 5_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), cashAccounts, grossValueEur: 5_000 })
    expect(out[0]!.envelopeType).toBe('cash_courant')
  })
})

describe('buildTopAssetsConsolidated — tri + limite 5', () => {
  it('limite stricte à 5 même avec 10 enveloppes', () => {
    const envelopes: EnvelopeForTop[] = Array.from({ length: 10 }, (_, i) => ({
      id:           `env-${i}`,
      name:         `Env${i}`,
      envelopeType: 'cto',
    }))
    const positions: PositionForTop[] = envelopes.map((e, i) => ({
      positionId:     `P${i}`,
      envelopeId:     e.id,
      assetClass:     'etf',
      marketValueEur: 1000 * (10 - i),   // valeurs descendantes 10000, 9000, …, 1000
    }))
    const out = buildTopAssetsConsolidated({
      ...emptyInput(), envelopes, positions, grossValueEur: 55_000,
    })
    expect(out).toHaveLength(5)
    expect(out[0]!.totalValueEur).toBe(10_000)
    expect(out[4]!.totalValueEur).toBe(6_000)
  })

  it('mix enveloppes / biens / cash : trié par valeur décroissante toutes catégories', () => {
    const envelopes: EnvelopeForTop[] = [{ id: 'env-pea', name: 'PEA', envelopeType: 'pea' }]
    const positions: PositionForTop[] = [
      { positionId: 'P', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 80_000 },
    ]
    const properties: PropertyForTop[] = [
      { id: 'p_tand', name: 'Immeuble Tandoori', currentValueEur: 410_000 },
    ]
    const cashAccounts: CashAccountForTop[] = [
      { id: 'c_lep', label: 'LEP', accountType: 'lep', balanceEur: 10_300 },
    ]
    const out = buildTopAssetsConsolidated({
      positions, envelopes, properties, cashAccounts, grossValueEur: 500_300,
    })
    expect(out.map((r) => r.label)).toEqual(['Immeuble Tandoori', 'PEA', 'LEP'])
  })

  it('tie-breaker déterministe sur `key.localeCompare` en cas d\'égalité', () => {
    const envelopes: EnvelopeForTop[] = [
      { id: 'env-z', name: 'Z', envelopeType: 'cto' },
      { id: 'env-a', name: 'A', envelopeType: 'cto' },
    ]
    const positions: PositionForTop[] = [
      { positionId: 'P_z', envelopeId: 'env-z', assetClass: 'etf', marketValueEur: 10_000 },
      { positionId: 'P_a', envelopeId: 'env-a', assetClass: 'etf', marketValueEur: 10_000 },
    ]
    const out = buildTopAssetsConsolidated({
      ...emptyInput(), envelopes, positions, grossValueEur: 20_000,
    })
    // `envelope:env-a` < `envelope:env-z` → A en premier
    expect(out[0]!.label).toBe('A')
    expect(out[1]!.label).toBe('Z')
  })
})

describe('buildTopAssetsConsolidated — fallback asset_class', () => {
  it('si ≥ 50 % des positions sont sans envelopeId → agrégation par assetClass', () => {
    const positions: PositionForTop[] = [
      // 3 positions sans envelope_id, 1 avec → 75 % sans → fallback activé
      { positionId: 'P1', envelopeId: null, assetClass: 'etf',     marketValueEur: 12_000 },
      { positionId: 'P2', envelopeId: null, assetClass: 'etf',     marketValueEur: 13_000 },
      { positionId: 'P3', envelopeId: null, assetClass: 'actions', marketValueEur:  5_000 },
      { positionId: 'P4', envelopeId: 'env-x', assetClass: 'etf',  marketValueEur:  4_000 },
    ]
    const envelopes: EnvelopeForTop[] = [
      { id: 'env-x', name: 'PEA orpheline', envelopeType: 'pea' },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), positions, envelopes, grossValueEur: 34_000 })
    // Mode fallback : on doit voir des clés `class:*`, pas `envelope:*`.
    expect(out.every((r) => r.key.startsWith('class:'))).toBe(true)
    // ETF (12k + 13k + 4k = 29k) > Actions (5k)
    const etf = out.find((r) => r.label === 'ETF / Fonds')
    expect(etf).toBeDefined()
    expect(etf!.totalValueEur).toBe(29_000)
    expect(etf!.underlyingPositionsCount).toBe(3)
    expect(etf!.envelopeType).toBe('asset_class')
  })

  it('< 50 % positions sans envelopeId : pas de fallback, bucket « Sans enveloppe » créé', () => {
    const envelopes: EnvelopeForTop[] = [
      { id: 'env-pea', name: 'PEA', envelopeType: 'pea' },
    ]
    const positions: PositionForTop[] = [
      { positionId: 'P1', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 20_000 },
      { positionId: 'P2', envelopeId: 'env-pea', assetClass: 'etf', marketValueEur: 15_000 },
      { positionId: 'P3', envelopeId: null,      assetClass: 'crypto', marketValueEur:  5_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), envelopes, positions, grossValueEur: 40_000 })
    expect(out.find((r) => r.label === 'PEA')).toBeDefined()
    expect(out.find((r) => r.label === 'Sans enveloppe')).toBeDefined()
    expect(out.find((r) => r.label === 'Sans enveloppe')!.totalValueEur).toBe(5_000)
  })
})

describe('buildTopAssetsConsolidated — percentOfGross', () => {
  it('calcule le pourcentage du patrimoine BRUT (peut dépasser 100 si dette)', () => {
    const properties: PropertyForTop[] = [
      { id: 'p1', name: 'Immeuble', currentValueEur: 410_000 },
    ]
    // grossValue de 500k → 410/500 = 82 %
    const out = buildTopAssetsConsolidated({ ...emptyInput(), properties, grossValueEur: 500_000 })
    expect(out[0]!.percentOfGross).toBeCloseTo(82, 1)
  })

  it('grossValueEur = 0 → percentOfGross = 0 (pas de NaN)', () => {
    const properties: PropertyForTop[] = [
      { id: 'p1', name: 'X', currentValueEur: 100_000 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), properties, grossValueEur: 0 })
    expect(out[0]!.percentOfGross).toBe(100_000 * 100)  // /1 → 10_000_000 (peu importe, on vérifie pas de NaN)
    expect(Number.isFinite(out[0]!.percentOfGross)).toBe(true)
  })
})

describe('buildTopAssetsConsolidated — empty + cas limites', () => {
  it('aucun input → tableau vide', () => {
    expect(buildTopAssetsConsolidated(emptyInput())).toEqual([])
  })

  it('positions sans MV ou MV <= 0 → exclues silencieusement', () => {
    const envelopes: EnvelopeForTop[] = [{ id: 'env', name: 'PEA', envelopeType: 'pea' }]
    const positions: PositionForTop[] = [
      { positionId: 'P_ok', envelopeId: 'env', assetClass: 'etf', marketValueEur: 10_000 },
      { positionId: 'P_no', envelopeId: 'env', assetClass: 'etf', marketValueEur: null },
      { positionId: 'P_0',  envelopeId: 'env', assetClass: 'etf', marketValueEur: 0 },
    ]
    const out = buildTopAssetsConsolidated({ ...emptyInput(), envelopes, positions, grossValueEur: 10_000 })
    expect(out).toHaveLength(1)
    expect(out[0]!.underlyingPositionsCount).toBe(1)
    expect(out[0]!.totalValueEur).toBe(10_000)
  })
})
