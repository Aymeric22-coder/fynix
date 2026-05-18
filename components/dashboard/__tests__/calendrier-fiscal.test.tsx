/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import {
  CalendrierFiscal,
  type EvenementFiscalSerialisable,
} from '../calendrier-fiscal'

function makeEvt(over: Partial<EvenementFiscalSerialisable> = {}): EvenementFiscalSerialisable {
  return {
    id:          over.id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
    titre:       over.titre ?? 'Événement test',
    description: over.description ?? 'description test',
    date:        over.date ?? new Date(Date.UTC(2026, 4, 25)).toISOString(),
    recurrence:  over.recurrence ?? 'annuel',
    categorie:   over.categorie ?? 'declaration',
    urgence:     over.urgence ?? 'attention',
    lien_externe: over.lien_externe,
  }
}

describe('<CalendrierFiscal>', () => {
  afterEach(() => { cleanup() })

  it('ne rend rien si 0 événement', () => {
    const { container } = render(<CalendrierFiscal evenements={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('3 événements → 3 cartes visibles, pas de bouton « Voir tout »', () => {
    const evts = [
      makeEvt({ id: 'a', titre: 'Déclaration 2042' }),
      makeEvt({ id: 'b', titre: 'Taxe foncière' }),
      makeEvt({ id: 'c', titre: 'PER fin d\'année' }),
    ]
    render(<CalendrierFiscal evenements={evts} />)
    expect(screen.getByText(/Déclaration 2042/)).toBeInTheDocument()
    expect(screen.getByText(/Taxe foncière/)).toBeInTheDocument()
    expect(screen.getByText(/PER fin d'année/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /voir tout/i })).not.toBeInTheDocument()
  })

  it('5 événements → 3 visibles + bouton « Voir tout (+2) »', () => {
    const evts = Array.from({ length: 5 }, (_, i) => makeEvt({
      id:    `e${i}`,
      titre: `Événement n°${i + 1}`,
    }))
    render(<CalendrierFiscal evenements={evts} />)
    // Les 3 premiers visibles
    expect(screen.getByText('Événement n°1')).toBeInTheDocument()
    expect(screen.getByText('Événement n°2')).toBeInTheDocument()
    expect(screen.getByText('Événement n°3')).toBeInTheDocument()
    // 4 et 5 cachés tant que pas expand
    expect(screen.queryByText('Événement n°4')).not.toBeInTheDocument()
    expect(screen.queryByText('Événement n°5')).not.toBeInTheDocument()
    // Bouton avec compteur surplus
    const btn = screen.getByRole('button', { name: /voir tout/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent(/\+2/)
  })

  it('clic sur « Voir tout » → tous les événements affichés + bouton « Réduire »', () => {
    const evts = Array.from({ length: 5 }, (_, i) => makeEvt({
      id:    `x${i}`,
      titre: `Item ${i + 1}`,
    }))
    render(<CalendrierFiscal evenements={evts} />)
    fireEvent.click(screen.getByRole('button', { name: /voir tout/i }))
    // Maintenant les 5 sont visibles
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 4')).toBeInTheDocument()
    expect(screen.getByText('Item 5')).toBeInTheDocument()
    // Bouton bascule
    expect(screen.getByRole('button', { name: /réduire/i })).toBeInTheDocument()
  })

  it('badge d\'urgence affiché selon catégorie', () => {
    render(<CalendrierFiscal evenements={[
      makeEvt({ id: 'u1', titre: 'Urgent test',    urgence: 'urgent' }),
      makeEvt({ id: 'u2', titre: 'Info test',      urgence: 'info' }),
      makeEvt({ id: 'u3', titre: 'Attention test', urgence: 'attention' }),
    ]} />)
    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByText('Attention')).toBeInTheDocument()
  })

  it('lien externe : ouvert dans nouvel onglet (rel/target sûrs)', () => {
    render(<CalendrierFiscal evenements={[makeEvt({
      id:           'l1',
      titre:        'Avec lien',
      lien_externe: 'https://www.impots.gouv.fr',
    })]} />)
    const link = screen.getByRole('link', { name: /impots\.gouv\.fr/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringMatching(/noopener/))
  })
})
