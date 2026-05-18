'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Mot de passe trop court (minimum 6 caracteres).')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else {
        setSuccess(true)
        setNeedsConfirmation(Boolean(data.needsConfirmation))
        if (!data.needsConfirmation) {
          router.push('/bienvenue')
          router.refresh()
        }
      }
    } catch {
      setError('Erreur de connexion. Reessaie.')
    } finally {
      setLoading(false)
    }
  }

  if (success && needsConfirmation) {
    return (
      <div className="card p-8 text-center space-y-3">
        <div className="text-4xl">&#x2709;&#xFE0F;</div>
        <p className="text-primary font-medium">Verifie ta boite mail</p>
        <p className="text-secondary text-sm">
          Un email de confirmation a ete envoye a {email}. Clique sur le lien pour activer ton compte.
        </p>
        <Link href="/login" className="text-accent text-sm hover:underline inline-block">
          Retour a la connexion
        </Link>
      </div>
    )
  }

  return (
    <div className="card p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">Creer un compte</h1>
        <p className="text-sm text-secondary mt-1">Gratuit, pas de carte bancaire.</p>
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

        <div>
          <label className="block text-sm text-secondary mb-1.5">Mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm
                       text-primary placeholder:text-muted focus:outline-none focus:border-accent
                       transition-colors"
          />
          <p className="text-xs text-muted mt-1">Minimum 6 caracteres.</p>
        </div>

        <div>
          <label className="block text-sm text-secondary mb-1.5">Confirme le mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm
                       text-primary placeholder:text-muted focus:outline-none focus:border-accent
                       transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2.5 rounded-lg
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {loading ? 'Creation...' : 'Creer mon compte'}
        </button>
      </form>

      <div className="text-center text-sm text-secondary">
        Deja un compte ?{' '}
        <Link href="/login" className="text-accent hover:underline">Se connecter</Link>
      </div>
    </div>
  )
}
