'use client'

import { useState, useTransition } from 'react'
import { signInAction, magicLinkAction } from './actions'

export default function LoginPage() {
  const [mode, setMode]   = useState<'signin' | 'magic'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent]   = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = mode === 'signin'
        ? await signInAction(formData)
        : await magicLinkAction(formData)

      if (result?.error) {
        setError(result.error)
      } else if (mode === 'magic') {
        setSent(true)
      }
      // Si signin OK, signInAction fait redirect() côté serveur
    })
  }

  if (sent) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className="text-4xl">✉️</div>
        <p className="text-primary font-medium">Lien envoyé</p>
        <p className="text-secondary text-sm">Vérifiez votre boîte mail — le lien est valable 1h.</p>
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
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm
                       text-primary placeholder:text-muted focus:outline-none focus:border-accent
                       transition-colors"
          />
        </div>

        {mode === 'signin' && (
          <div>
            <label className="block text-sm text-secondary mb-1.5">Mot de passe</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
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
          disabled={isPending}
          className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 rounded-lg
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isPending
            ? 'Connexion…'
            : mode === 'signin' ? 'Se connecter' : 'Envoyer le lien'}
        </button>
      </form>
    </div>
  )
}
