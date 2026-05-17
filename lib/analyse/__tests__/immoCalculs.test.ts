/**
 * Tests du recalibrage du score de risque immobilier (Tâche 4 Sprint 2).
 *
 * Avant Sprint 2 : LTV ≥ 75 % → 65 pts + 10 si cashflow < 0 → un bien
 * standard à LTV 80 % avec cashflow négatif les 3 premières années
 * étiqueté "très risqué" (75 pts). Faux signal.
 *
 * Après Sprint 2 :
 *   LTV = 0    → 5
 *   LTV < 70   → 15
 *   LTV 70-89  → 30  (norme française primo-investisseur)
 *   LTV ≥ 90   → 50
 *   + 10 si cashflow < 0 ET acquisition ≥ 24 mois.
 */
import { describe, it, expect } from 'vitest'
import { calculerKPIsBien } from '../immoCalculs'

const TODAY = new Date('2026-05-17T12:00:00Z')

function dateMoinsMois(mois: number): string {
  const d = new Date(TODAY)
  d.setMonth(d.getMonth() - mois)
  return d.toISOString().slice(0, 10)
}

describe('calculerKPIsBien — recalibrage risque immo Sprint 2', () => {
  const baseBien = {
    valeur:            200_000,
    credit_restant:    160_000,    // LTV 80 %
    mensualite_credit: 1_000,
    loyer_mensuel:     900,
    charges_annuelles: 2_400,
  }

  it('bien payé cash (LTV 0) → risque 5', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 0, mensualite_credit: 0,
    })
    expect(k.risque_immo).toBe(5)
  })

  it('LTV < 70 % → risque 15', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 100_000,  // LTV 50 %
      loyer_mensuel: 1500,  // cashflow positif → pas de malus
      mensualite_credit: 600,
    })
    expect(k.risque_immo).toBe(15)
  })

  it('LTV 80 % (norme française) + cashflow positif → risque 30 (PAS 65+10)', () => {
    const k = calculerKPIsBien({
      ...baseBien,
      loyer_mensuel: 1500,  // CF positif
      charges_annuelles: 0,
    })
    expect(k.ltv).toBe(80)
    expect(k.cashflow_mensuel).toBeGreaterThan(0)
    expect(k.risque_immo).toBe(30)
  })

  it('LTV 80 % + cashflow négatif + bien ancien (≥ 24 mois) → risque 40 (30+10)', () => {
    const k = calculerKPIsBien({
      ...baseBien,  // CF négatif par défaut (loyer 900, mensualité 1000, charges 200/mois)
      acquisition_date: dateMoinsMois(36),  // 3 ans
    })
    expect(k.cashflow_mensuel).toBeLessThan(0)
    expect(k.risque_immo).toBe(40)
  })

  it('LTV 80 % + cashflow négatif MAIS bien récent (< 24 mois) → risque 30 sans malus', () => {
    const k = calculerKPIsBien({
      ...baseBien,
      acquisition_date: dateMoinsMois(12),  // 1 an
    })
    expect(k.cashflow_mensuel).toBeLessThan(0)
    expect(k.risque_immo).toBe(30)  // malus neutralisé
  })

  it('LTV 80 % + cashflow négatif + date manquante → conservateur (avec malus)', () => {
    const k = calculerKPIsBien(baseBien)  // pas d'acquisition_date
    expect(k.risque_immo).toBe(40)
  })

  it('LTV ≥ 90 % → risque 50 (sur-endettement)', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 190_000,  // LTV 95 %
      loyer_mensuel: 1500, mensualite_credit: 1200, charges_annuelles: 0,
    })
    expect(k.ltv).toBe(95)
    expect(k.risque_immo).toBe(50)
  })

  it('LTV ≥ 90 % + cashflow négatif + ancien → 60', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 190_000,
      acquisition_date: dateMoinsMois(30),
    })
    expect(k.risque_immo).toBe(60)  // 50 + 10
  })

  it('date d\'acquisition future ou invalide → ignorée (malus appliqué)', () => {
    const k1 = calculerKPIsBien({ ...baseBien, acquisition_date: 'invalid-date' })
    expect(k1.risque_immo).toBe(40)
    const k2 = calculerKPIsBien({ ...baseBien, acquisition_date: '2050-01-01' })
    // Date future → considéré "récent" → malus neutralisé
    expect(k2.risque_immo).toBe(30)
  })

  it('LTV exactement 70 % → bucket 70-89 (30 pts)', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 140_000,
      loyer_mensuel: 1500, mensualite_credit: 800, charges_annuelles: 0,
    })
    expect(k.ltv).toBe(70)
    expect(k.risque_immo).toBe(30)
  })

  it('LTV exactement 89 % → bucket 70-89 (30 pts) — sous le seuil ≥ 90', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 178_000,  // 89 %
      loyer_mensuel: 1500, mensualite_credit: 1100, charges_annuelles: 0,
    })
    expect(k.ltv).toBe(89)
    expect(k.risque_immo).toBe(30)
  })

  it('LTV exactement 90 % → bucket ≥ 90 (50 pts)', () => {
    const k = calculerKPIsBien({
      ...baseBien, credit_restant: 180_000,  // 90 %
      loyer_mensuel: 1500, mensualite_credit: 1100, charges_annuelles: 0,
    })
    expect(k.ltv).toBe(90)
    expect(k.risque_immo).toBe(50)
  })
})
