import { describe, it, expect } from 'vitest'
import {
  quizScore, quizLevel, riskScore, experienceScore, savingsRate,
  globalScore, fireTarget, fireYears, inferProfileType, riskLabel,
  computeAxes, computeProfileMetrics,
  QUIZ_BOURSE, QUIZ_CRYPTO, QUIZ_IMMO,
} from '../calculs'

describe('quizScore', () => {
  it('compte les bonnes réponses', () => {
    // QUIZ_BOURSE bonnes réponses : [0, 1, 2, 3]
    expect(quizScore([0, 1, 2, 3], QUIZ_BOURSE)).toBe(4)
    expect(quizScore([0, 1, 2, 0], QUIZ_BOURSE)).toBe(3)
    expect(quizScore([3, 3, 3, 3], QUIZ_BOURSE)).toBe(1)  // seule la dernière vaut 3
  })

  it('réponse manquante (null/undefined) compte 0', () => {
    expect(quizScore([0, null, undefined, 3], QUIZ_BOURSE)).toBe(2)
    expect(quizScore([], QUIZ_BOURSE)).toBe(0)
  })
})

describe('quizLevel', () => {
  it('vérification fine des bornes', () => {
    expect(quizLevel(0, 4).label).toBe('Débutant')
    expect(quizLevel(1, 4).label).toBe('Débutant')        // 25 % < 26 %
    expect(quizLevel(2, 4).label).toBe('Intermédiaire')   // 50 %
    expect(quizLevel(3, 4).label).toBe('Avancé')          // 75 %
    expect(quizLevel(4, 4).label).toBe('Expert')          // 100 %
    expect(quizLevel(2, 3).label).toBe('Avancé')          // 66 %
  })

  it('total 0 → Débutant', () => {
    expect(quizLevel(0, 0).label).toBe('Débutant')
  })

  it('expose tone et pct', () => {
    expect(quizLevel(0, 4).tone).toBe('danger')
    expect(quizLevel(4, 4).tone).toBe('success')
    expect(quizLevel(4, 4).pct).toBe(96)
  })
})

describe('riskScore', () => {
  it('toutes réponses hautes → 100', () => {
    expect(riskScore({
      risk_1: 'Renforcer', risk_2: '>15ans', risk_3: '20%+', risk_4: '>60%',
    })).toBe(100)
  })

  it('toutes réponses basses → bas', () => {
    expect(riskScore({
      risk_1: 'Vendre', risk_2: '<3ans', risk_3: '3-5%', risk_4: '<10%',
    })).toBeLessThan(10)
  })

  it('réponses manquantes → neutralisées à 50', () => {
    expect(riskScore({})).toBe(50)
    expect(riskScore({ risk_1: 'Renforcer' })).toBe(Math.round((100 + 50 + 50 + 50) / 4))
  })

  it('valeur invalide → fallback 50', () => {
    expect(riskScore({ risk_1: 'invalid_value' })).toBe(50)
  })
})

describe('experienceScore', () => {
  it('moyenne pondérée des 3 quiz par leur pct de niveau', () => {
    // Tous expert (pct 96) → 96
    expect(experienceScore({
      bourse: { correct: 4, total: 4 },
      crypto: { correct: 4, total: 4 },
      immo:   { correct: 3, total: 3 },
    })).toBe(96)

    // Tous débutant (pct 18) → 18
    expect(experienceScore({
      bourse: { correct: 0, total: 4 },
      crypto: { correct: 0, total: 4 },
      immo:   { correct: 0, total: 3 },
    })).toBe(18)
  })
})

describe('savingsRate', () => {
  it('arrondit le ratio', () => {
    expect(savingsRate(500, 2000)).toBe(25)
    expect(savingsRate(333, 1000)).toBe(33)
  })

  it('revenus nuls → 0', () => {
    expect(savingsRate(500, 0)).toBe(0)
    expect(savingsRate(500, -100)).toBe(0)
  })
})

describe('globalScore', () => {
  it('pondération 35/25/40', () => {
    // savings=50% (×2 = 100), risk=100, exp=100 → 100
    expect(globalScore({ savingsRatePct: 50, riskPct: 100, experiencePct: 100 })).toBe(100)
    // savings=0, risk=0, exp=0 → 0
    expect(globalScore({ savingsRatePct: 0, riskPct: 0, experiencePct: 0 })).toBe(0)
    // savings=10% (×2 = 20), risk=50, exp=50 → 20*0.35 + 50*0.25 + 50*0.40 = 7+12.5+20 = 39.5 → 40
    expect(globalScore({ savingsRatePct: 10, riskPct: 50, experiencePct: 50 })).toBe(40)
  })

  it('savings cap à 100 (50 % réel = max)', () => {
    // savings=80% (×2 = 160 mais cappé à 100), risk=0, exp=0 → 100*0.35 = 35
    expect(globalScore({ savingsRatePct: 80, riskPct: 0, experiencePct: 0 })).toBe(35)
  })
})

describe('fireTarget', () => {
  it('règle des 25x', () => {
    expect(fireTarget(4000)).toBe(4000 * 12 * 25)  // 1.2M €
    expect(fireTarget(0)).toBe(0)
    expect(fireTarget(-100)).toBe(0)
  })
})

describe('fireYears', () => {
  it('renvoie 99 si contribution ou cible <= 0', () => {
    expect(fireYears(0, 1_000_000)).toBe(99)
    expect(fireYears(500, 0)).toBe(99)
    expect(fireYears(-500, 1000)).toBe(99)
  })

  it('contribution forte → délai court', () => {
    // 10 000 € / mois pour atteindre 100 000 € → quelques mois
    const y = fireYears(10000, 100000)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(2)
  })

  it('cible inatteignable plafonnée à 50 ans', () => {
    // 1 € / mois pour 1B → renvoie 50 (plafond)
    expect(fireYears(1, 1_000_000_000)).toBeCloseTo(50, 0)
  })
})

describe('inferProfileType', () => {
  it('Conservateur : risque<30 et exp<35', () => {
    expect(inferProfileType(20, 20)).toBe('Conservateur')
    expect(inferProfileType(29, 34)).toBe('Conservateur')
  })

  it('Offensif : risque>=70 et exp>=65', () => {
    expect(inferProfileType(70, 65)).toBe('Offensif')
    expect(inferProfileType(100, 100)).toBe('Offensif')
  })

  it('Dynamique : risque>=55 (sinon Offensif)', () => {
    expect(inferProfileType(60, 30)).toBe('Dynamique')
    expect(inferProfileType(55, 60)).toBe('Dynamique')
  })

  it('Stratège : exp>=70 (sinon)', () => {
    expect(inferProfileType(40, 75)).toBe('Stratège')
  })

  it('Équilibré : reste', () => {
    expect(inferProfileType(50, 50)).toBe('Équilibré')
    expect(inferProfileType(40, 50)).toBe('Équilibré')
  })
})

describe('riskLabel', () => {
  it('mappe correctement les seuils', () => {
    expect(riskLabel(20).label).toBe('Conservateur')
    expect(riskLabel(40).label).toBe('Équilibré')
    expect(riskLabel(60).label).toBe('Dynamique')
    expect(riskLabel(80).label).toBe('Offensif')
  })
})

describe('computeAxes', () => {
  it('taux d\'épargne faible → warn', () => {
    const axes = computeAxes({
      savingsRatePct: 5,
      bourseLevel: { label: 'Avancé',  pct: 72, tone: 'info' },
      cryptoLevel: { label: 'Avancé',  pct: 72, tone: 'info' },
      immoLevel:   { label: 'Avancé',  pct: 72, tone: 'info' },
      fireYearsValue: 15,
    })
    expect(axes[0]?.tone).toBe('warn')
    expect(axes[0]?.label).toContain("Taux d'épargne")
  })

  it('maîtrise multi-actifs (≥70 partout) → axe positif dédié', () => {
    const axes = computeAxes({
      savingsRatePct: 25,
      bourseLevel: { label: 'Avancé', pct: 72, tone: 'info' },
      cryptoLevel: { label: 'Avancé', pct: 72, tone: 'info' },
      immoLevel:   { label: 'Avancé', pct: 72, tone: 'info' },
      fireYearsValue: 15,
    })
    expect(axes.some((a) => a.label.includes('Maîtrise multi-actifs'))).toBe(true)
  })

  it('FIRE rapide → axe rocket', () => {
    const axes = computeAxes({
      savingsRatePct: 30,
      bourseLevel: { label: 'Expert', pct: 96, tone: 'success' },
      cryptoLevel: { label: 'Expert', pct: 96, tone: 'success' },
      immoLevel:   { label: 'Expert', pct: 96, tone: 'success' },
      fireYearsValue: 7,
    })
    expect(axes.some((a) => a.icon === '🚀')).toBe(true)
  })

  it('FIRE inatteignable (99) → pas d\'axe ⏳', () => {
    const axes = computeAxes({
      savingsRatePct: 30,
      bourseLevel: { label: 'Avancé', pct: 72, tone: 'info' },
      cryptoLevel: { label: 'Avancé', pct: 72, tone: 'info' },
      immoLevel:   { label: 'Avancé', pct: 72, tone: 'info' },
      fireYearsValue: 99,
    })
    expect(axes.some((a) => a.icon === '⏳')).toBe(false)
  })
})

describe('computeProfileMetrics — agrégat complet', () => {
  it('profil expert avec gros revenus', () => {
    const m = computeProfileMetrics({
      age: 35,
      revenu_mensuel: 5000, revenu_conjoint: 3000, autres_revenus: 500,
      loyer: 1200, autres_credits: 0, charges_fixes: 400, depenses_courantes: 1000,
      epargne_mensuelle: 3000,
      quiz_bourse: [0, 1, 2, 3],
      quiz_crypto: [0, 1, 2, 1],
      quiz_immo:   [1, 2, 3],
      risk_1: 'Renforcer', risk_2: '>15ans', risk_3: '10-20%', risk_4: '30-60%',
      revenu_passif_cible: 4000,
    })

    expect(m.revenusTotal).toBe(8500)
    expect(m.chargesTotal).toBe(2600)
    expect(m.resteAVivre).toBe(5900)
    expect(m.epargne).toBe(3000)
    expect(m.savingsRatePct).toBe(35)  // 3000/8500 ≈ 35%
    expect(m.bourse.correct).toBe(4)
    expect(m.crypto.correct).toBe(4)
    expect(m.immo.correct).toBe(3)
    expect(m.bourse.level.label).toBe('Expert')
    expect(m.profileType).toBe('Offensif')
    expect(m.fireTargetCapital).toBe(4000 * 12 * 25)
    expect(m.fireYearsValue).toBeLessThan(20)
    expect(m.fireAge).not.toBeNull()
  })

  it('profil débutant complet', () => {
    const m = computeProfileMetrics({
      age: 25,
      revenu_mensuel: 1800,
      loyer: 700, charges_fixes: 200, depenses_courantes: 800,
      epargne_mensuelle: 100,
      quiz_bourse: [], quiz_crypto: [], quiz_immo: [],
      // Réponses risque toutes défensives → riskScore < 30
      risk_1: 'Vendre', risk_2: '<3ans', risk_3: '3-5%', risk_4: '<10%',
      revenu_passif_cible: 2500,
    })
    expect(m.savingsRatePct).toBeLessThan(10)
    expect(m.profileType).toBe('Conservateur')
    expect(m.bourse.level.label).toBe('Débutant')
    expect(m.axes.some((a) => a.tone === 'warn')).toBe(true)
  })

  it('profil vide → toutes métriques à 0 / défauts', () => {
    const m = computeProfileMetrics({})
    expect(m.revenusTotal).toBe(0)
    expect(m.chargesTotal).toBe(0)
    expect(m.savingsRatePct).toBe(0)
    expect(m.fireYearsValue).toBe(99)
    expect(m.fireAge).toBeNull()
  })
})
