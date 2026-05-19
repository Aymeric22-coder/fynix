/**
 * Modal simulateur de revente immobilière — multi-régimes fiscaux.
 *
 * Étape 1 (inputs) :
 *   - Régime fiscal d'exploitation (sélecteur) — particulier / LMNP / LMP / SCI IS
 *   - Bien (prix achat / date / type d'usage)
 *   - Vente envisagée (prix, horizon 6 mois → 35 ans, frais agence)
 *   - Champs conditionnels selon régime : amortissements, CCA, taux IS,
 *     CA LMP, TMI LMP
 *   - Accordéon frais d'acquisition / travaux réels
 *
 * Étape 2 (résultats) :
 *   - Bandeau d'exonération si applicable, sinon
 *   - PV brute + abattements (régimes particulier/LMNP uniquement)
 *   - Impôts détaillés selon régime :
 *       Particulier/LMNP → IR + PS + surtaxe
 *       LMP             → 2 lignes (PV CT TMI+PS, PV LT 12,8 %)
 *       SCI IS          → 3 scénarios (Net SCI / Dividendes / Avec CCA)
 *   - Avertissements (LF 2025, etc.)
 *   - Conseil « attendre = économiser » (régimes avec abattements)
 *   - Impact FIRE
 *   - Tableau comparatif inter-régimes
 *
 * Le calcul vit dans lib/real-estate/plusValue.ts (PUR, testé séparément).
 */
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, CheckCircle2, TrendingUp, Hourglass, AlertTriangle,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatEur } from '@/lib/utils/format'
import {
  calculerPlusValue,
  type SimulationReventeResult, type TypeUsageBien,
  type RegimeFiscalRevente,
  REGIME_LABELS,
} from '@/lib/real-estate/plusValue'

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export interface SimulationReventeBien {
  id:                       string
  nom:                      string
  prixAchat:                number
  dateAchat:                string  // YYYY-MM-DD
  valeurActuelle?:          number | null
  typeUsage:                TypeUsageBien
  regimeFiscal?:            RegimeFiscalRevente
  fraisAcquisitionReels?:   number
  travauxReels?:            number
  amortissementsCumules?:   number
  comptesCourantsAssocies?: number
}

export interface SimulationReventeModalProps {
  bien:               SimulationReventeBien
  open:               boolean
  onClose:            () => void
  patrimoineActuel?:  number
  epargneMensuelle?:  number
  revenuMensuelNet?:  number
  ageActuel?:         number
}

// ─────────────────────────────────────────────────────────────────
// Horizons cession — 6 mois à 35 ans
// ─────────────────────────────────────────────────────────────────

const HORIZONS: ReadonlyArray<{ value: string; label: string; months: number }> = [
  { value: '6m',  label: 'Dans 6 mois', months:   6 },
  { value: '1y',  label: 'Dans 1 an',   months:  12 },
  { value: '2y',  label: 'Dans 2 ans',  months:  24 },
  { value: '3y',  label: 'Dans 3 ans',  months:  36 },
  { value: '5y',  label: 'Dans 5 ans',  months:  60 },
  { value: '10y', label: 'Dans 10 ans', months: 120 },
  { value: '15y', label: 'Dans 15 ans', months: 180 },
  { value: '20y', label: 'Dans 20 ans', months: 240 },
  { value: '25y', label: 'Dans 25 ans', months: 300 },
  { value: '30y', label: 'Dans 30 ans', months: 360 },
  { value: '35y', label: 'Dans 35 ans', months: 420 },
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
// Avertissements par régime affichés sous le champ amortissements
// ─────────────────────────────────────────────────────────────────

const AMORT_WARNING: Partial<Record<RegimeFiscalRevente, string>> = {
  lmnp:   '⚠️ Loi de finances 2025 : les amortissements sont réintégrés dans votre plus-value imposable.',
  sci_is: '⚠️ Les amortissements augmentent la PV imposable (VNC = prix achat − amortissements).',
  lmp:    '⚠️ Les amortissements constituent la PV court terme, taxée à votre TMI + cotisations sociales.',
}

// ─────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────

export function SimulationReventeModal(props: SimulationReventeModalProps) {
  const { bien, open, onClose } = props

  const [step, setStep] = useState<'inputs' | 'results'>('inputs')

  // Inputs étape 1
  const [prixVente, setPrixVente]   = useState<string>(() =>
    bien.valeurActuelle != null ? String(bien.valeurActuelle) : '')
  const [horizon, setHorizon]       = useState<string>('2y')
  const [fraisAgence, setFraisAgence] = useState<string>('')
  const [typeUsage, setTypeUsage]   = useState<TypeUsageBien>(bien.typeUsage)
  const [regimeFiscal, setRegimeFiscal] = useState<RegimeFiscalRevente>(
    bien.regimeFiscal ?? 'particulier',
  )
  const [amortissements, setAmortissements] = useState<string>(
    bien.amortissementsCumules != null ? String(bien.amortissementsCumules) : '')
  const [comptesCourantsAssocies, setCca] = useState<string>(
    bien.comptesCourantsAssocies != null ? String(bien.comptesCourantsAssocies) : '')
  const [tauxIS, setTauxIS] = useState<string>('25')
  const [caLmp, setCaLmp]   = useState<string>('')
  const [tmiLmp, setTmiLmp] = useState<string>('30')

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fraisAcqReels, setFraisAcqReels] = useState<string>(
    bien.fraisAcquisitionReels != null ? String(bien.fraisAcquisitionReels) : '')
  const [travauxReels, setTravauxReels]   = useState<string>(
    bien.travauxReels != null ? String(bien.travauxReels) : '')

  function handleClose() {
    setStep('inputs')
    onClose()
  }

  const showAmortissements = regimeFiscal === 'lmnp' || regimeFiscal === 'lmp' || regimeFiscal === 'sci_is'
  const showCCA            = regimeFiscal === 'sci_is'
  const showCaTmiLmp       = regimeFiscal === 'lmp'

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
      regimeFiscal,
      amortissementsCumules:   amortissements ? Number(amortissements) : undefined,
      comptesCourantsAssocies: comptesCourantsAssocies ? Number(comptesCourantsAssocies) : undefined,
      tauxIS:                  showCCA && tauxIS ? Number(tauxIS) : undefined,
      caLmpMoyenSur2Ans:       showCaTmiLmp && caLmp ? Number(caLmp) : undefined,
      tmiLmp:                  showCaTmiLmp && tmiLmp ? Number(tmiLmp) : undefined,
      fraisAcquisitionReels:   fraisAcqReels ? Number(fraisAcqReels) : undefined,
      travauxReels:            travauxReels ? Number(travauxReels) : undefined,
      fraisAgenceVente:        fraisAgence ? Number(fraisAgence) : 0,
      patrimoineActuel:        props.patrimoineActuel,
      epargneMensuelle:        props.epargneMensuelle,
      revenuMensuelNet:        props.revenuMensuelNet,
      ageActuel:               props.ageActuel,
    })
  }, [
    step, prixVente, horizon, fraisAgence, fraisAcqReels, travauxReels,
    typeUsage, regimeFiscal, amortissements, comptesCourantsAssocies,
    tauxIS, caLmp, tmiLmp, showCCA, showCaTmiLmp, bien, props,
  ])

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
          {/* ─── Régime fiscal — en premier ─── */}
          <section className="space-y-3">
            <h3 className="text-xs text-secondary uppercase tracking-widest">Régime fiscal d&apos;exploitation</h3>
            <Field label="Régime fiscal" htmlFor="regime">
              <select
                id="regime"
                value={regimeFiscal}
                onChange={(e) => setRegimeFiscal(e.target.value as RegimeFiscalRevente)}
                className={inputCls}
              >
                <option value="particulier">{REGIME_LABELS.particulier}</option>
                <option value="lmnp">{REGIME_LABELS.lmnp}</option>
                <option value="lmp">{REGIME_LABELS.lmp}</option>
                <option value="sci_is">{REGIME_LABELS.sci_is}</option>
              </select>
            </Field>
          </section>

          {/* ─── Le bien ─── */}
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

          {/* ─── La vente envisagée ─── */}
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

          {/* ─── Champs conditionnels par régime ─── */}
          {(showAmortissements || showCCA || showCaTmiLmp) && (
            <section className="space-y-3">
              <h3 className="text-xs text-secondary uppercase tracking-widest">
                Données du régime {REGIME_LABELS[regimeFiscal]}
              </h3>

              {showAmortissements && (
                <Field
                  label="Amortissements cumulés (€)"
                  htmlFor="amortissements"
                  hint={AMORT_WARNING[regimeFiscal]}
                >
                  <input
                    id="amortissements"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={500}
                    value={amortissements}
                    onChange={(e) => setAmortissements(e.target.value)}
                    placeholder="Si vide : estimation 2,5 %/an × 85 % du prix d'achat"
                    className={inputCls}
                  />
                </Field>
              )}

              {showCCA && (
                <>
                  <Field
                    label="Comptes courants d'associés (€)"
                    htmlFor="cca"
                    hint="Remboursables sans imposition avant les dividendes."
                  >
                    <input
                      id="cca"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1000}
                      value={comptesCourantsAssocies}
                      onChange={(e) => setCca(e.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Taux IS" htmlFor="taux-is">
                    <select
                      id="taux-is"
                      value={tauxIS}
                      onChange={(e) => setTauxIS(e.target.value)}
                      className={inputCls}
                    >
                      <option value="25">25 % — taux normal</option>
                      <option value="15">15 % — PME (bénéfice &lt; 42 500 €)</option>
                    </select>
                  </Field>
                </>
              )}

              {showCaTmiLmp && (
                <>
                  <Field
                    label="CA moyen sur 2 ans (€)"
                    htmlFor="ca-lmp"
                    hint="< 90 000 € → exonération totale (art. 151 septies CGI)."
                  >
                    <input
                      id="ca-lmp"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={1000}
                      value={caLmp}
                      onChange={(e) => setCaLmp(e.target.value)}
                      placeholder="Ex: 60000"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Tranche marginale d'imposition" htmlFor="tmi-lmp">
                    <select
                      id="tmi-lmp"
                      value={tmiLmp}
                      onChange={(e) => setTmiLmp(e.target.value)}
                      className={inputCls}
                    >
                      <option value="11">11 %</option>
                      <option value="30">30 %</option>
                      <option value="41">41 %</option>
                      <option value="45">45 %</option>
                    </select>
                  </Field>
                </>
              )}
            </section>
          )}

          {/* ─── Accordéon Frais & Travaux ─── */}
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

          <div className="pt-2">
            <Button onClick={() => setStep('results')} disabled={!valid} className="w-full">
              Simuler la revente
            </Button>
          </div>
        </div>
      ) : result ? (
        <ResultsView result={result} onEdit={() => setStep('inputs')} />
      ) : (
        <p className="text-sm text-danger">Erreur de calcul — réessaye en revenant aux inputs.</p>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Vue résultats
// ─────────────────────────────────────────────────────────────────

function ResultsView({ result, onEdit }: {
  result: SimulationReventeResult
  onEdit: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Exonération → bandeau dédié */}
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

      {/* Avertissements (LF 2025, etc.) */}
      {result.avertissements.length > 0 && !result.exonere && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 space-y-1.5">
          {result.avertissements.map((a, i) => (
            <p key={i} className="text-[11px] text-secondary leading-relaxed flex items-start gap-2">
              <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <span>{a}</span>
            </p>
          ))}
        </div>
      )}

      {/* Bloc 1 — PV brute */}
      <section className="card p-4">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">La plus-value</p>
        <Row
          label="Prix de vente"
          value={`+${formatEur(result.netVendeur + result.impotTotal, { decimals: 0 })}`}
        />
        <Row
          label={result.vnc !== undefined ? '− VNC (base − amortissements)' : '− Prix d\'acquisition corrigé'}
          value={`−${formatEur(result.prixAcquisitionCorriges, { decimals: 0 })}`}
        />
        <div className="border-t border-border mt-2 pt-2">
          <Row label="Plus-value brute" value={formatEur(result.pvBrute, { decimals: 0 })} bold />
        </div>
        <p className="text-[10px] text-muted mt-2">
          Régime : <span className="text-primary">{result.regimeLabel}</span> ·
          Détention : {result.anneesDetention} an{result.anneesDetention > 1 ? 's' : ''}
          {result.amortissementsCumulesUtilises > 0 && (
            <> · Amortissements : {formatEur(result.amortissementsCumulesUtilises, { decimals: 0 })}
              {result.amortissementsEstimes && <span className="text-amber-400"> (estimés)</span>}
            </>
          )}
        </p>
      </section>

      {/* Bloc 2 — Abattements (particulier / LMNP / micro_bic) */}
      {!result.exonere && (result.regime === 'particulier'
        || result.regime === 'lmnp'
        || result.regime === 'micro_bic'
        || result.regime === 'foncier_nu'
        || result.regime === 'scpi') && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">
            Après {result.anneesDetention} an{result.anneesDetention > 1 ? 's' : ''} de détention
          </p>
          <AbattementRow label="Abattement IR (19 %)" pct={result.abattementIRPct} pvNette={result.pvNettePourIR} />
          <div className="mt-3">
            <AbattementRow label="Abattement PS (17,2 %)" pct={result.abattementPSPct} pvNette={result.pvNettePourPS} />
          </div>
        </section>
      )}

      {/* Bloc 3a — Détail impôts particulier / LMNP */}
      {!result.exonere && (result.regime === 'particulier'
        || result.regime === 'lmnp'
        || result.regime === 'micro_bic'
        || result.regime === 'foncier_nu'
        || result.regime === 'scpi') && (
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

      {/* Bloc 3b — Détail LMP (2 lignes) */}
      {!result.exonere && result.regime === 'lmp' && result.lmpDetail && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">Décomposition LMP</p>
          <div className="space-y-2">
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary">PV court terme (amortissements)</span>
                <span className="financial-value text-primary">{formatEur(result.lmpDetail.pvCourtTerme, { decimals: 0 })}</span>
              </div>
              <p className="text-[10px] text-muted mt-1">
                Taxée à votre TMI + 17,2 % cotisations sociales →
                <span className="text-primary"> {formatEur(result.lmpDetail.impotCourtTerme + result.lmpDetail.cotisationsSocialesLMP, { decimals: 0 })}</span>
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary">PV long terme</span>
                <span className="financial-value text-primary">{formatEur(result.lmpDetail.pvLongTerme, { decimals: 0 })}</span>
              </div>
              <p className="text-[10px] text-muted mt-1">
                Taxée à 12,8 % (PFU IR) →
                <span className="text-primary"> {formatEur(result.lmpDetail.impotLongTerme, { decimals: 0 })}</span>
              </p>
            </div>
            {result.lmpDetail.exonerationApplicable && result.lmpDetail.tauxExonerationPct < 100 && (
              <p className="text-xs text-emerald-400">
                ✓ Exonération dégressive {result.lmpDetail.tauxExonerationPct.toFixed(0)} % appliquée (art. 151 septies)
              </p>
            )}
          </div>
          <div className="border-t border-border mt-3 pt-2">
            <Row
              label="Total impôt"
              value={formatEur(result.impotTotal, { decimals: 0 })}
              bold
              tone={result.impotTotal > 20_000 ? 'danger' : undefined}
            />
          </div>
        </section>
      )}

      {/* Bloc 3c — SCI IS : 3 scénarios */}
      {!result.exonere && result.regime === 'sci_is' && result.sciIsDetail && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">Sortie des fonds</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ScenarioCard
              label="Net SCI après IS"
              value={result.sciIsDetail.netApresIS}
              sub={`(reste en société · IS ${result.sciIsDetail.tauxISPct.toFixed(0)} %)`}
              tone="muted"
            />
            <ScenarioCard
              label="Dividendes"
              value={result.sciIsDetail.netApresDistributionDividendes}
              sub="(PFU 30 % sur tout)"
              tone={result.sciIsDetail.montantCCARemboursable === 0 ? 'accent' : 'muted'}
            />
            <ScenarioCard
              label="Avec CCA optimisé"
              value={result.sciIsDetail.netApresRemboursementCCA}
              sub={result.sciIsDetail.montantCCARemboursable > 0
                ? `(CCA ${formatEur(result.sciIsDetail.montantCCARemboursable, { decimals: 0 })} + PFU)`
                : '(saisis ton CCA)'}
              tone={result.sciIsDetail.montantCCARemboursable > 0 ? 'accent' : 'muted'}
            />
          </div>
        </section>
      )}

      {/* Bloc 4 — Net vendeur (métrique hero) */}
      <section className="rounded-xl border border-accent/30 bg-accent/5 p-5 text-center">
        <p className="text-xs text-secondary uppercase tracking-widest mb-1">
          {result.regime === 'sci_is' ? 'En poche (scénario optimal)' : 'Tu empocheras'}
        </p>
        <p className="text-3xl font-bold text-accent financial-value">
          {formatEur(result.netVendeur, { decimals: 0 })} nets
        </p>
        <p className="text-xs text-secondary mt-1">après impôts et frais d&apos;agence</p>
      </section>

      {/* Bloc 5 — Impact FIRE */}
      {result.impactFIRE && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <TrendingUp size={12} className="text-accent" />
            Impact sur ton indépendance
          </p>
          {result.impactFIRE.gainAnneesFIRE !== null && result.impactFIRE.gainAnneesFIRE > 0 ? (
            <p className="text-sm text-primary leading-relaxed">
              En réinvestissant{' '}
              <span className="financial-value text-accent">
                {formatEur(result.impactFIRE.gainPatrimoineNet, { decimals: 0 })}
              </span>, tu pourrais être indépendant{' '}
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

      {/* Conseil attente */}
      {result.conseilAttente && !result.exonere && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <Hourglass size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-secondary leading-relaxed">{result.conseilAttente.explication}</p>
        </div>
      )}

      {/* Tableau comparatif inter-régimes */}
      {result.comparaisonRegimes && result.comparaisonRegimes.length > 0 && (
        <section className="card p-4">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">
            Si tu avais choisi un autre régime…
          </p>
          <div className="space-y-2">
            {result.comparaisonRegimes.map((c) => (
              <div
                key={c.regime}
                className={
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm '
                  + (c.estRegimeActuel
                    ? 'bg-accent/10 border border-accent/30'
                    : 'bg-surface-2 border border-border')
                }
              >
                <span className="text-primary truncate">{c.regimeLabel}</span>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-xs text-muted financial-value">
                    Impôt {formatEur(c.impotTotal, { decimals: 0 })}
                  </span>
                  <span className="text-sm font-semibold financial-value text-primary min-w-[7ch] text-right">
                    {formatEur(c.netVendeur, { decimals: 0 })}
                  </span>
                  {c.estRegimeActuel && (
                    <span className="text-[10px] text-accent uppercase">← actuel</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted italic mt-3">
            Comparaison indicative avec les mêmes données d&apos;entrée et hypothèses.
          </p>
        </section>
      )}

      <p className="text-[11px] text-muted italic text-center">
        Estimation indicative — règles fiscales France 2026. Consulte un notaire ou expert-comptable avant cession.
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
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-[10px] text-muted mt-1">
        PV imposable : <span className="financial-value">{formatEur(pvNette, { decimals: 0 })}</span>
      </p>
    </div>
  )
}

function ScenarioCard({ label, value, sub, tone }: {
  label: string
  value: number
  sub:   string
  tone:  'accent' | 'muted'
}) {
  const valueCls = tone === 'accent' ? 'text-accent' : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-3 text-center">
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className={`text-base font-semibold financial-value mt-1 ${valueCls}`}>
        {formatEur(value, { decimals: 0 })}
      </p>
      <p className="text-[10px] text-muted mt-1 leading-tight">{sub}</p>
    </div>
  )
}
