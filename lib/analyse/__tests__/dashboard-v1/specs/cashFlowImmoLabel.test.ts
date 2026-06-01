/**
 * Spec P0.4 — Renommage « Cash-flow mensuel » → « Cash-flow immobilier (Y1 simulé) ».
 *
 * Statut : **livré en V1.2**. Le rename ne concerne que la structure interne
 * du nouveau pipeline (`DashboardKpis.cash_flow_immo_y1` + `.cash_flow_immo_y1_label`).
 * Le bloc inline `dashboard/page.tsx` garde `monthly_cash_flow` jusqu'à V1.4.
 *
 * La VALEUR numérique est strictement inchangée (même formule, même périmètre :
 * `hasImmoSim ? totalMonthlyCFYear1 − otherMonthlyLoan : 0`).
 *
 * Le vrai cash-flow patrimonial (loyers + dividendes + intérêts livrets − mensualités)
 * reste planifié pour P1.1, hors scope V1.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

describe('P0.4 — Cash-flow immobilier (Y1 simulé) [rename livré V1.2]', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      it('label = « Cash-flow immobilier (Y1 simulé) »', () => {
        expect(data.kpis.cash_flow_immo_y1_label).toBe('Cash-flow immobilier (Y1 simulé)')
      })

      it('valeur numérique = inchangée par rapport à `currentBuggy.cashFlowMonthly`', () => {
        expect(data.kpis.cash_flow_immo_y1).toBeCloseTo(fixture.currentBuggy.cashFlowMonthly, 2)
      })
    },
  )

  it('sans bien immo simulé : valeur = 0 mais label reste « Cash-flow immobilier (Y1 simulé) »', () => {
    const boursier = ALL_FIXTURES.find((f) => f.id === 'investisseur-boursier')!
    const data = computeDashboardData(boursier.inputs)
    expect(data.kpis.cash_flow_immo_y1).toBe(0)
    expect(data.kpis.cash_flow_immo_y1_label).toBe('Cash-flow immobilier (Y1 simulé)')
  })

  it('au moins un bien sim complète : sim_cf_label exposé', () => {
    const immo = ALL_FIXTURES.find((f) => f.id === 'investisseur-immo')!
    const data = computeDashboardData(immo.inputs)
    expect(data.kpis.sim_cf_label).toBe('après impôts (simulation)')
  })

  it('aucun bien sim complète : sim_cf_label = undefined', () => {
    const boursier = ALL_FIXTURES.find((f) => f.id === 'investisseur-boursier')!
    const data = computeDashboardData(boursier.inputs)
    expect(data.kpis.sim_cf_label).toBeUndefined()
  })
})

describe('P1.1 — Cash-flow patrimonial agrégé [futur, hors V1]', () => {
  it.todo('preretraite : cashFlowPatrimonial ≈ 600 (immo) + 750 (3 % fonds euros 300k) + 250 (3 % livrets 100k) = 1 600 €/mois')
  it.todo('investisseur-boursier : cashFlowPatrimonial ≈ 0 (immo) + estim dividendes ETF + intérêts livret = > 0')
  it.todo('soustraction des mensualités non-immo (crédits conso, étudiant) si existantes')
})
