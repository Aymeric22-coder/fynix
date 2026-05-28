/* @vitest-environment jsdom */
/**
 * QW9-bis close-out — Suffixe inline « · foyer ajusté » sur la ligne capital
 * du Hero (sous la barre de progression patrimoine).
 *
 * Pattern identique au `details` du score Progression FIRE : suffixe texte
 * sobre, pas de badge, pas de tooltip. La décomposition complète reste
 * portée par le badge `<CibleFoyer>` dans la ligne « Revenu passif » du Hero.
 *
 * Couvre :
 *   1. hasAdjustment === true  → suffixe " · foyer ajusté" présent
 *   2. hasAdjustment === false → suffixe absent (libellé legacy "X cible")
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { FIREProgressHero, type FireHeroData } from '../fire-progress-hero'
import type { CibleFoyerDetail } from '@/lib/profil/cibleFamille'

afterEach(() => { cleanup() })

function detailNeutre(): CibleFoyerDetail {
  return {
    brut: 3000, ajuste: 3000, enfantsDelta: 0, coupleDelta: 0,
    hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
  }
}

function detailAjuste(): CibleFoyerDetail {
  return {
    brut: 3000, ajuste: 5100,
    enfantsDelta: 600, coupleDelta: 1500,
    hasAdjustment: true,
    raisons: [
      { label: 'couple, un seul revenu déclaré', montant: 1500 },
      { label: '2 enfants', montant: 600 },
    ],
    nbEnfants: 2, hasCoupleBonus: true,
  }
}

function makeData(cibleFoyerDetail: CibleFoyerDetail | null): FireHeroData {
  return {
    profileComplete:              true,
    patrimoine_net_actuel:        500_000,
    patrimoine_fire_cible:        1_530_000,
    age_actuel:                   35,
    age_fire_cible:               50,
    age_fire_projete:             52,
    age_fire_optimiste:           48,
    age_fire_median:              52,
    age_fire_pessimiste:          58,
    rendement_central_pct:        7,
    epargne_mensuelle_actuelle:   1000,
    epargne_mensuelle_necessaire: null,
    revenu_passif_actuel:         180,
    revenu_passif_cible:          cibleFoyerDetail?.ajuste ?? 3000,
    cibleFoyerDetail,
  }
}

describe('<FIREProgressHero> — suffixe foyer ajusté ligne capital', () => {
  it('hasAdjustment === true → suffixe " · foyer ajusté" présent', () => {
    const { container } = render(
      <FIREProgressHero data={makeData(detailAjuste())} />,
    )
    expect(container.textContent ?? '').toContain('· foyer ajusté')
  })

  it('hasAdjustment === false → pas de suffixe (libellé legacy)', () => {
    const { container } = render(
      <FIREProgressHero data={makeData(detailNeutre())} />,
    )
    expect(container.textContent ?? '').not.toContain('foyer ajusté')
  })

  it('cibleFoyerDetail null → pas de suffixe (profil sans donnée famille)', () => {
    const { container } = render(
      <FIREProgressHero data={makeData(null)} />,
    )
    expect(container.textContent ?? '').not.toContain('foyer ajusté')
  })
})
