import { describe, it, expect } from 'vitest'
import {
  quizScore, quizLevel, riskScore, experienceScore, savingsRate,
  globalScore, fireTarget, fireYears, inferProfileType, riskLabel,
  computeAxes, computeProfileMetrics,
  QUIZ_BOURSE,
  normalizeFireType, normalizeStabiliteRevenus, normalizePriorite,
  normalizeSituationFamiliale, normalizeEnfants, deriveStabiliteFromStatutPro,
  swrMultiplier, fireTargetByType,
  adjustCibleFamille, revenuPassifCibleAjuste,
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

  // QW9-bis — Champs ajustés famille (additifs, non-régression brut)
  describe('QW9-bis — variantes foyer ajusté', () => {
    it('célibataire 0 enfant : *Ajuste === *Brut (cohérence), hasAdjustment=false', () => {
      const m = computeProfileMetrics({
        age: 35,
        revenu_mensuel: 5000,
        epargne_mensuelle: 1000,
        revenu_passif_cible: 3000,
        situation_familiale: 'Célibataire',
        enfants: '0',
      })
      // Les champs brut existants restent inchangés bit pour bit
      expect(m.fireTargetCapital).toBe(3000 * 12 * 25)
      // Les variantes ajustées sont identiques au brut (pas d'ajustement)
      expect(m.fireTargetCapitalAjuste).toBe(m.fireTargetCapital)
      expect(m.fireYearsValueAjuste).toBe(m.fireYearsValue)
      expect(m.fireAgeAjuste).toBe(m.fireAge)
      // Detail neutre
      expect(m.cibleFoyerDetail.hasAdjustment).toBe(false)
      expect(m.cibleFoyerDetail.ajuste).toBe(m.cibleFoyerDetail.brut)
    })

    it('couple + 2 enfants sans revenu conjoint : *Ajuste > *Brut, hasAdjustment=true', () => {
      const m = computeProfileMetrics({
        age: 35,
        revenu_mensuel: 5000, revenu_conjoint: 0,
        epargne_mensuelle: 1000,
        revenu_passif_cible: 3000,
        situation_familiale: 'Marié(e) / PACS',
        enfants: '2',
      })
      // BRUT inchangé bit pour bit (non-régression)
      expect(m.fireTargetCapital).toBe(3000 * 12 * 25)        // 900 000 €
      // AJUSTÉ : cible 5100 €/mois → capital 5100 × 12 × 25 = 1 530 000 €
      expect(m.fireTargetCapitalAjuste).toBe(5100 * 12 * 25)
      // Années / âge ajustés cohérents (plus longs car cible plus grande)
      expect(m.fireYearsValueAjuste).toBeGreaterThan(m.fireYearsValue)
      // Detail exposé
      expect(m.cibleFoyerDetail.hasAdjustment).toBe(true)
      expect(m.cibleFoyerDetail.brut).toBe(3000)
      expect(m.cibleFoyerDetail.ajuste).toBe(5100)
      expect(m.cibleFoyerDetail.raisons).toHaveLength(2)
    })

    it('non-régression : profil "complet" du test ci-dessus → champs brut inchangés', () => {
      // Reproduit exactement la fixture de "calcule toutes les métriques (profil complet)"
      // SANS situation_familiale / enfants (= comportement legacy).
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
      // Les champs brut DOIVENT être strictement identiques à l'attendu legacy
      expect(m.fireTargetCapital).toBe(4000 * 12 * 25)
      expect(m.fireYearsValue).toBeLessThan(20)
      expect(m.fireAge).not.toBeNull()
      // Pas d'ajustement → variantes ajustées identiques
      expect(m.fireTargetCapitalAjuste).toBe(m.fireTargetCapital)
      expect(m.fireYearsValueAjuste).toBe(m.fireYearsValue)
      expect(m.fireAgeAjuste).toBe(m.fireAge)
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// Tâche A — normalisation des champs profil
// ─────────────────────────────────────────────────────────────────

describe('normalizeFireType', () => {
  it('détecte les 5 ids même via libellé UI', () => {
    expect(normalizeFireType('Lean FIRE')).toBe('lean')
    expect(normalizeFireType('classic')).toBe('classic')
    expect(normalizeFireType('Fat FIRE')).toBe('fat')
    expect(normalizeFireType('Coast FIRE')).toBe('coast')
    expect(normalizeFireType('Barista FIRE')).toBe('barista')
  })
  it('null pour valeurs vides ou inconnues', () => {
    expect(normalizeFireType(null)).toBeNull()
    expect(normalizeFireType(undefined)).toBeNull()
    expect(normalizeFireType('')).toBeNull()
    expect(normalizeFireType('quoi')).toBeNull()
  })
})

describe('normalizeStabiliteRevenus', () => {
  it('mappe les libellés UI vers les 4 ids', () => {
    expect(normalizeStabiliteRevenus('Très stables (CDI)')).toBe('cdi')
    expect(normalizeStabiliteRevenus('Stables mais variables')).toBe('cdi')
    expect(normalizeStabiliteRevenus('Irréguliers')).toBe('independant')
    expect(normalizeStabiliteRevenus('Très variables')).toBe('independant')
    expect(normalizeStabiliteRevenus('Indépendant / Freelance')).toBe('independant')
    expect(normalizeStabiliteRevenus('Chômage longue durée')).toBe('chomage')
    expect(normalizeStabiliteRevenus('Retraité')).toBe('retraite')
  })
  it('accepte aussi l\'id direct', () => {
    expect(normalizeStabiliteRevenus('cdi')).toBe('cdi')
  })
  it('null si non renseigné', () => {
    expect(normalizeStabiliteRevenus(null)).toBeNull()
    expect(normalizeStabiliteRevenus('autre situation')).toBeNull()
  })
})

// QW2 — Fallback stabilité depuis le statut professionnel.
describe('deriveStabiliteFromStatutPro', () => {
  it('mappe les statuts non ambigus (1 par chip STATUTS_PRO)', () => {
    expect(deriveStabiliteFromStatutPro('Salarié')).toBe('cdi')
    expect(deriveStabiliteFromStatutPro('Indépendant / Freelance')).toBe('independant')
    expect(deriveStabiliteFromStatutPro('Retraité')).toBe('retraite')
  })
  it('cas ambigus → null (pas de devinette)', () => {
    expect(deriveStabiliteFromStatutPro("Chef d'entreprise")).toBeNull()
    expect(deriveStabiliteFromStatutPro('Autre')).toBeNull()
  })
  it('null / undefined / inconnu → null', () => {
    expect(deriveStabiliteFromStatutPro(null)).toBeNull()
    expect(deriveStabiliteFromStatutPro(undefined)).toBeNull()
    expect(deriveStabiliteFromStatutPro('Astronaute')).toBeNull()
  })
  it('tolérant à la casse / sans accent', () => {
    expect(deriveStabiliteFromStatutPro('salarie')).toBe('cdi')
    expect(deriveStabiliteFromStatutPro('FREELANCE')).toBe('independant')
  })
})

describe('normalizePriorite', () => {
  // QW4 — Les 5 chips du wizard (étape 8) → 4 buckets distincts.
  it('mappe les 5 chips wizard vers 4 buckets', () => {
    expect(normalizePriorite('Transmettre un patrimoine')).toBe('transmission')
    expect(normalizePriorite('Sécurité famille')).toBe('securite_famille')
    expect(normalizePriorite('Arrêter de travailler')).toBe('independance')
    expect(normalizePriorite('Liberté de temps')).toBe('equilibre')
    expect(normalizePriorite('Voyager')).toBe('equilibre')
  })
  it('tolérant à la casse / sans accent / ids directs', () => {
    expect(normalizePriorite('transmission')).toBe('transmission')
    expect(normalizePriorite('securite_famille')).toBe('securite_famille')
    expect(normalizePriorite('independance')).toBe('independance')
    expect(normalizePriorite('equilibre')).toBe('equilibre')
  })
  it('null / undefined / inconnu → null (fallback safe)', () => {
    expect(normalizePriorite(null)).toBeNull()
    expect(normalizePriorite(undefined)).toBeNull()
    expect(normalizePriorite('Devenir astronaute')).toBeNull()
  })
})

describe('normalizeSituationFamiliale', () => {
  it('détecte célibataire / couple / marié / pacsé', () => {
    expect(normalizeSituationFamiliale('Célibataire')).toBe('celibataire')
    expect(normalizeSituationFamiliale('En couple')).toBe('couple')
    expect(normalizeSituationFamiliale('Marié(e) / PACS')).toBe('pacse')  // PACS prioritaire
    expect(normalizeSituationFamiliale('Marié')).toBe('marie')
    expect(normalizeSituationFamiliale('Autre')).toBe('autre')
  })
})

describe('normalizeEnfants', () => {
  it('parse "0" .. "4+"', () => {
    expect(normalizeEnfants('0')).toBe(0)
    expect(normalizeEnfants('1')).toBe(1)
    expect(normalizeEnfants('3')).toBe(3)
    expect(normalizeEnfants('4+')).toBe(5)
  })
  it('0 pour valeur invalide', () => {
    expect(normalizeEnfants(null)).toBe(0)
    expect(normalizeEnfants('xyz')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// Tâche A.1 — SWR adapté au type FIRE
// ─────────────────────────────────────────────────────────────────

describe('swrMultiplier', () => {
  it('classic / barista → ×25 (SWR 4 %)', () => {
    expect(swrMultiplier('classic')).toBe(25)
    expect(swrMultiplier('barista')).toBe(25)
  })
  it('lean / fat → ×28.57 (SWR 3.5 %)', () => {
    expect(swrMultiplier('lean')).toBeCloseTo(28.571, 2)
    expect(swrMultiplier('fat')).toBeCloseTo(28.571, 2)
  })
  it('coast → ×25 (le multiplicateur reste celui de classic)', () => {
    expect(swrMultiplier('coast')).toBe(25)
  })
  it('null → ×25 par défaut', () => {
    expect(swrMultiplier(null)).toBe(25)
    expect(swrMultiplier(undefined)).toBe(25)
  })
})

describe('fireTargetByType', () => {
  it('classic 3000€/mois → 900 000 €', () => {
    expect(fireTargetByType(3000, 'classic')).toBe(900_000)
  })
  it('lean 2000€/mois → 685 714 € (×28.57)', () => {
    expect(fireTargetByType(2000, 'lean')).toBeCloseTo(685_714, 0)
  })
  it('fat 5000€/mois → 1 714 285 € (×28.57)', () => {
    expect(fireTargetByType(5000, 'fat')).toBeCloseTo(1_714_286, 0)
  })
  it('coast à 30 ans visant 65 ans → cible classic divisée par (1.07)^35', () => {
    // À 30 ans, viser 3000€/mois passifs à 65 ans en mode coast :
    // capital_now = 900 000 / (1.07)^35 ≈ 84 350 €
    const out = fireTargetByType(3000, 'coast', 30, 65)
    const expected = 900_000 / Math.pow(1.07, 35)
    expect(out).toBeCloseTo(expected, 0)
    expect(out).toBeLessThan(100_000)
  })
  it('coast sans age renseigné → retombe sur cible classic', () => {
    expect(fireTargetByType(3000, 'coast', null, null)).toBe(900_000)
    expect(fireTargetByType(3000, 'coast', 40, 35)).toBe(900_000)  // ageCible < age
  })
  it('null → cible classic (backward compat)', () => {
    expect(fireTargetByType(2000, null)).toBe(fireTarget(2000))
  })
  it('revenu négatif clampé à 0', () => {
    expect(fireTargetByType(-100, 'classic')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// Tâche A.2 — Ajustement composition du foyer
// ─────────────────────────────────────────────────────────────────

describe('adjustCibleFamille', () => {
  it('célibataire sans enfant → +0', () => {
    expect(adjustCibleFamille({
      enfants: '0', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })).toBe(0)
  })
  it('2 enfants → +600€/mois (2 × 300)', () => {
    expect(adjustCibleFamille({
      enfants: '2', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })).toBe(600)
  })
  it('marié sans revenu conjoint déclaré → +50% de la cible', () => {
    expect(adjustCibleFamille({
      enfants: '0', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })).toBe(1500)  // 50% × 3000
  })
  it('marié AVEC revenu conjoint déclaré → 0 (le conjoint contribue)', () => {
    expect(adjustCibleFamille({
      enfants: '0', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 2500, revenu_passif_cible: 3000,
    })).toBe(0)
  })
  it('combinaison enfants + couple sans revenu conjoint', () => {
    // 2 enfants (+600) + couple sans conjoint revenu (+50% × 3000 = +1500)
    expect(adjustCibleFamille({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })).toBe(2100)
  })
  it('4+ enfants → +1500€/mois (5 × 300)', () => {
    expect(adjustCibleFamille({
      enfants: '4+', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 2000,
    })).toBe(1500)
  })
})

describe('revenuPassifCibleAjuste', () => {
  it('= saisi + adjustCibleFamille', () => {
    const profil = {
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    }
    expect(revenuPassifCibleAjuste(profil)).toBe(3000 + 600 + 1500)
  })
  it('cible saisie 0 et famille → contribue seulement les enfants', () => {
    expect(revenuPassifCibleAjuste({
      enfants: '1', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 0,
    })).toBe(300)
  })
})
