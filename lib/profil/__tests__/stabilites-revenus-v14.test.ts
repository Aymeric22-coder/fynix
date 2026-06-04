/**
 * V1.4 Vol F — Reformulation chip « Très stables (CDI) » → « Très stables ».
 *
 * Vérifie :
 *   - Le libellé `STABILITES_REVENUS[0]` est bien « Très stables » sans
 *     la mention « (CDI) ».
 *   - `normalizeStabiliteRevenus('Très stables')` retourne 'cdi' (mapping
 *     historique préservé, basé sur le tag « stable »).
 *   - `mapStabiliteToEnum('Très stables')` retourne 'stable' (override
 *     matelas préservé).
 */
import { describe, it, expect } from 'vitest'
import { STABILITES_REVENUS, normalizeStabiliteRevenus } from '../calculs'
import { mapStabiliteToEnum } from '../getProfileContext'

describe('V1.4 Vol F — chip « Très stables »', () => {
  it('le libellé du chip est « Très stables » (sans mention CDI)', () => {
    expect(STABILITES_REVENUS[0]).toBe('Très stables')
    // Pour mémoire : avant V1.4 = « Très stables (CDI) ».
    expect(STABILITES_REVENUS[0]).not.toMatch(/\(CDI\)/i)
  })

  it('« Très stables » est toujours mappé vers cdi (normalizeStabiliteRevenus)', () => {
    expect(normalizeStabiliteRevenus('Très stables')).toBe('cdi')
  })

  it('« Très stables » est toujours mappé vers stable (mapStabiliteToEnum override matelas)', () => {
    expect(mapStabiliteToEnum('Très stables')).toBe('stable')
  })

  it('ancien libellé « Très stables (CDI) » → mapping inchangé (compat données legacy)', () => {
    // Les utilisateurs ayant rempli le wizard avant V1.4 ont l'ancienne
    // chaîne en DB → on doit continuer à la mapper correctement.
    expect(normalizeStabiliteRevenus('Très stables (CDI)')).toBe('cdi')
    expect(mapStabiliteToEnum('Très stables (CDI)')).toBe('stable')
  })

  it('les 4 libellés sont distincts', () => {
    const set = new Set(STABILITES_REVENUS)
    expect(set.size).toBe(STABILITES_REVENUS.length)
  })
})
