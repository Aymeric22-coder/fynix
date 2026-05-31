/**
 * CS10 — Découpe narrative du wizard en 3 chapitres (Phase 6 Engagement).
 *
 * Pattern miroir de `lifeEventsConstants.ts`, `enveloppesConstants.ts`,
 * `quizCatalog.ts`. Source unique des libellés et du mapping étape →
 * chapitre. La couche chapitre est PUREMENT VISUELLE : le moteur
 * SKIP_RULES (routing.ts) continue de fonctionner sans modification.
 *
 * Mapping (post-renumérotation, ALL_STEPS naturel [1..10]) :
 *   Chapitre 1 « Toi »          — Steps 1, 2, 3, 4    (4 étapes)
 *   Chapitre 2 « Tes savoirs »  — Steps 5, 6, 7, 8    (4 étapes)
 *   Chapitre 3 « Tes ambitions »— Steps 9, 10         (2 étapes)
 *
 * Les IDs SUIVENT désormais l'ordre visuel — aucun réordonnement
 * artificiel dans ALL_STEPS, la concaténation des stepIds de CHAPTERS
 * est strictement `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`.
 */

import { ALL_STEPS, type StepId } from './routing'

export type ChapterId = 'toi' | 'savoirs' | 'ambitions'

export interface Chapter {
  readonly id:       ChapterId
  readonly title:    string
  readonly subtitle: string
  /** IDs d'étapes (ordre dans l'array = ordre de visite intra-chapitre). */
  readonly stepIds:  ReadonlyArray<StepId>
}

export const CHAPTERS: ReadonlyArray<Chapter> = [
  {
    id:       'toi',
    title:    'Toi',
    subtitle: 'On commence par toi — qui tu es, ta situation, ce que tu as construit.',
    stepIds:  [1, 2, 3, 4],
  },
  {
    id:       'savoirs',
    title:    'Tes savoirs',
    subtitle: 'Ce que tu maîtrises côté investissement (et ce qu\'on peut clarifier ensemble).',
    stepIds:  [5, 6, 7, 8],
  },
  {
    id:       'ambitions',
    title:    'Tes ambitions',
    subtitle: 'Où tu veux aller, ce que tu prépares pour demain.',
    stepIds:  [9, 10],
  },
] as const

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Retourne le chapitre qui contient l'étape donnée. Throw si l'étape n'est
 * mappée à aucun chapitre (bug code).
 */
export function getChapterForStep(stepId: StepId): Chapter {
  const c = CHAPTERS.find((ch) => ch.stepIds.includes(stepId))
  if (!c) throw new Error(`[chaptersConstants] aucun chapitre pour la step ${stepId}`)
  return c
}

/** Index 0-based du chapitre dans CHAPTERS (utile pour "Chapitre 2 / 3"). */
export function getChapterIndex(chapter: Chapter): number {
  return CHAPTERS.findIndex((c) => c.id === chapter.id)
}

/**
 * Calcule la progression dans le chapitre courant pour une étape donnée :
 *   - chapterIndex            : 0..CHAPTERS.length-1
 *   - chapterCount            : CHAPTERS.length (=3)
 *   - stepInChapter           : 1-based position de l'étape DANS son chapitre
 *   - totalStepsInChapter     : nb d'étapes du chapitre
 *   - isFirstStepInChapter    : true si stepInChapter === 1
 *   - isLastStepInChapter     : true si stepInChapter === totalStepsInChapter
 */
export interface ChapterProgress {
  chapter:              Chapter
  chapterIndex:         number
  chapterCount:         number
  stepInChapter:        number
  totalStepsInChapter:  number
  isFirstStepInChapter: boolean
  isLastStepInChapter:  boolean
}

export function getChapterProgress(stepId: StepId): ChapterProgress {
  const chapter = getChapterForStep(stepId)
  const chapterIndex = getChapterIndex(chapter)
  const stepInChapter = chapter.stepIds.indexOf(stepId) + 1
  const total = chapter.stepIds.length
  return {
    chapter,
    chapterIndex,
    chapterCount:         CHAPTERS.length,
    stepInChapter,
    totalStepsInChapter:  total,
    isFirstStepInChapter: stepInChapter === 1,
    isLastStepInChapter:  stepInChapter === total,
  }
}

/**
 * Garde-fou : vérifie que chaque step de ALL_STEPS est bien dans
 * EXACTEMENT un chapitre. Exécuté côté test (statique) — n'est pas
 * appelé en runtime, mais documente l'invariant.
 */
export function assertChaptersCoverAllSteps(): void {
  for (const s of ALL_STEPS) {
    const matches = CHAPTERS.filter((c) => c.stepIds.includes(s))
    if (matches.length !== 1) {
      throw new Error(
        `[chaptersConstants] step ${s} appartient à ${matches.length} chapitre(s) (attendu 1)`,
      )
    }
  }
  const totalSteps = CHAPTERS.reduce((acc, c) => acc + c.stepIds.length, 0)
  if (totalSteps !== ALL_STEPS.length) {
    throw new Error(
      `[chaptersConstants] CHAPTERS couvre ${totalSteps} steps mais ALL_STEPS en compte ${ALL_STEPS.length}`,
    )
  }
}
