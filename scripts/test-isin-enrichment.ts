/**
 * Script ad-hoc de validation manuelle de l'enrichissement ISIN.
 *
 * Usage :
 *   npx tsx scripts/test-isin-enrichment.ts
 *
 * Ce script appelle DIRECTEMENT enrichISIN() — il a besoin :
 *   - d'une instance Supabase joignable (variables NEXT_PUBLIC_SUPABASE_URL
 *     + clé service ou session valide côté server client)
 *   - d'un accès Internet (OpenFIGI + Yahoo)
 *
 * Il n'est PAS exécuté par vitest (présence dans `scripts/` exclu du run).
 * Pour CI, on s'appuie sur les tests unitaires des mappings purs.
 */

import { enrichISIN } from '@/lib/analyse/isinEnricher'

const TEST_ISINS = [
  { isin: 'FR0000131104', expect: 'BNP Paribas (action française)' },
  { isin: 'US0378331005', expect: 'Apple (action américaine)' },
  { isin: 'IE00B4L5Y983', expect: 'iShares Core MSCI World ETF (Irlande)' },
  { isin: 'LU0290358497', expect: 'Xtrackers MSCI World Swap ETF (Luxembourg)' },
]

async function run() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Test enrichissement ISIN — OpenFIGI + Yahoo Finance')
  console.log('═══════════════════════════════════════════════════════════\n')

  for (const { isin, expect } of TEST_ISINS) {
    console.log(`▶ ${isin}  (attendu : ${expect})`)
    try {
      const t0 = Date.now()
      const data = await enrichISIN(isin)
      const dt   = Date.now() - t0

      console.log(`   nom        : ${data.name}`)
      console.log(`   symbol     : ${data.symbol ?? '—'}`)
      console.log(`   asset_type : ${data.asset_type}`)
      console.log(`   secteur    : ${data.sector ?? '—'}`)
      console.log(`   industrie  : ${data.industry ?? '—'}`)
      console.log(`   pays       : ${data.country ?? '—'}`)
      console.log(`   devise     : ${data.currency}`)
      console.log(`   exchange   : ${data.exchange ?? '—'}`)
      console.log(`   prix       : ${data.current_price ?? '—'}`)
      console.log(`   durée      : ${dt} ms\n`)
    } catch (e) {
      console.error(`   ❌ ERREUR : ${(e as Error).message}\n`)
    }
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Fin du test')
  console.log('═══════════════════════════════════════════════════════════')
}

run().catch((e) => { console.error(e); process.exit(1) })
