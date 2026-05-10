'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Check, AlertCircle } from 'lucide-react'

interface RefreshResult {
  refreshed:          number
  skipped:            number
  errors:             number
  instrumentsScanned: number
  message?:           string
}

export function RefreshPricesButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<RefreshResult | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/portfolio/refresh-prices', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setResult(json.data as RefreshResult)
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  // Auto-clear status après 5s
  if (result || error) {
    setTimeout(() => {
      if (result) setResult(null)
      if (error)  setError(null)
    }, 5000)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-surface-2 border border-border hover:border-accent text-secondary hover:text-primary transition-colors disabled:opacity-50"
        title="Rafraîchir les prix de marché"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Mise à jour…' : 'Rafraîchir'}
      </button>

      {result && (
        <div className="flex items-center gap-1.5 text-xs text-accent">
          <Check size={12} />
          <span>
            {result.refreshed} prix mis à jour
            {result.skipped > 0 && <span className="text-secondary"> · {result.skipped} ignorés</span>}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
