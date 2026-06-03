/* @vitest-environment jsdom */
/**
 * Tests `CashMatelasCard` — 4 états visuels (Cash V1.1, Volet C.2).
 *
 * Couvre :
 *   - État ✅ « Dans la cible »  (P2, CDI équilibré de l'audit)
 *   - État ⚠️ « Sous-liquide »   (P1, débutant CDI)
 *   - État 💰 « Sur-liquide »    (P4, sur-liquide CDI)
 *   - État ❓ Non applicable     (charges manquantes / statut manquant)
 *
 * Simule mentalement les 6 personas de l'audit § 7 :
 *   - P1 (charges ~1800, statut cdi)            → sous-liquide
 *   - P2 (charges ~2500, statut cdi)            → dans la cible
 *   - P3 (charges ~3000, statut independant)    → dans la cible
 *   - P4 (charges ~2000, statut cdi)            → sur-liquide
 *   - P5 (charges ~2000, statut cdi, volontaire) → sur-liquide (V1.2 neutralisera)
 *   - P6 (charges ~4000, statut dirigeant)      → dans la cible
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { CashMatelasCard } from '../cash-matelas-card'
import type { ProfileContext } from '@/lib/profil/getProfileContext'

afterEach(cleanup)

const PROFIL_CDI: ProfileContext = {
  revenuMensuel:     3_500,
  chargesMensuelles: 2_500,
  statutPro:         'cdi',
  stabiliteRevenus:  null,
}

describe('CashMatelasCard — 4 états visuels', () => {
  it('✅ Dans la cible (P2 équilibré) : 18 000 € sur cible 7 500-15 000', () => {
    // Charges 2500 × [3..6] = [7500..15000]. Cash 18 000 → DEPASSE la haute.
    // Pour rester dans la cible avec ce CDI, prends 12 000.
    render(<CashMatelasCard totalCash={12_000} profile={PROFIL_CDI} />)
    expect(screen.getByText(/Matelas équilibré/i)).toBeTruthy()
    expect(screen.getByText(/Profil stable/i)).toBeTruthy()
    expect(screen.getByText(/3-6 mois/i)).toBeTruthy()
  })

  it('⚠️ Sous-liquide (P1 débutant) : 2 300 € sur cible 5 400-10 800', () => {
    const profile: ProfileContext = {
      revenuMensuel:     2_200,
      chargesMensuelles: 1_800,
      statutPro:         'cdi',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={2_300} profile={profile} />)
    expect(screen.getByText(/Matelas insuffisant/i)).toBeTruthy()
    // Manque = 5400 - 2300 = 3100 €
    expect(screen.getByText(/manque/i)).toBeTruthy()
  })

  it('💰 Sur-liquide (P4) : 49 000 € sur cible 6 000-12 000 (cdi, charges 2k)', () => {
    const profile: ProfileContext = {
      revenuMensuel:     3_000,
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={49_000} profile={profile} />)
    expect(screen.getByText(/Excédent de liquidité/i)).toBeTruthy()
    expect(screen.getByText(/à investir potentiellement/i)).toBeTruthy()
  })

  it('❓ Non applicable — charges manquantes → CTA Profil', () => {
    const profile: ProfileContext = {
      revenuMensuel:     3_500,
      chargesMensuelles: null,
      statutPro:         'cdi',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={10_000} profile={profile} />)
    expect(screen.getByText(/données manquantes/i)).toBeTruthy()
    expect(screen.getByText(/Renseigne tes charges/i)).toBeTruthy()
    const cta = screen.getByText(/Renseigner mes charges/i)
    expect(cta.getAttribute('href')).toBe('/profil')
  })

  it('❓ Non applicable — statut manquant → CTA Profil', () => {
    const profile: ProfileContext = {
      revenuMensuel:     3_500,
      chargesMensuelles: 2_000,
      statutPro:         null,
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={10_000} profile={profile} />)
    expect(screen.getByText(/Renseigne ton statut/i)).toBeTruthy()
    expect(screen.getByText(/Renseigner mon statut/i)).toBeTruthy()
  })
})

describe('CashMatelasCard — robustesse multi-profils (audit § 7)', () => {
  it('P3 Indépendant (charges 3000) : cible 18 000-36 000, 28 000 € → dans la cible', () => {
    const profile: ProfileContext = {
      revenuMensuel:     4_000,
      chargesMensuelles: 3_000,
      statutPro:         'independant',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={28_000} profile={profile} />)
    expect(screen.getByText(/Matelas équilibré/i)).toBeTruthy()
    expect(screen.getByText(/Profil volatil/i)).toBeTruthy()
    expect(screen.getByText(/6-12 mois/i)).toBeTruthy()
  })

  it('P6 Dirigeant (charges 4000) : cible 24 000-48 000, 68 000 € → sur-liquide', () => {
    const profile: ProfileContext = {
      revenuMensuel:     8_000,
      chargesMensuelles: 4_000,
      statutPro:         'dirigeant',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={68_000} profile={profile} />)
    expect(screen.getByText(/Excédent de liquidité/i)).toBeTruthy()
    expect(screen.getByText(/Profil volatil/i)).toBeTruthy()
  })

  it('Override stabilité = stable sur indépendant → cible 3-6 mois', () => {
    const profile: ProfileContext = {
      revenuMensuel:     4_000,
      chargesMensuelles: 2_000,
      statutPro:         'independant',
      stabiliteRevenus:  'stable',
    }
    render(<CashMatelasCard totalCash={10_000} profile={profile} />)
    // Cible basse = 6000, cible haute = 12 000. Cash 10 000 → équilibré.
    expect(screen.getByText(/Matelas équilibré/i)).toBeTruthy()
    expect(screen.getByText(/3-6 mois/i)).toBeTruthy()
  })

  it('Mention « X mois de salaire » affichée si revenuNetMensuel présent', () => {
    render(<CashMatelasCard totalCash={10_000} profile={PROFIL_CDI} />)
    // 10 000 / 3 500 ≈ 2,9 mois
    expect(screen.getByText(/mois de salaire/i)).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────
// V1.1-POLISH — Nouveau design de la jauge
// ──────────────────────────────────────────────────────────────────────
describe('CashMatelasCard — V1.1-POLISH jauge auto-suffisante', () => {
  const PROFIL_AYMERIC: ProfileContext = {
    revenuMensuel:     2_600,
    chargesMensuelles: 1_675,
    statutPro:         'independant',
    stabiliteRevenus:  'instable',
  }

  it('affiche les 3 labels de segments « Insuffisant / Cible / Excédent »', () => {
    render(<CashMatelasCard totalCash={18_578} profile={PROFIL_AYMERIC} />)
    expect(screen.getByText(/Insuffisant/i)).toBeTruthy()
    expect(screen.getByText(/^Cible$/i)).toBeTruthy()
    expect(screen.getByText(/Excédent/i)).toBeTruthy()
  })

  it('cas Aymeric (cible 9-12 mois) : affiche le label montant sur le curseur', () => {
    render(<CashMatelasCard totalCash={18_578} profile={PROFIL_AYMERIC} />)
    // Le label montant du curseur utilise formatCurrency(18578, EUR)
    // (présent au moins une fois — sur le curseur). On vérifie sa présence.
    const matches = screen.getAllByText((_content, node) =>
      node?.textContent?.includes('18') === true
      && node?.textContent?.includes('578') === true,
    )
    expect(matches.length).toBeGreaterThan(0)
  })

  it('cas overflow (totalCash > cibleHaute × 1,5) : affiche le préfixe « > »', () => {
    // cibleHaute = 1675 × 12 = 20100, × 1,5 = 30150. 50000 > 30150 → overflow.
    render(<CashMatelasCard totalCash={50_000} profile={PROFIL_AYMERIC} />)
    expect(screen.getByText(/^> /)).toBeTruthy()
  })

  it('graduations chiffrées : 4 valeurs (0 / cibleBasse / cibleHaute / cap) rendues', () => {
    // Cas P3 indépendant non override : charges 3000, cible 18 000-36 000.
    // Graduations attendues : 0, 18 000, 36 000, 54 000.
    const profile: ProfileContext = {
      revenuMensuel:     4_000,
      chargesMensuelles: 3_000,
      statutPro:         'independant',
      stabiliteRevenus:  null,
    }
    render(<CashMatelasCard totalCash={28_000} profile={profile} />)
    // Les valeurs apparaissent en double (mobile compact + desktop) →
    // on cherche au moins une occurrence pour chaque.
    expect(screen.getAllByText((_content, node) =>
      node?.textContent === '0 €',
    ).length).toBeGreaterThan(0)
    expect(screen.getAllByText((_content, node) =>
      node?.textContent?.includes('18') === true
      && node?.textContent?.includes('000') === true,
    ).length).toBeGreaterThan(0)
    expect(screen.getAllByText((_content, node) =>
      node?.textContent?.includes('36') === true
      && node?.textContent?.includes('000') === true,
    ).length).toBeGreaterThan(0)
    expect(screen.getAllByText((_content, node) =>
      node?.textContent?.includes('54') === true
      && node?.textContent?.includes('000') === true,
    ).length).toBeGreaterThan(0)
  })

  it('suppression des 3 colonnes redondantes Total / Cible basse / Cible haute', () => {
    render(<CashMatelasCard totalCash={28_000} profile={{
      revenuMensuel:     4_000,
      chargesMensuelles: 3_000,
      statutPro:         'independant',
      stabiliteRevenus:  null,
    }} />)
    // Les labels littéraux « Total cash », « Cible basse », « Cible haute »
    // de l'ancienne V1.1 ne doivent plus apparaître.
    expect(screen.queryByText('Total cash')).toBeNull()
    expect(screen.queryByText('Cible basse')).toBeNull()
    expect(screen.queryByText('Cible haute')).toBeNull()
  })
})
