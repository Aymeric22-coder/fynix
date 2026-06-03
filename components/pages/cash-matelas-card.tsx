/**
 * `CashMatelasCard` — Server Component (Cash V1.1, Volet C.2).
 *
 * Bloc « Votre matelas de sécurité » affiché sur `/cash` immédiatement
 * sous le total. Délègue le calcul à `computeMatelasCible` (helper pur
 * V1.0) ; gère les 4 états visuels :
 *
 *   ✅ Dans la cible    : cibleBasse ≤ totalCash ≤ cibleHaute
 *   ⚠️ Sous-liquide      : totalCash < cibleBasse
 *   💰 Sur-liquide       : totalCash > cibleHaute
 *   ❓ Non applicable    : profil incomplet → CTA vers Profil
 *
 * V1.2 fermera la boucle « cash volontaire » (toggle + motif) qui
 * neutralisera l'état sur-liquide quand l'utilisateur déclare un projet
 * (apport immo, achat planifié).
 */
import Link from 'next/link'
import { Shield, AlertTriangle, Wallet, HelpCircle } from 'lucide-react'
import { computeMatelasCible } from '@/lib/cash/matelas'
import type { ProfileContext } from '@/lib/profil/getProfileContext'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  totalCash:      number
  profile:        ProfileContext
}

const PROFIL_LABEL: Record<'stable' | 'standard' | 'volatil', string> = {
  stable:   'Profil stable',
  standard: 'Profil standard',
  volatil:  'Profil volatil',
}

export function CashMatelasCard({ totalCash, profile }: Props) {
  const m = computeMatelasCible({
    chargesMensuelles:  profile.chargesMensuelles ?? 0,
    statutPro:          profile.statutPro,
    stabiliteRevenus:   profile.stabiliteRevenus,
    salaireNetMensuel:  profile.revenuMensuel ?? undefined,
  })

  // ── État « non applicable » ───────────────────────────────────────
  if (!m.applicable) {
    const isCharges = m.raisonNonApplicable === 'charges_manquantes'
    const cta = isCharges
      ? { label: 'Renseigner mes charges', href: '/profil', text: 'Renseigne tes charges mensuelles dans Profil pour estimer ta cible matelas.' }
      : { label: 'Renseigner mon statut',  href: '/profil', text: 'Renseigne ton statut professionnel dans Profil pour estimer ta cible matelas.' }
    return (
      <div className="card p-5 mb-6 flex items-start gap-4">
        <HelpCircle size={20} className="text-muted shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary mb-1">Matelas de sécurité — données manquantes</p>
          <p className="text-xs text-secondary mb-3">{cta.text}</p>
          <Link
            href={cta.href}
            className="text-xs text-accent hover:underline"
          >
            {cta.label} →
          </Link>
        </div>
      </div>
    )
  }

  // À ce stade : `applicable === true` → cibles non null
  const cibleBasse = m.cibleBasseEur as number
  const cibleHaute = m.cibleHauteEur as number

  // ── État applicable : sous-liquide / OK / sur-liquide ──────────────
  const status: 'sous' | 'ok' | 'sur' =
    totalCash < cibleBasse ? 'sous' :
    totalCash > cibleHaute ? 'sur'  : 'ok'

  const STATUS_META = {
    sous: {
      icon:    AlertTriangle,
      tone:    'text-danger',
      ring:    'border-danger/30',
      bg:      'bg-danger-muted',
      title:   'Matelas insuffisant',
      message: `Il manque ${formatCurrency(cibleBasse - totalCash, 'EUR')} pour atteindre la cible basse.`,
    },
    ok: {
      icon:    Shield,
      tone:    'text-accent',
      ring:    'border-accent/30',
      bg:      'bg-accent-muted',
      title:   'Matelas équilibré',
      message: `Tu es dans la zone cible (${formatCurrency(cibleBasse, 'EUR')} à ${formatCurrency(cibleHaute, 'EUR')}).`,
    },
    sur: {
      icon:    Wallet,
      tone:    'text-warning',
      ring:    'border-warning/30',
      bg:      'bg-warning-muted',
      title:   'Excédent de liquidité',
      message: `${formatCurrency(totalCash - cibleHaute, 'EUR')} au-delà de la cible haute — à investir potentiellement.`,
    },
  }[status]
  const Icon = STATUS_META.icon

  // Mois de salaire (info bonus, jamais en cible)
  const moisDeSalaire = profile.revenuMensuel && profile.revenuMensuel > 0
    ? totalCash / profile.revenuMensuel
    : null

  return (
    <section className={`card p-5 mb-6 border ${STATUS_META.ring}`} aria-label="Matelas de sécurité">
      <header className="flex items-start gap-3 mb-4">
        <span className={`shrink-0 p-2 rounded-lg ${STATUS_META.bg}`}>
          <Icon size={18} className={STATUS_META.tone} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-sm font-medium text-primary">{STATUS_META.title}</p>
            <p className="text-xs text-secondary">
              {PROFIL_LABEL[m.profilRisque]} — cible {m.multiplicateurMin}-{m.multiplicateurMax} mois de charges
            </p>
          </div>
          <p className={`text-xs mt-1 ${STATUS_META.tone}`}>{STATUS_META.message}</p>
        </div>
      </header>

      {/* Jauge */}
      <MatelasJauge totalCash={totalCash} cibleBasse={cibleBasse} cibleHaute={cibleHaute} />

      {/* 3 chiffres clés */}
      <dl className="grid grid-cols-3 gap-3 mt-4">
        <KpiCell label="Total cash"   value={formatCurrency(totalCash,  'EUR')} highlight />
        <KpiCell label="Cible basse"  value={formatCurrency(cibleBasse, 'EUR')} />
        <KpiCell label="Cible haute"  value={formatCurrency(cibleHaute, 'EUR')} />
      </dl>

      {moisDeSalaire !== null && (
        <p className="text-[11px] text-muted mt-3">
          ≈ {moisDeSalaire.toFixed(1)} mois de salaire net mensuel — info complémentaire,
          la cible reste calculée sur les charges.
        </p>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function KpiCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-muted">{label}</dt>
      <dd className={`text-sm financial-value mt-0.5 ${highlight ? 'text-primary font-semibold' : 'text-secondary'}`}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Jauge horizontale 3 segments (rouge / vert / orange) + curseur position
 * actuelle. Plafond visuel : `cibleHaute × 1,5` (au-delà, curseur coincé
 * à droite).
 */
function MatelasJauge({
  totalCash, cibleBasse, cibleHaute,
}: { totalCash: number; cibleBasse: number; cibleHaute: number }) {
  const cap = cibleHaute * 1.5
  const pct = (v: number) => Math.max(0, Math.min(100, (v / cap) * 100))
  const widthSous = pct(cibleBasse)
  const widthOk   = pct(cibleHaute) - pct(cibleBasse)
  const widthSur  = 100 - pct(cibleHaute)
  const cursor    = pct(totalCash)
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden flex bg-surface-2" aria-hidden>
      <div className="bg-danger/50"  style={{ width: `${widthSous}%` }} />
      <div className="bg-accent/50"  style={{ width: `${widthOk}%`   }} />
      <div className="bg-warning/50" style={{ width: `${widthSur}%`  }} />
      <div
        className="absolute top-1/2 w-0.5 h-3.5 bg-primary rounded-full"
        style={{ left: `${cursor}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  )
}
