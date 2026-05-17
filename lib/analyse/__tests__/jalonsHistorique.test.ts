import { describe, it, expect } from 'vitest'
import { enrichJalonsAvecHistorique } from '../jalonsHistorique'
import type { JalonFIRE } from '@/types/analyse'

const j = (over: Partial<JalonFIRE>): JalonFIRE => ({
  age: 40, label: 'X', type: 'milestone', valeur: 100_000, ...over,
})

describe('enrichJalonsAvecHistorique', () => {
  it('patrimoine 650k → jalons 100k et 500k marques atteint, 1M reste futur', () => {
    const jalons: JalonFIRE[] = [
      j({ valeur: 100_000, label: '100 k€', age: 35 }),
      j({ valeur: 500_000, label: '500 k€', age: 45 }),
      j({ valeur: 1_000_000, label: '1 M€',  age: 55 }),
    ]
    const historique = [
      { snapshot_date: '2024-06-01', patrimoine_net: 120_000 },
      { snapshot_date: '2025-12-01', patrimoine_net: 520_000 },
      { snapshot_date: '2026-05-01', patrimoine_net: 650_000 },
    ]
    const out = enrichJalonsAvecHistorique(jalons, historique)
    expect(out[0]).toMatchObject({ valeur: 100_000, atteint: true, date_atteinte: '2024-06-01' })
    expect(out[1]).toMatchObject({ valeur: 500_000, atteint: true, date_atteinte: '2025-12-01' })
    expect(out[2]).toMatchObject({ valeur: 1_000_000 })
    expect(out[2]!.atteint).toBeUndefined()
  })

  it('jalons non-milestone (fire, lean_fire, debt) ne sont jamais marques', () => {
    const jalons: JalonFIRE[] = [
      j({ type: 'fire',      label: 'FIRE',  valeur: 900_000, age: 55 }),
      j({ type: 'lean_fire', label: 'Lean',  valeur: 600_000, age: 50 }),
      j({ type: 'debt',      label: 'Solde', valeur: 0,       age: 45 }),
    ]
    const historique = [
      { snapshot_date: '2026-01-01', patrimoine_net: 1_500_000 },
    ]
    const out = enrichJalonsAvecHistorique(jalons, historique)
    expect(out.every((x) => x.atteint === undefined)).toBe(true)
  })

  it('retirerAtteints=true filtre les milestones deja franchies', () => {
    const jalons: JalonFIRE[] = [
      j({ valeur: 100_000, label: '100 k€' }),
      j({ valeur: 1_000_000, label: '1 M€', age: 55 }),
    ]
    const historique = [{ snapshot_date: '2024-01-01', patrimoine_net: 200_000 }]
    const out = enrichJalonsAvecHistorique(jalons, historique, { retirerAtteints: true })
    expect(out).toHaveLength(1)
    expect(out[0]!.valeur).toBe(1_000_000)
  })

  it('historique vide → aucun jalon marque', () => {
    const jalons: JalonFIRE[] = [j({ valeur: 100_000 })]
    const out = enrichJalonsAvecHistorique(jalons, [])
    expect(out[0]!.atteint).toBeUndefined()
  })

  it('tri chronologique : prend le 1er franchissement', () => {
    const jalons: JalonFIRE[] = [j({ valeur: 100_000 })]
    const historique = [
      { snapshot_date: '2026-01-01', patrimoine_net: 150_000 },
      { snapshot_date: '2024-01-01', patrimoine_net: 110_000 },
    ]
    const out = enrichJalonsAvecHistorique(jalons, historique)
    expect(out[0]!.date_atteinte).toBe('2024-01-01')
  })
})
