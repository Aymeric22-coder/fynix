/**
 * Page admin : derniers feedbacks ARIA, gated par ADMIN_EMAIL env var.
 *
 * Si l'utilisateur connecte n'a pas l'email ADMIN_EMAIL -> notFound()
 * (renvoie un 404 generique, sans indiquer que la page existe).
 *
 * Permet d'identifier rapidement les reponses 👎 et le contexte pour
 * ajuster le system prompt / les tools.
 */
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'ARIA — Feedbacks (admin)' }

// Force a etre dynamique : on lit la session a chaque requete + on veut
// les feedbacks les plus recents en temps reel.
export const dynamic = 'force-dynamic'

interface FeedbackRow {
  id:         string
  rating:     number
  reason:     string | null
  created_at: string
  message_id: string
  message:    {
    content:         string
    created_at:      string
    conversation_id: string
    role:            string
    tool_calls:      unknown
  } | null
}

export default async function AriaFeedbackAdminPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
  if (!user || !adminEmail || user.email?.toLowerCase() !== adminEmail) {
    notFound()
  }

  // 50 derniers feedbacks (toutes notes) avec le message joint.
  const { data, error } = await supabase
    .from('aria_feedback')
    .select(`
      id, rating, reason, created_at, message_id,
      message:aria_messages (
        content, created_at, conversation_id, role, tool_calls
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">ARIA — Feedbacks</h1>
        <p className="text-danger">Erreur lecture : {error.message}</p>
      </div>
    )
  }

  const rows = (data ?? []) as unknown as FeedbackRow[]
  const negatifs = rows.filter((r) => r.rating === -1)
  const positifs = rows.filter((r) => r.rating === 1)

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">ARIA — Feedbacks utilisateurs</h1>
      <p className="text-secondary mb-6">
        {rows.length} dernieres notes — {negatifs.length} negatives, {positifs.length} positives.
      </p>

      {negatifs.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3 text-danger">Notes negatives 👎</h2>
          <div className="space-y-3">
            {negatifs.map((row) => (
              <FeedbackCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}

      {positifs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 positive">Notes positives 👍</h2>
          <div className="space-y-3">
            {positifs.map((row) => (
              <FeedbackCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <p className="text-secondary">Aucun feedback enregistre pour le moment.</p>
      )}
    </div>
  )
}

function FeedbackCard({ row }: { row: FeedbackRow }) {
  const icon = row.rating === 1 ? '👍' : '👎'
  const colorClass = row.rating === 1 ? 'positive' : 'negative'
  return (
    <article className="card p-4">
      <header className="flex items-center justify-between mb-2 text-sm">
        <span className={colorClass}>{icon} {formatDate(row.created_at, 'medium')}</span>
        <span className="text-secondary text-xs">conv {row.message?.conversation_id?.slice(0, 8) ?? '—'}</span>
      </header>
      {row.reason && (
        <p className="text-sm mb-2 text-primary italic">« {row.reason} »</p>
      )}
      <p className="text-sm whitespace-pre-wrap">{row.message?.content ?? '(message supprime)'}</p>
      {row.message?.tool_calls ? (
        <details className="mt-2 text-xs text-secondary">
          <summary>Tool calls</summary>
          <pre className="mt-1 overflow-x-auto">{JSON.stringify(row.message.tool_calls, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  )
}
