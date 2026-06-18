/**
 * Section "Projection FIRE interactive" Phase 9 — version refondue :
 *
 *   1. Graphique stacked area (4 composantes : financier, immo existant,
 *      immo futur, cash)
 *   2. 5 cartes résumé (indépendance, patrimoine âge cible, revenu
 *      passif, effort mensuel, levier immobilier)
 *   3. 5 sliders (épargne DCA, rendement financier, revenu cible,
 *      appréciation immo, inflation loyers)
 *   4. Simulateur d'acquisitions futures (jusqu'à 5)
 *
 * Toute la logique métier vient de `lib/analyse/projectionFIRE.ts`.
 * Recalcul instantané (< 100 ms) via useMemo à chaque changement.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Plus, Sparkles, Target, TrendingUp, Wallet, Building2, Check, Loader2, Radio } from 'lucide-react'
import {
  projectionGlobale, projectionFIREIntervalle, calculerImpactAcquisition,
  calculerRendementPortefeuille, estimerTauxFiscalitePortefeuille,
  SWR_DEFAUT_PCT, INFLATION_DEFAUT_PCT,
} from '@/lib/analyse/projectionFIRE'
import { normalizeFireType } from '@/lib/profil/calculs'
import { adjustCibleFamilleDetail } from '@/lib/profil/cibleFamille'
import { formatCurrency } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { CibleFoyer } from '@/components/profil/CibleFoyer'
import { AcquisitionFutureForm } from './AcquisitionFutureForm'
import { StressTestPanel } from './StressTestPanel'
import { useFutureAcquisitions } from '@/hooks/use-future-acquisitions'
import type { PatrimoineComplet, AcquisitionFuture, JalonFIRE } from '@/types/analyse'
import {
  buildLifeEventAriaLabel, buildLifeEventBreakdown, hasActiveLifeEvents,
} from '@/lib/profil/lifeEventsExplain'
import { lifeEventDateToYearMonth, LIFE_EVENT_LABELS } from '@/lib/profil/lifeEventsConstants'

interface Props {
  patrimoine: PatrimoineComplet
  /** Horodatage du dernier refresh patrimoine (epoch ms) — affiche le
   *  badge "En direct • HH:MM" en haut de la section quand fourni. */
  lastUpdatedAt?: number | null
}

const COLOR_FIN  = '#10b981'   // emerald
const COLOR_IMMO = '#E8B84B'   // or
const COLOR_ACQ  = '#3b82f6'   // bleu
const COLOR_CASH = '#71717a'   // muted

/**
 * Tooltip custom du graphe de projection.
 *
 * Affiche en première ligne le **Patrimoine total** (somme de toutes les
 * composantes présentes dans le `payload` Recharts), en gras et séparé des
 * détails, puis chaque composante non nulle. Le total est calculé ici, au
 * rendu — aucune clé `total` n'existe dans les données source.
 */
interface TooltipEntry {
  name?:     string
  value?:    number
  color?:    string
  dataKey?:  string | number
}
function ProjectionTooltip(props: {
  active?:  boolean
  payload?: TooltipEntry[]
  label?:   string | number
}) {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
  const components = payload.filter((entry) => (entry.value ?? 0) !== 0)

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ color: '#f4f4f5', fontSize: 11, marginBottom: 6 }}>{`${label} ans`}</p>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', gap: 16,
          paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #2a2a2a',
        }}
      >
        <span style={{ color: '#f4f4f5', fontSize: 12, fontWeight: 700 }}>Patrimoine total</span>
        <span style={{ color: '#f4f4f5', fontSize: 12, fontWeight: 700 }}>
          {formatCurrency(total, 'EUR', { compact: true })}
        </span>
      </div>
      {components.map((entry) => (
        <div
          key={String(entry.dataKey)}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12, lineHeight: '18px' }}
        >
          <span style={{ color: entry.color ?? '#71717a' }}>{entry.name}</span>
          <span style={{ color: '#f4f4f5' }}>{formatCurrency(entry.value ?? 0, 'EUR', { compact: true })}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Label custom d'une `ReferenceLine` verticale : affiche UNIQUEMENT une icône
 * (emoji) au sommet (ou en bas) de la ligne, et expose le texte complet via un
 * `<title>` SVG natif — tooltip navigateur au survol, zéro dépendance.
 *
 * `dy` permet de décaler verticalement l'icône pour désamorcer les
 * chevauchements quand plusieurs jalons tombent dans la même zone temporelle.
 * Recharts injecte `viewBox` (position pixel de la ligne dans la zone de tracé).
 */
function RefLineLabel(props: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number }
  icon:     string
  title:    string
  fill:     string
  dy?:      number
  bottom?:  boolean
}) {
  const { viewBox, icon, title, fill, dy = 0, bottom = false } = props
  const x   = viewBox?.x ?? 0
  const top = viewBox?.y ?? 0
  const h   = viewBox?.height ?? 0
  const y   = bottom ? top + h - 6 : top + 14
  return (
    <g style={{ cursor: 'default' }}>
      <title>{title}</title>
      <text x={x} y={y} dy={dy} textAnchor="middle" fontSize={14} fill={fill}>
        {icon}
      </text>
    </g>
  )
}

/** Couleurs des jalons sur le graphique (Sprint 3 Tâche 5). */
const JALON_COLOR: Record<JalonFIRE['type'], string> = {
  fire:       '#10b981',   // emerald — atteinte FIRE
  lean_fire:  '#84cc16',   // lime — Lean FIRE (70 % cible)
  debt:       '#3b82f6',   // bleu — crédit soldé
  milestone:  '#9ca3af',   // gris — paliers patrimoine 100k/500k/1M
}

function defaultAcquisitionPayload(): Omit<AcquisitionFuture, 'id'> {
  return {
    nom: 'Nouvelle acquisition',
    dans_combien_annees: 3,
    prix_achat: 180000, frais_notaire_pct: 8, apport: 36000,
    taux_interet: 3.5, duree_credit_ans: 20,
    type: 'locatif', loyer_brut_mensuel: 900, taux_vacance_pct: 5,
    charges_mensuelles: 100, appreciation_annuelle_pct: 2,
  }
}

function formatTimeHM(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function ProjectionFIRE({ patrimoine, lastUpdatedAt }: Props) {
  const fi = patrimoine.fireInputs

  // Cas profil incomplet — early return AVANT le composant Inner pour
  // respecter les rules-of-hooks (les hooks vivent dans Inner).
  if (!fi.age || !fi.age_cible || fi.revenu_passif_cible <= 0) {
    return (
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-2">Ta trajectoire vers l&apos;indépendance</p>
        <p className="text-sm text-secondary">
          Complétez votre profil (âge, âge cible, revenu passif visé) dans <a href="/profil" className="text-accent underline">Profil investisseur</a> pour activer la projection.
        </p>
      </div>
    )
  }

  return <ProjectionFIREInner patrimoine={patrimoine} lastUpdatedAt={lastUpdatedAt} />
}

function ProjectionFIREInner({ patrimoine, lastUpdatedAt }: Props) {
  // Garanti par le early return du wrapper ProjectionFIRE : age et age_cible
  // sont non-null et revenu_passif_cible > 0. On force le narrowing.
  const fi = patrimoine.fireInputs as typeof patrimoine.fireInputs & {
    age: number
    age_cible: number
  }

  // ── État local sliders ──────────────────────────────────────────
  const rendementDefaut = Math.max(3, Math.min(12, calculerRendementPortefeuille(patrimoine) || 7))
  // SWR défaut selon fire_type du profil (lean/fat = 3.5 %, sinon 4 %)
  const swrDefaut = (() => {
    const t = normalizeFireType((fi as { fire_type?: string | null }).fire_type)
    if (t === 'lean' || t === 'fat') return 3.5
    return SWR_DEFAUT_PCT
  })()
  // Taux fiscalité portefeuille déduit des enveloppes (PEA / AV / CTO).
  const tauxFiscalDefaut = estimerTauxFiscalitePortefeuille(fi.enveloppes)

  const [epargne,           setEpargne]           = useState<number>(fi.epargne_mensuelle)
  const [rendement,         setRendement]         = useState<number>(rendementDefaut)
  // QW9 — Le slider édite la cible BRUTE (= ce que l'utilisateur a saisi
  // dans le wizard). QW9-bis : le `detailLive` est RECALCULÉ à chaque drag
  // depuis la valeur du slider + les inputs profil bruts (situation, enfants,
  // revenu_conjoint), de sorte que le bonus couple (+50 % de la cible)
  // bouge avec le slider — pas figé sur la cible saisie initialement.
  const [revenuCible,       setRevenuCible]       = useState<number>(fi.revenu_passif_cible)
  const detailLive = useMemo(
    () => adjustCibleFamilleDetail({
      enfants:             fi.enfants,
      situation_familiale: fi.situation_familiale,
      revenu_conjoint:     fi.revenu_conjoint,
      revenu_passif_cible: revenuCible,
    }),
    [revenuCible, fi.enfants, fi.situation_familiale, fi.revenu_conjoint],
  )
  const [appreciationImmo,  setAppreciationImmo]  = useState<number>(2)
  const [inflationLoyers,   setInflationLoyers]   = useState<number>(1.5)
  // Sprint 3 sliders
  const [inflationGenerale, setInflationGenerale] = useState<number>(INFLATION_DEFAUT_PCT)
  const [swr,               setSwr]               = useState<number>(swrDefaut)
  const [epargneCroissance, setEpargneCroissance] = useState<number>(2)

  // Acquisitions persistees en DB (hook + realtime).
  const {
    acquisitions,
    loading: loadingAcquisitions,
    saving:  savingAcquisitions,
    error:   acquisitionsError,
    add:     addAcquisition,
    update:  updateAcquisition,
    remove:  removeAcquisition,
  } = useFutureAcquisitions()

  // ── Projection globale ─────────────────────────────────────────
  const baseInputs = useMemo(() => ({
    ageActuel:                 fi.age!,
    ageCible:                  fi.age_cible!,
    // QW9-bis — Cible effective = detailLive.ajuste, RECALCULÉ en live à
    // partir de la valeur du slider. Le bonus couple bouge donc avec le
    // slider (50 % de la cible courante), les enfants restent à +300 €/N.
    revenuPassifCible:         detailLive.ajuste,
    epargneMensuelle:          epargne,
    rendementCentral:          rendement,
    appreciationImmoPct:       appreciationImmo,
    inflationLoyersPct:        inflationLoyers,
    inflationPct:              inflationGenerale,
    swrPct:                    swr,
    epargneCroissanceAnnuellePct:  epargneCroissance,
    tauxFiscalitePortefeuillePct:  tauxFiscalDefaut,
    patrimoineFinancierActuel: patrimoine.totalPortefeuille,
    cashActuel:                patrimoine.totalCash,
    biensExistants:            patrimoine.biens,
    acquisitionsFutures:       acquisitions,
  }), [
    // revenuCible n'est pas listé : il influence baseInputs uniquement via
    // detailLive.ajuste (cf. useMemo plus haut qui dépend de revenuCible),
    // qui est déjà dans les deps ci-dessous. Inclure les 2 = warning ESLint.
    fi.age, fi.age_cible, detailLive.ajuste, epargne, rendement,
    appreciationImmo, inflationLoyers, inflationGenerale, swr, epargneCroissance,
    tauxFiscalDefaut, patrimoine, acquisitions,
  ])
  const result   = useMemo(() => projectionGlobale(baseInputs),       [baseInputs])
  const interval = useMemo(() => projectionFIREIntervalle(baseInputs), [baseInputs])

  // Texte de l'âge d'indépendance : intervalle [optimiste–pessimiste]
  // (médiane M) si les 3 scénarios convergent, sinon fallback médian seul.
  const hasInterval = interval.age_fire_optimiste !== null
                   && interval.age_fire_pessimiste !== null
                   && interval.age_fire_median !== null
  const ageIndepText = hasInterval
    ? `${interval.age_fire_optimiste}–${interval.age_fire_pessimiste} ans`
    : result.ageIndependanceCentral !== null
      ? `${result.ageIndependanceCentral} ans`
      : 'Hors horizon'
  const ageIndepSub = hasInterval
    ? `médiane ${interval.age_fire_median} ans`
    : null

  const ecartText = result.ecartObjectif === null
    ? '—'
    : result.ecartObjectif <= 0
    ? `${-result.ecartObjectif} an${-result.ecartObjectif > 1 ? 's' : ''} d'avance`
    : `${result.ecartObjectif} an${result.ecartObjectif > 1 ? 's' : ''} de retard`
  const onTime = result.ageIndependanceCentral !== null && result.ageIndependanceCentral <= fi.age_cible

  const intervalTooltip =
    `Hypothèses : rendement médian ${rendement.toFixed(1)} %/an, optimiste +1,5 %, pessimiste −1,5 %. `
    + `Cible indexée sur ${inflationGenerale.toFixed(1)} %/an d'inflation, SWR ${swr.toFixed(1)} %. `
    + `Les performances passées ne préjugent pas des performances futures.`

  // Décalage vertical alterné des icônes de jalons quand deux d'entre eux
  // tombent à ≤ 2 ans d'écart (jalons déjà triés par âge) — évite que les
  // emojis se superposent sans toucher aux lignes verticales elles-mêmes.
  const jalonOffsets: number[] = []
  for (let i = 0; i < result.jalons.length; i++) {
    const cur  = result.jalons[i]
    const prev = result.jalons[i - 1]
    const prevOff = jalonOffsets[i - 1] ?? 0
    jalonOffsets.push(cur && prev && Math.abs(cur.age - prev.age) <= 2 ? (prevOff === 0 ? -18 : 0) : 0)
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Ta trajectoire vers l&apos;indépendance</p>
          <p className="text-xs text-muted mt-0.5">4 composantes — financier, immo existant, acquisitions futures, cash</p>
        </div>
        {lastUpdatedAt != null && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted whitespace-nowrap">
            <Radio size={11} className="text-accent animate-pulse" />
            <span>En direct · {formatTimeHM(lastUpdatedAt)}</span>
          </div>
        )}
      </div>

      {/* ─── 5 cartes résumé ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <SummaryCard
          icon={<Sparkles size={12} className="text-accent" />}
          label="Indépendance"
          subLabel={ageIndepSub ?? undefined}
          value={ageIndepText}
          sub={ecartText}
          accent={onTime ? 'success' : 'warning'}
          tooltip={intervalTooltip}
        />
        <SummaryCard
          icon={<Wallet size={12} className="text-accent" />}
          label={`Patrimoine à ${fi.age_cible} ans`}
          value={formatCurrency(result.patrimoineAgeCible, 'EUR', { compact: true })}
          sub={`fin ${formatCurrency(result.detailsAgeCible.financier, 'EUR', { compact: true })} · immo ${formatCurrency(result.detailsAgeCible.equityImmoExistant + result.detailsAgeCible.equityImmoFuture, 'EUR', { compact: true })}`}
          details={[
            { label: `Cible avec SWR ${swr.toFixed(1)} %`,
              value: formatCurrency(result.ciblePatrimoineAjusteeInflation, 'EUR', { compact: true }) },
          ]}
          footnote={`Cible ajustée à l'inflation ${inflationGenerale.toFixed(1)} %/an`}
        />
        {(() => {
          // Sprint 3 Tâche 2 : on affiche NET en valeur principale,
          // brut en sous-texte. Comparaison cible vs net = vrai signal.
          const netM   = result.revenuPassifNetProjete
          const brutM  = result.revenuPassifBrutProjete
          const cibleM = result.cibleRevenuMensuelEnEurosFuturs
          const objectifAtteint = netM >= cibleM
          const delta = cibleM - netM
          return (
            <SummaryCard
              icon={<Target size={12} className="text-accent" />}
              label={`Revenu passif à ${fi.age_cible} ans`}
              subLabel="net après impôts estimés"
              value={formatCurrency(netM, 'EUR', { decimals: 0 }) + '/m'}
              accent={objectifAtteint ? 'success' : 'warning'}
              details={[
                { label: 'Brut avant impôts',
                  value: formatCurrency(brutM, 'EUR', { decimals: 0 }) + '/m' },
                { label: `Pression fiscale estimée`,
                  value: `${result.tauxPressionFiscaleEstime.toFixed(1)} %` },
                { label: `Cible (€ futurs)`,
                  value: formatCurrency(cibleM, 'EUR', { decimals: 0 }) + '/m' },
              ]}
              footnote={objectifAtteint
                ? '✓ Objectif atteint en net'
                : `Manque ${formatCurrency(delta, 'EUR', { decimals: 0 })}/m pour atteindre la cible`}
            />
          )
        })()}
        <SummaryCard
          icon={<TrendingUp size={12} className="text-secondary" />}
          label="Effort mensuel"
          value={formatCurrency(epargne + patrimoine.mensualitesImmoTotal, 'EUR', { decimals: 0 }) + '/m'}
          sub={`DCA ${formatCurrency(epargne, 'EUR', { decimals: 0 })} + immo ${formatCurrency(patrimoine.mensualitesImmoTotal, 'EUR', { decimals: 0 })}`}
        />
        {(() => {
          const valeur       = result.detailsAgeCible.valeurBruteImmo
          const credit       = result.detailsAgeCible.creditRestantImmo
          const equity       = result.detailsAgeCible.equityImmoExistant + result.detailsAgeCible.equityImmoFuture
          const ansCredit    = Math.max(0, fi.age_cible! - fi.age!)
          return (
            <SummaryCard
              icon={<Building2 size={12} className="text-amber-400" />}
              label={`Immo à ${fi.age_cible} ans`}
              subLabel="Patrimoine immo projeté"
              value={formatCurrency(equity, 'EUR', { compact: true })}
              accent={equity > 0 ? 'success' : undefined}
              details={[
                { label: 'Valeur projetée', value: formatCurrency(valeur, 'EUR', { compact: true }) },
                { label: 'Capital restant', value: formatCurrency(credit, 'EUR', { compact: true }) },
                { label: 'Equity nette',    value: formatCurrency(equity, 'EUR', { compact: true }) },
              ]}
              footnote={valeur > 0 ? `Le crédit a travaillé pour vous pendant ${ansCredit} ans` : undefined}
            />
          )
        })()}
      </div>

      {/* ─── Info inflation (Sprint 3 Tâche 1) ───
          Affiche ce que représente la cible saisie en euros futurs à
          l'âge cible, pour rendre tangible l'effet de l'inflation. */}
      <div className="mb-4 bg-surface-2 border border-border rounded-lg px-3.5 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-secondary">
          Cible ajustée à l&apos;inflation :
        </span>
        <span className="text-xs text-primary financial-value font-medium">
          {formatCurrency(result.cibleRevenuMensuelEnEurosFuturs, 'EUR', { decimals: 0 })}/m
        </span>
        <span className="text-xs text-muted">
          en euros {fi.age_cible} (vous saisissez {formatCurrency(revenuCible, 'EUR', { decimals: 0 })}/m en €&nbsp;d&apos;aujourd&apos;hui)
        </span>
        <span
          className="cursor-help select-none text-muted text-xs ml-auto"
          title={`Avec ${inflationGenerale.toFixed(1)} % d'inflation/an pendant ${Math.max(0, (fi.age_cible ?? 0) - (fi.age ?? 0))} ans, ${formatCurrency(revenuCible, 'EUR', { decimals: 0 })} d'aujourd'hui équivalent à ${formatCurrency(result.cibleRevenuMensuelEnEurosFuturs, 'EUR', { decimals: 0 })} en euros futurs (même pouvoir d'achat).`}
        >
          ⓘ
        </span>
      </div>

      {/* CS5 — Bandeau évènements de vie pris en compte par le snapshot
            serveur. La projection LOCALE (sliders) ne les recompute pas
            en live ; les ReferenceLine ci-dessous matérialisent leur date.  */}
      {hasActiveLifeEvents(patrimoine.lifeEvents) && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent-muted/30 p-3">
          <p className="text-xs text-secondary leading-relaxed">
            <span className="text-primary font-medium">Ta projection FIRE </span>
            {buildLifeEventAriaLabel(patrimoine.lifeEvents)}.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {buildLifeEventBreakdown(patrimoine.lifeEvents).map((b) => (
              <span
                key={b.text}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 border border-border text-[11px] text-secondary"
              >
                {b.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Graphique stacked area ─── */}
      <div style={{ width: '100%', height: 600 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={result.points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gFin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_FIN} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_FIN} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gImmo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_IMMO} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_IMMO} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gAcq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_ACQ} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_ACQ} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_CASH} stopOpacity={0.5} />
                <stop offset="100%" stopColor={COLOR_CASH} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#222" strokeDasharray="3 3" />
            <XAxis dataKey="age" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis tickFormatter={(v) => formatCurrency(v as number, 'EUR', { compact: true })} tick={{ fill: '#71717a', fontSize: 11 }} width={70} />
            <Tooltip content={<ProjectionTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
            <Area type="monotone" stackId="1" dataKey="patrimoineFinancier" name="Financier"        stroke={COLOR_FIN}  fill="url(#gFin)"  strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="equityImmoExistant"  name="Immo existant"    stroke={COLOR_IMMO} fill="url(#gImmo)" strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="equityImmoFuture"    name="Acquisitions"     stroke={COLOR_ACQ}  fill="url(#gAcq)"  strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="cash"                name="Cash"             stroke={COLOR_CASH} fill="url(#gCash)" strokeWidth={1.5} />
            <ReferenceLine
              x={fi.age_cible}
              stroke="#71717a"
              strokeDasharray="3 3"
              label={<RefLineLabel icon="🏁" title={`Âge cible · ${fi.age_cible} ans`} fill="#71717a" />}
            />
            {/* Sprint 3 Tâche 5 — jalons détectés automatiquement.
                Label réduit à l'emoji (1er token du libellé), texte complet
                dans le <title> SVG au survol. */}
            {result.jalons.map((j, i) => (
              <ReferenceLine
                key={`${j.type}-${j.age}-${i}`}
                x={j.age}
                stroke={JALON_COLOR[j.type]}
                strokeDasharray={j.type === 'fire' ? '0' : '4 4'}
                strokeWidth={j.type === 'fire' ? 2 : 1}
                label={
                  <RefLineLabel
                    icon={j.label.split(' ')[0] ?? j.label}
                    title={`${j.label} · ${j.age} ans`}
                    fill={JALON_COLOR[j.type]}
                    dy={jalonOffsets[i] ?? 0}
                  />
                }
              />
            ))}
            {/* CS5 — ReferenceLine pour chaque évènement de vie actif. */}
            {patrimoine.lifeEvents.filter((e) => e.is_active).map((e) => {
              const { year } = lifeEventDateToYearMonth(e.occurrence_date)
              if (year === null || fi.age === null) return null
              const age = (fi.age) + (year - new Date().getFullYear())
              return (
                <ReferenceLine
                  key={`lev-${e.id}`}
                  x={age}
                  stroke="#a78bfa"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={
                    <RefLineLabel
                      icon={
                        e.type === 'capital_exceptionnel' ? '💰' :
                        e.type === 'retraite' ? '🏖' :
                        e.type === 'achat_rp' ? '🏠' : '👶'
                      }
                      title={`${LIFE_EVENT_LABELS[e.type]}${e.label ? ` (${e.label})` : ''} · ${age} ans`}
                      fill="#a78bfa"
                      bottom
                    />
                  }
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Timeline horizontale des jalons sous le graphique */}
      {result.jalons.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-secondary uppercase tracking-widest text-[10px]">Jalons</span>
          {result.jalons.map((j, i) => (
            <span
              key={`tl-${j.type}-${j.age}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 border border-border"
              style={{ borderColor: `${JALON_COLOR[j.type]}40` }}
              title={`${j.label} à ${j.age} ans (dans ${j.age - (fi.age ?? 0)} ans)`}
            >
              <span style={{ color: JALON_COLOR[j.type] }} className="font-medium">{j.label}</span>
              <span className="text-muted financial-value">{j.age}&thinsp;ans</span>
            </span>
          ))}
        </div>
      )}

      {/* ─── Warnings éventuels ─── */}
      {result.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-warning bg-warning-muted border border-warning/30 rounded-lg px-3 py-1.5">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ─── Sliders (5 legacy + 3 Sprint 3) ─── */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Slider label="Épargne mensuelle DCA"  value={epargne}          min={0}    max={5000}  step={50}
                format={(v) => formatCurrency(v, 'EUR', { decimals: 0 })} onChange={setEpargne} />
        <Slider label="Rendement marchés"      value={rendement}        min={3}    max={12}    step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setRendement} />
        <div className="flex flex-col gap-2 min-w-0">
          <Slider label="Revenu passif cible"    value={revenuCible}      min={1000} max={10000} step={100}
                  format={(v) => `${formatCurrency(v, 'EUR', { decimals: 0 })}/m`} onChange={setRevenuCible} />
          {/* QW9-bis — Badge "Pour ton foyer" recompose en live le delta
              depuis la valeur du slider. Le composant retourne null si
              !hasAdjustment (célibataire 0 enfant) → aucun bruit visuel. */}
          <CibleFoyer detail={detailLive} variant="inline" />
        </div>
        <Slider label="Appréciation immo"      value={appreciationImmo} min={0}    max={5}     step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setAppreciationImmo} />
        <Slider label="Inflation loyers"       value={inflationLoyers}  min={0}    max={4}     step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setInflationLoyers} />
        {/* Sprint 3 — 3 nouveaux sliders */}
        <Slider label="Inflation générale"     value={inflationGenerale} min={0}    max={5}    step={0.1}
                format={(v) => `${v.toFixed(1)} %`} onChange={setInflationGenerale}
                tooltip="Inflation moyenne attendue. Indexe votre cible de revenu passif : 3 000 €/mois aujourd'hui vaudront moins en pouvoir d'achat dans 20 ans." />
        <Slider label="Taux de retrait (SWR)"  value={swr}              min={2.5}  max={5}     step={0.1}
                format={(v) => `${v.toFixed(1)} %`} onChange={setSwr}
                tooltip="Le taux de retrait annuel sécurisé sur votre patrimoine. 4 % = règle des 25× (Trinity Study). Plus conservateur (3-3,5 %) = patrimoine cible plus élevé." />
        <Slider label="Progression épargne/an" value={epargneCroissance} min={0}    max={8}    step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setEpargneCroissance}
                tooltip="Augmentation annuelle de votre capacité d'épargne (évolution de carrière, baisse des charges, enfants qui grandissent…). 0 % = épargne constante." />
      </div>

      {/* ─── Simulateur acquisitions futures ─── */}
      <div className="mt-6 pt-5 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-secondary uppercase tracking-widest">Acquisitions futures simulées</p>
            <p className="text-[10px] text-muted mt-0.5 flex items-center gap-1">
              {savingAcquisitions ? (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  Sauvegarde…
                </>
              ) : (
                <>
                  <Check size={10} className="text-accent" />
                  Sauvegardé automatiquement
                </>
              )}
            </p>
          </div>
          {acquisitions.length < 5 && (
            <Button variant="secondary" icon={Plus}
              disabled={loadingAcquisitions}
              onClick={() => { void addAcquisition(defaultAcquisitionPayload()) }}>
              Ajouter
            </Button>
          )}
        </div>

        {acquisitionsError && (
          <p className="text-xs text-warning bg-warning-muted border border-warning/30 rounded-lg px-3 py-1.5">
            ⚠ Erreur de sauvegarde : {acquisitionsError}
          </p>
        )}

        {loadingAcquisitions ? (
          <p className="text-xs text-muted">Chargement des acquisitions…</p>
        ) : acquisitions.length === 0 ? (
          <p className="text-xs text-muted">Aucune acquisition simulée. Ajoutez-en pour voir l&apos;impact sur votre trajectoire d&apos;indépendance.</p>
        ) : (
          <div className="space-y-4">
            {acquisitions.map((a) => (
              <AcquisitionWithImpact
                key={a.id}
                acquisition={a}
                baseInputs={baseInputs}
                onChange={(updated) => { void updateAcquisition(updated) }}
                onDelete={() => { void removeAcquisition(a.id) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Stress tests — REMONTÉS en évidence sous les acquisitions ─── */}
      <div className="mt-6 pt-5 border-t border-border">
        <StressTestPanel
          projectionBase={result}
          age_actuel={fi.age!}
          age_cible={fi.age_cible!}
          cible_fire={result.ciblePatrimoineAjusteeInflation}
          // QW9-bis — Cible effective passée au stress-test = detailLive.ajuste,
          // cohérent avec ce qui est utilisé pour cible_fire et baseInputs.
          revenu_passif_cible={detailLive.ajuste}
          rendement_central_pct={rendement}
          swr_pct={swr}
          inflation_pct={inflationGenerale}
          total_portefeuille={patrimoine.totalPortefeuille}
          total_immo={patrimoine.totalImmo}
          total_cash={patrimoine.totalCash}
          epargne_mensuelle={epargne}
          revenu_loyers={Math.max(0, patrimoine.revenuPassifImmo)}
        />
      </div>

      {/* ─── Disclaimer ─── */}
      <p className="mt-4 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
        ⚠ Simulation indicative basée sur des hypothèses de rendement et d&apos;appréciation
        (rendement marchés {rendement.toFixed(1)} %/an, appréciation immo {appreciationImmo.toFixed(1)} %/an,
        inflation loyers {inflationLoyers.toFixed(1)} %/an). Les performances passées ne préjugent pas
        des performances futures.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, accent, subLabel, details, footnote, tooltip }: {
  icon: React.ReactNode; label: string; value: string;
  sub?: string
  subLabel?: string
  details?: { label: string; value: string }[]
  footnote?: string
  accent?: 'success' | 'warning'
  tooltip?: string
}) {
  const color = accent === 'success' ? 'text-accent' : accent === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        {icon}<span className="truncate">{label}</span>
        {tooltip && <span className="cursor-help select-none text-muted" title={tooltip}>ⓘ</span>}
      </div>
      {subLabel && <p className="text-[9px] text-muted italic mt-0.5 leading-tight">{subLabel}</p>}
      <p className={`text-base font-semibold financial-value mt-1.5 ${color}`}>{value}</p>
      {details ? (
        <div className="mt-1.5 space-y-0.5">
          {details.map((d, i) => (
            <div key={i} className="flex justify-between text-[10px] text-muted gap-2">
              <span className="truncate">{d.label}</span>
              <span className="financial-value text-secondary whitespace-nowrap">{d.value}</span>
            </div>
          ))}
        </div>
      ) : (
        sub && <p className="text-[10px] text-muted truncate">{sub}</p>
      )}
      {footnote && <p className="text-[10px] text-muted italic mt-1.5 leading-tight">{footnote}</p>}
    </div>
  )
}

function Slider({ label, value, min, max, step, format, onChange, tooltip }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void
  tooltip?: string
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5 gap-1">
        <label className="text-xs text-secondary inline-flex items-center gap-1">
          {label}
          {tooltip && (
            <span
              className="cursor-help select-none text-muted"
              title={tooltip}
            >ⓘ</span>
          )}
        </label>
        <span className="text-xs text-accent financial-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#10b981] cursor-pointer"
      />
    </div>
  )
}

/**
 * Bloc "AcquisitionFutureForm + badge impact FIRE".
 * Calcule en mémo l'impact (delta années) de l'acquisition sur l'âge FIRE.
 */
function AcquisitionWithImpact({
  acquisition, baseInputs, onChange, onDelete,
}: {
  acquisition: AcquisitionFuture
  baseInputs:  Parameters<typeof projectionGlobale>[0]
  onChange:    (a: AcquisitionFuture) => void
  onDelete:    () => void
}) {
  const impact = useMemo(() => calculerImpactAcquisition(baseInputs, acquisition), [baseInputs, acquisition])
  return (
    <div>
      <AcquisitionFutureForm acquisition={acquisition} onChange={onChange} onDelete={onDelete} />
      {impact !== 0 && (
        <p className={`text-xs mt-1.5 ${impact > 0 ? 'text-accent' : 'text-warning'}`}>
          Impact sur ton indépendance : {impact > 0 ? `+${impact} an${impact > 1 ? 's' : ''} d'avance` : `${impact} an${impact < -1 ? 's' : ''} de retard`}
        </p>
      )}
    </div>
  )
}
