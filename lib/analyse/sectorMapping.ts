/**
 * Normalisation des libellés sectoriels Yahoo Finance vers le français.
 *
 * Yahoo renvoie les secteurs en anglais avec une taxonomie fixe (10-11
 * grands secteurs GICS). On les traduit pour l'affichage côté UI tout
 * en gardant la valeur brute en DB (champ `sector` de `isin_cache`).
 *
 * Si un secteur n'est pas mappé (ex: traduction Yahoo qui change), on
 * renvoie le libellé brut tel quel — pas de fallback "Autre" pour
 * préserver l'information.
 */

export const SECTOR_MAP: Record<string, string> = {
  'Technology':             'Technologie',
  'Healthcare':             'Santé',
  'Financial Services':     'Finance',
  'Consumer Cyclical':      'Consommation cyclique',
  'Consumer Defensive':     'Consommation de base',
  'Industrials':            'Industrie',
  'Basic Materials':        'Matières premières',
  'Energy':                 'Énergie',
  'Utilities':              'Services publics',
  'Real Estate':            'Immobilier',
  'Communication Services': 'Communication',
}

/**
 * Traduit un libellé secteur Yahoo en français.
 * Si l'entrée est null/undefined ou inconnue, renvoie l'entrée telle
 * quelle (ou null).
 */
export function translateSector(raw: string | null | undefined): string | null {
  if (!raw) return null
  return SECTOR_MAP[raw] ?? raw
}

/**
 * Liste exhaustive des secteurs FR (utile pour les filtres / légendes).
 */
export const ALL_SECTORS_FR: string[] = Object.values(SECTOR_MAP)
