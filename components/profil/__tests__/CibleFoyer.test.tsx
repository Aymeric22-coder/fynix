/* @vitest-environment jsdom */
/**
 * QW9-bis — Tests de rendu du composant <CibleFoyer>.
 *
 * Vérifie :
 *   1. Rendu conditionnel : !hasAdjustment → composant retourne null
 *      (variants inline ET detailed). PAS de "3000 → 3000".
 *   2. Variant `detailed` quand hasAdjustment : affiche brut + ajuste + items
 *      + nudge (si bonus couple présent).
 *   3. Variant `inline` quand hasAdjustment : badge + tooltip.
 *   4. Pas de nudge si l'ajustement ne vient que des enfants (pas
 *      d'action utile à proposer).
 *   5. Label canonique "4 enfants ou plus" rendu tel quel.
 *
 * Note : formatCurrency émet un narrow no-break space (U+202F) entre les
 * milliers et avant €. On vérifie donc les montants via textContent +
 * regex `\D?` qui matche n'importe quel séparateur (espace normal ou
 * insécable). `getByText` ne suit pas les frontières de spans imbriqués,
 * d'où l'usage de `container.textContent` quand le texte est splitté.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { CibleFoyer } from '../CibleFoyer'
import { adjustCibleFamilleDetail } from '@/lib/profil/cibleFamille'

afterEach(() => { cleanup() })

function detailFor(p: {
  enfants?: string; situation_familiale?: string;
  revenu_conjoint?: number; revenu_passif_cible?: number;
}) {
  return adjustCibleFamilleDetail({
    enfants:             p.enfants             ?? '0',
    situation_familiale: p.situation_familiale ?? 'Célibataire',
    revenu_conjoint:     p.revenu_conjoint     ?? 0,
    revenu_passif_cible: p.revenu_passif_cible ?? 3000,
  })
}

describe('<CibleFoyer> — rendu conditionnel', () => {
  it('variant inline + !hasAdjustment → ne rend RIEN (null)', () => {
    const detail = detailFor({})   // célib 0 enfant
    const { container } = render(<CibleFoyer detail={detail} variant="inline" />)
    expect(container.innerHTML).toBe('')
  })

  it('variant detailed + !hasAdjustment → ne rend RIEN (null)', () => {
    const detail = detailFor({})
    const { container } = render(<CibleFoyer detail={detail} variant="detailed" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('<CibleFoyer> — variant detailed (hasAdjustment)', () => {
  it('couple + 2 enfants sans revenu conjoint : brut, ajusté, deux raisons, nudge', () => {
    const detail = detailFor({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    const { container } = render(<CibleFoyer detail={detail} variant="detailed" />)

    // Brut affiché — montant via textContent (split sur 2 nœuds dans le rendu).
    expect(screen.getByText('Cible (saisie)')).toBeInTheDocument()
    expect(container.textContent ?? '').toMatch(/3\D?000\D?€\D?\/mois/)
    // Ajusté affiché
    expect(screen.getByText('Pour ton foyer')).toBeInTheDocument()
    expect(container.textContent ?? '').toMatch(/5\D?100\D?€\D?\/mois/)
    // Badge "ajusté"
    expect(screen.getByText('ajusté')).toBeInTheDocument()
    // Raisons
    expect(screen.getByText('couple, un seul revenu déclaré')).toBeInTheDocument()
    expect(screen.getByText('2 enfants')).toBeInTheDocument()
    // Nudge (couple actif → présent)
    expect(screen.getByText(/Renseigne le revenu de ton conjoint/i)).toBeInTheDocument()
  })

  it('enfants seuls (pas de bonus couple) → PAS de nudge', () => {
    const detail = detailFor({
      enfants: '1', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    render(<CibleFoyer detail={detail} variant="detailed" />)

    expect(screen.getByText('1 enfant')).toBeInTheDocument()
    // Pas de nudge : pas de mention "conjoint" dans le rendu
    expect(screen.queryByText(/Renseigne le revenu de ton conjoint/i))
      .not.toBeInTheDocument()
  })

  it('4+ enfants : label canonique "4 enfants ou plus"', () => {
    const detail = detailFor({
      enfants: '4+', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    render(<CibleFoyer detail={detail} variant="detailed" />)
    expect(screen.getByText('4 enfants ou plus')).toBeInTheDocument()
  })
})

describe('<CibleFoyer> — variant inline (hasAdjustment)', () => {
  it('couple + 2 enfants : badge avec montant ajusté + bouton tooltip accessible', () => {
    const detail = detailFor({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    const { container } = render(<CibleFoyer detail={detail} variant="inline" />)

    // Montant ajusté visible dans le badge. Le libellé "Foyer : " et le
    // montant sont split sur 2 spans distincts (pour la troncature mobile
    // du libellé sans toucher au montant) — on vérifie via textContent
    // agrégé du conteneur.
    expect(container.textContent ?? '').toMatch(/5\D?100\D?€\D?\/m/)

    // Bouton tooltip (aria-label commence par "Aide : ")
    const tipBtn = screen.getByRole('button', { name: /Aide\s*:/i })
    expect(tipBtn).toBeInTheDocument()
    // L'aria-label expose le montant ajusté ET brut
    const label = tipBtn.getAttribute('aria-label') || ''
    expect(label).toMatch(/5\D?100/)
    expect(label).toMatch(/3\D?000/)
  })
})
