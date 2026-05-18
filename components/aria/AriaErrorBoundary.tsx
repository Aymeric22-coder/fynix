/**
 * Error boundary autour de l'arborescence ARIA. Si un composant interne
 * crashe, on log et on cache silencieusement — l'app continue de
 * fonctionner. Sans ca, une exception dans ARIA met toute la page
 * en "Application error" (l'app entiere devient inutilisable).
 *
 * Hot-fix critique apres le bug Phase 6 ou AriaLauncher tuait le layout.
 */
'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AriaErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (typeof window !== 'undefined') {
      console.error('[ARIA] crash boundary —', error, info?.componentStack)
    }
  }

  override render() {
    if (this.state.hasError) {
      return null                                  // ARIA disparait, l'app continue
    }
    return this.props.children
  }
}
