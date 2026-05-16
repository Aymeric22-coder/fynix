import { describe, it, expect } from 'vitest'
import {
  simulerBienExistant, simulerAcquisitionFuture, projectionGlobale,
  calculerImpactAcquisition,
} from '../projectionFIRE'
import type { BienImmo, AcquisitionFuture, ProjectionInputs } from '@/types/analyse'

function bien(over: Partial<BienImmo> = {}): BienImmo {
  return {
    id: 'b1', nom: 'Appart', ville: null, pays: 'France', type: 'Locatif',
    valeur: 200000, loyer_mensuel: 800, credit_restant: 100000,
    mensualite_credit: 700, charges_annuelles: 2000,
    equity: 100000, rendement_brut: 4.8, rendement_net: 3.8,
    cashflow_mensuel: -67, ltv: 50, niveau_levier: 'Modéré', risque_immo: 45,
    donnees_completes: true,
    taux_interet_estime: 3, duree_restante_mois: 180,
    ...over,
  }
}

function acq(over: Partial<AcquisitionFuture> = {}): AcquisitionFuture {
  return {
    id: 'a1', nom: 'Lyon T3', dans_combien_annees: 3,
    prix_achat: 180000, frais_notaire_pct: 8, apport: 36000,
    taux_interet: 3.5, duree_credit_ans: 20,
    type: 'locatif', loyer_brut_mensuel: 900, taux_vacance_pct: 5,
    charges_mensuelles: 100, appreciation_annuelle_pct: 2,
    ...over,
  }
}

describe('simulerBienExistant', () => {
  it('amortit le crédit jusqu\'à 0 et le solde au bon moment', () => {
    const traj = simulerBienExistant(bien(), 20, 2, 1.5)
    expect(traj).toHaveLength(21)            // année 0..20
    // À l'année 15 (180 mois = 15 ans), le crédit doit être proche de 0
    expect(traj[15]?.credit_restant).toBeLessThan(5000)
    expect(traj[20]?.credit_restant).toBe(0)
    expect(traj[20]?.mensualite).toBe(0)
  })

  it('apprécie la valeur du bien (+2 %/an = ×1.49 sur 20 ans)', () => {
    const traj = simulerBienExistant(bien({ valeur: 100000 }), 20, 2, 0)
    // 100k × 1.02^20 ≈ 148595
    expect(traj[20]?.valeur).toBeGreaterThan(140000)
    expect(traj[20]?.valeur).toBeLessThan(155000)
  })

  it('équity augmente quand crédit baisse + valeur apprécie', () => {
    const traj = simulerBienExistant(bien(), 20, 2, 1.5)
    expect(traj[0]?.equity).toBeLessThan(traj[10]?.equity ?? 0)
    expect(traj[10]?.equity).toBeLessThan(traj[20]?.equity ?? 0)
  })

  it('bien sans crédit : equity = valeur dès le départ', () => {
    const traj = simulerBienExistant(
      bien({ credit_restant: 0, mensualite_credit: 0, duree_restante_mois: 0 }),
      10, 2, 1.5,
    )
    expect(traj[0]?.equity).toBe(traj[0]?.valeur)
    expect(traj[5]?.mensualite).toBe(0)
  })
})

describe('simulerAcquisitionFuture', () => {
  it('rien avant l\'année N, puis acquisition à l\'année N', () => {
    const traj = simulerAcquisitionFuture(acq({ dans_combien_annees: 3 }), 10, 1.5)
    expect(traj[0]?.valeur).toBe(0)
    expect(traj[2]?.valeur).toBe(0)
    expect(traj[3]?.valeur).toBeGreaterThan(0)
    expect(traj[3]?.credit_restant).toBeGreaterThan(0)
  })

  it('mensualité PMT calculée correctement (180k à 3.5 % sur 20 ans ≈ 1044 €)', () => {
    const traj = simulerAcquisitionFuture(
      acq({ dans_combien_annees: 0, prix_achat: 180000, apport: 0, taux_interet: 3.5, duree_credit_ans: 20 }),
      1, 0,
    )
    // capital emprunté = 180k × 1.08 = 194.4k
    // mensualité PMT ≈ 1127 €
    expect(traj[0]?.mensualite).toBeGreaterThan(1100)
    expect(traj[0]?.mensualite).toBeLessThan(1200)
  })

  it('appréciation 2 %/an pendant l\'amortissement', () => {
    const traj = simulerAcquisitionFuture(acq({ dans_combien_annees: 0 }), 10, 1.5)
    expect(traj[10]?.valeur).toBeGreaterThan(traj[0]?.valeur ?? 0)
  })
})

describe('projectionGlobale — combinaison complète', () => {
  const baseInputs: ProjectionInputs = {
    ageActuel: 30, ageCible: 60,
    revenuPassifCible: 3000, epargneMensuelle: 1000,
    rendementCentral: 7, appreciationImmoPct: 2, inflationLoyersPct: 1.5,
    patrimoineFinancierActuel: 100000, cashActuel: 20000,
    biensExistants: [],
    acquisitionsFutures: [],
  }

  it('produit 36 points (année 0..35) par défaut', () => {
    const r = projectionGlobale(baseInputs)
    expect(r.points).toHaveLength(36)
    expect(r.points[0]?.age).toBe(30)
  })

  it('sans immo : total = financier + cash', () => {
    const r = projectionGlobale(baseInputs)
    const p0 = r.points[0]!
    expect(p0.patrimoineFinancier).toBe(100000)
    expect(p0.cash).toBe(20000)
    expect(p0.equityImmoExistant).toBe(0)
    expect(p0.equityImmoFuture).toBe(0)
    expect(p0.total).toBe(120000)
  })

  it('avec un bien existant : equity progresse année par année', () => {
    const r = projectionGlobale({ ...baseInputs, biensExistants: [bien()] })
    expect(r.points[0]?.equityImmoExistant).toBeGreaterThan(0)
    expect(r.points[20]?.equityImmoExistant).toBeGreaterThan(r.points[0]!.equityImmoExistant)
  })

  it('acquisition future : apport sorti du financier à l\'année N', () => {
    const r = projectionGlobale({
      ...baseInputs,
      acquisitionsFutures: [acq({ dans_combien_annees: 5, apport: 30000 })],
    })
    // Avant année 5 : pas d'equity future
    expect(r.points[4]?.equityImmoFuture).toBe(0)
    // À partir de année 5 : equity > 0
    expect(r.points[5]?.equityImmoFuture).toBeGreaterThan(0)
  })

  it('détecte l\'âge d\'indépendance via revenu potentiel', () => {
    const r = projectionGlobale({
      ...baseInputs,
      patrimoineFinancierActuel: 500000, epargneMensuelle: 2000,
    })
    expect(r.ageIndependanceCentral).not.toBeNull()
    expect(r.ageIndependanceCentral!).toBeLessThan(70)
  })
})

describe('calculerImpactAcquisition', () => {
  it('une acquisition rentable AVANCE l\'âge FIRE', () => {
    const base: ProjectionInputs = {
      ageActuel: 30, ageCible: 60,
      revenuPassifCible: 3000, epargneMensuelle: 500,
      rendementCentral: 7, appreciationImmoPct: 2, inflationLoyersPct: 1.5,
      patrimoineFinancierActuel: 100000, cashActuel: 50000,
      biensExistants: [],
      acquisitionsFutures: [],
    }
    const acquisition = acq({
      dans_combien_annees: 2,
      prix_achat: 150000, apport: 30000,
      loyer_brut_mensuel: 800, charges_mensuelles: 50,
    })
    const impact = calculerImpactAcquisition(base, acquisition)
    expect(impact).toBeGreaterThanOrEqual(0)
  })
})
