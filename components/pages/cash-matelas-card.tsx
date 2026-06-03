/**
 * `CashMatelasCard` — Server Component (Cash V1.1, Volet C.2 + V1.1-POLISH).
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
 * V1.1-POLISH — Refonte de la jauge horizontale :
 *   - Graduations chiffrées sous la barre (0 / cibleBasse / cibleHaute /
 *     cibleHaute × 1,5).
 *   - Labels « Insuffisant / Cible / Excédent » au-dessus de chaque segment.
 *   - Curseur triangulaire avec label montant.
 *   - Suppression des 3 colonnes redondantes (Total / Cible basse / Cible
 *     haute) — l'info est maintenant lisible directement sur la jauge.
 *
 * V1.2 fermera la boucle « cash volontaire » (toggle + motif) qui
 * neutralisera l'état sur-liquide quand l'utilisateur déclare un projet
 * (apport immo, achat planifié).
 */
import Link from 'next/link'
import { Shield, AlertTriangle, Wallet, HelpCircle } from 'lucide-react'
import { computeMatelasCible } from '@/lib/cash/matelas'
import { computeJaugeMatelas } from '@/lib/cash/jauge'
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

      {/* V1.1-POLISH — Jauge auto-suffisante */}
      <MatelasJauge totalCash={totalCash} cibleBasse={cibleBasse} cibleHaute={cibleHaute} />

      {moisDeSalaire !== null && (
        <p className="text-[11px] text-muted mt-4 text-center">
          ≈ {moisDeSalaire.toFixed(1)} mois de salaire net mensuel — info complémentaire,
          la cible reste calculée sur les charges.
        </p>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */

/**
 * Jauge horizontale 3 segments + curseur triangulaire avec label.
 *
 * Layout :
 *   - Ligne 1 : labels « Insuffisant / Cible / Excédent » centrés sur leur
 *     segment, plus le triangle ▼ + label montant aligné sur le curseur.
 *   - Ligne 2 : barre 3 segments aux largeurs proportionnelles à la plage
 *     réelle (cf. `computeJaugeMatelas`).
 *   - Ligne 3 : 4 graduations chiffrées (0 / cibleBasse / cibleHaute /
 *     domainMax) centrées sur leur position. Sur mobile (< sm), version
 *     compacte (« 15 k€ »).
 *
 * Responsive : largeur 100 % du parent, hauteur fixe.
 */
function MatelasJauge({
  totalCash, cibleBasse, cibleHaute,
}: { totalCash: number; cibleBasse: number; cibleHaute: number }) {
  const layout = computeJaugeMatelas({
    totalCashEur:  totalCash,
    cibleBasseEur: cibleBasse,
    cibleHauteEur: cibleHaute,
  })

  // Position du LABEL au-dessus du curseur. On la borne entre 5 % et 95 %
  // pour éviter que le label déborde du conteneur.
  const labelLeftPct = Math.max(5, Math.min(95, layout.cursorPct))

  return (
    <div className="relative w-full pt-9 pb-7" aria-hidden>
      {/* Ligne 1 — labels de segments + curseur */}
      <div className="absolute inset-x-0 top-0 h-9 pointer-events-none">
        {/* Labels segments centrés sur chaque segment, opacity réduite */}
        <span
          className="absolute top-1 text-[10px] uppercase tracking-widest text-muted/70"
          style={{ left: `${layout.segments.rouge.widthPct / 2}%`, transform: 'translateX(-50%)' }}
        >
          Insuffisant
        </span>
        <span
          className="absolute top-1 text-[10px] uppercase tracking-widest text-accent/80"
          style={{
            left: `${layout.segments.rouge.widthPct + layout.segments.vert.widthPct / 2}%`,
            transform: 'translateX(-50%)',
          }}
        >
          Cible
        </span>
        <span
          className="absolute top-1 text-[10px] uppercase tracking-widest text-muted/70"
          style={{
            left: `${layout.segments.rouge.widthPct + layout.segments.vert.widthPct + layout.segments.orange.widthPct / 2}%`,
            transform: 'translateX(-50%)',
          }}
        >
          Excédent
        </span>

        {/* Curseur triangulaire + label montant */}
        <div
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${labelLeftPct}%`, transform: 'translateX(-50%)' }}
        >
          <span className="text-[11px] financial-value font-semibold text-primary whitespace-nowrap">
            {layout.overflow ? '> ' : ''}{formatCurrency(totalCash, 'EUR')}
          </span>
          <span className="text-primary leading-none -mt-0.5" aria-hidden>▼</span>
        </div>
      </div>

      {/* Ligne 2 — barre 3 segments avec frontières fines */}
      <div className="relative w-full h-3 flex overflow-hidden">
        <div
          className="bg-rose-500/80 rounded-l-full"
          style={{ width: `${layout.segments.rouge.widthPct}%` }}
        />
        <span className="w-px bg-bg/40" aria-hidden />
        <div
          className="bg-accent/85"
          style={{ width: `${layout.segments.vert.widthPct}%` }}
        />
        <span className="w-px bg-bg/40" aria-hidden />
        <div
          className="bg-amber-500/80 rounded-r-full"
          style={{ width: `${layout.segments.orange.widthPct}%` }}
        />
      </div>

      {/* Ligne 3 — graduations chiffrées (responsive) */}
      <div className="absolute inset-x-0 bottom-0 h-6 pointer-events-none">
        {layout.graduationsPct.map((pct, i) => {
          // `noUncheckedIndexedAccess` → l'indexation typée renvoie
          // `number | undefined`. Les 2 tableaux ont la MEME longueur
          // (4) par construction du helper, donc fallback à 0 sûr.
          const value = layout.graduations[i] ?? 0
          return (
            <span
              key={i}
              className="absolute top-1 text-[10px] financial-value text-muted/60 whitespace-nowrap"
              style={{
                left: `${pct}%`,
                // Premier et dernier : aligner à gauche/droite pour ne pas couper
                transform: i === 0 ? 'translateX(0)' :
                            i === layout.graduationsPct.length - 1 ? 'translateX(-100%)' :
                            'translateX(-50%)',
              }}
            >
              <FormattedGraduation value={value} />
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Affiche un montant de graduation en deux versions selon le viewport :
 *   - mobile (< sm) : compact (« 15 k€ »)
 *   - desktop      : forme complète (« 15 075 € »)
 */
function FormattedGraduation({ value }: { value: number }) {
  return (
    <>
      <span className="sm:hidden">{formatCurrency(value, 'EUR', { compact: true })}</span>
      <span className="hidden sm:inline">{formatCurrency(value, 'EUR')}</span>
    </>
  )
}
