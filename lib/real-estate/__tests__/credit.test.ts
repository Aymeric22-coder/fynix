/**
 * Tests des helpers crédit immobilier (CRD + IRA) ainsi que de
 * leur intégration dans `calculerPlusValue` (netVendeur post-crédit).
 */
import { describe, it, expect } from 'vitest'
import { calculerCRD, calculerIRA } from '../credit'
import { calculerPlusValue } from '../plusValue'

// ─────────────────────────────────────────────────────────────────
// calculerCRD
// ─────────────────────────────────────────────────────────────────

describe('calculerCRD', () => {
  it('crédit soldé avant cession → CRD = 0, creditSolde = true', () => {
    // Début il y a 25 ans, durée 20 ans → terminé depuis 5 ans
    const dateDebut   = new Date('2000-06-01T00:00:00.000Z')
    const dateCession = new Date('2026-05-19T00:00:00.000Z')
    const r = calculerCRD(200_000, 3, 240, dateDebut, dateCession)
    expect(r.creditSolde).toBe(true)
    expect(r.crd).toBe(0)
    expect(r.mensualitesRestantes).toBe(0)
  })

  it('crédit en cours — 200 k €, 2 %, 240 mois, payé 120 mois → CRD ≈ 110 k €', () => {
    // 120 mois exactement entre debut et cession (10 ans)
    const dateDebut   = new Date('2010-01-01T00:00:00.000Z')
    const dateCession = new Date('2020-01-01T00:00:00.000Z')
    const r = calculerCRD(200_000, 2, 240, dateDebut, dateCession)
    expect(r.creditSolde).toBe(false)
    expect(r.mensualitesPaees).toBe(120)
    expect(r.mensualitesRestantes).toBe(120)
    // Formule théorique → ~109 980 €. On accepte 105–115 k pour la robustesse.
    expect(r.crd).toBeGreaterThan(105_000)
    expect(r.crd).toBeLessThan(115_000)
  })

  it('crédit taux zéro (PTZ) — amortissement linéaire', () => {
    const dateDebut   = new Date('2015-01-01T00:00:00.000Z')
    const dateCession = new Date('2020-01-01T00:00:00.000Z')
    // 60 mois payés sur 240 → reste 180 → 50 000 × 180/240 = 37 500
    const r = calculerCRD(50_000, 0, 240, dateDebut, dateCession)
    expect(r.creditSolde).toBe(false)
    expect(r.mensualitesPaees).toBe(60)
    expect(r.mensualitesRestantes).toBe(180)
    expect(r.crd).toBe(37_500)
  })

  it('capital ≤ 0 → CRD = 0, creditSolde true', () => {
    const r = calculerCRD(0, 2, 240, new Date(), new Date())
    expect(r.crd).toBe(0)
    expect(r.creditSolde).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// calculerIRA
// ─────────────────────────────────────────────────────────────────

describe('calculerIRA', () => {
  it('CRD 100 k €, taux 1,5 % → 6 mois d\'intérêts (750 €) retenus', () => {
    // Option A = 100 000 × 3 % = 3 000
    // Option B = 100 000 × 1,5%/12 × 6 = 750
    // min → Option B (mois_interets)
    const r = calculerIRA(100_000, 1.5)
    expect(r.ira).toBe(750)
    expect(r.methode).toBe('mois_interets')
    expect(r.detail).toMatch(/6 mois/i)
  })

  it('CRD 100 k €, taux 5 % → 6 mois d\'intérêts (2 500 €) retenus', () => {
    // Option A = 3 000, Option B = 2 500 → min = 2 500
    const r = calculerIRA(100_000, 5)
    expect(r.ira).toBe(2_500)
    expect(r.methode).toBe('mois_interets')
  })

  it('CRD 100 k €, taux 7 % → 3 % du CRD (3 000 €) retenu', () => {
    // Option A = 3 000, Option B = 100 000 × 7%/12 × 6 = 3 500 → min = A
    const r = calculerIRA(100_000, 7)
    expect(r.ira).toBe(3_000)
    expect(r.methode).toBe('pct_crd')
    expect(r.detail).toMatch(/3 ?%/i)
  })

  it('iraExonere = true → 0 €, methode = exonere', () => {
    const r = calculerIRA(100_000, 5, true)
    expect(r.ira).toBe(0)
    expect(r.methode).toBe('exonere')
  })

  it('CRD = 0 → IRA = 0', () => {
    const r = calculerIRA(0, 5)
    expect(r.ira).toBe(0)
    expect(r.methode).toBe('exonere')
  })
})

// ─────────────────────────────────────────────────────────────────
// Intégration : netVendeur post-crédit dans calculerPlusValue
// ─────────────────────────────────────────────────────────────────

describe('calculerPlusValue — netVendeur avec crédit', () => {
  /** Cas particulier 22 ans de détention → exo IR (100 % abattement à 22 ans),
   *  on contrôle un net vendeur que l'on choisit en pilotant les inputs. */
  it('vente 300 k € avec crédit 80 k + IRA → net vendeur réduit de 80 k + IRA', () => {
    const r = calculerPlusValue({
      prixAchat:           150_000,
      dateAchat:           new Date('2010-06-01T00:00:00.000Z'),
      prixVenteEstime:     300_000,
      dateCessionEstimee:  new Date('2026-06-01T00:00:00.000Z'),
      typeUsage:           'locatif',
      regimeFiscal:        'particulier',
      fraisAgenceVente:    9_000,
      creditCapitalRestantDu: 80_000,
      creditTauxAnnuelPct:    2,           // pour IRA : min(3% × 80k=2400, 80k×2%/12×6=800) → 800
    })
    expect(r.creditDetail).toBeDefined()
    expect(r.creditDetail!.crdADateCession).toBe(80_000)
    expect(r.creditDetail!.ira).toBe(800)
    expect(r.creditDetail!.totalRemboursementBanque).toBe(80_800)
    // netVendeur = prixVente − fraisAgence − impôt − CRD − IRA
    //            = 300 000 − 9 000 − impôt − 80 800
    const expected = 300_000 - 9_000 - r.impotTotal - 80_800
    expect(r.netVendeur).toBe(expected)
  })

  it('sans crédit → comportement inchangé (rétro-compat)', () => {
    const r = calculerPlusValue({
      prixAchat:           150_000,
      dateAchat:           new Date('2010-06-01T00:00:00.000Z'),
      prixVenteEstime:     300_000,
      dateCessionEstimee:  new Date('2026-06-01T00:00:00.000Z'),
      typeUsage:           'locatif',
      regimeFiscal:        'particulier',
      fraisAgenceVente:    9_000,
    })
    expect(r.creditDetail).toBeUndefined()
    // netVendeur = prixVente − fraisAgence − impôt
    expect(r.netVendeur).toBe(300_000 - 9_000 - r.impotTotal)
  })

  it('CRD = 0 (champ omis et données brutes absentes) → pas de creditDetail', () => {
    const r = calculerPlusValue({
      prixAchat:           150_000,
      dateAchat:           new Date('2010-06-01T00:00:00.000Z'),
      prixVenteEstime:     300_000,
      dateCessionEstimee:  new Date('2026-06-01T00:00:00.000Z'),
      typeUsage:           'locatif',
      regimeFiscal:        'particulier',
      creditCapitalRestantDu: 0,           // explicitement nul
    })
    expect(r.creditDetail).toBeUndefined()
  })

  it('IRA exonérées → seul le CRD est déduit, pas d\'IRA', () => {
    const r = calculerPlusValue({
      prixAchat:           150_000,
      dateAchat:           new Date('2010-06-01T00:00:00.000Z'),
      prixVenteEstime:     300_000,
      dateCessionEstimee:  new Date('2026-06-01T00:00:00.000Z'),
      typeUsage:           'locatif',
      regimeFiscal:        'particulier',
      creditCapitalRestantDu: 50_000,
      creditTauxAnnuelPct:    3,
      iraExonere:          true,
    })
    expect(r.creditDetail!.ira).toBe(0)
    expect(r.creditDetail!.methodeIRA).toBe('exonere')
    expect(r.creditDetail!.totalRemboursementBanque).toBe(50_000)
  })
})
