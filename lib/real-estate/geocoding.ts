/**
 * Geocodage des adresses francaises via l'API publique du gouvernement
 * (api-adresse.data.gouv.fr / BAN — Base Adresse Nationale).
 *
 * Sources : https://adresse.data.gouv.fr/api-doc/adresse
 *  - Gratuit, sans cle API
 *  - Limite : pas de quota officiel mais usage raisonnable recommande
 *  - Couverture : France metropolitaine + DOM
 *
 * Renvoie null si :
 *  - adresse vide ou incomplete (pas de city ni postalCode)
 *  - API indisponible
 *  - aucun resultat trouve
 *
 * Ne throw jamais — l'erreur reseau renvoie null + log warning.
 */

export interface GeocodingResult {
  lat: number
  lng: number
  /** Score de confiance 0-1 (API BAN). */
  score?: number
  /** Type : housenumber, street, locality, municipality... */
  matchType?: string
}

export interface GeocodeAddressInput {
  street?:    string | null
  postalCode: string | null
  city:       string | null
}

export async function geocodeAddress(
  input: GeocodeAddressInput,
  options?: { fetchImpl?: typeof fetch },
): Promise<GeocodingResult | null> {
  const fetchFn = options?.fetchImpl ?? fetch
  const parts = [input.street, input.postalCode, input.city]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

  // Au minimum il faut un code postal OU une ville pour avoir une chance
  if (parts.length === 0) return null

  const q = parts.join(' ').trim()
  if (q.length < 3) return null

  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      console.warn(`[geocoding] API returned ${res.status} for "${q}"`)
      return null
    }
    const data = await res.json() as {
      features?: Array<{
        geometry: { coordinates: [number, number] }
        properties: { score: number; type: string }
      }>
    }
    const first = data.features?.[0]
    if (!first) return null

    const [lng, lat] = first.geometry.coordinates
    return {
      lat,
      lng,
      score: first.properties.score,
      matchType: first.properties.type,
    }
  } catch (e) {
    console.warn('[geocoding] Network or parse error:', e instanceof Error ? e.message : e)
    return null
  }
}
