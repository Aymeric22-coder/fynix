/**
 * POST /api/real-estate/geocode-missing
 *
 * Geocode tous les biens de l'utilisateur qui n'ont pas encore de
 * coordonnees (latitude / longitude null). Appelle l'API BAN
 * pour chacun et stocke le resultat en DB.
 *
 * Strategie : au premier chargement de la vue carte, le client
 * appelle cette route. Les biens deja geocodes ne sont pas
 * re-traites — le cache est definitif (sauf re-geocodage manuel
 * lors du save d'un bien).
 *
 * Renvoie : { processed, succeeded, failed, properties: [{id, lat, lng, error?}] }
 *
 * Securite : owner-only via withAuth + filtre user_id.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { geocodeAddress } from '@/lib/real-estate/geocoding'

interface GeocodeBatchResult {
  processed: number
  succeeded: number
  failed:    number
  properties: Array<{
    id:    string
    lat?:  number
    lng?:  number
    error?: string
  }>
}

export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  // Charge tous les biens sans coordonnees
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select('id, address_line1, address_zip, address_city')
    .eq('user_id', user.id)
    .is('latitude', null)

  if (!properties || properties.length === 0) {
    return ok({ processed: 0, succeeded: 0, failed: 0, properties: [] } satisfies GeocodeBatchResult)
  }

  const result: GeocodeBatchResult = {
    processed: properties.length,
    succeeded: 0,
    failed:    0,
    properties: [],
  }

  // Geocodage sequentiel pour respecter l'API publique (pas de rate limit
  // officiel mais usage raisonnable). Pour > 20 biens on pourrait passer
  // en parallele avec un pool — peu probable a court terme.
  for (const p of properties) {
    if (!p.address_city && !p.address_zip) {
      result.failed++
      result.properties.push({
        id: p.id as string,
        error: 'Adresse incomplète',
      })
      continue
    }

    const geo = await geocodeAddress({
      street:     p.address_line1 as string | null,
      postalCode: p.address_zip   as string | null,
      city:       p.address_city  as string | null,
    })

    if (!geo) {
      result.failed++
      result.properties.push({
        id: p.id as string,
        error: 'Géocodage impossible',
      })
      continue
    }

    // Update DB
    const { error } = await supabase
      .from('real_estate_properties')
      .update({
        latitude:    geo.lat,
        longitude:   geo.lng,
        geocoded_at: new Date().toISOString(),
      })
      .eq('id', p.id)
      .eq('user_id', user.id)

    if (error) {
      result.failed++
      result.properties.push({
        id: p.id as string,
        error: error.message,
      })
    } else {
      result.succeeded++
      result.properties.push({
        id: p.id as string,
        lat: geo.lat,
        lng: geo.lng,
      })
    }
  }

  return ok(result)
})
