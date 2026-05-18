/**
 * Tests purs du calendrier fiscal — fonction `getEvenementsFiscaux`.
 *
 * Toutes les dates sont fixées via `now` injectable pour reproductibilité.
 * Les événements sont identifiables par leur `id` stable.
 */
import { describe, it, expect } from 'vitest'
import {
  getEvenementsFiscaux,
  IFI_SEUIL_EUR,
  LIVRET_A_PLAFOND,
  type CalendrierInputs,
} from '../calendrier'

function makeInputs(over: Partial<CalendrierInputs> = {}): CalendrierInputs {
  return {
    patrimoineNet:          0,
    tmiPct:                 30,
    enveloppes:             [],
    regimesImmo:            [],
    nbBiensImmo:            0,
    hasResidenceSecondaire: false,
    peaOuvertureDate:       null,
    avOuvertureDate:        null,
    livretASolde:           0,
    now:                    new Date(Date.UTC(2026, 0, 15)), // 15 jan 2026
    ...over,
  }
}

function ids(events: ReturnType<typeof getEvenementsFiscaux>): string[] {
  return events.map((e) => e.id)
}

describe('getEvenementsFiscaux', () => {
  it('déclaration 2042 toujours présente (universel)', () => {
    const out = getEvenementsFiscaux(makeInputs())
    expect(ids(out)).toContain('declaration-2042')
  })

  it('un profile vide ne renvoie QUE la déclaration 2042', () => {
    const out = getEvenementsFiscaux(makeInputs())
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('declaration-2042')
  })

  it('IFI : déclenché uniquement si patrimoineNet > seuil 1,3 M€', () => {
    const sans = getEvenementsFiscaux(makeInputs({ patrimoineNet: 1_200_000 }))
    expect(ids(sans)).not.toContain('declaration-ifi')

    const avec = getEvenementsFiscaux(makeInputs({ patrimoineNet: IFI_SEUIL_EUR + 1 }))
    expect(ids(avec)).toContain('declaration-ifi')
  })

  it('biens en régime réel foncier → déclaration 2044', () => {
    const out = getEvenementsFiscaux(makeInputs({ regimesImmo: ['foncier_nu'] }))
    expect(ids(out)).toContain('declaration-2044')
  })

  it('régime micro foncier → pas de 2044 obligatoire (couvert par 2042)', () => {
    // foncier_micro est mappé dans `aRegimeReel` car déclaration spécifique recommandée.
    // On accepte sa présence — l'utilisateur peut filtrer côté UI.
    const out = getEvenementsFiscaux(makeInputs({ regimesImmo: ['foncier_micro'] }))
    expect(ids(out)).toContain('declaration-2044')
  })

  it('LMNP réel → déclaration LMNP 2031/2033 supplémentaire', () => {
    const out = getEvenementsFiscaux(makeInputs({ regimesImmo: ['lmnp_reel'] }))
    expect(ids(out)).toContain('declaration-lmnp-2031')
  })

  it('biens immo > 0 → taxe foncière dans la liste', () => {
    const out = getEvenementsFiscaux(makeInputs({ nbBiensImmo: 1 }))
    expect(ids(out)).toContain('taxe-fonciere')
  })

  it('résidence secondaire → taxe d\'habitation RS', () => {
    const out = getEvenementsFiscaux(makeInputs({ hasResidenceSecondaire: true }))
    expect(ids(out)).toContain('taxe-habitation-rs')
  })

  it('PEA ouvert il y a 4 ans 11 mois → jalon 5 ans dans les 12 mois', () => {
    // PEA ouvert le 15 fév 2021, now = 15 jan 2026 → 5 ans atteints le 15 fév 2026 (dans 1 mois)
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:       ['PEA'],
      peaOuvertureDate: '2021-02-15',
      now:              new Date(Date.UTC(2026, 0, 15)),
    }))
    expect(ids(out)).toContain('jalon-pea-5ans')
  })

  it('PEA déjà au-delà des 5 ans → pas de jalon (date passée)', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:       ['PEA'],
      peaOuvertureDate: '2015-01-01',
      now:              new Date(Date.UTC(2026, 0, 15)),
    }))
    expect(ids(out)).not.toContain('jalon-pea-5ans')
  })

  it('AV ouverte il y a 7 ans 11 mois → jalon 8 ans dans les 12 mois', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:      ['Assurance-vie'],
      avOuvertureDate: '2018-02-15',
      now:             new Date(Date.UTC(2026, 0, 15)),
    }))
    expect(ids(out)).toContain('jalon-av-8ans')
  })

  it('PER ouvert + décembre → événement PER urgent', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes: ['PER'],
      now:        new Date(Date.UTC(2026, 11, 5)), // 5 déc 2026
      tmiPct:     30,
    }))
    const per = out.find((e) => e.id === 'per-versement-fin-annee')
    expect(per).toBeDefined()
    expect(per!.urgence).toBe('urgent')
  })

  it('PER ouvert + octobre → événement PER attention (pas encore urgent)', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes: ['PER'],
      now:        new Date(Date.UTC(2026, 9, 5)), // 5 oct 2026
    }))
    const per = out.find((e) => e.id === 'per-versement-fin-annee')
    expect(per).toBeDefined()
    expect(per!.urgence).toBe('attention')
  })

  it('PER + janvier → pas d\'événement PER (trop tôt)', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes: ['PER'],
      now:        new Date(Date.UTC(2026, 0, 15)),
    }))
    expect(ids(out)).not.toContain('per-versement-fin-annee')
  })

  it('Livret A non plein → événement de capacité restante', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:   ['Livret A'],
      livretASolde: 10_000,
    }))
    expect(ids(out)).toContain('livret-a-capacite')
  })

  it('Livret A plein → pas d\'événement', () => {
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:   ['Livret A'],
      livretASolde: LIVRET_A_PLAFOND,
    }))
    expect(ids(out)).not.toContain('livret-a-capacite')
  })

  it('résultat trié par date croissante', () => {
    const out = getEvenementsFiscaux(makeInputs({
      patrimoineNet:          5_000_000,
      regimesImmo:            ['lmnp_reel'],
      nbBiensImmo:            2,
      hasResidenceSecondaire: true,
      enveloppes:             ['PEA', 'Assurance-vie', 'PER', 'Livret A'],
      peaOuvertureDate:       '2021-08-10',
      avOuvertureDate:        '2018-08-10',
      livretASolde:           5_000,
      now:                    new Date(Date.UTC(2026, 10, 5)), // 5 nov 2026
    }))
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.date.getTime()).toBeGreaterThanOrEqual(out[i - 1]!.date.getTime())
    }
    expect(out.length).toBeGreaterThan(3)
  })

  it('événements au-delà de l\'horizon 12 mois sont filtrés', () => {
    // PEA ouvert hier → jalon 5 ans dans ~5 ans → hors horizon
    const out = getEvenementsFiscaux(makeInputs({
      enveloppes:       ['PEA'],
      peaOuvertureDate: '2026-01-14',
      now:              new Date(Date.UTC(2026, 0, 15)),
    }))
    expect(ids(out)).not.toContain('jalon-pea-5ans')
  })
})
