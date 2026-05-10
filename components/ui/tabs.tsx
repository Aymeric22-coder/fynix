'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface TabItem {
  id:       string
  label:    string
  /** Optionnel : icône Lucide affichée à gauche du label */
  icon?:    React.ComponentType<{ size?: number; className?: string }>
  /** Optionnel : badge à droite (compteur, alerte) */
  badge?:   ReactNode
  content:  ReactNode
}

interface Props {
  tabs:        TabItem[]
  /** Onglet par défaut (id) si pas de paramètre URL. Défaut : premier */
  defaultTab?: string
  /**
   * Si fourni, l'onglet actif est synchronisé avec ce paramètre URL
   * (ex: 'tab' → ?tab=credit). Permet le deep-linking.
   */
  urlParam?:   string
}

export function Tabs({ tabs, defaultTab, urlParam }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initial = (urlParam && searchParams.get(urlParam)) || defaultTab || tabs[0]?.id || ''
  const [active, setActive] = useState<string>(initial)

  // Sync avec URL si urlParam fourni
  useEffect(() => {
    if (!urlParam) return
    const param = searchParams.get(urlParam)
    if (param && param !== active) setActive(param)
  }, [searchParams, urlParam, active])

  function handleClick(tabId: string) {
    setActive(tabId)
    if (urlParam) {
      const url = new URL(window.location.href)
      url.searchParams.set(urlParam, tabId)
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === active
            return (
              <button
                key={tab.id}
                onClick={() => handleClick(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-accent text-primary'
                    : 'border-transparent text-secondary hover:text-primary hover:border-border'
                }`}
              >
                {tab.icon && <tab.icon size={14} />}
                {tab.label}
                {tab.badge}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active panel */}
      <div>{activeTab?.content}</div>
    </div>
  )
}
