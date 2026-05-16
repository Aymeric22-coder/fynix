/**
 * Regroupement géographique : pays (code ISO 2 lettres ou libellé Yahoo)
 * → grande zone d'investissement.
 *
 * Yahoo renvoie le pays sous forme libellée ("United States",
 * "France", "Japan"…). On normalise vers code ISO 2 lettres puis on
 * mappe en zones agrégées pour les vues d'exposition régionale.
 *
 * Volontairement grossier : 6 zones, pas plus. Pour des vues plus
 * fines (US vs Canada), on consultera directement le champ `country`
 * brut dans `isin_cache`.
 */

export type GeoZone =
  | 'Amérique du Nord'
  | 'Europe'
  | 'Europe émergente'
  | 'Asie développée'
  | 'Asie émergente'
  | 'Amérique latine'
  | 'Moyen-Orient'
  | 'Afrique'
  | 'Autres'        // pays inconnus / résiduel marginal

/**
 * Normalisation libellé Yahoo → code ISO 2 lettres.
 * Liste pragmatique des pays les plus courants pour un investisseur FR.
 */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'United States':        'US',
  'USA':                  'US',
  'Canada':               'CA',
  'France':               'FR',
  'Germany':              'DE',
  'United Kingdom':       'GB',
  'UK':                   'GB',
  'Netherlands':          'NL',
  'Switzerland':          'CH',
  'Sweden':               'SE',
  'Italy':                'IT',
  'Spain':                'ES',
  'Belgium':              'BE',
  'Ireland':              'IE',
  'Luxembourg':           'LU',
  'Denmark':              'DK',
  'Finland':              'FI',
  'Norway':               'NO',
  'Austria':              'AT',
  'Portugal':             'PT',
  'Japan':                'JP',
  'South Korea':          'KR',
  'Korea':                'KR',
  'Australia':            'AU',
  'Hong Kong':            'HK',
  'Singapore':            'SG',
  'New Zealand':          'NZ',
  'China':                'CN',
  'India':                'IN',
  'Taiwan':               'TW',
  'Thailand':             'TH',
  'Vietnam':              'VN',
  'Indonesia':            'ID',
  'Philippines':          'PH',
  'Malaysia':             'MY',
  'Brazil':               'BR',
  'Mexico':               'MX',
  'Argentina':            'AR',
  'Chile':                'CL',
  'Colombia':             'CO',
  'Peru':                 'PE',
  // Europe émergente
  'Poland':               'PL',
  'Czech Republic':       'CZ',
  'Hungary':              'HU',
  'Romania':              'RO',
  'Greece':               'GR',
  'Turkey':               'TR',
  'Russia':               'RU',
  // Moyen-Orient
  'Israel':               'IL',
  'Saudi Arabia':         'SA',
  'United Arab Emirates': 'AE',
  'UAE':                  'AE',
  'Qatar':                'QA',
  'Kuwait':               'KW',
  // Afrique
  'South Africa':         'ZA',
  'Nigeria':              'NG',
  'Egypt':                'EG',
  'Morocco':              'MA',
}

const ZONE_BY_ISO: Record<string, GeoZone> = {
  // Amérique du Nord
  US: 'Amérique du Nord', CA: 'Amérique du Nord',

  // Europe (UE + UK + Suisse + Norvège…)
  FR: 'Europe', DE: 'Europe', GB: 'Europe', NL: 'Europe', CH: 'Europe',
  SE: 'Europe', IT: 'Europe', ES: 'Europe', BE: 'Europe', IE: 'Europe',
  LU: 'Europe', DK: 'Europe', FI: 'Europe', NO: 'Europe', AT: 'Europe',
  PT: 'Europe',

  // Asie développée
  JP: 'Asie développée', KR: 'Asie développée', AU: 'Asie développée',
  HK: 'Asie développée', SG: 'Asie développée', NZ: 'Asie développée',

  // Asie émergente
  CN: 'Asie émergente', IN: 'Asie émergente', TW: 'Asie émergente',
  TH: 'Asie émergente', VN: 'Asie émergente', ID: 'Asie émergente',
  PH: 'Asie émergente', MY: 'Asie émergente',

  // Amérique latine
  BR: 'Amérique latine', MX: 'Amérique latine', AR: 'Amérique latine',
  CL: 'Amérique latine', CO: 'Amérique latine', PE: 'Amérique latine',

  // Europe émergente
  PL: 'Europe émergente', CZ: 'Europe émergente', HU: 'Europe émergente',
  RO: 'Europe émergente', GR: 'Europe émergente', TR: 'Europe émergente',
  RU: 'Europe émergente',

  // Moyen-Orient
  IL: 'Moyen-Orient', SA: 'Moyen-Orient', AE: 'Moyen-Orient',
  QA: 'Moyen-Orient', KW: 'Moyen-Orient',

  // Afrique
  ZA: 'Afrique', NG: 'Afrique', EG: 'Afrique', MA: 'Afrique',
}

/**
 * Convertit un libellé pays Yahoo (ou code ISO direct) en code ISO 2.
 * Renvoie null si introuvable.
 */
export function toIsoCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Déjà un code ISO 2 ?
  if (/^[A-Z]{2}$/.test(raw)) return raw
  return COUNTRY_NAME_TO_ISO[raw] ?? null
}

/**
 * Détermine la zone géographique d'investissement pour un pays donné.
 * Tolère soit un libellé Yahoo soit un code ISO. Renvoie 'Autres' par
 * défaut quand le pays est inconnu.
 */
export function geoZone(rawCountry: string | null | undefined): GeoZone {
  const iso = toIsoCode(rawCountry)
  if (!iso) return 'Autres'
  return ZONE_BY_ISO[iso] ?? 'Autres'
}

/** Toutes les zones disponibles (utile pour filtres / légendes). */
export const ALL_ZONES: GeoZone[] = [
  'Amérique du Nord',
  'Europe',
  'Europe émergente',
  'Asie développée',
  'Asie émergente',
  'Amérique latine',
  'Moyen-Orient',
  'Afrique',
  'Autres',
]
