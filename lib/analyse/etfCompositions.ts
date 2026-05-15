/**
 * Compositions statiques des ETF les plus courants détenus par les
 * investisseurs français (PEA / CTO / AV).
 *
 * Pourquoi statique : Yahoo Finance / OpenFIGI ne fournissent pas de
 * façon fiable la décomposition complète d'un ETF (sectorWeightings est
 * souvent incomplet, country du fonds = pays du gestionnaire pas
 * l'exposition réelle). On maintient donc une table revue manuellement
 * sur les principaux trackers, mise à jour ~1×/an (les compositions
 * GICS bougent peu).
 *
 * Format :
 *   - clé   : ISIN (12 chars, format ISO 6166)
 *   - sectors / zones : pourcentages, somme attendue ≈ 100 (tolérance ±2 %)
 *   - les libellés sectors sont DÉJÀ en français (compatible avec
 *     l'agrégateur côté UI) — pas de traduction nécessaire
 *   - les zones utilisent strictement les libellés `GeoZone` du
 *     module geoMapping (Amérique du Nord / Europe / Asie développée /
 *     Asie émergente / Amérique latine / Europe émergente / Moyen-Orient
 *     / Afrique / Autres)
 *
 * Pour ajouter un ETF : copier-coller un bloc, vérifier la composition
 * sur le KIID de l'émetteur (iShares, Amundi, Lyxor…) ou sur justetf.com.
 */

export interface ETFComposition {
  /** Nom court humain (utilisé dans les logs / debug). */
  name:    string
  /** Map secteur FR → pourcentage (0..100). */
  sectors: Record<string, number>
  /** Map zone géographique (GeoZone) → pourcentage (0..100). */
  zones:   Record<string, number>
}

export const ETF_COMPOSITIONS: Record<string, ETFComposition> = {
  // ── MONDE (MSCI World) ─────────────────────────────────────────
  'IE00B4L5Y983': {
    name: 'iShares Core MSCI World',
    sectors: {
      'Technologie': 23, 'Finance': 15, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 69, 'Europe': 16, 'Asie développée': 11, 'Autres': 4 },
  },
  'LU1681043599': {
    name: 'Amundi MSCI World',
    sectors: {
      'Technologie': 23, 'Finance': 15, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 69, 'Europe': 16, 'Asie développée': 11, 'Autres': 4 },
  },
  'FR0010315770': {
    name: 'Lyxor MSCI World',
    sectors: {
      'Technologie': 23, 'Finance': 14, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 11,
    },
    zones: { 'Amérique du Nord': 68, 'Europe': 16, 'Asie développée': 12, 'Autres': 4 },
  },
  'LU0290358497': {
    name: 'Xtrackers MSCI World Swap',
    sectors: {
      'Technologie': 23, 'Finance': 15, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 69, 'Europe': 16, 'Asie développée': 11, 'Autres': 4 },
  },

  // ── S&P 500 ─────────────────────────────────────────────────────
  'IE00B5BMR087': {
    name: 'iShares Core S&P 500',
    sectors: {
      'Technologie': 29, 'Finance': 13, 'Santé': 13, 'Industrie': 9,
      'Consommation cyclique': 11, 'Consommation de base': 6, 'Énergie': 4,
      'Immobilier': 3, 'Matières premières': 2, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 100 },
  },
  'LU1681048804': {
    name: 'Amundi S&P 500',
    sectors: {
      'Technologie': 29, 'Finance': 13, 'Santé': 13, 'Industrie': 9,
      'Consommation cyclique': 11, 'Consommation de base': 6, 'Énergie': 4,
      'Immobilier': 3, 'Matières premières': 2, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 100 },
  },
  'FR0011871128': {
    name: 'Lyxor S&P 500',
    sectors: {
      'Technologie': 29, 'Finance': 13, 'Santé': 13, 'Industrie': 9,
      'Consommation cyclique': 11, 'Consommation de base': 6, 'Énergie': 4,
      'Immobilier': 3, 'Matières premières': 2, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 100 },
  },

  // ── NASDAQ / TECH ──────────────────────────────────────────────
  'IE00B53SZB19': {
    name: 'iShares Nasdaq 100',
    sectors: {
      'Technologie': 58, 'Communication': 18, 'Consommation cyclique': 14,
      'Santé': 6, 'Industrie': 2, 'Finance': 2,
    },
    zones: { 'Amérique du Nord': 97, 'Autres': 3 },
  },
  'LU1829221024': {
    name: 'Amundi Nasdaq 100',
    sectors: {
      'Technologie': 58, 'Communication': 18, 'Consommation cyclique': 14,
      'Santé': 6, 'Industrie': 2, 'Finance': 2,
    },
    zones: { 'Amérique du Nord': 97, 'Autres': 3 },
  },
  'LU1829221271': {
    name: 'Lyxor Nasdaq 100',
    sectors: {
      'Technologie': 58, 'Communication': 18, 'Consommation cyclique': 14,
      'Santé': 6, 'Industrie': 2, 'Finance': 2,
    },
    zones: { 'Amérique du Nord': 97, 'Autres': 3 },
  },

  // ── EUROPE ─────────────────────────────────────────────────────
  'IE00B4K48X80': {
    name: 'iShares Core MSCI Europe',
    sectors: {
      'Finance': 18, 'Industrie': 15, 'Santé': 14, 'Consommation de base': 12,
      'Matières premières': 8, 'Énergie': 7, 'Technologie': 7,
      'Consommation cyclique': 8, 'Services publics': 5, 'Communication': 4,
      'Immobilier': 2,
    },
    zones: { 'Europe': 100 },
  },
  'FR0007054358': {
    name: 'Lyxor Euro Stoxx 50',
    sectors: {
      'Finance': 20, 'Industrie': 14, 'Santé': 13, 'Consommation de base': 12,
      'Énergie': 8, 'Technologie': 9, 'Matières premières': 7,
      'Consommation cyclique': 8, 'Services publics': 5, 'Communication': 4,
    },
    zones: { 'Europe': 100 },
  },
  'FR0007080973': {
    name: 'Amundi CAC 40',
    sectors: {
      'Consommation cyclique': 22, 'Industrie': 17, 'Finance': 13, 'Santé': 12,
      'Énergie': 9, 'Matières premières': 8, 'Technologie': 7,
      'Services publics': 5, 'Communication': 4, 'Consommation de base': 3,
    },
    zones: { 'Europe': 85, 'Amérique du Nord': 10, 'Autres': 5 },
  },

  // ── ÉMERGENTS ──────────────────────────────────────────────────
  'IE00B0M63177': {
    name: 'iShares MSCI Emerging Markets',
    sectors: {
      'Technologie': 22, 'Finance': 22, 'Consommation cyclique': 14,
      'Communication': 10, 'Matières premières': 8, 'Énergie': 6,
      'Industrie': 6, 'Santé': 4, 'Consommation de base': 4,
      'Immobilier': 3, 'Services publics': 1,
    },
    zones: { 'Asie émergente': 60, 'Amérique latine': 10, 'Europe émergente': 8, 'Autres': 22 },
  },

  // ── OBLIGATAIRE ────────────────────────────────────────────────
  'IE00B4WXJJ64': {
    name: 'iShares Core Euro Govt Bond',
    sectors: { 'Obligations souveraines': 100 },
    zones:   { 'Europe': 100 },
  },
  'FR0010028860': {
    name: 'Lyxor Euro Government Bond',
    sectors: { 'Obligations souveraines': 100 },
    zones:   { 'Europe': 100 },
  },

  // ── THÉMATIQUES ────────────────────────────────────────────────
  'IE00B1XNHC34': {
    name: 'iShares Global Clean Energy',
    sectors: { 'Services publics': 55, 'Énergie': 30, 'Industrie': 15 },
    zones:   { 'Amérique du Nord': 45, 'Europe': 30, 'Asie développée': 15, 'Autres': 10 },
  },
  'IE00BYZK4552': {
    name: 'iShares Automation & Robotics',
    sectors: { 'Technologie': 55, 'Industrie': 35, 'Autres': 10 },
    zones:   { 'Amérique du Nord': 40, 'Europe': 25, 'Asie développée': 30, 'Autres': 5 },
  },
}

/**
 * Renvoie la composition d'un ETF si elle est référencée dans la table.
 * @param isin ISIN à chercher (insensible à la casse / aux espaces)
 */
export function getEtfComposition(isin: string): ETFComposition | null {
  if (!isin) return null
  const key = isin.trim().toUpperCase()
  return ETF_COMPOSITIONS[key] ?? null
}

/**
 * Indique si un ISIN est un ETF connu de la table de compositions.
 */
export function isMappedEtf(isin: string): boolean {
  return getEtfComposition(isin) !== null
}
