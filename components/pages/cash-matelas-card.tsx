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
  totalCash:           number
  profile:             ProfileContext
  /**
   * V1.2 Volet D — Cash effectif = `totalCash − Σ intents actives`.
   * Quand > 0 et différent de totalCash, on calcule le statut sur cette
   * valeur (et on affiche un badge sous la jauge). Le curseur reste
   * positionné sur `totalCash` brut pour préserver la lecture instantanée.
   * Si non fourni → comportement V1.1-POLISH strictement préservé.
   */
  cashEffectif?:       number
  totalIntentsActives?: number
  countIntentsActives?: number
}

const PROFIL_LABEL: Record<'stable' | 'standard' | 'volatil', string> = {
  stable:   'Profil stable',
  standard: 'Profil standard',
  volatil:  'Profil volatil',
}

export function CashMatelasCard({
  totalCash, profile,
  cashEffectif:        cashEffectifProp,
  totalIntentsActives: totalIntentsActivesProp,
  countIntentsActives: countIntentsActivesProp,
}: Props) {
  // V1.2 — Si aucune info intent fournie, `cashEffectif` = `totalCash` :
  // comportement strictement V1.1-POLISH préservé.
  const totalIntentsActives = totalIntentsActivesProp ?? 0
  const countIntentsActives = countIntentsActivesProp ?? 0
  const cashEffectif        = cashEffectifProp ?? totalCash
  const hasIntents          = totalIntentsActives > 0 && countIntentsActives > 0

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
  // V1.2 Volet D — Statut calculé sur `cashEffectif` (= brut − intents
  // actives). Un utilisateur sur-liquide qui a déclaré ses intentions
  // peut passer de « Excédent » à « Équilibré ».
  const status: 'sous' | 'ok' | 'sur' =
    cashEffectif < cibleBasse ? 'sous' :
    cashEffectif > cibleHaute ? 'sur'  : 'ok'

  const STATUS_META = {
    sous: {
      icon:    AlertTriangle,
      tone:    'text-danger',
      ring:    'border-danger/30',
      bg:      'bg-danger-muted',
      title:   'Matelas insuffisant',
      message: `Il manque ${formatCurrency(cibleBasse - cashEffectif, 'EUR')} pour atteindre la cible basse.`,
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
      message: `${formatCurrency(cashEffectif - cibleHaute, 'EUR')} au-delà de la cible haute — à investir potentiellement.`,
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

      {/* V1.2-POLISH — Jauge à 2 marqueurs :
          - Curseur principal ▼ sur cashEffectif (= matelas réel, cohérent
            avec le statut affiché).
          - Marker secondaire ○ sur totalCash brut, visible seulement
            quand hasIntents ET écart visuel suffisant. */}
      <MatelasJauge
        cashEffectif={cashEffectif}
        cashBrut={hasIntents ? totalCash : undefined}
        cibleBasse={cibleBasse}
        cibleHaute={cibleHaute}
      />

      {hasIntents && (
        <a
          href="#cash-intents"
          className="block mt-3 text-center text-[11px] text-muted hover:text-secondary transition-colors"
        >
          {formatCurrency(totalIntentsActives, 'EUR')} volontaire
          {countIntentsActives > 1 ? `s (${countIntentsActives} intentions actives)` : ' (1 intention active)'}
        </a>
      )}

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
 * Jauge horizontale 3 segments + 1 ou 2 marqueurs avec labels.
 *
 * Layout :
 *   - Ligne 1 : labels « Insuffisant / Cible / Excédent » centrés sur leur
 *     segment, plus :
 *     • Curseur PRINCIPAL ▼ sur `cashEffectif` (signal fort, plein, opaque).
 *     • Marker SECONDAIRE ○ sur `cashBrut` si fourni ET écart visuel
 *       suffisant (cf. `showBrutMarker` du helper). Discret, opacity ~60 %.
 *   - Ligne 2 : barre 3 segments aux largeurs proportionnelles.
 *   - Ligne 3 : 4 graduations chiffrées (0 / cibleBasse / cibleHaute /
 *     domainMax). Mobile : version compacte (« 15 k€ »).
 *
 * Cas 0 intent (cashBrut undefined) : 1 seul curseur, label « Cash actuel »
 * (au lieu de « Matelas effectif ») pour éviter une terminologie inutilement
 * technique. Comportement strictement identique à V1.1-POLISH.
 *
 * Évitement de chevauchement vertical : si les 2 marqueurs sont proches
 * (≤ 10 % d'écart mais ≥ MIN_GAP_PCT), on décale le marker brut vers le
 * haut pour éviter que les labels se chevauchent.
 *
 * Responsive : largeur 100 % du parent, hauteur fixe (un peu plus haute
 * que V1.1 pour accommoder 2 niveaux de labels).
 */
function MatelasJauge({
  cashEffectif, cashBrut, cibleBasse, cibleHaute,
}: {
  cashEffectif: number
  cashBrut?:    number
  cibleBasse:   number
  cibleHaute:   number
}) {
  const layout = computeJaugeMatelas({
    totalCashEur:  cashEffectif,
    cashBrutEur:   cashBrut,
    cibleBasseEur: cibleBasse,
    cibleHauteEur: cibleHaute,
  })

  // Position des labels : bornée [5 ; 95] pour ne pas déborder.
  const effectifLabelLeft = Math.max(5, Math.min(95, layout.cursorEffectifPct))
  const brutLabelLeft     = Math.max(5, Math.min(95, layout.cursorBrutPct))

  // Si les 2 marqueurs sont assez proches sur l'axe X (< 12 %), on
  // décale verticalement le marker brut pour éviter le chevauchement
  // des labels (chacun fait ~80 px de large). Au-delà, ils sont sur la
  // même ligne.
  const closeOnX = layout.showBrutMarker
    && Math.abs(layout.cursorBrutPct - layout.cursorEffectifPct) < 12

  const hasBrutMarker = layout.showBrutMarker
  // Label du curseur principal : V1.2-POLISH renomme en « Matelas effectif »
  // s'il y a des intentions actives (= il a un sens distinct du brut),
  // sinon on garde un terme neutre.
  const effectifLabel = hasBrutMarker ? 'Matelas effectif' : 'Cash actuel'

  // Hauteur du conteneur : 14 si on a 2 marqueurs avec décalage vertical,
  // 11 sinon (V1.1-POLISH = 9).
  const topPaddingClass = closeOnX ? 'pt-14' : 'pt-11'

  return (
    <div className={`relative w-full ${topPaddingClass} pb-7`} aria-hidden>
      {/* Ligne 1 — labels de segments + curseur(s) */}
      <div className={`absolute inset-x-0 top-0 ${closeOnX ? 'h-14' : 'h-11'} pointer-events-none`}>
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

        {/* Marker SECONDAIRE (brut) — rendu D'ABORD pour qu'il passe
            sous le principal en cas de superposition partielle. Décalé
            d'un cran vers le haut si proche du principal. */}
        {hasBrutMarker && (
          <div
            className={`absolute ${closeOnX ? 'top-0' : 'bottom-0'} flex flex-col items-center opacity-60`}
            style={{ left: `${brutLabelLeft}%`, transform: 'translateX(-50%)' }}
          >
            <span className="text-[10px] financial-value text-secondary whitespace-nowrap">
              {layout.cursorBrutOverflow ? '> ' : ''}{formatCurrency(cashBrut as number, 'EUR')}
            </span>
            <span className="text-[8px] uppercase tracking-widest text-muted leading-none">
              Cash total
            </span>
            <span className="text-secondary leading-none mt-0.5" aria-hidden>○</span>
          </div>
        )}

        {/* Curseur PRINCIPAL (effectif) — triangle plein. */}
        <div
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${effectifLabelLeft}%`, transform: 'translateX(-50%)' }}
        >
          <span className="text-[11px] financial-value font-semibold text-primary whitespace-nowrap">
            {layout.cursorEffectifOverflow ? '> ' : ''}{formatCurrency(cashEffectif, 'EUR')}
          </span>
          <span className="text-[8px] uppercase tracking-widest text-muted/70 leading-none">
            {effectifLabel}
          </span>
          <span className="text-primary leading-none mt-0.5" aria-hidden>▼</span>
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
