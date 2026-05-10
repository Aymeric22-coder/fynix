/**
 * Tests : parseCsv + guessTransactionType
 */

import { describe, it, expect } from 'vitest'
import { parseCsv, guessTransactionType } from '../csv-import'

describe('parseCsv — délimiteur', () => {

  it('détecte délimiteur ;', () => {
    const csv = `Date;Libellé;Montant
2025-01-15;Loyer T2;850`
    const r = parseCsv(csv)
    expect(r.delimiter).toBe(';')
    expect(r.rows).toHaveLength(1)
  })

  it('détecte délimiteur ,', () => {
    const csv = `Date,Libellé,Montant
2025-01-15,Loyer T2,850`
    const r = parseCsv(csv)
    expect(r.delimiter).toBe(',')
  })
})

describe('parseCsv — formats de date', () => {

  it('accepte ISO YYYY-MM-DD', () => {
    const csv = `Date;Libellé;Montant\n2025-03-14;Test;100`
    const r = parseCsv(csv)
    expect(r.rows[0]!.date).toBe('2025-03-14')
  })

  it('accepte FR DD/MM/YYYY', () => {
    const csv = `Date;Libellé;Montant\n14/03/2025;Test;100`
    const r = parseCsv(csv)
    expect(r.rows[0]!.date).toBe('2025-03-14')
  })

  it('accepte FR DD/MM/YY (siècle deviné)', () => {
    const csv = `Date;Libellé;Montant\n14/03/25;Test;100`
    const r = parseCsv(csv)
    expect(r.rows[0]!.date).toBe('2025-03-14')
  })

  it('rejette date invalide', () => {
    const csv = `Date;Libellé;Montant\nfoo;Test;100`
    const r = parseCsv(csv)
    expect(r.rows[0]!.error).toBe('Date invalide')
    expect(r.errors).toBe(1)
  })
})

describe('parseCsv — formats de montant', () => {

  it('accepte décimale avec point', () => {
    const csv = `Date;Libellé;Montant\n2025-01-01;Test;1234.56`
    const r = parseCsv(csv)
    expect(r.rows[0]!.amount).toBe(1234.56)
  })

  it('accepte décimale avec virgule (FR)', () => {
    const csv = `Date;Libellé;Montant\n2025-01-01;Test;1234,56`
    const r = parseCsv(csv)
    expect(r.rows[0]!.amount).toBe(1234.56)
  })

  it('parse montants négatifs', () => {
    const csv = `Date;Libellé;Montant\n2025-01-01;Échéance;-1052.30`
    const r = parseCsv(csv)
    expect(r.rows[0]!.amount).toBe(-1052.30)
  })

  it('supprime symboles devise', () => {
    const csv = `Date;Libellé;Montant\n2025-01-01;Test;850€`
    const r = parseCsv(csv)
    expect(r.rows[0]!.amount).toBe(850)
  })
})

describe('parseCsv — colonnes débit/crédit séparées (LCL-style)', () => {

  it('combine débit et crédit en montant signé', () => {
    const csv = `Date;Libellé;Débit;Crédit
2025-01-15;Loyer;;850
2025-01-10;Échéance pret;1052,30;`
    const r = parseCsv(csv)
    expect(r.rows[0]!.amount).toBe(850)
    expect(r.rows[1]!.amount).toBe(-1052.30)
  })
})

describe('guessTransactionType — patterns loyers', () => {

  it('reconnaît loyer en entrée', () => {
    expect(guessTransactionType('Loyer Mme Dupont T2', 850).type).toBe('rent_income')
  })

  it('ne reconnaît pas loyer en sortie (signe contradictoire)', () => {
    expect(guessTransactionType('Loyer Mme Dupont', -850).type).toBe('unknown')
  })

  it('reconnaît "Encaissement locataire"', () => {
    const r = guessTransactionType('Encaissement locataire DUPONT', 850)
    expect(r.type).toBe('rent_income')
    expect(r.confidence).toBeGreaterThanOrEqual(85)
  })
})

describe('guessTransactionType — patterns crédit', () => {

  it('reconnaît échéance prêt immo', () => {
    const r = guessTransactionType('Echeance pret immo Banque Populaire', -1052)
    expect(r.type).toBe('loan_payment')
    expect(r.confidence).toBeGreaterThanOrEqual(95)
  })

  it('reconnaît mensualité', () => {
    expect(guessTransactionType('Mensualité crédit habitat', -1100).type).toBe('loan_payment')
  })

  it('ne reconnaît pas mensualité en entrée', () => {
    expect(guessTransactionType('Mensualité', 1100).type).toBe('unknown')
  })
})

describe('guessTransactionType — patterns taxes & charges', () => {

  it('reconnaît taxe foncière', () => {
    const r = guessTransactionType('Taxe fonciere 2024 - DGFIP', -1500)
    expect(r.type).toBe('tax')
    expect(r.confidence).toBeGreaterThanOrEqual(98)
  })

  it('reconnaît assurance PNO', () => {
    expect(guessTransactionType('Prelevement assurance PNO', -350).type).toBe('fee')
  })

  it('reconnaît syndic copropriété', () => {
    expect(guessTransactionType('Syndic Cabinet Martin trim 1', -450).type).toBe('fee')
  })

  it('reconnaît travaux', () => {
    const r = guessTransactionType('Travaux peinture lot 2', -800)
    expect(r.type).toBe('fee')
    expect(r.confidence).toBeGreaterThanOrEqual(70)
  })
})

describe('guessTransactionType — fallback', () => {

  it('renvoie unknown si rien ne matche', () => {
    const r = guessTransactionType('Achat carrefour', -45.50)
    expect(r.type).toBe('unknown')
    expect(r.confidence).toBe(0)
  })
})

describe('parseCsv — intégration complète', () => {

  it('parse un relevé bancaire FR typique', () => {
    const csv = `Date;Libellé;Montant
15/01/2025;Loyer T2 Dupont;850
10/01/2025;Echeance pret immo;-1052,30
05/01/2025;Taxe fonciere 2024;-1500
03/01/2025;Achat boulangerie;-12,50
01/01/2025;Salaire Janvier;3500`

    const r = parseCsv(csv)
    expect(r.rows).toHaveLength(5)
    expect(r.errors).toBe(0)
    expect(r.rows[0]!.guessedType).toBe('rent_income')
    expect(r.rows[1]!.guessedType).toBe('loan_payment')
    expect(r.rows[2]!.guessedType).toBe('tax')
    expect(r.rows[3]!.guessedType).toBe('unknown')
    expect(r.rows[4]!.guessedType).toBe('unknown')   // pas de pattern salaire (hors scope)
  })
})
