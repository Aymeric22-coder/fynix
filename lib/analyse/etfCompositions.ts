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
    // Compo réelle MSCI EM (Sep 2024) : 80 % Asie ém (Chine+Inde+Taiwan+
    // Corée+SEA), 8 % Am. latine (Brésil+Mexique), 5 % Moyen-Orient (Saudi+
    // UAE+Qatar), 3 % Afrique (Afrique du Sud), 4 % Europe émergente
    // (Pologne+Hongrie+Grèce).
    zones: { 'Asie émergente': 80, 'Amérique latine': 8, 'Moyen-Orient': 5, 'Afrique': 3, 'Europe émergente': 4 },
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
  'IE0007Y8Y157': {
    name: 'VanEck Quantum Computing UCITS ETF',
    sectors: { 'Technologie': 70, 'Communication': 15, 'Industrie': 10, 'Autres': 5 },
    zones:   { 'Amérique du Nord': 70, 'Asie développée': 15, 'Europe': 10, 'Autres': 5 },
  },

  // ── NASDAQ 100 — variantes additionnelles ──────────────────────
  // Amundi PEA Nasdaq 100 (réplication synthétique pour PEA)
  'FR0011871110': {
    name: 'Amundi PEA Nasdaq-100 UCITS ETF',
    sectors: {
      'Technologie': 58, 'Communication': 18, 'Consommation cyclique': 14,
      'Santé': 6, 'Industrie': 2, 'Finance': 2,
    },
    zones: { 'Amérique du Nord': 97, 'Autres': 3 },
  },
  // Amundi Nasdaq-100 USD ACC
  'LU1681038326': {
    name: 'Amundi Nasdaq-100 UCITS ETF USD Acc',
    sectors: {
      'Technologie': 58, 'Communication': 18, 'Consommation cyclique': 14,
      'Santé': 6, 'Industrie': 2, 'Finance': 2,
    },
    zones: { 'Amérique du Nord': 97, 'Autres': 3 },
  },

  // ── MSCI WORLD — variantes additionnelles ──────────────────────
  // Amundi Core MSCI World (nouveau ticker remplaçant LU1681043599)
  'IE000BI8OT95': {
    name: 'Amundi Core MSCI World UCITS ETF Acc',
    sectors: {
      'Technologie': 23, 'Finance': 15, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 69, 'Europe': 16, 'Asie développée': 11, 'Autres': 4 },
  },
  // iShares MSCI World Swap PEA (réplication synthétique pour PEA)
  'IE0002XZSH01': {
    name: 'iShares MSCI World Swap PEA UCITS ETF',
    sectors: {
      'Technologie': 23, 'Finance': 15, 'Santé': 12, 'Industrie': 11,
      'Consommation cyclique': 10, 'Consommation de base': 7, 'Énergie': 5,
      'Immobilier': 3, 'Matières premières': 4, 'Communication': 10,
    },
    zones: { 'Amérique du Nord': 69, 'Europe': 16, 'Asie développée': 11, 'Autres': 4 },
  },

  // ── EUROPE LARGE / MID CAP ─────────────────────────────────────
  // BNP Easy STOXX Europe 600 (sectoriel large) — apparaît 2× chez l'user
  'FR0011550193': {
    name: 'BNP Paribas Easy STOXX Europe 600',
    sectors: {
      'Finance': 18, 'Industrie': 15, 'Santé': 14, 'Consommation de base': 12,
      'Consommation cyclique': 11, 'Technologie': 8, 'Matières premières': 7,
      'Énergie': 5, 'Communication': 5, 'Services publics': 4, 'Immobilier': 1,
    },
    zones: { 'Europe': 100 },
  },
  // iShares MSCI Europe Mid Cap (mid caps européennes)
  'IE00BF20LF40': {
    name: 'iShares MSCI Europe Mid Cap UCITS ETF',
    sectors: {
      'Industrie': 22, 'Consommation cyclique': 16, 'Finance': 14,
      'Matières premières': 11, 'Technologie': 10, 'Santé': 9,
      'Consommation de base': 7, 'Immobilier': 5, 'Énergie': 3,
      'Services publics': 2, 'Communication': 1,
    },
    zones: { 'Europe': 100 },
  },

  // ── US SMALL CAPS ─────────────────────────────────────────────
  // Amundi Russell 2000
  'LU1681038672': {
    name: 'Amundi Russell 2000 UCITS ETF',
    sectors: {
      'Industrie': 18, 'Finance': 17, 'Santé': 15, 'Technologie': 13,
      'Consommation cyclique': 12, 'Immobilier': 7, 'Énergie': 5,
      'Matières premières': 5, 'Consommation de base': 4,
      'Services publics': 3, 'Communication': 1,
    },
    zones: { 'Amérique du Nord': 100 },
  },

  // ── ÉMERGENTS — variantes ESG / supplémentaires ────────────────
  // BNP Easy MSCI Emerging Markets ESG
  'LU1291097779': {
    name: 'BNP Paribas Easy MSCI EM SRI S-Series PAB 5% Capped',
    sectors: {
      'Technologie': 22, 'Finance': 22, 'Consommation cyclique': 14,
      'Communication': 10, 'Matières premières': 8, 'Énergie': 6,
      'Industrie': 6, 'Santé': 4, 'Consommation de base': 4,
      'Immobilier': 3, 'Services publics': 1,
    },
    // Compo réelle MSCI EM (Sep 2024) : 80 % Asie ém (Chine+Inde+Taiwan+
    // Corée+SEA), 8 % Am. latine (Brésil+Mexique), 5 % Moyen-Orient (Saudi+
    // UAE+Qatar), 3 % Afrique (Afrique du Sud), 4 % Europe émergente
    // (Pologne+Hongrie+Grèce).
    zones: { 'Asie émergente': 80, 'Amérique latine': 8, 'Moyen-Orient': 5, 'Afrique': 3, 'Europe émergente': 4 },
  },
  // Amundi PEA MSCI Emerging Markets ESG
  'FR0011440478': {
    name: 'Amundi PEA MSCI Emerging Markets ESG',
    sectors: {
      'Technologie': 22, 'Finance': 22, 'Consommation cyclique': 14,
      'Communication': 10, 'Matières premières': 8, 'Énergie': 6,
      'Industrie': 6, 'Santé': 4, 'Consommation de base': 4,
      'Immobilier': 3, 'Services publics': 1,
    },
    // Compo réelle MSCI EM (Sep 2024) : 80 % Asie ém (Chine+Inde+Taiwan+
    // Corée+SEA), 8 % Am. latine (Brésil+Mexique), 5 % Moyen-Orient (Saudi+
    // UAE+Qatar), 3 % Afrique (Afrique du Sud), 4 % Europe émergente
    // (Pologne+Hongrie+Grèce).
    zones: { 'Asie émergente': 80, 'Amérique latine': 8, 'Moyen-Orient': 5, 'Afrique': 3, 'Europe émergente': 4 },
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

// ─────────────────────────────────────────────────────────────────
// Fallback par nom — pour les ETFs dont l'ISIN n'est pas dans la
// table mais dont le nom contient une référence d'indice connue.
// Évite que la fiabilité s'effondre dès qu'un nouvel ISIN apparaît.
// ─────────────────────────────────────────────────────────────────

interface NameFallback {
  /** Regex insensible à la casse appliquée au nom de l'ETF. */
  pattern: RegExp
  /** Clé d'un ETF déjà référencé dont on copie la composition. */
  baseKey: string
  /** Label humain (utilisé pour les logs). */
  label:   string
}

const NAME_FALLBACKS: NameFallback[] = [
  // Ordre : les patterns les plus spécifiques en premier
  { pattern: /nasdaq[\s-]?100/i,           baseKey: 'IE00B53SZB19', label: 'Nasdaq 100' },
  { pattern: /\bs[\s&]+p\s*500\b/i,        baseKey: 'IE00B5BMR087', label: 'S&P 500' },
  { pattern: /\bcac\s*40\b/i,              baseKey: 'FR0007080973', label: 'CAC 40' },
  { pattern: /\beuro\s*stoxx\s*50\b/i,     baseKey: 'FR0007054358', label: 'Euro Stoxx 50' },
  { pattern: /stoxx\s*europe\s*600/i,      baseKey: 'FR0011550193', label: 'Stoxx Europe 600' },
  { pattern: /msci\s*europe\s*mid/i,       baseKey: 'IE00BF20LF40', label: 'MSCI Europe Mid Cap' },
  { pattern: /msci\s*europe(?!\s*mid)/i,   baseKey: 'IE00B4K48X80', label: 'MSCI Europe' },
  { pattern: /russell\s*2000/i,            baseKey: 'LU1681038672', label: 'Russell 2000' },
  { pattern: /msci\s*em(?:\b|erging)/i,    baseKey: 'IE00B0M63177', label: 'MSCI Emerging Markets' },
  { pattern: /clean\s*energy/i,            baseKey: 'IE00B1XNHC34', label: 'Clean Energy' },
  { pattern: /automation|robotic/i,        baseKey: 'IE00BYZK4552', label: 'Automation & Robotics' },
  { pattern: /quantum/i,                   baseKey: 'IE0007Y8Y157', label: 'Quantum Computing' },
  { pattern: /euro\s*gov(?:ernment|t)\s*bond/i, baseKey: 'IE00B4WXJJ64', label: 'Euro Gov Bond' },
  // MSCI World en DERNIER (le plus large)
  { pattern: /msci\s*world|\bworld\s*swap\b|\bworld\s*ucits\b/i, baseKey: 'IE00B4L5Y983', label: 'MSCI World' },
]

/**
 * Cherche une composition par approximation sur le NOM de l'ETF.
 * Utilisé en fallback quand l'ISIN n'est pas dans la table.
 *
 * @returns la composition à utiliser, ou null si aucun pattern ne matche.
 */
export function getEtfCompositionByName(name: string): { composition: ETFComposition; matchedLabel: string } | null {
  if (!name) return null
  for (const fb of NAME_FALLBACKS) {
    if (fb.pattern.test(name)) {
      const base = ETF_COMPOSITIONS[fb.baseKey]
      if (base) return { composition: base, matchedLabel: fb.label }
    }
  }
  return null
}
