/**
 * Tests d'intégration R3 — import CSV de dividendes + realized_pnl ventes.
 *
 * Couvre la chaîne :
 *   1. parseTradeRepublic reconnaît les lignes DIVIDEND/INTEREST_PAYMENT.
 *   2. buildTransactionRowsForImport({ withRealizedPnl: true }) calcule
 *      la PV réalisée des ventes via le trail CUMP (D4).
 *   3. Les dividendes produisent des lignes `transaction_type='dividend'`
 *      avec `realized_pnl: null`.
 *   4. external_ref est strictement déterministe → idempotence garantie
 *      sur ré-import (l'index unique partiel DB + ignoreDuplicates rend
 *      le second insert un no-op silencieux).
 *
 * On n'a pas besoin de mocker Supabase : ces tests couvrent la logique
 * pure de transformation CSV → ImportTransactionRow[], qui est ce que
 * la route serialise puis envoie en upsert idempotent.
 */

import { describe, it, expect } from 'vitest'
import { parseBrokerCsv } from '../csvImport'
import { buildTransactionRowsForImport } from '../import-transactions'

// ─── Fixture : CSV Trade Republic ─────────────────────────────────────
//
// Format reproduisant la structure d'un export TR officiel : en plus
// des colonnes principales (CATEGORY/TYPE/DATETIME/NAME/SYMBOL/SHARES/
// PRICE/CURRENCY), on inclut `asset_class` et `transaction_id` qui sont
// les marqueurs distinctifs de TR pour la détection automatique, et la
// colonne `value` qui porte le montant total (utile pour les dividendes
// quand TR ne renseigne pas le détail shares × price).
const TR_CSV = [
  'CATEGORY,TYPE,DATETIME,NAME,SYMBOL,SHARES,PRICE,CURRENCY,VALUE,ASSET_CLASS,TRANSACTION_ID',
  // 1 achat de 10 actions à 100€
  'TRADING,BUY,2024-01-15T09:00:00Z,Air Liquide,FR0000120073,10,100,EUR,1000,STOCK,tx-1',
  // 1 vente partielle de 4 actions à 150€ (PV brute = (150−100)×4 = 200)
  'TRADING,SELL,2024-06-30T09:00:00Z,Air Liquide,FR0000120073,4,150,EUR,600,STOCK,tx-2',
  // 1 dividende 12,50€ (versé sur 6 actions résiduelles)
  'DIVIDEND,CREDIT,2024-05-20T09:00:00Z,Air Liquide,FR0000120073,6,2.0833,EUR,12.50,STOCK,tx-3',
  // 1 versement d'intérêts 3,40€ (cash, pas d'ISIN — sera orphelin)
  'INTEREST_PAYMENT,CREDIT,2024-12-31T09:00:00Z,Cash,XXX,1,3.40,EUR,3.40,CASH,tx-4',
].join('\n')

const CTX = {
  userId:       'user-aaaa',
  positionId:   'pos-air-liquide',
  instrumentId: 'inst-air-liquide',
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('R3 — Import TR avec dividendes + realized_pnl ventes', () => {
  it('parser TR reconnaît buy / sell / dividend / interest_payment', () => {
    const parsed = parseBrokerCsv(TR_CSV)
    expect(parsed.broker).toBe('trade_republic')
    const types = parsed.transactions.map((t) => t.transaction_type)
    // Le CSV de test contient 4 lignes (buy, sell, dividend, interest).
    // L'interest_payment cash n'a pas d'ISIN sur le symbol mais reste
    // typée 'dividend' (interest est traité comme dividend par convention).
    expect(types.filter((t) => t === 'buy')).toHaveLength(1)
    expect(types.filter((t) => t === 'sell')).toHaveLength(1)
    expect(types.filter((t) => t === 'dividend')).toHaveLength(2)
  })

  it('build rows : vente porte realized_pnl = (150 − 100) × 4 = 200', () => {
    const parsed = parseBrokerCsv(TR_CSV)
    // On filtre sur l'ISIN Air Liquide (le buy + sell + 1er dividende)
    const grpAirLiquide = parsed.transactions.filter(
      (t) => t.isin === 'FR0000120073',
    )

    const { rows, skipped } = buildTransactionRowsForImport(
      grpAirLiquide,
      CTX,
      { withRealizedPnl: true },
    )

    expect(skipped).toHaveLength(0)
    expect(rows).toHaveLength(3)

    const purchase = rows.find((r) => r.transaction_type === 'purchase')!
    const sale     = rows.find((r) => r.transaction_type === 'sale')!
    const dividend = rows.find((r) => r.transaction_type === 'dividend')!

    expect(purchase.realized_pnl).toBeNull()
    expect(dividend.realized_pnl).toBeNull()

    // R3 / E4 : la vente porte la PV réalisée calculée par le trail CUMP.
    expect(sale.realized_pnl).not.toBeNull()
    expect(sale.realized_pnl).toBeCloseTo(200, 6)
  })

  it('dividende : ligne transaction_type=dividend, amount = montant CSV', () => {
    const parsed = parseBrokerCsv(TR_CSV)
    const dividends = parsed.transactions.filter((t) => t.transaction_type === 'dividend')
    // Le dividende Air Liquide via la colonne VALUE (12.50)
    const airLiquideDiv = dividends.find((d) => d.isin === 'FR0000120073')!
    expect(airLiquideDiv).toBeTruthy()

    const { rows } = buildTransactionRowsForImport([airLiquideDiv], CTX)
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.transaction_type).toBe('dividend')
    expect(r.amount).toBeCloseTo(12.50, 6)
    expect(r.realized_pnl).toBeNull()
    expect(r.external_ref).toMatch(/^[0-9a-f]{64}$/)
  })

  it('idempotence : 2 builds successifs → external_ref strictement identiques', () => {
    const parsed = parseBrokerCsv(TR_CSV)
    // On force le même ctx pour avoir un hash strictement comparable
    // (le hash inclut userId/instrumentId).
    const grp = parsed.transactions.filter((t) => t.isin === 'FR0000120073')

    const first  = buildTransactionRowsForImport(grp, CTX, { withRealizedPnl: true })
    const second = buildTransactionRowsForImport(grp, CTX, { withRealizedPnl: true })

    expect(first.rows.map((r) => r.external_ref)).toEqual(
      second.rows.map((r) => r.external_ref),
    )

    // Au niveau DB, ces hashes identiques + l'index unique partiel
    // (user_id, external_ref) WHERE external_ref IS NOT NULL (migration 033)
    // + upsert avec onConflict ignoreDuplicates garantissent que le
    // ré-import est un no-op silencieux. Côté route, ça se traduit par
    // dividends_inserted: 0 sur la seconde tentative.
  })

  it('hash dividende dépend de amount (R3) : deux montants ≠ → hashes ≠', () => {
    const csvA = [
      'CATEGORY,TYPE,DATETIME,NAME,SYMBOL,SHARES,PRICE,CURRENCY,VALUE,ASSET_CLASS,TRANSACTION_ID',
      'DIVIDEND,CREDIT,2024-05-20T09:00:00Z,Air Liquide,FR0000120073,6,2.0833,EUR,12.50,STOCK,tx-a',
    ].join('\n')
    const csvB = [
      'CATEGORY,TYPE,DATETIME,NAME,SYMBOL,SHARES,PRICE,CURRENCY,VALUE,ASSET_CLASS,TRANSACTION_ID',
      'DIVIDEND,CREDIT,2024-05-20T09:00:00Z,Air Liquide,FR0000120073,6,2.0833,EUR,15.00,STOCK,tx-b',
    ].join('\n')

    const txA = parseBrokerCsv(csvA, 'trade_republic').transactions[0]!
    const txB = parseBrokerCsv(csvB, 'trade_republic').transactions[0]!

    const rowA = buildTransactionRowsForImport([txA], CTX).rows[0]!
    const rowB = buildTransactionRowsForImport([txB], CTX).rows[0]!
    expect(rowA.external_ref).not.toBe(rowB.external_ref)
    expect(rowA.amount).toBeCloseTo(12.50, 6)
    expect(rowB.amount).toBeCloseTo(15.00, 6)
  })
})
