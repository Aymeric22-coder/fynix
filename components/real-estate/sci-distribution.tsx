'use client'

import { useMemo, useState } from 'react'
import { Star, Info } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { computeDividendDistribution } from '@/lib/real-estate/fiscal/sci-is'
import { InfoTip } from '@/components/ui/info-tip'

/**
 * V17 — Pédagogie InfoTip sur la ligne « Remboursement CCA ».
 *
 * Sans aide contextuelle, un utilisateur lisait « Solde CCA 20 000 € »
 * et « Remboursement CCA 10 378 € » et croyait à un impôt — alors que
 * l'écart est juste le plafond annuel de trésorerie. Le texte est
 * construit à partir des deux valeurs disponibles dans le composant :
 *   - ccaBalance  = solde de CCA déclaré (= result.ccaAvailable)
 *   - annualCap   = trésorerie disponible sur l'année 1 (cash-flow
 *                   après impôt) = prop `availableCashYear`
 *
 * Trois cas, dans cet ordre (le premier qui matche gagne) :
 *   1. annualCap ≤ 0          → pas de trésorerie cette année
 *   2. ccaBalance ≤ annualCap → un exercice suffit pour solder
 *   3. cas standard           → estimation du nombre d'années
 */
function buildCcaHelpText(ccaBalance: number, annualCap: number): string {
  const fmt = (v: number) => formatCurrency(v, 'EUR')
  if (annualCap <= 0) {
    return (
      `La SCI ne génère pas de trésorerie positive cette année ; ` +
      `aucun remboursement possible pour l'instant. Vous pourrez ` +
      `récupérer votre CCA (${fmt(ccaBalance)}) en franchise d'impôt ` +
      `dès que la trésorerie redeviendra positive.`
    )
  }
  if (ccaBalance <= annualCap) {
    return (
      `Vous pouvez récupérer la totalité de votre CCA ` +
      `(${fmt(ccaBalance)}) dès cette année, en franchise d'impôt.`
    )
  }
  const years = Math.ceil(ccaBalance / annualCap)
  return (
    `Vous pouvez récupérer l'intégralité de votre CCA ` +
    `(${fmt(ccaBalance)}) en franchise d'impôt. La SCI vous rembourse ` +
    `dans la limite du cash qu'elle génère chaque année ` +
    `(~${fmt(annualCap)} en année 1), soit environ ${years} ans pour ` +
    `solder le compte courant.`
  )
}

interface Props {
  /** Résultat net après IS (année 1) — calculé par la projection. */
  netProfitAfterIS: number
  /** Solde CCA déclaré pour ce bien (€). */
  ccaAmount:        number
  /**
   * Trésorerie disponible pour rembourser le CCA cette année
   * (typiquement `simResult.projection[0].cashFlowAfterTax`). Le
   * remboursement du CCA est plafonné par ce cash, pas par le bénéfice
   * comptable — une SCI fortement amortie peut avoir un bénéfice ≈ 0
   * et un cash positif.
   */
  availableCashYear: number
  /** TMI du foyer. */
  tmiPct:           number
}

/**
 * Bloc "Distribution" pour une SCI à l'IS : compare PFU vs barème
 * et affiche l'option remboursement CCA (non imposable).
 */
export function SciDistribution({ netProfitAfterIS, ccaAmount, availableCashYear, tmiPct }: Props) {
  // L'utilisateur peut moduler le montant à distribuer en dividendes
  // (par défaut : tout le profit après IS).
  const [dividendInput, setDividendInput] = useState<number>(
    Math.max(0, Math.round(netProfitAfterIS)),
  )

  const result = useMemo(
    () => computeDividendDistribution({
      netProfitAfterIS,
      dividendAmount: dividendInput,
      ccaAmount,
      availableCashYear,
      tmiPct,
    }),
    [netProfitAfterIS, dividendInput, ccaAmount, availableCashYear, tmiPct],
  )

  // L'option globale la plus avantageuse en € net dans la poche :
  //  - dividendes (option optimale entre PFU et barème)
  //  - remboursement CCA (s'il y a du CCA dispo)
  const ccaIsBest = result.ccaReimbursement > result.optimalNetAmount

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-primary">
          Distribution — comment récupérer vos bénéfices ?
        </h3>
        <p className="text-xs text-secondary mt-1">
          Une SCI à l&apos;IS ne « remonte » pas automatiquement le cash à l&apos;associé.
          Deux mécanismes : dividendes (imposés) ou remboursement de compte courant
          (fiscalement neutre).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface-2 rounded-lg p-3">
          <p className="text-xs text-secondary">Résultat net après IS</p>
          <p className="text-base font-semibold financial-value text-primary mt-1">
            {formatCurrency(netProfitAfterIS, 'EUR')}
          </p>
        </div>
        <div className="bg-surface-2 rounded-lg p-3">
          <p className="text-xs text-secondary">Solde CCA</p>
          <p className="text-base font-semibold financial-value text-primary mt-1">
            {formatCurrency(result.ccaAvailable, 'EUR')}
          </p>
        </div>
        <div className="bg-surface-2 rounded-lg p-3">
          <p className="text-xs text-secondary">Votre TMI</p>
          <p className="text-base font-semibold financial-value text-primary mt-1">
            {formatPercent(tmiPct)}
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs text-secondary mb-1.5">
          Montant à distribuer en dividendes (€)
        </label>
        <input
          type="number" min={0} step={100}
          value={dividendInput}
          onChange={(e) => setDividendInput(Math.max(0, Number(e.target.value)))}
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-primary"
        />
      </div>

      <div className="space-y-2">
        {/* Option A — PFU */}
        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
          !ccaIsBest && result.optimalOption === 'pfu' ? 'border-accent/40 bg-accent/5' : 'border-border'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {!ccaIsBest && result.optimalOption === 'pfu' && (
              <Star size={12} className="text-accent fill-accent" />
            )}
            <span className="text-sm text-primary">PFU (Flat Tax 30 %)</span>
          </div>
          <div className="text-right">
            <p className="text-sm financial-value text-primary">
              {formatCurrency(result.netAfterPfu, 'EUR')}
            </p>
            <p className="text-xs text-muted">−{formatCurrency(result.pfuTax, 'EUR')}</p>
          </div>
        </div>

        {/* Option B — Barème IR */}
        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
          !ccaIsBest && result.optimalOption === 'bareme' ? 'border-accent/40 bg-accent/5' : 'border-border'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {!ccaIsBest && result.optimalOption === 'bareme' && (
              <Star size={12} className="text-accent fill-accent" />
            )}
            <span className="text-sm text-primary">Barème IR (abattement 40 % + PS 17,2 %)</span>
          </div>
          <div className="text-right">
            <p className="text-sm financial-value text-primary">
              {formatCurrency(result.netAfterBareme, 'EUR')}
            </p>
            <p className="text-xs text-muted">−{formatCurrency(result.baremeTax, 'EUR')}</p>
          </div>
        </div>

        {/* Option C — CCA */}
        {result.ccaAvailable > 0 && (
          <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
            ccaIsBest ? 'border-accent/40 bg-accent/5' : 'border-border'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {ccaIsBest && <Star size={12} className="text-accent fill-accent" />}
              <span className="text-sm text-primary flex items-center gap-1.5">
                Remboursement CCA (non imposable)
                <InfoTip text={buildCcaHelpText(result.ccaAvailable, availableCashYear)} />
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm financial-value text-accent">
                {formatCurrency(result.ccaReimbursement, 'EUR')}
              </p>
              <p className="text-xs text-muted">
                {result.ccaCapped ? 'plafonné à la trésorerie' : 'remboursable'}
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted flex items-start gap-1.5">
        <Info size={11} className="shrink-0 mt-0.5" />
        Ces calculs sont des estimations basées sur les textes fiscaux en vigueur.
        Consultez un expert-comptable pour votre situation précise.
      </p>
    </div>
  )
}
