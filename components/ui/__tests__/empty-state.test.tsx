/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Briefcase } from 'lucide-react'
import { EmptyState } from '../empty-state'
import { ARIA_OPEN_EVENT, type AriaOpenDetail } from '@/lib/aria/openAria'

describe('<EmptyState>', () => {
  afterEach(() => { cleanup() })

  it('affiche titre, description et action sans bouton ARIA quand ariaPrompt est absent', () => {
    render(
      <EmptyState
        icon={Briefcase}
        title="Aucune position"
        description="Ajoute ta première position."
        action={<button>Ajouter</button>}
      />,
    )
    expect(screen.getByText('Aucune position')).toBeInTheDocument()
    expect(screen.getByText('Ajoute ta première position.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /demander à aria/i })).not.toBeInTheDocument()
  })

  it('affiche le bouton « Demander à ARIA » quand ariaPrompt est fourni', () => {
    render(
      <EmptyState
        icon={Briefcase}
        title="Aucune position"
        description="…"
        ariaPrompt="prompt de test"
      />,
    )
    expect(screen.getByRole('button', { name: /demander à aria/i })).toBeInTheDocument()
  })

  it('dispatche un CustomEvent firecore:aria-open avec le prompt au clic sur ARIA', () => {
    const listener = vi.fn<(e: Event) => void>()
    window.addEventListener(ARIA_OPEN_EVENT, listener)
    render(
      <EmptyState
        icon={Briefcase}
        title="x"
        description="y"
        ariaPrompt="explique ceci"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /demander à aria/i }))
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0]?.[0] as CustomEvent<AriaOpenDetail>
    expect(event.detail.prompt).toBe('explique ceci')
    window.removeEventListener(ARIA_OPEN_EVENT, listener)
  })
})
