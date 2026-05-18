/**
 * Modal simulateur de revente immobilière — 2 étapes.
 *
 * Étape 1 (inputs) : prix vente, date cession, frais agence + accordéon
 * frais d'acquisition / travaux réels (forfaits si vides).
 *
 * Étape 2 (résultats) : pédagogique avec bloc PV brute, abattements
 * (barre de progression vers prochain palier), impôts détaillés, net
 * vendeur en métrique principale, impact sur la trajectoire FIRE si
 * inputs fournis, et bandeau « attendre = économiser » si un palier
 * d'abattement franchit ≥ 6 points dans les 2 ans.
 *
 * Le calcul vit dans lib/real-estate/plusValue.ts (PUR, testé séparément).
 */
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, TrendingUp, Hourglass } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatEur } from '@/lib/utils/format'
import {
  calculerPlusValue, abattementIRPct,
  type SimulationReventeResult, type TypeUsageBien,
} from '@/lib/real-estate/plusValue'

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export interface SimulationReventeBien {
  /** Identifiant unique du bien (utile pour les tests et le tri). */
  id:                 string
  /** Nom affiché. */
  nom:                string
  /** Prix d'achat HH (€). */
  prixAchat:          number
  /** Date d'achat (ISO string YYYY-MM-DD). */
  dateAchat:          string
  /** Valeur actuelle de marché (€) — sert de placeholder pour le prix de vente. */
  valeurActuelle?:    number | null
  /** Type d'usage (RP / locatif / secondaire). */
  typeUsage:          TypeUsageBien
  /** Frais d'acquisition réels déjà payés à l'achat (€). Optionnel. */
  fraisAcquisitionReels?: number
  /** Travaux déjà engagés (€). Optionnel. */
  travauxReels?:      number
}

export interface SimulationReventeModalProps {
  bien:               SimulationReventeBien
  open:               boolean
  onClose:            () => void
  // ── Pour l'impact FIRE ──────────────────────────────────────────
  patrimoineActuel?:  number
  epargneMensuelle?:  number
  revenuMensuelNet?:  number
  ageActuel?:         number
}

// ─────────────────────────────────────────────────────────────────
// Options "Dans X ans"
// ─────────────────────────────────────────────────────────────────

const HORIZONS: ReadonlyArray<{ value: string; label: string; months: number }> = [
  { value: '6m',  label: 'Dans 6 mois', months:   6 },
  { value: '1y',  label: 'Dans 1 an',   months:  12 },
  { value: '2y',  label: 'Dans 2 ans',  months:  24 },
  { value: '3y',  label: 'Dans 3 ans',  months:  36 },
  { value: '5y',  label: 'Dans 5 ans',  months:  60 },
  { value: '10y', label: 'Dans 10 ans', months: 120 },
]

function addMonthsToToday(months: number): Date {
  const now = new Date()
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + months,
    now.getUTCDate(),
  ))
}

// ─────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────

export function SimulationReventeModal(props: SimulationReventeModalProps) {
  const { bien, open, onClose } = props

  const [step, setStep] = useState<'inputs' | 'results'>('inputs')

  // Inputs étape 1
  const [prixVente, setPrixVente] = useState<string>(() =>
    bien.valeurActuelle != null ? String(bien.valeurActuelle) : '')
  const [horizon, setHorizon] = useState<string>('2y')
  const [fraisAgence, setFraisAgence] = useState<string>('')
  const [typeUsage, setTypeUsage] = useState<TypeUsageBien>(bien.typeUsage)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fraisAcqReels, setFraisAcqReels] = useState<string>(
    bien.fraisAcquisitionReels != null ? String(bien.fraisAcquisitionReels) : '')
  const [travauxReels, setTravauxReels] = useState<string>(
    bien.travauxReels != null ? String(bien.travauxReels) : '')

  // Reset au close
  function handleClose() {
    setStep('inputs')
    onClose()
  }

  const result: SimulationReventeResult | null = useMemo(() => {
    if (step !== 'results') return null
    const prix = Number(prixVente)
    if (!Number.isFinite(prix) || prix <= 0) return null
    const horizonObj = HORIZONS.find((h) => h.value === horizon) ?? HORIZONS[2]!
    return calculerPlusValue({
      prixAchat:           bien.prixAchat,
      dateAchat:           new Date(bien.dateAchat),
      prixVenteEstime:     prix,
      dateCessionEstimee:  addMonthsToToday(horizonObj.months),
      typeUsage,
      fraisAcquisitionReels: fraisAcqReels ? Number(fraisAcqReels) : undefined,
      travauxReels:          travauxReels ? Number(travauxReels) : undefined,
      fraisAgenceVente:    fraisAgence ? Number(fraisAgence) : 0,
      patrimoineActuel:    props.patrimoineActuel,
      epargneMensuelle:    props.epargneMensuelle,
      revenuMensuelNet:    props.revenuMensuelNet,
      ageActuel:           props.ageActuel,
    })
  }, [step, prixVente, horizon, fraisAgence, fraisAcqReels, travauxReels, typeUsage, bien, props])

  // « Attendre = économiser » : si dans 2 ans on franchit un palier
  // d'abattement IR ≥ 6 points, on signale l'opportunité.
  const opportuniteAttente = useMemo(() => {
    if (!result || result.exonere) return null
    const horizonObj = HORIZONS.find((h) => h.value === horizon) ?? HORIZONS[2]!
    const dateMaintenant = addMonthsToToday(horizonObj.months)
    // Compare avec dans 24 mois supplémentaires
    const dans24 = new Date(Date.UTC(
      dateMaintenant.getUTCFullYear() + 2,
      dateMaintenant.getUTCMonth(),
      dateMaintenant.getUTCDate(),
    ))
    const anneesAttendues =
      dans24.getUTCFullYear() - new Date(bien.dateAchat).getUTCFullYear()
    const aIRActuel = result.abattementIRPct
    const aIRFutur  = abattementIRPct(anneesAttendues)
    const gainPct   = aIRFutur - aIRActuel
    if (gainPct < 6) return null
    return { gainPct, dateApprox: dans24 }
  }, [result, horizon, bien.dateAchat])

  const valid = Number(prixVente) > 0

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'inputs' ? 'Simuler une revente' : 'Résultat de la simulation'}
      subtitle={step === 'inputs' ? bien.nom : undefined}
      size="lg"
    >
      {step === 'inputs' ? (
        <div className="space-y-5">
          {/* Section "Le bien" */}
          <section className="space-y-3">
            <h3 className="text-xs text-secondary uppercase tracking-widest">Le bien</h3>
            <div className="grid grid-cols-2 gap-3">
              <KpiLine label="Prix d'achat" value={formatEur(bien.prixAchat, { decimals: 0 })} />
              <KpiLine label="Date d'achat" value={new Date(bien.dateAchat).toLocaleDateString('fr-FR')} />
            </div>
            <Field label="Type d'usage" htmlFor="type-usage">
              <select
                id="type-usage"
                value={typeUsage}
                onChange={(e) => setTypeUsage(e.target.value as TypeUsageBien)}
                className={inputCls}
              >
                <option value="locatif">{TYPE_LABEL.locatif}</option>
                <option value="secondaire">{TYPE_LABEL.secondaire}</option>
                <option value="residence_principale">{TYPE_LABEL.residence_principale}</option>
              </select>
            </Field>
          </section>

          {/* Section "La vente envisagée" */}
          <section className="space-y-3">
            <h3 className="text-xs text-secondary uppercase tracking-widest">La vente envisagée</h3>
            <Field label="Prix de vente estimé (€)" htmlFor="prix-vente">
              <input
                id="prix-vente"
                type="number"
                inputMode="decimal"
                min={1}
                step={1000}
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                placeholder={bien.valeurActuelle != null ? String(bien.valeurActuelle) : 'Ex: 250000'}
                className={inputCls}
              />
            </Field>
            <Field label="Date de cession envisagée" htmlFor="horizon">
              <select
                id="horizon"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                className={inputCls}
              >
                {HORIZONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Frais d'agence (€)" htmlFor="frais-agence" hint="0 si vente directe entre particuliers.">
              <input
                id="frais-agence"
                type="number"
                inputMode="decimal"
                min={0}
                step={500}
                value={fraisAgence}
                onChange={(e) => setFraisAgence(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </Field>
          </section>

          {/* Accordéon Frais & Travaux */}
          <section>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="w-full text-left text-xs text-secondary uppercase tracking-widest hover:text-primary"
            >
              {showAdvanced ? '▾' : '▸'} Frais d&apos;acquisition &amp; travaux (avancé)
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <Field
                  label="Frais d'acquisition réels (€)"
                  htmlFor="frais-acq"
                  hint="Si vide, forfait 7,5 % du prix d'achat appliqué."
                >
                  <input
                    id="frais-acq"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={500}
                    value={fraisAcqReels}
                    onChange={(e) => setFraisAcqReels(e.target.value)}
                    placeholder={`Forfait ≈ ${formatEur(bien.prixAchat * 0.075, { decimals: 0 })}`}
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Travaux réels (€)"
                  htmlFor="travaux"
                  hint="Si vide et détention > 5 ans, forfait 15 % du prix d'achat appliqué."
                >
                  <input
                    id="travaux"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={500}
                    value={travauxReels}
                    onChange={(e) => setTravauxReels(e.target.value)}
                    placeholder={`Forfait ≈ ${formatEur(bien.prixAchat * 0.15, { decimals: 0 })}`}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </section>

          {/* CTA */}
          <div className="pt-2">
            <Button
              onClick={() => setStep('results')}
              disabled={!valid}
              className="w-full"
            >
              Simuler la revente
            </Button>
          </div>
        </div>
      ) : result ? (
        <ResultsView
          result={result}
          opportunite={opportuniteAttente}
          onEdit={() => setStep('inputs')}
        />
      ) : (
        <p className="text-sm text-danger">Erreur de calcul — réessaye en revenant aux inputs.</p>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Vue résultats
// ─────────────────────────────────────────────────────────────────

interface OpportuniteAttente { gainPct: number; dateApprox: Date }

function ResultsView({ result, opportunite, onEdit }: {
  result:      SimulationReventeResult
  opportunite: OpportuniteAttente | null
  onEdit:      () => void
}) {
  return (
    <div className="space-y-5">
      {/* Exonération → bandeau dédié, on saute le détail impôts */}
      {result.exonere && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-primary font-medium">Cession exonérée</p>
            <p className="text-xs text-secondary mt-1 leading-relaxed">
              {result.raisonExoneration ?? 'Aucun impôt sur la plus-value.'}
            </p>
          </div>
        </div>
      )}

      {/* Bloc 1 — Plus-value brute */}
      <section className="card p-4">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">La plus-value</p>
        <Row label="Prix de vente"               value={`+${formatEur(result.netVendeur + result.impotTotal, { decimals: 0 })}`} />
        <Row label="− Prix d'acquisition corrigé" value={`−${formatEur(result.prixAcquisitionCorriges, { decimals: 0 })}`} />
        <div className="border-t border-border mt-2 pt-2">
          <Row label="Plus-value brute" value={formatEur(result.pvBrute, { decimals: 0 })} bold />
        </div>
        <p className="text-[10px] text-muted mt-2">
          Détention : {result.anneesDetention} an{result.anneesDetention > 1 ? 's' : ''} ·
          Frais d&apos;acquisition retenus : {formatEur(result.fraisAcquisitionRetenus, { decimals: 0 })} ·
          Travaux retenus : {formatEur(result.travauxRetenus, { decimals: 0 })}
        </p>
      </section>

      {/* Bloc 2 — Abattements (si pas exo) */}
      {!result.exonere && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">
            Après {result.anneesDetention} an{result.anneesDetention > 1 ? 's' : ''} de détention
          </p>
          <AbattementRow
            label="Abattement IR (19 %)"
            pct={result.abattementIRPct}
            pvNette={result.pvNettePourIR}
          />
          <div className="mt-3">
            <AbattementRow
              label="Abattement PS (17,2 %)"
              pct={result.abattementPSPct}
              pvNette={result.pvNettePourPS}
            />
          </div>
        </section>
      )}

      {/* Bloc 3 — Détail impôts (si pas exo) */}
      {!result.exonere && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">L&apos;impôt à payer</p>
          <Row label="Impôt sur le revenu (19 %)" value={formatEur(result.impotIR, { decimals: 0 })} />
          <Row label="Prélèvements sociaux (17,2 %)" value={formatEur(result.impotPS, { decimals: 0 })} />
          <Row
            label="Surtaxe sur grosses PV"
            value={result.surtaxe > 0 ? formatEur(result.surtaxe, { decimals: 0 }) : 'Aucune'}
          />
          <div className="border-t border-border mt-2 pt-2">
            <Row
              label="Total impôt"
              value={formatEur(result.impotTotal, { decimals: 0 })}
              bold
              tone={result.impotTotal > 20_000 ? 'danger' : undefined}
            />
            <p className="text-[10px] text-muted mt-1">
              Taux effectif : {result.tauxImpositionEffectifPct.toFixed(1)} % de la PV brute
            </p>
          </div>
        </section>
      )}

      {/* Bloc 4 — Net vendeur (métrique hero) */}
      <section className="rounded-xl border border-accent/30 bg-accent/5 p-5 text-center">
        <p className="text-xs text-secondary uppercase tracking-widest mb-1">Tu empocheras</p>
        <p className="text-3xl font-bold text-accent financial-value">
          {formatEur(result.netVendeur, { decimals: 0 })} nets
        </p>
        <p className="text-xs text-secondary mt-1">après impôts et frais d&apos;agence</p>
      </section>

      {/* Bloc 5 — Impact FIRE (si calculé) */}
      {result.impactFIRE && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <TrendingUp size={12} className="text-accent" />
            Impact sur ton indépendance
          </p>
          {result.impactFIRE.gainAnneesFIRE !== null
            && result.impactFIRE.gainAnneesFIRE > 0 ? (
            <p className="text-sm text-primary leading-relaxed">
              En réinvestissant <span className="financial-value text-accent">{formatEur(result.impactFIRE.gainPatrimoineNet, { decimals: 0 })}</span>,
              tu pourrais être indépendant{' '}
              <span className="text-accent font-medium">
                {result.impactFIRE.gainAnneesFIRE} an{result.impactFIRE.gainAnneesFIRE > 1 ? 's' : ''} plus tôt
              </span>
              {result.impactFIRE.ageIndependanceSansVente !== null
                && result.impactFIRE.nouvelAgeIndependance !== null && (
                <> ({result.impactFIRE.ageIndependanceSansVente} → {result.impactFIRE.nouvelAgeIndependance} ans).</>
              )}
            </p>
          ) : (
            <p className="text-sm text-secondary">
              Réinvestir {formatEur(result.impactFIRE.gainPatrimoineNet, { decimals: 0 })} n&apos;avance
              pas significativement ta date d&apos;indépendance dans la projection actuelle.
            </p>
          )}
          <Link
            href="/analyse?tab=simuler"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
          >
            Voir la projection complète <ArrowRight size={11} />
          </Link>
        </section>
      )}

      {/* Bandeau « attendre = économiser » */}
      {opportunite && !result.exonere && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <Hourglass size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-secondary leading-relaxed">
            En attendant {opportunite.dateApprox.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })},
            tu gagnes <strong className="text-emerald-400">+{opportunite.gainPct} points</strong> d&apos;abattement IR
            sur la plus-value imposable.
          </p>
        </div>
      )}

      {/* Disclaimer + retour */}
      <p className="text-[11px] text-muted italic text-center">
        Estimation indicative — règles fiscales France 2026. Consulte un notaire avant toute cession.
      </p>
      <Button variant="secondary" onClick={onEdit} className="w-full">
        ← Modifier les paramètres
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<TypeUsageBien, string> = {
  residence_principale: 'Résidence principale',
  locatif:              'Locatif',
  secondaire:           'Résidence secondaire',
}

const inputCls = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors'

function Field({ label, hint, htmlFor, children }: {
  label:    string
  hint?:    string
  htmlFor:  string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-primary">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted leading-relaxed">{hint}</p>}
    </div>
  )
}

function KpiLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className="text-sm text-primary font-medium financial-value mt-0.5 truncate">{value}</p>
    </div>
  )
}

function Row({ label, value, bold, tone }: {
  label: string
  value: string
  bold?: boolean
  tone?: 'danger'
}) {
  const valueCls = bold
    ? `text-base font-semibold financial-value ${tone === 'danger' ? 'text-danger' : 'text-primary'}`
    : 'text-sm financial-value text-primary'
  return (
    <div className="flex items-center justify-between py-1">
      <span className={bold ? 'text-sm text-primary font-medium' : 'text-sm text-secondary'}>{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  )
}

function AbattementRow({ label, pct, pvNette }: {
  label:   string
  pct:     number
  pvNette: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm text-primary">{label}</p>
        <p className="text-sm text-accent font-medium financial-value">{pct.toFixed(1)} %</p>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted mt-1">
        PV imposable : <span className="financial-value">{formatEur(pvNette, { decimals: 0 })}</span>
      </p>
    </div>
  )
}
