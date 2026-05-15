'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { formatCurrency } from '@/lib/utils/format'
import type { CategorySummary } from '@/lib/portfolio/categories'

interface Props {
  summaries:    CategorySummary[]
  activeId:     string
  currency?:    string
}

export function CategoryTabs({ summaries, activeId, currency = 'EUR' }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  function selectCategory(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'global') {
      params.delete('cat')
    } else {
      params.set('cat', id)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="border-b border-border mb-6">
      <div className="flex gap-1 overflow-x-auto -mb-px">
        {summaries.map((cat) => {
          const isActive = cat.id === activeId
          const isEmpty  = cat.positionsCount === 0 && cat.id !== 'global'
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              disabled={isEmpty}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                  ? 'border-accent text-primary'
                  : isEmpty
                    ? 'border-transparent text-muted cursor-not-allowed opacity-50'
                    : 'border-transparent text-secondary hover:text-primary hover:border-border'
                }
              `}
            >
              <span>{cat.label}</span>
              {cat.id !== 'global' && cat.positionsCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-accent-muted text-accent' : 'bg-surface-2 text-secondary'
                }`}>
                  {cat.positionsCount}
                </span>
              )}
              {cat.id === 'global' && cat.totalValue > 0 && (
                <span className="text-[10px] text-muted">
                  {formatCurrency(cat.totalValue, currency, { compact: true })}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
