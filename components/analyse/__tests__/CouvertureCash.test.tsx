/* @vitest-environment jsdom */
/**
 * Tests `CouvertureCash` — V1.3-PATCH harmonisation sur `charges_mensuelles`
 * seules (sans `mensualitesImmoTotal`).
 *
 * Vérifie :
 *   - Libellé : « X €/mois de charges » (plus « charges totales »).
 *   - Base de calcul = `charges_mensuelles` uniquement.
 *   - Lien V1.3 vers /cash#matelas conservé.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { CouvertureCash } from '../CouvertureCash'
import type { PatrimoineComplet, CompteCash } from '@/types/analyse'

afterEach(cleanup)

function patrimoine(over: {
  totalCash:      number
  charges:        number
  mensualitesImmo: number
}): PatrimoineComplet {
  const compte: CompteCash = {
    id: 'c1', nom: 'Livret A', type: 'livret_a',
    banque: 'BNP', solde: over.totalCash, devise: 'EUR',
  } as unknown as CompteCash
  return {
    totalBrut: over.totalCash, totalNet: over.totalCash,
    totalPortefeuille: 0, totalImmo: 0,
    totalCash: over.totalCash,
    totalCashInvestissable: 0,
    cashEffectif: over.totalCash, totalIntentsActives: 0,
    totalDettes: 0, totalImmoEquity: 0, risqueImmoGlobal: 0,
    revenuPassifImmo: 0,
    mensualitesImmoTotal: over.mensualitesImmo,
    rendementNetImmoMoyen: 0,
    positions: [], biens: [], comptes: [compte],
    repartitionClasses: [],
    repartitionSectorielle: [],
    repartitionGeo: [],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo: 50,
    rendementEstime: 2, revenuPassifActuel: 0,
    projectionFIRESnapshot: null, lifeEvents: [],
    profilType: null, prenom: 'Test',
    fireInputs: {
      age: 35, age_cible: 55,
      epargne_mensuelle: 500,
      revenu_passif_cible: 2_000, revenu_passif_cible_ajuste: 2_000,
      cibleFoyerDetail: {
        brut: 2_000, ajuste: 2_000,
        enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint: 0,
      situation_familiale: 'Célibataire',
      enfants: '0',
      revenu_mensuel_total: 4_000,
      charges_mensuelles: over.charges,
      risk_score: 50, enveloppes: [],
      tmi_rate: 30, tmi_estime: false,
      actions_eu_value: 0,
    } as never,
    scores: {} as never, recommandations: [],
    analyseFiabilite: { pct: 100, niveau: 'vert', label: 'OK' },
    unmappedEtfs: [], unmappedAll: [],
    cryptoTotal: 0, cryptoCostTotal: 0, cryptoBreakdown: [],
    lastUpdated: new Date().toISOString(),
  }
}

describe('CouvertureCash — V1.3-PATCH harmonisation charges seules', () => {
  it('libellé : « X €/mois de charges » (sans « totales »)', () => {
    const data = patrimoine({ totalCash: 10_000, charges: 1_675, mensualitesImmo: 1_958 })
    render(<CouvertureCash data={data} />)
    // Avant patch : « sur 3 633 €/mois de charges totales »
    // Après patch : « sur 1 675 €/mois de charges »
    expect(screen.getByText(/1 675/)).toBeTruthy()
    expect(screen.queryByText(/charges totales/i)).toBeNull()
    expect(screen.queryByText(/3 633/)).toBeNull()
  })

  it('cas Aymeric : 18 578 € cash / 1 675 € charges + 1 958 € immo → 11,1 mois (sur charges seules)', () => {
    const data = patrimoine({ totalCash: 18_578, charges: 1_675, mensualitesImmo: 1_958 })
    render(<CouvertureCash data={data} />)
    // moisCouverts = 18 578 / 1 675 = 11,09
    expect(screen.getByText(/11\.1 mois/)).toBeTruthy()
  })

  it('lien V1.3 vers /cash#matelas conservé', () => {
    const data = patrimoine({ totalCash: 10_000, charges: 2_000, mensualitesImmo: 0 })
    render(<CouvertureCash data={data} />)
    const link = screen.getByText(/matelas de sécurité contextualisé/i).closest('a')
    expect(link?.getAttribute('href')).toBe('/cash#matelas')
  })

  it('sans comptes cash → composant ne rend rien (préservé)', () => {
    const data = patrimoine({ totalCash: 0, charges: 2_000, mensualitesImmo: 0 })
    data.comptes = []
    const { container } = render(<CouvertureCash data={data} />)
    expect(container.firstChild).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────
// V1.4 Vol B — Suppression du verdict qualificatif (dissonance vs /cash)
// ──────────────────────────────────────────────────────────────────────
describe('CouvertureCash — V1.4 Vol B suppression verdict', () => {
  it('aucun verdict qualificatif n\'est rendu (« Excellent », « Cash excessif », etc.)', () => {
    const data = patrimoine({ totalCash: 50_000, charges: 2_000, mensualitesImmo: 0 })
    render(<CouvertureCash data={data} />)
    expect(screen.queryByText(/Excellent coussin/i)).toBeNull()
    expect(screen.queryByText(/Cash excessif/i)).toBeNull()
    expect(screen.queryByText(/Correct — visez/i)).toBeNull()
    expect(screen.queryByText(/Épargne de précaution insuffisante/i)).toBeNull()
  })

  it('phrase neutre de redirection vers /cash est présente', () => {
    const data = patrimoine({ totalCash: 10_000, charges: 2_000, mensualitesImmo: 0 })
    render(<CouvertureCash data={data} />)
    expect(screen.getByText(/Diagnostic complet/i)).toBeTruthy()
  })

  it('cas bas (cash 3 000 / 2 000) → métrique factuelle 1,5 mois, pas de verdict', () => {
    const data = patrimoine({ totalCash: 3_000, charges: 2_000, mensualitesImmo: 0 })
    render(<CouvertureCash data={data} />)
    expect(screen.getByText(/1\.5 mois/)).toBeTruthy()
    expect(screen.queryByText(/insuffisante/i)).toBeNull()
  })

  it('cas élevé (cash 30 000 / 2 000) → métrique factuelle 15 mois, pas de verdict', () => {
    const data = patrimoine({ totalCash: 30_000, charges: 2_000, mensualitesImmo: 0 })
    render(<CouvertureCash data={data} />)
    expect(screen.getByText(/15\.0 mois/)).toBeTruthy()
    expect(screen.queryByText(/excessif/i)).toBeNull()
  })
})
