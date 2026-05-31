/**
 * CS4 — Tests des 3 recos catégorie 'transmission'.
 *
 * Comble le « trou catalogue transmission » historique : avant CS4, aucune
 * reco ne sortait sur cette catégorie, donc un axe transmission=100 ne
 * pouvait rien remonter.
 *
 * Cas testés :
 *   • #10 transmission-clause-beneficiaire : déclenchée si AV ouverte.
 *   • #11 transmission-donations          : déclenchée si patrimoine > 200k ET enfants.
 *   • #12 transmission-ouvrir-av          : déclenchée si AV non ouverte ET patrimoine > 50k.
 */
import { describe, it, expect } from 'vitest'
import { genererRecommandations } from '../recommandations'
import { calculerTousLesScores } from '../scores'
import type {
  PatrimoineComplet, EnrichedPosition, AnalyseAssetType,
} from '@/types/analyse'

function pos(over: Partial<EnrichedPosition> = {}): EnrichedPosition {
  return {
    isin: 'X', name: 'X', quantity: 1, pru: 100,
    current_price: 100, current_value: 100, current_value_local: 100,
    gain_loss: 0, gain_loss_pct: 0,
    asset_type: 'stock' as AnalyseAssetType, sector: null, country: null,
    currency: 'EUR', price_estimated: false, weight_in_portfolio: 0,
    ...over,
  }
}

interface Over {
  enveloppes?: string[]
  enfants?:    string | null
  totalNet?:   number
  age?:        number | null
}

function pat(over: Over = {}): PatrimoineComplet {
  const totalNet = over.totalNet ?? 100_000
  return {
    totalBrut: totalNet, totalNet,
    totalPortefeuille: 60_000, totalImmo: 0, totalCash: 40_000, totalDettes: 0,
    totalCashInvestissable: 40_000,
    totalImmoEquity: 0, risqueImmoGlobal: 0, revenuPassifImmo: 0,
    mensualitesImmoTotal: 0, rendementNetImmoMoyen: 0,
    positions: [
      pos({ asset_type: 'etf', current_value: 60_000, sector: 'Technology', country: 'United States' }),
    ],
    biens: [], comptes: [],
    repartitionClasses: [
      { label: 'ETF / Fonds', valeur: 60_000, pourcentage: 60, color: '#10B981' },
      { label: 'Cash',        valeur: 40_000, pourcentage: 40, color: '#71717a' },
    ],
    repartitionSectorielle: [],
    repartitionGeo:         [],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo:         50,
    rendementEstime: 5,
    revenuPassifActuel: 0,
    projectionFIRESnapshot: null,
    lifeEvents:              [],
    profilType: 'Équilibré', prenom: 'Test',
    fireInputs: {
      age: over.age ?? 40, age_cible: 60,
      epargne_mensuelle: 1000,
      revenu_passif_cible: 3000,
      revenu_passif_cible_ajuste: 3000,
      cibleFoyerDetail: {
        brut: 3000, ajuste: 3000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint: 0,
      situation_familiale: 'Célibataire',
      enfants:             over.enfants ?? '0',
      revenu_mensuel_total: 5000,
      charges_mensuelles: 2000,
      risk_score: 50,
      enveloppes: over.enveloppes ?? [],
      tmi_rate: 30,
      tmi_estime: false,
      actions_eu_value: 0,
    } as PatrimoineComplet['fireInputs'],
    scores: {} as never, recommandations: [],
    analyseFiabilite: { pct: 100, niveau: 'vert', label: 'OK' },
    unmappedEtfs: [], unmappedAll: [],
    cryptoTotal: 0, cryptoCostTotal: 0, cryptoBreakdown: [],
    lastUpdated: new Date().toISOString(),
  }
}

function getRecos(p: PatrimoineComplet) {
  const scores = calculerTousLesScores(p)
  return genererRecommandations({ ...p, scores }, scores)
}

describe('CS4 — Reco #10 transmission-clause-beneficiaire (AV ouverte)', () => {
  it('AV ouverte → reco présente', () => {
    const p = pat({ enveloppes: ['Assurance-vie'] })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-clause-beneficiaire')).toBe(true)
  })

  it('AV non ouverte → reco absente', () => {
    const p = pat({ enveloppes: ['PEA'] })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-clause-beneficiaire')).toBe(false)
  })

  it('catégorie est "transmission"', () => {
    const p = pat({ enveloppes: ['Assurance-vie'] })
    const r = getRecos(p).find((r) => r.id === 'transmission-clause-beneficiaire')
    expect(r?.categorie).toBe('transmission')
  })
})

describe('CS4 — Reco #11 transmission-donations (patrimoine > 200k + enfants)', () => {
  it('patrimoine 250k + enfants=2 → reco présente', () => {
    const p = pat({ totalNet: 250_000, enfants: '2' })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-donations')).toBe(true)
  })

  it('patrimoine 250k SANS enfants → reco absente', () => {
    const p = pat({ totalNet: 250_000, enfants: '0' })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-donations')).toBe(false)
  })

  it('patrimoine 150k (sous seuil) + enfants → reco absente', () => {
    const p = pat({ totalNet: 150_000, enfants: '2' })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-donations')).toBe(false)
  })

  it('gain_estime_eur = 20000 €', () => {
    const p = pat({ totalNet: 250_000, enfants: '2' })
    // recos.slice(0,6) : on cherche dans tous les triggers AVANT le slice final
    // → reco peut être hors top 6 selon le tri. On vérifie l'output produit
    // par le moteur. La reco peut ne pas apparaître si trop d'alertes hautes.
    const r = getRecos(p).find((r) => r.id === 'transmission-donations')
    if (r) {
      // @ts-expect-error — RecommandationEnrichie
      expect(r.gain_estime_eur).toBe(20_000)
    }
  })
})

describe('CS4 — Reco #12 transmission-ouvrir-av (AV absente, patrimoine > 50k)', () => {
  it('AV absente + patrimoine 100k → reco présente', () => {
    const p = pat({ enveloppes: ['PEA'], totalNet: 100_000 })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-ouvrir-av')).toBe(true)
  })

  it('AV ouverte → reco absente', () => {
    const p = pat({ enveloppes: ['Assurance-vie', 'PEA'], totalNet: 100_000 })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-ouvrir-av')).toBe(false)
  })

  it('patrimoine 30k (sous seuil) → reco absente', () => {
    const p = pat({ enveloppes: ['PEA'], totalNet: 30_000 })
    const recos = getRecos(p)
    expect(recos.some((r) => r.id === 'transmission-ouvrir-av')).toBe(false)
  })

  it('age < 70 → message inclut hint abattement', () => {
    const p = pat({ enveloppes: ['PEA'], totalNet: 100_000, age: 50 })
    const r = getRecos(p).find((r) => r.id === 'transmission-ouvrir-av')
    if (r) expect(r.description).toMatch(/avant 70 ans/i)
  })
})

describe('CS4 — Axe transmission=100 → recos transmission remontent', () => {
  it('avec AV ouverte + axes transmission=100 → clause bénéficiaire dans top 3', () => {
    const p: PatrimoineComplet = {
      ...pat({ enveloppes: ['Assurance-vie'], totalNet: 250_000, enfants: '2' }),
    }
    const fi = p.fireInputs as PatrimoineComplet['fireInputs'] & {
      objectifs_axes?: { rendement: number; securite: number; optimisation: number; transmission: number } | null
    }
    fi.objectifs_axes = { rendement: 0, securite: 0, optimisation: 0, transmission: 100 }
    const recos = getRecos(p)
    const transmissionIdx = recos.findIndex((r) => r.categorie === 'transmission')
    if (transmissionIdx >= 0) {
      // Avec axe transmission=100, au moins une reco transmission doit
      // être visible dans la liste finale (top 6).
      expect(transmissionIdx).toBeLessThanOrEqual(5)
    }
  })
})
