/**
 * CS5 dette — Tests source-of-truth des chips Step 4 (`ENVELOPPE_DEFS`).
 *
 * Garde-fous :
 *   1. Cohérence interne : ids/labels uniques, helpers fonctionnels.
 *   2. Single source of truth : aucun fichier `lib/*` ne référence en dur
 *      les labels d'enveloppes via regex `/crypto/i` ou `/immo|scpi/i` (le
 *      bug originel). Test "static" qui lit les fichiers cibles.
 *   3. Couverture des classes : au moins une chip pour chaque classe d'actif
 *      utilisée par les SKIP_RULES (crypto, immo).
 *   4. Le re-export `ENVELOPPES` (calculs.ts) reste synchronisé.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ENVELOPPE_DEFS, ENVELOPPE_LABELS,
  findEnvelopeByLabel, findEnvelopeById, envelopeLabelById,
  envelopeHasClass, anyEnvelopeHasClass,
} from '../enveloppesConstants'
import { ENVELOPPES } from '../calculs'

describe('ENVELOPPE_DEFS — cohérence interne', () => {
  it('ids uniques', () => {
    const ids = ENVELOPPE_DEFS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('labels uniques', () => {
    const labels = ENVELOPPE_DEFS.map((d) => d.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
  it('ENVELOPPE_LABELS strictement = ENVELOPPE_DEFS.map(d=>d.label)', () => {
    expect(ENVELOPPE_LABELS).toEqual(ENVELOPPE_DEFS.map((d) => d.label))
  })
  it('calculs.ts:ENVELOPPES re-export synchronisé', () => {
    expect(ENVELOPPES).toEqual(ENVELOPPE_LABELS)
  })
})

describe('ENVELOPPE_DEFS — couverture des classes critiques', () => {
  it('au moins une chip de classe crypto (sinon R1 toujours false → bug originel)', () => {
    expect(ENVELOPPE_DEFS.some((d) => d.classes.includes('crypto'))).toBe(true)
  })
  it('au moins une chip de classe immo', () => {
    expect(ENVELOPPE_DEFS.some((d) => d.classes.includes('immo'))).toBe(true)
  })
  it('CTO n\'a PAS la classe crypto (sinon R1 deviendrait trop laxe — cf. doc)', () => {
    const cto = findEnvelopeById('cto')
    expect(cto?.classes.includes('crypto')).toBe(false)
  })
})

describe('Helpers', () => {
  it('findEnvelopeByLabel — match strict', () => {
    expect(findEnvelopeByLabel('PEA')?.id).toBe('pea')
    expect(findEnvelopeByLabel('Crypto')?.id).toBe('crypto')
    expect(findEnvelopeByLabel('Inexistant')).toBeNull()
    expect(findEnvelopeByLabel(null)).toBeNull()
  })
  it('envelopeLabelById — throw si inconnu', () => {
    expect(envelopeLabelById('pea')).toBe('PEA')
    expect(() => envelopeLabelById('xxx')).toThrow()
  })
  it('envelopeHasClass — strict', () => {
    expect(envelopeHasClass('Crypto', 'crypto')).toBe(true)
    expect(envelopeHasClass('PEA', 'crypto')).toBe(false)
    expect(envelopeHasClass('Immobilier / SCPI', 'immo')).toBe(true)
  })
  it('anyEnvelopeHasClass — sur liste', () => {
    expect(anyEnvelopeHasClass(['PEA', 'Crypto'], 'crypto')).toBe(true)
    expect(anyEnvelopeHasClass(['PEA', 'CTO'], 'crypto')).toBe(false)
    expect(anyEnvelopeHasClass([], 'crypto')).toBe(false)
    expect(anyEnvelopeHasClass(null, 'crypto')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────
// Garde-fou static : aucune regex /crypto/i ou /immo|scpi/i ne doit
// subsister sur le pattern « test enveloppe profil ». Si ce test casse,
// quelqu'un a réintroduit la dette — relire CS5 dette puis utiliser
// `anyEnvelopeHasClass(profile.enveloppes, 'crypto' | 'immo')` à la place.
// ────────────────────────────────────────────────────────────────────

describe('CS5 dette — single source of truth (anti-regression statique)', () => {
  const REPO_ROOT = process.cwd()
  // Fichiers où la regex aurait pu se cacher.
  const filesToCheck = [
    'lib/profil/routing.ts',
    'lib/analyse/projectionFIRE.ts',
    'lib/analyse/optimiseurFiscal.ts',
  ]

  for (const rel of filesToCheck) {
    it(`${rel} ne contient plus de regex /crypto/i ou /immo\\|scpi/i sur profile.enveloppes`, () => {
      const src = readFileSync(join(REPO_ROOT, rel), 'utf-8')
      // On scanne LITERALEMENT les regex critiques. Tolère si elles
      // apparaissent dans des commentaires (qui parlent du bug historique).
      const codeOnly = src
        .split('\n')
        .filter((l) => {
          const trimmed = l.trim()
          // skip lignes de commentaire (single line, JSDoc body, doc CS5 dette).
          return !(trimmed.startsWith('//')
                || trimmed.startsWith('*')
                || trimmed.startsWith('/*'))
        })
        .join('\n')
      expect(codeOnly).not.toMatch(/\/crypto\/i?\.test/)
      expect(codeOnly).not.toMatch(/\/immo\|scpi\/i?\.test/)
    })
  }
})
