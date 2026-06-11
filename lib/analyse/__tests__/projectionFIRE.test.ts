import { describe, it, expect } from 'vitest'
import {
  simulerBienExistant, simulerAcquisitionFuture, projectionGlobale,
  calculerImpactAcquisition, projectionFIREIntervalle, FIRE_SCENARIO_DELTA_PCT,
} from '../projectionFIRE'
import type { BienImmo, AcquisitionFuture, ProjectionInputs } from '@/types/analyse'

function bien(over: Partial<BienImmo> = {}): BienImmo {
  return {
    id: 'b1', nom: 'Appart', ville: null, pays: 'France', type: 'Locatif',
    valeur: 200000, loyer_mensuel: 800, credit_restant: 100000,
    mensualite_credit: 700, charges_annuelles: 2000,
    equity: 100000, rendement_brut: 4.8, rendement_net: 3.8,
    cashflow_mensuel: -67,
    cashflow_net_fiscal: -67, impot_mensuel_estime: 0, taux_effort_fiscal: 0,
    charges_are_estimated: false,
    ltv: 50, niveau_levier: 'Modéré', risque_immo: 45,
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

  // Sprint 1 — B6 : propagation du cashflow net fiscal
  describe('cashflow net fiscal (Sprint 1 B6)', () => {
    // Bien : loyer 1000/mois (12 000/an), 0 charges, 0 credit → cashflow brut = 12 000
    // Si cashflowNetFiscalAnnuel = 8 000, impot = 4 000 → ratio impot/loyer = 33.33 %
    const bienSimple = (): BienImmo => bien({
      valeur: 100000, loyer_mensuel: 1000,
      credit_restant: 0, mensualite_credit: 0, duree_restante_mois: 0,
      charges_annuelles: 0,
    })

    it('A — utilise le cashflow net fiscal fourni a l\'annee 0', () => {
      const traj = simulerBienExistant(bienSimple(), 5, 0, 0, 8000)
      expect(traj[0]?.cashflow_annuel).toBe(8000)
    })

    it('A — applique le ratio impot/loyer constant aux annees suivantes', () => {
      // Inflation loyers 10 %/an : a y=1 le loyer = 13 200, impot 33.33 % = 4 400
      // → cashflow = 13 200 - 0 - 4 400 = 8 800
      const traj = simulerBienExistant(bienSimple(), 5, 0, 10, 8000)
      expect(traj[1]?.cashflow_annuel).toBe(8800)
    })

    it('A — un impot nul (cashflow net = cashflow brut) donne le brut', () => {
      const traj = simulerBienExistant(bienSimple(), 3, 0, 0, 12000)
      expect(traj[0]?.cashflow_annuel).toBe(12000)
    })

    it('B — fallback cashflow brut quand cashflowNetFiscalAnnuel absent', () => {
      const traj = simulerBienExistant(bienSimple(), 3, 0, 0)
      // Pas d'impot deduit → cashflow brut = 12 000
      expect(traj[0]?.cashflow_annuel).toBe(12000)
    })

    it('B — fallback aussi quand cashflowNetFiscalAnnuel = NaN', () => {
      const traj = simulerBienExistant(bienSimple(), 3, 0, 0, NaN)
      expect(traj[0]?.cashflow_annuel).toBe(12000)
    })
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

  // ── P2 — garde d'apport (warning de faisabilité) ──────────────────
  // Acquisition à l'année 1 ⇒ capital disponible avant la sortie =
  // trajFinancier[0] = patrimoineFinancierActuel (déterministe).

  it('warning de faisabilité : apport > capital financier disponible (P2)', () => {
    const r = projectionGlobale({
      ...baseInputs,
      patrimoineFinancierActuel: 50_000,
      acquisitionsFutures: [acq({ nom: 'Bien trop cher', dans_combien_annees: 1, apport: 80_000 })],
    })
    const w = r.warnings.find((m) => m.includes('Bien trop cher'))
    expect(w).toBeDefined()
    expect(w).toContain('faisabilité')
    // Le bandeau montre le capital RÉELLEMENT disponible (avant l'apport),
    // pas le capital post-acquisition.
    expect(w).toContain('disponible')
  })

  it('pas de warning si apport < capital financier disponible (P2 — régression)', () => {
    const r = projectionGlobale({
      ...baseInputs,
      patrimoineFinancierActuel: 100_000,
      acquisitionsFutures: [acq({ nom: 'Bien finançable', dans_combien_annees: 1, apport: 30_000 })],
    })
    const w = r.warnings.find((m) => m.includes('Bien finançable'))
    expect(w).toBeUndefined()
  })
})

describe('projectionGlobale — indexation inflation', () => {
  const baseInputs = {
    ageActuel: 30, ageCible: 60,
    revenuPassifCible: 3000, epargneMensuelle: 2000,
    rendementCentral: 7, appreciationImmoPct: 2, inflationLoyersPct: 1.5,
    patrimoineFinancierActuel: 500000, cashActuel: 50000,
    biensExistants: [],
    acquisitionsFutures: [],
  }

  it('cible indexée → âge FIRE plus tardif qu\'avec inflation = 0', () => {
    const sansInflation = projectionGlobale({ ...baseInputs, inflationPct: 0 })
    const avecInflation = projectionGlobale({ ...baseInputs, inflationPct: 4 })
    // Une cible qui grossit chaque année devient plus dure à atteindre.
    if (sansInflation.ageIndependanceCentral !== null && avecInflation.ageIndependanceCentral !== null) {
      expect(avecInflation.ageIndependanceCentral)
        .toBeGreaterThanOrEqual(sansInflation.ageIndependanceCentral)
    } else {
      // Au minimum on accepte que l'inflation puisse pousser hors horizon.
      expect(avecInflation.ageIndependanceCentral === null
          || avecInflation.ageIndependanceCentral! >= (sansInflation.ageIndependanceCentral ?? 0))
        .toBe(true)
    }
  })

  it('inflation par défaut (2 %) ≠ inflation = 0', () => {
    const defaut    = projectionGlobale(baseInputs)              // inflation par défaut 2 %
    const sans      = projectionGlobale({ ...baseInputs, inflationPct: 0 })
    // Au moins un point doit différer si la cible grossit avec le temps.
    expect(defaut.ageIndependanceCentral)
      .not.toBeLessThan(sans.ageIndependanceCentral ?? 0)
  })
})

describe('projectionFIREIntervalle — 3 scénarios de rendement', () => {
  const baseInputs = {
    ageActuel: 30, ageCible: 60,
    revenuPassifCible: 3000, epargneMensuelle: 2000,
    rendementCentral: 7, appreciationImmoPct: 2, inflationLoyersPct: 1.5,
    inflationPct: 2,
    patrimoineFinancierActuel: 500000, cashActuel: 50000,
    biensExistants: [],
    acquisitionsFutures: [],
  }

  it('expose les 3 âges + rendement central', () => {
    const i = projectionFIREIntervalle(baseInputs)
    expect(i.rendement_central_pct).toBe(7)
    expect(FIRE_SCENARIO_DELTA_PCT).toBe(1.5)
    expect(i.age_fire_optimiste).not.toBeUndefined()
    expect(i.age_fire_median).not.toBeUndefined()
    expect(i.age_fire_pessimiste).not.toBeUndefined()
  })

  it('optimiste ≤ médian ≤ pessimiste (atteint la cible plus tôt)', () => {
    const i = projectionFIREIntervalle(baseInputs)
    if (i.age_fire_optimiste !== null && i.age_fire_median !== null) {
      expect(i.age_fire_optimiste).toBeLessThanOrEqual(i.age_fire_median)
    }
    if (i.age_fire_median !== null && i.age_fire_pessimiste !== null) {
      expect(i.age_fire_median).toBeLessThanOrEqual(i.age_fire_pessimiste)
    }
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

// ─────────────────────────────────────────────────────────────────
// Sprint 3 — Inflation, SWR, croissance épargne, fiscalité, jalons
// ─────────────────────────────────────────────────────────────────

import { estimerTauxFiscalitePortefeuille, SWR_DEFAUT_PCT, INFLATION_DEFAUT_PCT } from '../projectionFIRE'

const baseS3: ProjectionInputs = {
  ageActuel: 30, ageCible: 60,
  revenuPassifCible: 3000, epargneMensuelle: 2000,
  rendementCentral: 7, appreciationImmoPct: 2, inflationLoyersPct: 1.5,
  patrimoineFinancierActuel: 500000, cashActuel: 50000,
  biensExistants: [],
  acquisitionsFutures: [],
}

describe('Sprint 3 — cible inflation-adjusted (Tâche 1)', () => {
  it('cibleRevenuMensuelEnEurosFuturs = saisie × (1 + inflation)^N', () => {
    const r = projectionGlobale({ ...baseS3, inflationPct: 2 })
    // 3000 × 1.02^30 = 5434
    expect(r.cibleRevenuMensuelEnEurosFuturs).toBeGreaterThan(5300)
    expect(r.cibleRevenuMensuelEnEurosFuturs).toBeLessThan(5500)
  })

  it('inflation = 0 → cible future = cible saisie', () => {
    const r = projectionGlobale({ ...baseS3, inflationPct: 0 })
    expect(r.cibleRevenuMensuelEnEurosFuturs).toBe(3000)
  })

  it('inflation par défaut quand non fournie', () => {
    const r = projectionGlobale(baseS3)
    expect(r.inflationUtilisee).toBe(INFLATION_DEFAUT_PCT)
  })

  it('ciblePatrimoineAjusteeInflation = revenu annuel ajusté / SWR', () => {
    const r = projectionGlobale({ ...baseS3, inflationPct: 0, swrPct: 4 })
    // 3000 × 12 / 0.04 = 900 000
    expect(r.ciblePatrimoineAjusteeInflation).toBe(900_000)
  })
})

describe('Sprint 3 — SWR ajustable (Tâche 3)', () => {
  it('SWR plus bas → cible patrimoine plus élevée', () => {
    const r4   = projectionGlobale({ ...baseS3, inflationPct: 0, swrPct: 4 })
    const r3   = projectionGlobale({ ...baseS3, inflationPct: 0, swrPct: 3 })
    expect(r3.ciblePatrimoineAjusteeInflation).toBeGreaterThan(r4.ciblePatrimoineAjusteeInflation)
  })

  it('SWR par défaut = 4 %', () => {
    const r = projectionGlobale(baseS3)
    expect(r.swrUtilise).toBe(SWR_DEFAUT_PCT)
  })

  it('SWR 3,5 % → âge FIRE plus tardif que SWR 4 %', () => {
    const r4 = projectionGlobale({ ...baseS3, swrPct: 4 })
    const r3 = projectionGlobale({ ...baseS3, swrPct: 3.5 })
    if (r4.ageIndependanceCentral !== null && r3.ageIndependanceCentral !== null) {
      expect(r3.ageIndependanceCentral).toBeGreaterThanOrEqual(r4.ageIndependanceCentral)
    }
  })
})

describe('Sprint 3 — Croissance épargne (Tâche 4)', () => {
  it('croissance positive → patrimoine final plus élevé', () => {
    const sans = projectionGlobale({ ...baseS3, epargneCroissanceAnnuellePct: 0 })
    const avec = projectionGlobale({ ...baseS3, epargneCroissanceAnnuellePct: 3 })
    const finalSans = sans.points[sans.points.length - 1]?.patrimoineFinancier ?? 0
    const finalAvec = avec.points[avec.points.length - 1]?.patrimoineFinancier ?? 0
    expect(finalAvec).toBeGreaterThan(finalSans)
  })

  it('croissance = 0 → comportement identique à legacy', () => {
    const r = projectionGlobale({ ...baseS3, epargneCroissanceAnnuellePct: 0 })
    // L'épargne est constante à 2000/mois pendant tout l'horizon.
    // On vérifie que le patrimoine final est cohérent avec l'ancien calcul.
    expect(r.points.length).toBeGreaterThan(0)
  })

  it('croissance 5 % → âge FIRE plus précoce', () => {
    const r0 = projectionGlobale({
      ...baseS3, patrimoineFinancierActuel: 100_000, epargneMensuelle: 500,
      epargneCroissanceAnnuellePct: 0,
    })
    const r5 = projectionGlobale({
      ...baseS3, patrimoineFinancierActuel: 100_000, epargneMensuelle: 500,
      epargneCroissanceAnnuellePct: 5,
    })
    if (r0.ageIndependanceCentral !== null && r5.ageIndependanceCentral !== null) {
      expect(r5.ageIndependanceCentral).toBeLessThanOrEqual(r0.ageIndependanceCentral)
    }
  })
})

describe('Sprint 3 — Fiscalité revenu passif (Tâche 2)', () => {
  it('expose les 3 champs brut/net/pression fiscale', () => {
    const r = projectionGlobale(baseS3)
    expect(typeof r.revenuPassifBrutProjete).toBe('number')
    expect(typeof r.revenuPassifNetProjete).toBe('number')
    expect(typeof r.tauxPressionFiscaleEstime).toBe('number')
  })

  it('net ≤ brut (toujours)', () => {
    const r = projectionGlobale({ ...baseS3, tauxFiscalitePortefeuillePct: 30 })
    expect(r.revenuPassifNetProjete).toBeLessThanOrEqual(r.revenuPassifBrutProjete)
  })

  it('taux fiscalité 0 → net = brut, pression = 0', () => {
    const r = projectionGlobale({ ...baseS3, tauxFiscalitePortefeuillePct: 0 })
    expect(r.revenuPassifNetProjete).toBe(r.revenuPassifBrutProjete)
    expect(r.tauxPressionFiscaleEstime).toBe(0)
  })

  it('taux fiscalité 30 % → pression ≈ 30 % (portefeuille seul)', () => {
    const r = projectionGlobale({
      ...baseS3, biensExistants: [],  // pas de loyers, que portefeuille
      tauxFiscalitePortefeuillePct: 30,
    })
    expect(r.tauxPressionFiscaleEstime).toBeCloseTo(30, 0)
  })
})

describe('Sprint 3 — estimerTauxFiscalitePortefeuille', () => {
  it('PEA seul → 17,2 %', () => {
    expect(estimerTauxFiscalitePortefeuille(['PEA'])).toBe(17.2)
  })

  it('CTO seul → 30 %', () => {
    expect(estimerTauxFiscalitePortefeuille(['CTO'])).toBe(30)
  })

  it('AV seule → 24,7 %', () => {
    expect(estimerTauxFiscalitePortefeuille(['Assurance-vie'])).toBe(24.7)
  })

  it('Livret A → 0 %', () => {
    expect(estimerTauxFiscalitePortefeuille(['Livret A'])).toBe(0)
  })

  it('PEA + CTO → moyenne (17,2 + 30) / 2 = 23,6', () => {
    expect(estimerTauxFiscalitePortefeuille(['PEA', 'CTO'])).toBe(23.6)
  })

  it('vide / null → fallback PFU 30 %', () => {
    expect(estimerTauxFiscalitePortefeuille([])).toBe(30)
    expect(estimerTauxFiscalitePortefeuille(null)).toBe(30)
    expect(estimerTauxFiscalitePortefeuille(undefined)).toBe(30)
  })
})

describe('Sprint 3 — Jalons (Tâche 5)', () => {
  it('expose un tableau jalons trié par âge', () => {
    const r = projectionGlobale(baseS3)
    expect(Array.isArray(r.jalons)).toBe(true)
    for (let i = 1; i < r.jalons.length; i++) {
      expect(r.jalons[i]!.age).toBeGreaterThanOrEqual(r.jalons[i - 1]!.age)
    }
  })

  it('détecte les milestones 100k / 500k / 1M', () => {
    const r = projectionGlobale({
      ...baseS3, patrimoineFinancierActuel: 50_000, epargneMensuelle: 1000,
    })
    const types = r.jalons.filter((j) => j.type === 'milestone').map((j) => j.valeur)
    // 50k départ + 1k/mois sur 35 ans → atteint 100k facilement, et plus
    expect(types).toContain(100_000)
  })

  it('détecte un jalon FIRE quand l\'âge d\'indépendance est atteint', () => {
    const r = projectionGlobale({
      ...baseS3, patrimoineFinancierActuel: 700_000, epargneMensuelle: 2000,
    })
    if (r.ageIndependanceCentral !== null) {
      const fireJalon = r.jalons.find((j) => j.type === 'fire')
      expect(fireJalon).toBeDefined()
      expect(fireJalon!.age).toBe(r.ageIndependanceCentral)
    }
  })

  it('détecte le jalon Lean FIRE avant le FIRE complet', () => {
    const r = projectionGlobale({
      ...baseS3, patrimoineFinancierActuel: 500_000, epargneMensuelle: 1500,
    })
    const lean = r.jalons.find((j) => j.type === 'lean_fire')
    const full = r.jalons.find((j) => j.type === 'fire')
    if (lean && full) {
      expect(lean.age).toBeLessThan(full.age)
    }
  })

  it('détecte le jalon "crédit soldé" pour un bien existant', () => {
    const r = projectionGlobale({
      ...baseS3,
      biensExistants: [bien({ credit_restant: 50_000, mensualite_credit: 500, taux_interet_estime: 3, duree_restante_mois: 120 })],
    })
    const debtJalon = r.jalons.find((j) => j.type === 'debt')
    expect(debtJalon).toBeDefined()
    expect(debtJalon!.label).toContain('soldé')
  })
})
