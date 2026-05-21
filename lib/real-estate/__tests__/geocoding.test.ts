import { describe, it, expect, vi } from 'vitest'
import { geocodeAddress } from '../geocoding'

/**
 * Tests du geocodage avec API BAN mockee.
 * On ne fait pas d'appel reseau reel — uniquement validation du parsing
 * et de la robustesse aux erreurs.
 */

function mockFetch(response: { ok?: boolean; status?: number; json: () => Promise<unknown> }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json,
  } as Response)
}

describe('geocodeAddress', () => {
  it('Test 1 — adresse valide => retourne lat/lng', async () => {
    const fetchImpl = mockFetch({
      json: async () => ({
        features: [{
          geometry: { coordinates: [2.3522, 48.8566] },  // [lng, lat]
          properties: { score: 0.98, type: 'housenumber' },
        }],
      }),
    })

    const result = await geocodeAddress(
      { street: '1 rue de la Paix', postalCode: '75001', city: 'Paris' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )

    expect(result).not.toBeNull()
    // Coordonnees dans les bounds de Paris (lat 48.8-48.9, lng 2.2-2.5)
    expect(result!.lat).toBeGreaterThanOrEqual(48.8)
    expect(result!.lat).toBeLessThanOrEqual(48.9)
    expect(result!.lng).toBeGreaterThanOrEqual(2.2)
    expect(result!.lng).toBeLessThanOrEqual(2.5)
    expect(result!.score).toBeCloseTo(0.98, 2)
  })

  it('Test 2 — adresse non trouvee (features=[]) => null sans throw', async () => {
    const fetchImpl = mockFetch({ json: async () => ({ features: [] }) })
    const result = await geocodeAddress(
      { street: 'ZZZZZZ inexistant', postalCode: '99999', city: 'NowhereCity' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(result).toBeNull()
  })

  it('Test 3 — adresse partielle (CP + ville seulement) => geocode', async () => {
    const fetchImpl = mockFetch({
      json: async () => ({
        features: [{
          geometry: { coordinates: [1.6778, 48.1147] },  // Rennes
          properties: { score: 0.7, type: 'municipality' },
        }],
      }),
    })
    const result = await geocodeAddress(
      { postalCode: '35000', city: 'Rennes', street: null },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(48.1, 1)
    expect(result!.matchType).toBe('municipality')
  })

  it('input vide => null (court-circuite l\'appel)', async () => {
    const fetchImpl = mockFetch({ json: async () => ({ features: [] }) })
    const result = await geocodeAddress(
      { postalCode: null, city: null, street: null },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('API en erreur 500 => null sans throw', async () => {
    const fetchImpl = mockFetch({
      ok: false, status: 500,
      json: async () => ({ error: 'Internal' }),
    })
    const result = await geocodeAddress(
      { postalCode: '75001', city: 'Paris', street: null },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(result).toBeNull()
  })

  it('reseau down (throw) => null sans propagation', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await geocodeAddress(
      { postalCode: '75001', city: 'Paris', street: null },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(result).toBeNull()
  })
})
