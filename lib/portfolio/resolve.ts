/**
 * Résolveur d'instrument à partir d'un identifiant (ISIN, ticker).
 *
 * Stratégie :
 *   1. OpenFIGI (résolveur d'identité officiel, gratuit, riche en métadonnées)
 *   2. (futur) Recherche locale dans la table `instruments` pour éviter
 *      les appels API redondants si un autre user a déjà créé le même titre.
 *
 * Le résolveur retourne un objet `ResolvedInstrument` qui sert à pré-remplir
 * le formulaire d'ajout de position. Il NE crée AUCUNE entrée DB : c'est
 * l'utilisateur qui valide et déclenche la création via le POST positions.
 */

import { resolveFigi, selectBestMatch, type FigiMatch } from './providers/openfigi'
import type { AssetClass } from '@/types/database.types'

export interface ResolvedInstrument {
  name:        string
  ticker:      string | null
  isin:        string | null
  assetClass:  AssetClass
  /** Place de cotation (code Bloomberg) si connue. */
  exchCode:    string | null
  /** Identifiant global FIGI (à stocker dans `instruments.provider_id` plus tard). */
  figi:        string | null
  /** Source de résolution (toujours 'openfigi' pour l'instant). */
  source:      'openfigi' | 'cache'
  /** Niveau de confiance heuristique. */
  confidence:  'high' | 'medium' | 'low'
}

/**
 * Mapping OpenFIGI (securityType + marketSector + securityType2) → AssetClass.
 *
 * OpenFIGI utilise une taxonomie large. On la projette sur notre ENUM
 * `asset_class` (17 valeurs). En cas d'ambiguïté, on tombe sur `other`.
 *
 * Référence OpenFIGI : https://www.openfigi.com/api/lookup#bloomberg-security-type-codes
 */
export function mapFigiToAssetClass(match: FigiMatch): AssetClass {
  const st  = (match.securityType  ?? '').toLowerCase()
  const st2 = (match.securityType2 ?? '').toLowerCase()
  const ms  = (match.marketSector  ?? '').toLowerCase()

  // ETF / trackers
  if (st.includes('etp') || st2.includes('etp') || st.includes('etf') || st2.includes('etf')) {
    return 'etf'
  }

  // REIT (US) / SIIC (FR)
  if (st.includes('reit') || st2.includes('reit')) return 'reit'
  if (st.includes('siic') || st2.includes('siic')) return 'siic'

  // SCPI (rare sur OpenFIGI, mais on couvre)
  if (st.includes('scpi') || st2.includes('scpi') || ms.includes('scpi')) return 'scpi'

  // OPCI
  if (st.includes('opci') || st2.includes('opci')) return 'opci'

  // Crypto
  // Bloomberg utilise "Curncy" pour devises ET cryptos. Heuristique :
  // si le ticker contient '-' ou '/' (BTC-USD, ETH/USD) → crypto.
  if (ms === 'curncy' && (match.ticker.includes('-') || match.ticker.includes('/'))) {
    return 'crypto'
  }
  if (st.includes('crypto') || st2.includes('crypto')) return 'crypto'

  // Obligations
  if (ms === 'corp' || ms === 'govt' || ms === 'mtge' || st.includes('bond')) return 'bond'

  // Fonds (OPCVM, mutual funds, supports AV)
  if (st.includes('mutual fund') || st.includes('open-end') || st.includes('closed-end')
      || st.includes('open end') || st2.includes('fund') || ms === 'm-mkt') {
    return 'fund'
  }

  // Métaux précieux & matières premières
  if (ms === 'comdty' || st.includes('metal') || st.includes('commodity')) return 'metal'

  // Produits dérivés
  if (st.includes('option') || st.includes('warrant') || st.includes('future')) return 'derivative'

  // Produits structurés (certificats, notes)
  if (st.includes('structured') || st.includes('certificate') || st.includes('note')) {
    return 'structured'
  }

  // Equity par défaut si marketSector = Equity
  if (ms === 'equity' || st.includes('common stock') || st.includes('preferred')
      || st.includes('ordinary share') || st2.includes('common stock')) {
    return 'equity'
  }

  return 'other'
}

/**
 * Résout un instrument à partir d'un ISIN (priorité) ou d'un ticker.
 *
 * @param input objet contenant au moins un ISIN OU un ticker
 * @param apiKey clé OpenFIGI optionnelle (env OPENFIGI_API_KEY)
 *
 * @returns instrument résolu ou null si rien trouvé / réseau KO.
 */
export async function resolveInstrument(
  input:  { isin?: string | null; ticker?: string | null; exchCode?: string | null },
  apiKey?: string,
): Promise<ResolvedInstrument | null> {
  // Normalisation
  const isin   = input.isin?.trim().toUpperCase()   || null
  const ticker = input.ticker?.trim().toUpperCase() || null

  let matches: FigiMatch[] | null = null

  // 1. Priorité ISIN (12 chars typique, mais on tolère >= 10)
  if (isin && isin.length >= 10) {
    matches = await resolveFigi('ID_ISIN', isin, input.exchCode ?? undefined, apiKey)
  }

  // 2. Fallback ticker si pas d'ISIN ou rien trouvé
  if ((!matches || matches.length === 0) && ticker) {
    matches = await resolveFigi('TICKER', ticker, input.exchCode ?? undefined, apiKey)
  }

  if (!matches || matches.length === 0) return null

  const best = selectBestMatch(matches)
  if (!best) return null

  return {
    name:       best.name,
    ticker:     best.ticker || null,
    isin:       isin,
    assetClass: mapFigiToAssetClass(best),
    exchCode:   best.exchCode,
    figi:       best.figi,
    source:     'openfigi',
    // Confiance : haute si on a ticker + nom + securityType cohérent
    confidence: best.ticker && best.name && best.securityType ? 'high' : 'medium',
  }
}
