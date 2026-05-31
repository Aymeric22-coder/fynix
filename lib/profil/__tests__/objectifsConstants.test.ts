/**
 * CS4 — Tests des constantes objectifs (matrice + helpers).
 *
 * Couvre :
 *   1. Cohérence interne (4 axes, 6 catégories, valeurs ∈ [-1,+1]).
 *   2. INVARIANT CRITIQUE : axes neutres (tous 50) → boost = 0 partout.
 *      C'est la garantie de non-régression Marc CS1.
 *   3. computeObjectifsBoost — matrice de cas (tout à 100, tout à 0, mix).
 *   4. normalizeAxes — préserve les rapports.
 *   5. sortAxesByValue — tri décroissant correct.
 *   6. deriveObjectifsFromPriorite — mapping legacy documenté.
 *   7. Garde-fou single-source : aucun fichier hors objectifsConstants ne
 *      duplique la matrice (anti-régression statique).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  OBJECTIF_AXES, OBJECTIF_LABELS, OBJECTIF_DESCRIPTIONS,
  OBJECTIFS_NEUTRES, AFFINITY_MATRIX,
  computeObjectifsBoost, normalizeAxes, sortAxesByValue,
  deriveObjectifsFromPriorite,
  type ObjectifsAxes, type RecoCategorieAffinity,
} from '../objectifsConstants'

const CATEGORIES: ReadonlyArray<RecoCategorieAffinity> = [
  'diversification', 'fiscalite', 'fire', 'risque', 'liquidite', 'transmission',
]

// ────────────────────────────────────────────────────────────────────
// 1 — Cohérence interne
// ────────────────────────────────────────────────────────────────────

describe('CS4 — cohérence interne', () => {
  it('4 axes définis', () => {
    expect(OBJECTIF_AXES.length).toBe(4)
    expect(OBJECTIF_AXES).toEqual(['rendement', 'securite', 'optimisation', 'transmission'])
  })

  it('labels et descriptions présents pour tous les axes', () => {
    for (const a of OBJECTIF_AXES) {
      expect(OBJECTIF_LABELS[a].length).toBeGreaterThan(2)
      expect(OBJECTIF_DESCRIPTIONS[a].length).toBeGreaterThan(20)
    }
  })

  it('AFFINITY_MATRIX : 4 axes × 6 catégories, toutes valeurs ∈ [-1, +1]', () => {
    for (const a of OBJECTIF_AXES) {
      for (const c of CATEGORIES) {
        const v = AFFINITY_MATRIX[a][c]
        expect(typeof v).toBe('number')
        expect(v).toBeGreaterThanOrEqual(-1)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('OBJECTIFS_NEUTRES = tous à 50', () => {
    expect(OBJECTIFS_NEUTRES).toEqual({
      rendement: 50, securite: 50, optimisation: 50, transmission: 50,
    })
  })
})

// ────────────────────────────────────────────────────────────────────
// 2 — INVARIANT CRITIQUE : boost neutre = 0
// ────────────────────────────────────────────────────────────────────

describe('CS4 — INVARIANT non-régression : axes neutres → boost = 0', () => {
  for (const c of CATEGORIES) {
    it(`tous à 50 → boost('${c}') = 0 (Marc CS1 préservé)`, () => {
      const boost = computeObjectifsBoost(OBJECTIFS_NEUTRES, c)
      expect(boost).toBe(0)
    })
  }
})

// ────────────────────────────────────────────────────────────────────
// 3 — computeObjectifsBoost matrice
// ────────────────────────────────────────────────────────────────────

describe('computeObjectifsBoost', () => {
  it('axe rendement à 100 → boost(fire) = +0.8 (rendement × fire)', () => {
    const axes: ObjectifsAxes = { rendement: 100, securite: 50, optimisation: 50, transmission: 50 }
    // centered: rendement=+1, autres=0
    // boost = 1 × AFFINITY.rendement.fire = +0.8
    expect(computeObjectifsBoost(axes, 'fire')).toBeCloseTo(0.8, 5)
  })

  it('axe securite à 0 → boost(liquidite) = -1.0', () => {
    // centered: securite=-1
    // boost = -1 × AFFINITY.securite.liquidite = -1.0
    const axes: ObjectifsAxes = { rendement: 50, securite: 0, optimisation: 50, transmission: 50 }
    expect(computeObjectifsBoost(axes, 'liquidite')).toBeCloseTo(-1.0, 5)
  })

  it('axe transmission à 100 → boost(transmission) = +1.0', () => {
    const axes: ObjectifsAxes = { rendement: 50, securite: 50, optimisation: 50, transmission: 100 }
    expect(computeObjectifsBoost(axes, 'transmission')).toBeCloseTo(1.0, 5)
  })

  it('multi-axes : somme correcte', () => {
    // rendement=100 (+1), securite=100 (+1), autres=50
    // boost(diversification) = 1 × 0.8 + 1 × 0.4 = 1.2
    const axes: ObjectifsAxes = { rendement: 100, securite: 100, optimisation: 50, transmission: 50 }
    expect(computeObjectifsBoost(axes, 'diversification')).toBeCloseTo(1.2, 5)
  })
})

// ────────────────────────────────────────────────────────────────────
// 4 — normalizeAxes
// ────────────────────────────────────────────────────────────────────

describe('normalizeAxes', () => {
  it('max-norm sur axes mixtes', () => {
    const n = normalizeAxes({ rendement: 80, securite: 40, optimisation: 20, transmission: 60 })
    expect(n.rendement).toBeCloseTo(100, 5)
    expect(n.securite).toBeCloseTo(50, 5)
    expect(n.optimisation).toBeCloseTo(25, 5)
    expect(n.transmission).toBeCloseTo(75, 5)
  })

  it('axes neutres : tous à 50 → tous à 100 (max-norm fait remonter)', () => {
    const n = normalizeAxes(OBJECTIFS_NEUTRES)
    expect(n.rendement).toBe(100)
    expect(n.securite).toBe(100)
    expect(n.optimisation).toBe(100)
    expect(n.transmission).toBe(100)
  })

  it('tous à 0 → inchangé (pas de division par 0)', () => {
    const z: ObjectifsAxes = { rendement: 0, securite: 0, optimisation: 0, transmission: 0 }
    expect(normalizeAxes(z)).toEqual(z)
  })
})

// ────────────────────────────────────────────────────────────────────
// 5 — sortAxesByValue
// ────────────────────────────────────────────────────────────────────

describe('sortAxesByValue', () => {
  it('tri décroissant correct', () => {
    const axes: ObjectifsAxes = { rendement: 30, securite: 80, optimisation: 50, transmission: 70 }
    const sorted = sortAxesByValue(axes)
    expect(sorted.map((s) => s.axe)).toEqual(['securite', 'transmission', 'optimisation', 'rendement'])
  })
})

// ────────────────────────────────────────────────────────────────────
// 6 — deriveObjectifsFromPriorite (migration legacy)
// ────────────────────────────────────────────────────────────────────

describe('deriveObjectifsFromPriorite', () => {
  it('null/undefined → null', () => {
    expect(deriveObjectifsFromPriorite(null)).toBe(null)
    expect(deriveObjectifsFromPriorite(undefined)).toBe(null)
  })
  it('equilibre → neutres (50,50,50,50)', () => {
    expect(deriveObjectifsFromPriorite('equilibre')).toEqual(OBJECTIFS_NEUTRES)
  })
  it('securite_famille → securité élevée', () => {
    const r = deriveObjectifsFromPriorite('securite_famille')
    expect(r?.securite).toBe(80)
    expect(r?.transmission).toBe(60)
  })
  it('transmission → transmission élevée', () => {
    const r = deriveObjectifsFromPriorite('transmission')
    expect(r?.transmission).toBe(80)
  })
  it('independance → rendement élevé', () => {
    const r = deriveObjectifsFromPriorite('independance')
    expect(r?.rendement).toBe(80)
  })
  it('valeur inconnue → null', () => {
    expect(deriveObjectifsFromPriorite('xyz')).toBe(null)
  })
})

// ────────────────────────────────────────────────────────────────────
// 7 — Garde-fou single source (anti-régression statique)
// ────────────────────────────────────────────────────────────────────

describe('Garde-fou single source : AFFINITY_MATRIX uniquement dans objectifsConstants.ts', () => {
  const REPO_ROOT = process.cwd()
  const SCAN_DIRS = ['lib', 'components', 'app']
  const EXCLUDE_FILES = new Set<string>([
    'lib/profil/objectifsConstants.ts',
    'lib/profil/__tests__/objectifsConstants.test.ts',
  ])

  function walk(dir: string): string[] {
    const out: string[] = []
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return out }
    for (const e of entries) {
      const full = join(dir, e)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          if (e === 'node_modules' || e === '.next') continue
          out.push(...walk(full))
        } else if (e.endsWith('.ts') || e.endsWith('.tsx')) {
          out.push(full)
        }
      } catch { /* ignore */ }
    }
    return out
  }

  it('aucun fichier hors objectifsConstants ne redéclare AFFINITY_MATRIX', () => {
    const offenders: string[] = []
    for (const root of SCAN_DIRS) {
      const files = walk(join(REPO_ROOT, root))
      for (const f of files) {
        const rel = relative(REPO_ROOT, f).replace(/\\/g, '/')
        if (EXCLUDE_FILES.has(rel)) continue
        let src: string
        try { src = readFileSync(f, 'utf-8') } catch { continue }
        // Cherche une déclaration de constante / variable
        if (/(const|let|var)\s+AFFINITY_MATRIX\s*=/.test(src)) {
          offenders.push(rel)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
