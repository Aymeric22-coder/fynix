'use client'

/**
 * Carte Leaflet des biens immobiliers du portefeuille.
 *
 * - Tuiles OpenStreetMap (gratuites, sans cle API)
 * - 1 marqueur par bien avec popup au clic (KPIs + lien vers la fiche)
 * - Couleur marqueur selon cash-flow (vert / orange / rouge / gris)
 * - fitBounds automatique sur les marqueurs au chargement
 * - Geocodage on-demand : si des biens sans coordonnees, appelle
 *   POST /api/real-estate/geocode-missing au mount et refresh
 *
 * Import dynamique de react-leaflet (Next.js SSR-unsafe pour Leaflet).
 */

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { PropertySummary } from '@/lib/real-estate/portfolio-summary'

// Import dynamique des composants Leaflet (necessite window pour init)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false })
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false })
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),        { ssr: false })

// CSS Leaflet (import obligatoire)
import 'leaflet/dist/leaflet.css'

interface LocatedProperty extends PropertySummary {
  latitude:  number
  longitude: number
}

interface Props {
  properties: PropertySummary[]
  /** Coordonnees deja chargees depuis la DB (pre-geocodees). */
  coords:     Record<string, { lat: number; lng: number } | null>
}

function colorForCashFlow(cf: number, hasData: boolean): string {
  if (!hasData) return '#71717a'              // gris
  if (cf > 0) return '#10b981'                // vert
  if (cf > -200) return '#f59e0b'             // orange
  return '#ef4444'                            // rouge
}

export function PropertyMap({ properties, coords }: Props) {
  const [localCoords, setLocalCoords] = useState<Record<string, { lat: number; lng: number } | null>>(coords)
  const [geocoding, setGeocoding] = useState(false)
  const [leafletReady, setLeafletReady] = useState(false)

  // Initialisation Leaflet : corrige le marker icon broken par defaut
  // (Next.js bundle path mismatch avec leaflet/dist/images/*)
  useEffect(() => {
    import('leaflet').then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete ((L.Icon.Default.prototype as any)._getIconUrl)
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      setLeafletReady(true)
    })
  }, [])

  // Geocodage on-demand au mount si des biens n'ont pas de coords
  useEffect(() => {
    const ungeocoded = properties.filter(p => !localCoords[p.id])
    if (ungeocoded.length === 0) return

    let cancelled = false
    setGeocoding(true)
    fetch('/api/real-estate/geocode-missing', { method: 'POST' })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        const updates: Record<string, { lat: number; lng: number } | null> = {}
        for (const p of (json?.data?.properties ?? []) as Array<{ id: string; lat?: number; lng?: number }>) {
          if (p.lat != null && p.lng != null) updates[p.id] = { lat: p.lat, lng: p.lng }
          else                                  updates[p.id] = null
        }
        setLocalCoords(prev => ({ ...prev, ...updates }))
      })
      .catch(() => { /* swallow — affiche les biens deja geocodes */ })
      .finally(() => { if (!cancelled) setGeocoding(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const located: LocatedProperty[] = useMemo(() => {
    const out: LocatedProperty[] = []
    for (const p of properties) {
      const c = localCoords[p.id]
      if (c) out.push({ ...p, latitude: c.lat, longitude: c.lng })
    }
    return out
  }, [properties, localCoords])

  const unlocated = useMemo(
    () => properties.filter(p => !localCoords[p.id]),
    [properties, localCoords],
  )

  // Centre par defaut : France
  const center: [number, number] = located.length > 0
    ? [located[0]!.latitude, located[0]!.longitude]
    : [46.6, 2.5]

  // Bounds pour fitBounds (au moins 2 points pour eviter le crash leaflet)
  const bounds: [[number, number], [number, number]] | undefined =
    located.length >= 2
      ? located.reduce(
          ([sw, ne]: [[number, number], [number, number]], p) => [
            [Math.min(sw[0], p.latitude),  Math.min(sw[1], p.longitude)],
            [Math.max(ne[0], p.latitude),  Math.max(ne[1], p.longitude)],
          ],
          [[90, 180], [-90, -180]] as [[number, number], [number, number]],
        )
      : undefined

  if (!leafletReady) {
    return (
      <div className="card p-8 text-center text-sm text-secondary">
        <Loader2 size={20} className="inline-block animate-spin mr-2" />
        Chargement de la carte…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {geocoding && (
        <div className="text-xs text-muted flex items-center gap-1.5 px-1">
          <Loader2 size={11} className="animate-spin" />
          Géocodage de {unlocated.length} bien{unlocated.length > 1 ? 's' : ''} en cours…
        </div>
      )}

      <div className="card overflow-hidden" style={{ height: 480 }}>
        <MapContainer
          center={center}
          zoom={located.length === 1 ? 12 : 6}
          bounds={bounds}
          boundsOptions={{ padding: [40, 40] }}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {located.map(p => (
            <PropertyMarker key={p.id} property={p} />
          ))}
        </MapContainer>
      </div>

      {unlocated.length > 0 && !geocoding && (
        <div className="card p-3 bg-warning/5 border-warning/30">
          <p className="text-xs text-secondary">
            {unlocated.length} bien{unlocated.length > 1 ? 's' : ''} non géolocalisé{unlocated.length > 1 ? 's' : ''} :
            {' '}
            <span className="text-primary">
              {unlocated.map(p => p.name).join(', ')}
            </span>
          </p>
          <p className="text-[11px] text-muted mt-1">
            → Vérifiez que l&apos;adresse (code postal + ville) est complète dans la fiche du bien.
          </p>
        </div>
      )}
    </div>
  )
}

function PropertyMarker({ property: p }: { property: LocatedProperty }) {
  const router = useRouter()
  const hasData = p.monthlyRent > 0 || p.monthlyNetCashFlow !== 0
  const color = colorForCashFlow(p.monthlyNetCashFlow, hasData)

  return (
    <Marker position={[p.latitude, p.longitude]}>
      <Popup>
        <div className="text-sm min-w-[200px]" style={{ color: '#111' }}>
          <p className="font-medium flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {p.name}
          </p>
          {p.city && <p className="text-xs" style={{ color: '#555' }}>{p.city}</p>}
          <hr style={{ borderColor: '#eee', margin: '8px 0' }} />
          <p className="text-xs" style={{ color: '#555' }}>
            Valeur :{' '}
            <span style={{ color: '#111', fontWeight: 500 }}>
              {formatCurrency(p.currentValue, 'EUR', { compact: true })}
            </span>
          </p>
          {hasData && (
            <>
              <p className="text-xs" style={{ color: '#555' }}>
                CF net :{' '}
                <span style={{ color, fontWeight: 500 }}>
                  {formatCurrency(p.monthlyNetCashFlow, 'EUR', { sign: true })}/mois
                </span>
              </p>
              <p className="text-xs" style={{ color: '#555' }}>
                Rendement :{' '}
                <span style={{ color: '#111', fontWeight: 500 }}>
                  {p.netNetYieldPct > 0 ? formatPercent(p.netNetYieldPct) : '—'}
                </span>
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => router.push(`/immobilier/${p.id}`)}
            style={{
              marginTop: 10, padding: '6px 12px', fontSize: 12,
              background: '#10b981', color: 'white', border: 'none',
              borderRadius: 4, cursor: 'pointer', width: '100%',
            }}
          >
            Voir la fiche →
          </button>
        </div>
      </Popup>
    </Marker>
  )
}
