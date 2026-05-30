/**
 * CS10 — Tests des chapitres narrés (couche visuelle au-dessus du routage).
 *
 * Couvre :
 *   1. Cohérence interne (ids uniques, couverture totale de ALL_STEPS,
 *      ordre intra-chapitre cohérent avec ALL_STEPS).
 *   2. getChapterForStep — match stable.
 *   3. getChapterProgress — matrice (1re step, dernière step, middle,
 *      step de chaque chapitre).
 *   4. Non-régression : assertChaptersCoverAllSteps ne throw pas.
 *   5. Cohérence stricte avec ALL_STEPS de routing.ts (Step 9 est bien
 *      dans le chapitre Toi à la 4e position).
 */
import { describe, it, expect } from 'vitest'
import {
  CHAPTERS,
  getChapterForStep,
  getChapterIndex,
  getChapterProgress,
  assertChaptersCoverAllSteps,
  type Chapter,
} from '../chaptersConstants'
import { ALL_STEPS, type StepId } from '../routing'

// ────────────────────────────────────────────────────────────────────
// 1 — Cohérence interne
// ────────────────────────────────────────────────────────────────────

describe('CHAPTERS — cohérence interne', () => {
  it('ids uniques', () => {
    const ids = CHAPTERS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('titles uniques', () => {
    const titles = CHAPTERS.map((c) => c.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
  it('aucun step n\'appartient à plus d\'un chapitre', () => {
    const stepToChapters = new Map<StepId, Chapter[]>()
    for (const c of CHAPTERS) {
      for (const s of c.stepIds) {
        const arr = stepToChapters.get(s) ?? []
        arr.push(c)
        stepToChapters.set(s, arr)
      }
    }
    for (const [s, cs] of stepToChapters) {
      expect(cs.length, `Step ${s} appartient à plusieurs chapitres`).toBe(1)
    }
  })
  it('couverture exhaustive : chaque step de ALL_STEPS est dans un chapitre', () => {
    for (const s of ALL_STEPS) {
      expect(CHAPTERS.some((c) => c.stepIds.includes(s)), `Step ${s} sans chapitre`).toBe(true)
    }
  })
  it('chaque chapitre a entre 2 et 4 steps (lisibilité)', () => {
    for (const c of CHAPTERS) {
      expect(c.stepIds.length).toBeGreaterThanOrEqual(2)
      expect(c.stepIds.length).toBeLessThanOrEqual(4)
    }
  })
  it('chaque chapitre a un subtitle non vide', () => {
    for (const c of CHAPTERS) {
      expect(c.subtitle.length).toBeGreaterThan(20)
    }
  })
})

// ────────────────────────────────────────────────────────────────────
// 2 — assertChaptersCoverAllSteps (garde-fou)
// ────────────────────────────────────────────────────────────────────

describe('assertChaptersCoverAllSteps', () => {
  it('ne throw pas avec la configuration actuelle', () => {
    expect(() => assertChaptersCoverAllSteps()).not.toThrow()
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — getChapterForStep
// ────────────────────────────────────────────────────────────────────

describe('getChapterForStep', () => {
  // Mapping attendu : 1,2,3,9=Toi  / 4,5,6,7=Tes savoirs  / 8,10=Tes ambitions
  const expected: Array<[StepId, string]> = [
    [1, 'toi'], [2, 'toi'], [3, 'toi'], [9, 'toi'],
    [4, 'savoirs'], [5, 'savoirs'], [6, 'savoirs'], [7, 'savoirs'],
    [8, 'ambitions'], [10, 'ambitions'],
  ]
  for (const [step, chapterId] of expected) {
    it(`step ${step} → chapitre ${chapterId}`, () => {
      expect(getChapterForStep(step).id).toBe(chapterId)
    })
  }
})

// ────────────────────────────────────────────────────────────────────
// 4 — getChapterProgress
// ────────────────────────────────────────────────────────────────────

describe('getChapterProgress', () => {
  it('Step 1 → chapitre Toi, 1ère étape sur 4', () => {
    const p = getChapterProgress(1)
    expect(p.chapter.id).toBe('toi')
    expect(p.chapterIndex).toBe(0)
    expect(p.chapterCount).toBe(3)
    expect(p.stepInChapter).toBe(1)
    expect(p.totalStepsInChapter).toBe(4)
    expect(p.isFirstStepInChapter).toBe(true)
    expect(p.isLastStepInChapter).toBe(false)
  })
  it('Step 9 → chapitre Toi, 4e étape sur 4 (dernière)', () => {
    const p = getChapterProgress(9)
    expect(p.chapter.id).toBe('toi')
    expect(p.stepInChapter).toBe(4)
    expect(p.totalStepsInChapter).toBe(4)
    expect(p.isFirstStepInChapter).toBe(false)
    expect(p.isLastStepInChapter).toBe(true)
  })
  it('Step 4 → chapitre Tes savoirs, 1ère étape', () => {
    const p = getChapterProgress(4)
    expect(p.chapter.id).toBe('savoirs')
    expect(p.chapterIndex).toBe(1)
    expect(p.stepInChapter).toBe(1)
    expect(p.isFirstStepInChapter).toBe(true)
  })
  it('Step 8 → chapitre Tes ambitions, 1ère étape sur 2', () => {
    const p = getChapterProgress(8)
    expect(p.chapter.id).toBe('ambitions')
    expect(p.chapterIndex).toBe(2)
    expect(p.totalStepsInChapter).toBe(2)
    expect(p.isFirstStepInChapter).toBe(true)
  })
  it('Step 10 → chapitre Tes ambitions, 2e (et dernière)', () => {
    const p = getChapterProgress(10)
    expect(p.chapter.id).toBe('ambitions')
    expect(p.stepInChapter).toBe(2)
    expect(p.isLastStepInChapter).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────
// 5 — Cohérence avec ALL_STEPS (ordre visuel)
// ────────────────────────────────────────────────────────────────────

describe('Cohérence avec ALL_STEPS', () => {
  it('ALL_STEPS reflète l\'ordre des chapitres (concaténation = ALL_STEPS)', () => {
    const concat = CHAPTERS.flatMap((c) => c.stepIds)
    expect(concat).toEqual([...ALL_STEPS])
  })
  it('Step 9 est juste après Step 3 et avant Step 4 dans ALL_STEPS', () => {
    const idx9 = ALL_STEPS.indexOf(9)
    const idx3 = ALL_STEPS.indexOf(3)
    const idx4 = ALL_STEPS.indexOf(4)
    expect(idx3).toBe(idx9 - 1)
    expect(idx4).toBe(idx9 + 1)
  })
})

// ────────────────────────────────────────────────────────────────────
// 6 — getChapterIndex
// ────────────────────────────────────────────────────────────────────

describe('getChapterIndex', () => {
  it('renvoie 0 pour Toi, 1 pour Tes savoirs, 2 pour Tes ambitions', () => {
    expect(getChapterIndex(CHAPTERS[0]!)).toBe(0)
    expect(getChapterIndex(CHAPTERS[1]!)).toBe(1)
    expect(getChapterIndex(CHAPTERS[2]!)).toBe(2)
  })
})
