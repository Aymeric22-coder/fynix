'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle2, AlertCircle, X, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { parseCsv, type ParsedRow, type GuessedType } from '@/lib/real-estate/csv-import'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  open:       boolean
  onClose:    () => void
  /** Asset associé au bien (utilisé pour rent_income / tax / fee). */
  assetId:    string
  /** Crédit lié (utilisé pour loan_payment). null si pas de crédit. */
  debtId:     string | null
}

const TYPE_LABELS: Record<GuessedType | 'skip', string> = {
  rent_income:  'Loyer perçu',
  loan_payment: 'Mensualité crédit',
  tax:          'Impôt / Taxe',
  fee:          'Frais',
  unknown:      '— À choisir —',
  skip:         'Ignorer',
}

const TYPE_OPTIONS: Array<GuessedType | 'skip'> = [
  'rent_income', 'loan_payment', 'tax', 'fee', 'skip',
]

interface RowState extends ParsedRow {
  /** Type final retenu pour l'import (modifiable par l'utilisateur). */
  finalType:  GuessedType | 'skip'
  /** Statut d'import : null = pas tenté, ok = créé, error = échec. */
  status:     null | 'ok' | 'error'
  errMessage?: string
}

export function ImportCsvModal({ open, onClose, assetId, debtId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<{ ok: number; skipped: number; failed: number } | null>(null)

  function reset() {
    setRows([])
    setFilename(null)
    setParseError(null)
    setImportDone(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    setParseError(null)
    setImportDone(null)
    try {
      const text = await file.text()
      const result = parseCsv(text)
      if (result.rows.length === 0) {
        setParseError('Aucune ligne valide dans ce fichier.')
        return
      }
      setRows(result.rows.map((r) => ({
        ...r,
        finalType: r.guessedType === 'unknown' ? 'skip' : r.guessedType,
        status:    null,
      })))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erreur de lecture')
    }
  }

  function updateRowType(idx: number, type: GuessedType | 'skip') {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, finalType: type } : r))
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function importAll() {
    setImporting(true)
    let ok = 0, skipped = 0, failed = 0
    const updated = [...rows]

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i]!
      if (r.finalType === 'skip' || r.error) {
        skipped++
        continue
      }
      // Pour loan_payment il faut un debtId
      if (r.finalType === 'loan_payment' && !debtId) {
        updated[i] = { ...r, status: 'error', errMessage: 'Aucun crédit associé au bien' }
        failed++
        continue
      }

      try {
        const body = {
          transaction_type: r.finalType,
          ...(r.finalType === 'loan_payment'
            ? { debt_id: debtId }
            : { asset_id: assetId }),
          // Pour les sorties (loan/tax/fee), on force le signe négatif
          amount: r.finalType === 'rent_income' ? Math.abs(r.amount) : -Math.abs(r.amount),
          executed_at: new Date(r.date + 'T12:00:00Z').toISOString(),
          value_date:  r.date,
          label:       r.label || `Import CSV ${r.date}`,
          currency:    'EUR',
          data_source: 'import',
        }
        const res = await fetch('/api/transactions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        updated[i] = { ...r, status: 'ok' }
        ok++
      } catch (err) {
        updated[i] = { ...r, status: 'error', errMessage: err instanceof Error ? err.message : 'Erreur' }
        failed++
      }
    }

    setRows(updated)
    setImportDone({ ok, skipped, failed })
    setImporting(false)
    if (ok > 0) router.refresh()
  }

  // Compteurs pré-import
  const counts = rows.reduce(
    (acc, r) => {
      if (r.error)            acc.invalid++
      else if (r.finalType === 'skip') acc.skipped++
      else                    acc.toImport++
      return acc
    },
    { toImport: 0, skipped: 0, invalid: 0 },
  )

  return (
    <Modal open={open} onClose={handleClose} title="Importer un relevé CSV" subtitle="Loyers, mensualités, charges depuis votre banque" size="lg">
      {/* Étape 1 : sélection fichier */}
      {rows.length === 0 && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-surface-2/30">
            <Upload size={32} className="text-muted mx-auto mb-3" />
            <p className="text-sm text-primary font-medium mb-1">Sélectionnez un fichier CSV</p>
            <p className="text-xs text-secondary mb-4">
              Format attendu : colonnes <code>Date</code>, <code>Libellé</code>, <code>Montant</code> (séparateur <code>;</code> ou <code>,</code>)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block mx-auto text-xs text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:cursor-pointer hover:file:bg-accent/90"
            />
          </div>

          {parseError && (
            <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{parseError}</p>
          )}

          <div className="bg-surface-2 rounded-lg p-4 text-xs text-secondary space-y-1">
            <p className="text-primary font-medium mb-1">Auto-détection :</p>
            <p>• <span className="text-primary">Loyer</span>, location, encaissement → <span className="text-accent">rent_income</span></p>
            <p>• <span className="text-primary">Échéance prêt</span>, mensualité, remboursement → <span className="text-accent">loan_payment</span></p>
            <p>• <span className="text-primary">Taxe foncière</span>, CFE, prélèvements sociaux → <span className="text-accent">tax</span></p>
            <p>• <span className="text-primary">Assurance PNO</span>, syndic, travaux, gestion → <span className="text-accent">fee</span></p>
          </div>
        </div>
      )}

      {/* Étape 2 : preview / review */}
      {rows.length > 0 && !importDone && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs">
              <FileText size={14} className="text-secondary" />
              <span className="text-primary font-medium">{filename}</span>
              <span className="text-muted">·</span>
              <span className="text-secondary">{rows.length} ligne(s)</span>
            </div>
            <button
              onClick={reset}
              className="text-xs text-secondary hover:text-primary flex items-center gap-1"
            >
              <X size={12} />Choisir un autre fichier
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="card p-3">
              <p className="text-muted">À importer</p>
              <p className="text-primary font-semibold text-lg">{counts.toImport}</p>
            </div>
            <div className="card p-3">
              <p className="text-muted">Ignorées</p>
              <p className="text-secondary font-semibold text-lg">{counts.skipped}</p>
            </div>
            <div className="card p-3">
              <p className="text-muted">Invalides</p>
              <p className={`font-semibold text-lg ${counts.invalid > 0 ? 'text-danger' : 'text-secondary'}`}>{counts.invalid}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr className="text-muted uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Libellé</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-center">Conf.</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.error ? 'bg-danger/5' : ''}>
                      <td className="px-3 py-2 text-secondary whitespace-nowrap">{r.date || '—'}</td>
                      <td className="px-3 py-2 text-primary truncate max-w-xs" title={r.label}>{r.label || '—'}</td>
                      <td className={`px-3 py-2 text-right financial-value ${r.amount >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {formatCurrency(r.amount, 'EUR')}
                      </td>
                      <td className="px-3 py-2">
                        {r.error ? (
                          <span className="text-xs text-danger flex items-center gap-1">
                            <AlertCircle size={11} />{r.error}
                          </span>
                        ) : (
                          <select
                            value={r.finalType}
                            onChange={(e) => updateRowType(i, e.target.value as GuessedType | 'skip')}
                            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs cursor-pointer"
                          >
                            {TYPE_OPTIONS.map((t) => (
                              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-muted">
                        {r.confidence > 0 ? `${r.confidence}%` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteRow(i)}
                          className="text-muted hover:text-danger transition-colors"
                          title="Supprimer cette ligne"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={handleClose}>Annuler</Button>
            <Button type="button" loading={importing} onClick={importAll} disabled={counts.toImport === 0}>
              Importer {counts.toImport} transaction{counts.toImport > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* Étape 3 : résumé import */}
      {importDone && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <CheckCircle2 size={36} className="text-accent mx-auto" />
            <p className="text-base font-medium text-primary">Import terminé</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="card p-3 text-center">
              <p className="text-accent font-semibold text-2xl">{importDone.ok}</p>
              <p className="text-muted">Créées</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-secondary font-semibold text-2xl">{importDone.skipped}</p>
              <p className="text-muted">Ignorées</p>
            </div>
            <div className="card p-3 text-center">
              <p className={`font-semibold text-2xl ${importDone.failed > 0 ? 'text-danger' : 'text-secondary'}`}>{importDone.failed}</p>
              <p className="text-muted">Échouées</p>
            </div>
          </div>
          {importDone.failed > 0 && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2">
                    <tr className="text-muted uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Libellé</th>
                      <th className="px-3 py-2 text-left">Erreur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.filter((r) => r.status === 'error').map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-secondary whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2 text-primary truncate max-w-xs">{r.label}</td>
                        <td className="px-3 py-2 text-danger text-xs">{r.errMessage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={reset}>Nouvel import</Button>
            <Button type="button" onClick={handleClose}>Fermer</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
