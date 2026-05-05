'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]     = useState<'signin' | 'magic'>('signin')
  const [email, setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const body = mode === 'signin'
        ? { email, password }
        : { email }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else if (data.magic) {
        setSent(true)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('Erreur de connexion. Veuillez reessayer.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className="text-4xl">&#x2709;&#xFE0F;</div>
        <p className="text-primary font-medium">Lien envoy&#233;</p>
        <p className="text-secondary text-sm">V&#233;rifiez votre bo&#238;te mail &#8212; le lien est valable 1h.</p>
        <button onClick={() => setSent(false)} className="text-accent text-sm hover:underline">
          Renvoyer
        </button>
      </div>
    )
  }

  return (
    <div className="card p-8 space-y-6">
      {/* Toggle mode */}
      <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
        {(['signin', 'magic'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null) }}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              mode === m
                ? 'bg-surface text-primary shadow-card'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {m === 'signin' ? 'Mot de passe' : 'Lien magique'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-secondary mb-1.5">Adresse e-mail</label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm
                       text-primary placeholder:text-muted focus:outline-none focus:border-accent
                       transition-colors"
          />
        </div>

        {mode === 'signin' && (
          <div>
            <label className="block text-sm text-secondary mb-1.5">Mot de passe</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm
                         text-primary placeholder:text-muted focus:outline-none focus:border-accent
                         transition-colors"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 rounded-lg
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {loading
            ? 'Connexion...'
            : mode === 'signin' ? 'Se connecter' : 'Envoyer le lien'}
        </button>
      </form>
    </div>
  )
}
