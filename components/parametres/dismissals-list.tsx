/**
 * DismissalsList — section /parametres listant les masquages actifs
 * (V2.2-BIS ST5).
 *
 * Charge `user_alert_dismissals` côté client via supabase, affiche un
 * tableau compact et expose un bouton « Réactiver » qui DELETE la ligne.
 *
 * Recharge automatiquement après suppression pour montrer l'état à jour.
 */
'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export interface DismissalRow {
  id:               string
  alert_signature:  string
  reason_code:      string
  reason_note:      string | null
  dismissed_at:     string
  expires_at:       string | null
}

const REASON_LABELS: Record<string, string> = {
  strategie_personnelle: 'Stratégie patrimoniale assumée',
  temporaire:            'Situation temporaire',
  pro_specialiste:       'Spécialisation sur cette classe d’actif',
  reco_irrealiste:       'Recommandation non réaliste',
  autre:                 'Autre',
}

/** Libellés humains pour les signatures connues du pipeline (calc.ts + recoMensuelles.ts).
 *  Les signatures inconnues / paramétrées (`concentration_position:<id>`,
 *  `reco:fiscal-<oppId>`) tombent sur un fallback générique. */
function humanizeSignature(sig: string): string {
  if (sig === 'over_exposure_immo_net') return 'Sur-exposition immobilier net'
  if (sig === 'over_exposure_crypto')   return 'Sur-exposition crypto'
  if (sig === 'cash_dormant_6m')        return 'Cash dormant (> 6 mois)'
  if (sig.startsWith('concentration_position:')) return 'Concentration sur une position'
  if (sig === 'reco:rebalance-classes')          return 'Recommandation : rebalancement d’allocation'
  if (sig === 'reco:invest-cash-dormant')        return 'Recommandation : investir le cash dormant'
  if (sig === 'reco:dca-retard')                  return 'Recommandation : DCA en retard'
  if (sig.startsWith('reco:fiscal-'))             return 'Recommandation fiscale'
  return sig
}

function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso }
}

export function DismissalsList() {
  const [rows,    setRows]    = useState<DismissalRow[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [busyId,  setBusyId]  = useState<string | null>(null)

  async function fetchAll() {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Non authentifié'); setRows([]); return }
    const { data, error: dbError } = await supabase
      .from('user_alert_dismissals')
      .select('id,alert_signature,reason_code,reason_note,dismissed_at,expires_at')
      .eq('user_id', user.id)
      .order('dismissed_at', { ascending: false })
    if (dbError) { setError(dbError.message); return }
    // Filtre les expirés côté client (cohérent avec le pipeline).
    const now = Date.now()
    const active = (data ?? []).filter((r) => {
      if (!r.expires_at) return true
      const ms = new Date(r.expires_at as string).getTime()
      return Number.isFinite(ms) && ms > now
    }) as DismissalRow[]
    setRows(active)
  }

  useEffect(() => { void fetchAll() }, [])

  async function reactivate(id: string) {
    setBusyId(id)
    setError(null)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('user_alert_dismissals')
      .delete()
      .eq('id', id)
    setBusyId(null)
    if (dbError) { setError(dbError.message); return }
    startTransition(() => { void fetchAll() })
  }

  return (
    <section className="card p-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={16} className="text-accent" />
        <h2 className="text-base font-semibold text-primary">Alertes et recommandations masquées</h2>
      </div>
      <p className="text-xs text-secondary mb-4">
        Items que tu as explicitement choisi de masquer sur le Dashboard. Réactive-les à tout moment.
      </p>

      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-secondary py-4">
          <Loader2 size={14} className="animate-spin" />
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-secondary py-3">
          Aucune alerte ou recommandation masquée pour l&apos;instant.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-primary font-medium">{humanizeSignature(r.alert_signature)}</p>
                <p className="text-xs text-secondary mt-0.5">
                  {REASON_LABELS[r.reason_code] ?? r.reason_code}
                  {r.reason_note && <> · <span className="italic">{r.reason_note}</span></>}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  Masqué le {formatDateFr(r.dismissed_at)}
                  {' · '}
                  {r.expires_at
                    ? <>jusqu&apos;au {formatDateFr(r.expires_at)}</>
                    : 'définitivement'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                loading={busyId === r.id || pending}
                onClick={() => reactivate(r.id)}
              >
                Réactiver
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
