/**
 * Orchestrateur de fournisseurs de cotations.
 *
 * Algorithme :
 *   1. Filtre la liste des providers actifs (is_active=true) qui supportent
 *      la classe d'actif demandée.
 *   2. Trie par priority croissante (1 = plus prioritaire).
 *   3. Tente chaque provider dans l'ordre. Premier succès gagne.
 *   4. Si tous échouent, renvoie null.
 *
 * La config (is_active, priority, supported_classes) vient de la table
 * `price_providers` en DB. L'orchestrateur ne lit pas la DB lui-même —
 * il reçoit la config en injection (testable, déterministe).
 */

import type { AssetClass } from '@/types/database.types'
import type {
  InstrumentLookup, PortfolioPriceProvider, PriceQuote,
} from './types'

export interface ProviderConfig {
  code:             string
  isActive:         boolean
  priority:         number
  supportedClasses: AssetClass[]
}

export class PriceOrchestrator {
  constructor(
    private providers: PortfolioPriceProvider[],
    private configs:   ProviderConfig[],
  ) {}

  /**
   * Renvoie la première cotation valide en respectant la chaîne de fallback.
   * @returns la quote ou null si aucun provider n'a réussi.
   */
  async getQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    const chain = this.buildChain(instrument.assetClass)

    for (const provider of chain) {
      try {
        const quote = await provider.fetchQuote(instrument)
        if (quote && quote.price > 0) return quote
      } catch (e) {
        console.warn(`[orchestrator] ${provider.code} threw:`, e)
      }
    }

    return null
  }

  /** Liste des providers actifs supportant la classe, triés par priorité. */
  buildChain(assetClass: AssetClass): PortfolioPriceProvider[] {
    const eligibleConfigs = this.configs
      .filter((c) => c.isActive && c.supportedClasses.includes(assetClass))
      .sort((a, b) => a.priority - b.priority)

    const byCode = new Map(this.providers.map((p) => [p.code, p]))

    return eligibleConfigs
      .map((c) => byCode.get(c.code))
      .filter((p): p is PortfolioPriceProvider => p !== undefined)
  }
}
