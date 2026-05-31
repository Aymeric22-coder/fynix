/**
 * CS2 LOT 3 — Tests du warning equity négative.
 *
 * Garantit qu'un bien avec `valeur < credit_restant` (underwater) produit
 * un warning explicite dans `projectionGlobale.warnings[]`, distinct du
 * warning « equity anormalement basse » qui existe déjà pour les cas
 * limite (0 < equity < 1000).
 */
import { describe, it, expect } from 'vitest'
import { projectionGlobale } from '../projectionFIRE'
import type { BienImmo, ProjectionInputs } from '@/types/analyse'

const BASE_BIEN: BienImmo = {
  id: 'b1', nom: 'Appart Lyon', ville: 'Lyon', pays: 'France', type: 'Locatif',
  valeur: 200_000, loyer_mensuel: 800, credit_restant: 0,
  mensualite_credit: 0, charges_annuelles: 2_000,
  charges_are_estimated: false,
  equity: 200_000, rendement_brut: 4.8, rendement_net: 3.8,
  cashflow_mensuel: 633, cashflow_net_fiscal: 600,
  impot_mensuel_estime: 33, taux_effort_fiscal: 4,
  ltv: 0, niveau_levier: 'Sans crédit', risque_immo: 15,
  donnees_completes: true,
  taux_interet_estime: 3, duree_restante_mois: 0,
}

const BASE_INPUTS: ProjectionInputs = {
  ageActuel: 30, ageCible: 60,
  revenuPassifCible: 3000, epargneMensuelle: 1000,
  rendementCentral: 7,
  appreciationImmoPct: 2, inflationLoyersPct: 1.5,
  patrimoineFinancierActuel: 50_000, cashActuel: 10_000,
  biensExistants: [],
  acquisitionsFutures: [],
}

describe('CS2 LOT 3 — warning equity négative', () => {
  it('bien avec valeur < credit_restant → warning "capital restant dû dépasse la valeur"', () => {
    const r = projectionGlobale({
      ...BASE_INPUTS,
      biensExistants: [{ ...BASE_BIEN, valeur: 150_000, credit_restant: 200_000 }],
    })
    expect(r.warnings.some((w) =>
      w.includes('Appart Lyon') &&
      w.includes('capital restant dû') &&
      w.includes('dépasse la valeur')
    )).toBe(true)
  })

  it('bien avec equity faible (500 €) mais positive → warning "anormalement basse"', () => {
    // Cas limite préexistant, doit toujours fonctionner.
    const r = projectionGlobale({
      ...BASE_INPUTS,
      biensExistants: [{ ...BASE_BIEN, valeur: 100_000, credit_restant: 99_500 }],
    })
    expect(r.warnings.some((w) => w.includes('anormalement basse'))).toBe(true)
  })

  it('bien avec equity saine → aucun warning equity', () => {
    const r = projectionGlobale({
      ...BASE_INPUTS,
      biensExistants: [{ ...BASE_BIEN, valeur: 200_000, credit_restant: 100_000 }],
    })
    expect(r.warnings.some((w) =>
      w.includes('anormalement basse') || w.includes('dépasse la valeur')
    )).toBe(false)
  })
})
