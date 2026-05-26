'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCcw, Save } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { InfoTip } from '@/components/ui/info-tip'
import { RegimeComparator } from '@/components/real-estate/regime-comparator'
import { LEXIQUE, getLexiqueDefinition } from '@/lib/real-estate/lexique'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { runSimulation } from '@/lib/real-estate'
import type { RawSimulationInput, FiscalRegimeKind } from '@/lib/real-estate/types'

// ─────────────────────────────────────────────────────────────────
//  Modèle minimal du sandbox
// ─────────────────────────────────────────────────────────────────

interface SandboxDraft {
  // Bien
  purchase_price:    number | undefined
  notary_fees:       number | undefined
  works_amount:      number | undefined
  furniture_amount:  number | undefined

  // Crédit
  hasLoan:           boolean
  loan_principal:    number | undefined
  loan_rate:         number | undefined
  loan_duration:     number | undefined
  insurance_rate:    number | undefined
  bank_fees:         number | undefined
  guarantee_fees:    number | undefined

  // Loyer
  monthly_rent:      number | undefined
  vacancy_months:    number | undefined

  // Charges
  property_tax:      number | undefined
  pno:               number | undefined
  condo_fees:        number | undefined
  cfe:               number | undefined
  maintenance:       number | undefined

  // Fiscal
  fiscal_regime:     FiscalRegimeKind
  tmi_pct:           number
}

const EMPTY: SandboxDraft = {
  purchase_price:    undefined,
  notary_fees:       undefined,
  works_amount:      0,
  furniture_amount:  0,
  hasLoan:           true,
  loan_principal:    undefined,
  loan_rate:         3.5,
  loan_duration:     240,
  insurance_rate:    0.3,
  bank_fees:         800,
  guarantee_fees:    1_500,
  monthly_rent:      undefined,
  vacancy_months:    0.3,
  property_tax:      undefined,
  pno:               400,
  condo_fees:        0,
  cfe:               0,
  maintenance:       0,
  fiscal_regime:     'lmnp_reel',
  tmi_pct:           30,
}

const STORAGE_KEY = 'fynix_simulator_draft_v1'

function load(): SandboxDraft {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch { return EMPTY }
}
function save(d: SandboxDraft) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch { /* quota */ }
}

// ─────────────────────────────────────────────────────────────────

export default function SimulateurPage() {
  const router = useRouter()
  const [draft, setDraft] = useState<SandboxDraft>(EMPTY)

  useEffect(() => { setDraft(load()) }, [])
  useEffect(() => { save(draft) }, [draft])

  const set = <K extends keyof SandboxDraft>(k: K, v: SandboxDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }))
  const setNum = <K extends keyof SandboxDraft>(k: K, raw: string) =>
    setDraft(d => ({ ...d, [k]: (raw === '' ? undefined : Number(raw)) as SandboxDraft[K] }))

  // Construit l'input de simulation à partir du brouillon
  const simInput = useMemo<RawSimulationInput | null>(() => {
    if (!draft.purchase_price || !draft.monthly_rent) return null
    const principal = draft.hasLoan ? (draft.loan_principal ?? 0) : 0
    return {
      property: {
        purchasePrice:    draft.purchase_price,
        notaryFees:       draft.notary_fees ?? 0,
        worksAmount:      draft.works_amount ?? 0,
        propertyIndexPct: 1,
      },
      loan: draft.hasLoan && principal > 0 ? {
        principal,
        annualRatePct:    draft.loan_rate ?? 3.5,
        durationYears:    (draft.loan_duration ?? 240) / 12,
        insuranceRatePct: draft.insurance_rate ?? 0,
        bankFees:         draft.bank_fees ?? 0,
        guaranteeFees:    draft.guarantee_fees ?? 0,
      } : undefined,
      rent: {
        monthlyRent:    draft.monthly_rent,
        vacancyMonths:  draft.vacancy_months ?? 0,
        rentalIndexPct: 1.5,
      },
      charges: {
        pno:            draft.pno ?? 0,
        gliPct:         0,
        propertyTax:    draft.property_tax ?? 0,
        cfe:            draft.cfe ?? 0,
        accountant:     0,
        condoFees:      draft.condo_fees ?? 0,
        managementPct:  0,
        maintenance:    draft.maintenance ?? 0,
        other:          0,
        chargesIndexPct: 1.5,
      },
      regime: regimeForKind(draft.fiscal_regime, draft.tmi_pct, draft.furniture_amount),
      downPayment: Math.max(0,
        (draft.purchase_price ?? 0)
        + (draft.notary_fees ?? 0)
        + (draft.works_amount ?? 0)
        - (draft.hasLoan ? (draft.loan_principal ?? 0) : 0),
      ),
      horizonYears: 10,
    }
  }, [draft])

  const result = useMemo(() => simInput ? runSimulation(simInput) : null, [simInput])

  // KPIs affichés
  const totalCost =
    (draft.purchase_price ?? 0)
    + (draft.notary_fees ?? 0)
    + (draft.works_amount ?? 0)
    + (draft.furniture_amount ?? 0)
    + (draft.hasLoan ? (draft.bank_fees ?? 0) + (draft.guarantee_fees ?? 0) : 0)

  const annualRent = (draft.monthly_rent ?? 0) * 12

  // Action "Enregistrer ce bien" : on hydrate le draft du wizard via sessionStorage
  function saveAsProperty() {
    if (typeof window === 'undefined') return
    const wizardDraft = {
      purchase_price:    draft.purchase_price,
      purchase_fees:     draft.notary_fees,
      works_amount:      draft.works_amount,
      furniture_amount:  draft.furniture_amount,
      fiscal_regime:     draft.fiscal_regime,
      hasLoan:           draft.hasLoan,
      loan_principal:    draft.loan_principal,
      loan_rate:         draft.loan_rate,
      loan_duration:     draft.loan_duration,
      insurance_rate:    draft.insurance_rate,
    }
    sessionStorage.setItem('fynix_simulator_draft_v1', JSON.stringify(wizardDraft))
    router.push('/immobilier/nouveau?from=simulator')
  }

  function reset() {
    setDraft(EMPTY)
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l&apos;immobilier
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Simulateur — Analyser une opportunité</h1>
          <p className="text-sm text-secondary mt-1">
            Vos données ne sont pas enregistrées. Évaluez rapidement la rentabilité d&apos;un bien
            avant de l&apos;ajouter à votre patrimoine.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={reset} icon={RotateCcw}>
          Réinitialiser
        </Button>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">

        {/* ─── Formulaire ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="text-xs text-secondary uppercase tracking-widest">Bien</h2>
            <FormGrid>
              <Field label="Prix d'achat (€)" required>
                <Input type="number" min={0} value={draft.purchase_price ?? ''}
                  onChange={(e) => setNum('purchase_price', e.target.value)} placeholder="200 000" />
              </Field>
              <Field label="Frais de notaire (€)">
                <Input type="number" min={0} value={draft.notary_fees ?? ''}
                  onChange={(e) => setNum('notary_fees', e.target.value)} placeholder="16 000" />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="Travaux (€)">
                <Input type="number" min={0} value={draft.works_amount ?? ''}
                  onChange={(e) => setNum('works_amount', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Mobilier — LMNP (€)">
                <Input type="number" min={0} value={draft.furniture_amount ?? ''}
                  onChange={(e) => setNum('furniture_amount', e.target.value)} placeholder="0" />
              </Field>
            </FormGrid>
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs text-secondary uppercase tracking-widest">Crédit</h2>
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input type="checkbox" checked={draft.hasLoan}
                  onChange={(e) => set('hasLoan', e.target.checked)} />
                Avec crédit
              </label>
            </div>
            {draft.hasLoan && (
              <>
                <FormGrid>
                  <Field label="Montant emprunté (€)">
                    <Input type="number" min={0} value={draft.loan_principal ?? ''}
                      onChange={(e) => setNum('loan_principal', e.target.value)} placeholder="180 000" />
                  </Field>
                  <Field label="Taux nominal (%)">
                    <Input type="number" step={0.01} min={0} max={20} value={draft.loan_rate ?? ''}
                      onChange={(e) => setNum('loan_rate', e.target.value)} placeholder="3.50" />
                  </Field>
                </FormGrid>
                <FormGrid cols={3}>
                  <Field label="Durée (mois)">
                    <Input type="number" min={1} max={480} value={draft.loan_duration ?? ''}
                      onChange={(e) => setNum('loan_duration', e.target.value)} placeholder="240" />
                  </Field>
                  <Field label="Assurance (%)">
                    <Input type="number" step={0.01} min={0} max={3} value={draft.insurance_rate ?? ''}
                      onChange={(e) => setNum('insurance_rate', e.target.value)} placeholder="0.30" />
                  </Field>
                  <Field label="Frais (€)">
                    <Input type="number" min={0}
                      value={(draft.bank_fees ?? 0) + (draft.guarantee_fees ?? 0)}
                      onChange={(e) => { const n = Number(e.target.value); set('bank_fees', Math.round(n/2)); set('guarantee_fees', Math.round(n/2)) }}
                      placeholder="2 300" />
                  </Field>
                </FormGrid>
              </>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="text-xs text-secondary uppercase tracking-widest">Loyers & charges (annuel)</h2>
            <FormGrid>
              <Field label="Loyer mensuel HC (€)" required>
                <Input type="number" min={0} value={draft.monthly_rent ?? ''}
                  onChange={(e) => setNum('monthly_rent', e.target.value)} placeholder="900" />
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    Vacance (mois/an)
                    <InfoTip text={LEXIQUE.vacancy} />
                  </span>
                }
                hint="0.3 ≈ 9 jours"
              >
                <Input type="number" step={0.1} min={0} max={12}
                  value={draft.vacancy_months ?? ''}
                  onChange={(e) => setNum('vacancy_months', e.target.value)} placeholder="0.3" />
              </Field>
            </FormGrid>
            <FormGrid cols={3}>
              <Field label="Taxe foncière (€/an)">
                <Input type="number" min={0} value={draft.property_tax ?? ''}
                  onChange={(e) => setNum('property_tax', e.target.value)} placeholder="1 200" />
              </Field>
              <Field label="Assurance PNO (€/an)">
                <Input type="number" min={0} value={draft.pno ?? ''}
                  onChange={(e) => setNum('pno', e.target.value)} placeholder="400" />
              </Field>
              <Field label="Copropriété (€/an)">
                <Input type="number" min={0} value={draft.condo_fees ?? ''}
                  onChange={(e) => setNum('condo_fees', e.target.value)} placeholder="600" />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="CFE (€/an)" hint="LMNP/LMP/SCI">
                <Input type="number" min={0} value={draft.cfe ?? ''}
                  onChange={(e) => setNum('cfe', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Entretien / travaux (€/an)">
                <Input type="number" min={0} value={draft.maintenance ?? ''}
                  onChange={(e) => setNum('maintenance', e.target.value)} placeholder="500" />
              </Field>
            </FormGrid>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="text-xs text-secondary uppercase tracking-widest">Fiscalité</h2>
            <FormGrid>
              <Field label="Régime fiscal" required>
                <Select value={draft.fiscal_regime}
                  onChange={(e) => set('fiscal_regime', e.target.value as FiscalRegimeKind)}>
                  <option value="foncier_micro">Micro-foncier</option>
                  <option value="foncier_nu">Foncier réel</option>
                  <option value="lmnp_micro">LMNP micro-BIC</option>
                  <option value="lmnp_reel">LMNP réel</option>
                  <option value="lmp">LMP</option>
                  <option value="sci_is">SCI à l&apos;IS</option>
                  <option value="sci_ir">SCI à l&apos;IR</option>
                </Select>
              </Field>
              <Field label="Votre TMI (%)">
                <Select value={draft.tmi_pct} onChange={(e) => set('tmi_pct', Number(e.target.value))}>
                  <option value={0}>0 %</option>
                  <option value={11}>11 %</option>
                  <option value={30}>30 %</option>
                  <option value={41}>41 %</option>
                  <option value={45}>45 %</option>
                </Select>
              </Field>
            </FormGrid>
          </div>
        </div>

        {/* ─── Analyse instantanée ──────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4 sticky top-4">
            <h2 className="text-xs text-secondary uppercase tracking-widest">Analyse instantanée</h2>

            {!simInput ? (
              <p className="text-sm text-secondary">
                Saisissez au minimum le prix d&apos;achat et le loyer mensuel pour voir les calculs.
              </p>
            ) : result && (
              <>
                <Kv label="Prix de revient total" value={formatCurrency(totalCost, 'EUR')} />
                <Kv label="Mensualité crédit"
                  value={formatCurrency(result.amortization?.totalMonthly ?? 0, 'EUR') + ' / mois'} />
                <Kv label="Loyers bruts"
                  value={formatCurrency(annualRent / 12, 'EUR') + ' / mois'} />

                <div className="border-t border-border pt-4 space-y-3">
                  <Kv label="Rendement brut"
                    tip={LEXIQUE.grossYield}
                    value={formatPercent(result.kpis.grossYieldFAI)} />
                  <Kv label="Rendement net"
                    tip={LEXIQUE.netYield}
                    value={formatPercent(result.kpis.netYield)} />
                  <Kv label="Rendement net-net"
                    tip={getLexiqueDefinition('netNetYield', draft.fiscal_regime)}
                    value={result.kpis.netNetYield > 0 ? formatPercent(result.kpis.netNetYield) : '—'} />
                  <Kv label="Cash-flow mensuel"
                    tip={LEXIQUE.monthlyCashFlow}
                    value={formatCurrency(result.kpis.monthlyCashFlowYear1, 'EUR') + ' / mois'}
                    tone={result.kpis.monthlyCashFlowYear1 >= 0 ? 'positive' : 'negative'} />
                  {result.kpis.monthlyCashFlowYear1 < 0 && (
                    <p className="text-xs text-warning">
                      Effort d&apos;épargne : {formatCurrency(-result.kpis.monthlyCashFlowYear1, 'EUR')} / mois
                    </p>
                  )}
                </div>

                <div className="border-t border-border pt-4">
                  <Button type="button" variant="primary" onClick={saveAsProperty} icon={Save} className="w-full">
                    Enregistrer ce bien
                  </Button>
                  <p className="text-xs text-muted mt-2 text-center">
                    Ouvre le formulaire de création avec les valeurs pré-remplies.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Comparateur de régimes en pleine largeur sous la grille */}
      {simInput && (
        <RegimeComparator
          base={{
            property:    simInput.property,
            loan:        simInput.loan as RawSimulationInput['loan'] extends infer T ? T extends undefined ? undefined : T : never,
            rent:        simInput.rent,
            charges:     simInput.charges,
            downPayment: simInput.downPayment,
            horizonYears: simInput.horizonYears,
          } as Parameters<typeof RegimeComparator>[0]['base']}
          defaultTmiPct={draft.tmi_pct}
        />
      )}
    </div>
  )
}

// Helper KV
function Kv({ label, value, tone, tip }: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
  /** Définition pédagogique (V9.1). */
  tip?:  string
}) {
  const colorClass = tone === 'positive' ? 'text-accent' : tone === 'negative' ? 'text-danger' : 'text-primary'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-secondary inline-flex items-center gap-1.5">
        {label}
        {tip && <InfoTip text={tip} iconSize={11} />}
      </span>
      <span className={`text-sm font-medium financial-value ${colorClass}`}>{value}</span>
    </div>
  )
}

// Helper régime
function regimeForKind(kind: FiscalRegimeKind, tmiPct: number, furnitureAmount: number | undefined) {
  const realParams = {
    landSharePct: 15,
    amortBuildingYears: 30,
    amortWorksYears: 15,
    amortFurnitureYears: 7,
    furnitureAmount: furnitureAmount ?? 0,
    acquisitionFeesTreatment: 'expense_y1' as const,
  }
  switch (kind) {
    case 'sci_is':       return { kind, ...realParams }
    case 'sci_ir':       return { kind, tmiPct }
    case 'lmnp_reel':    return { kind, tmiPct, ...realParams }
    case 'lmnp_micro':   return { kind, tmiPct, abattementPct: 50 }
    case 'lmp':          return { kind, tmiPct, ssiRatePct: 35, ...realParams }
    case 'foncier_nu':   return { kind, tmiPct }
    case 'foncier_micro':return { kind, tmiPct }
  }
}
