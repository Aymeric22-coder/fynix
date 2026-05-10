'use client'

import { useMemo, useState } from 'react'
import { Download, AlertTriangle, FileText } from 'lucide-react'
import type { YearEndReport } from '@/lib/real-estate/year-end-report'
import { reportToCsv } from '@/lib/real-estate/year-end-report'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  reports: YearEndReport[]   // un par année (sorted desc)
}

export function YearEndReportPanel({ reports }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(reports[0]?.year ?? null)

  const report = useMemo(
    () => reports.find((r) => r.year === selectedYear) ?? null,
    [reports, selectedYear],
  )

  function downloadCsv() {
    if (!report) return
    const csv = reportToCsv(report)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (report.propertyName ?? 'bien').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    link.href = url
    link.download = `rapport-${safeName}-${report.year}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (reports.length === 0) {
    return (
      <div className="card p-8 text-center space-y-3">
        <FileText size={28} className="text-muted mx-auto" />
        <p className="text-sm text-primary font-medium">Pas encore de rapport annuel</p>
        <p className="text-xs text-secondary max-w-md mx-auto">
          Le rapport annuel devient disponible une fois qu&apos;une année calendaire est écoulée
          avec des données réelles enregistrées.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-primary">Rapport annuel</h2>
          <p className="text-xs text-secondary mt-0.5">
            Synthèse fiscale prête pour la déclaration (2044, 2031, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm cursor-pointer"
          >
            {reports.map((r) => (
              <option key={r.year} value={r.year}>{r.year}</option>
            ))}
          </select>
          <button
            onClick={downloadCsv}
            disabled={!report}
            className="flex items-center gap-1.5 text-xs bg-accent text-white rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <Download size={12} />
            Exporter CSV
          </button>
        </div>
      </div>

      {report && (
        <div className="card p-5 space-y-5">
          {report.hasGaps && (
            <div className="bg-warning/5 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-warning font-medium mb-1">Données partielles</p>
                <ul className="text-secondary space-y-0.5 list-disc list-inside">
                  {report.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Section Revenus */}
          <Section title="Revenus locatifs">
            <Row label="Loyers perçus (réel)" value={report.rentReceived} bold />
            <Row label="Loyers prévus (simulation)" value={report.rentSimulated} muted />
            <Row label="Écart" value={report.rentVariance} variance />
          </Section>

          {/* Section Charges */}
          <Section title="Charges déductibles">
            <Row label="Taxe foncière"          value={report.chargesActual.taxeFonciere} />
            <Row label="Assurance PNO"          value={report.chargesActual.insurance} />
            <Row label="Expert-comptable"       value={report.chargesActual.accountant} />
            <Row label="CFE"                    value={report.chargesActual.cfe} />
            <Row label="Charges copropriété"    value={report.chargesActual.condoFees} />
            <Row label="Entretien / réparations" value={report.chargesActual.maintenance} />
            <Row label="Autres"                  value={report.chargesActual.other} />
            <div className="border-t border-border my-1.5"></div>
            <Row label="Total charges"           value={report.chargesActual.total} bold />
          </Section>

          {/* Section Crédit */}
          {report.loan && (
            <Section title="Crédit">
              <Row label="Intérêts d'emprunt (déductible)" value={report.loan.interestPaid} highlight />
              <Row label="Assurance emprunteur (déductible)" value={report.loan.insurancePaid} highlight />
              <Row label="Capital remboursé" value={report.loan.principalRepaid} muted />
              <div className="border-t border-border my-1.5"></div>
              <Row label="Total mensualités" value={report.loan.totalPaid} bold />
              <Row label="Capital restant dû fin d'année" value={report.loan.remainingCapital} muted />
            </Section>
          )}

          {/* Section Amortissements */}
          {report.amortizationTotal > 0 && (
            <Section title="Amortissements (régime réel)">
              <Row label="Total amortissements" value={report.amortizationTotal} highlight bold />
            </Section>
          )}

          {/* Section Résultat fiscal */}
          <Section title="Résultat fiscal">
            <Row label="Résultat fiscal" value={report.fiscalResult} bold negative={report.fiscalResult < 0} />
            <Row label="Base imposable"  value={report.taxableBase} />
            <Row label="Impôt estimé (TMI + PS)" value={report.taxEstimated} negative />
          </Section>

          {/* Section Cash-flow */}
          <Section title="Cash-flow net">
            <Row label="Réel"     value={report.cashFlowReal}      bold negative={report.cashFlowReal < 0} />
            <Row label="Simulé"   value={report.cashFlowSimulated} muted />
          </Section>

          <div className="text-xs text-muted pt-1 border-t border-border">
            Régime fiscal : <span className="text-secondary font-medium">{report.fiscalRegime}</span>
            {' · '}
            Bien : <span className="text-secondary">{report.propertyName ?? report.propertyId}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({
  label, value, bold, muted, highlight, variance, negative,
}: {
  label:    string
  value:    number
  bold?:    boolean
  muted?:   boolean
  highlight?: boolean
  variance?: boolean
  negative?: boolean
}) {
  let valColor = 'text-primary'
  if (muted)    valColor = 'text-muted'
  if (negative) valColor = 'text-danger'

  let valTxt = formatCurrency(value, 'EUR')
  if (variance) {
    valTxt = `${value >= 0 ? '+' : ''}${valTxt}`
    valColor = value >= 0 ? 'text-accent' : 'text-danger'
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`${highlight ? 'text-accent' : 'text-secondary'} ${bold ? 'font-medium' : ''}`}>{label}</span>
      <span className={`financial-value ${valColor} ${bold ? 'font-semibold' : ''}`}>{valTxt}</span>
    </div>
  )
}
