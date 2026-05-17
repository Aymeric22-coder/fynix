/**
 * Modal d'import CSV d'export broker — Boursorama / Degiro / Trade Republic.
 *
 *   - Drag & drop ou sélection fichier
 *   - Détection automatique du broker (badge "Degiro détecté ✓")
 *   - Aperçu des premières lignes avant import
 *   - Résumé après import (X importées, Y doublons, erreurs détaillées)
 *
 * Toute la logique de parsing est dans `lib/portfolio/csvImport.ts` —
 * ce composant ne fait QUE de l'UI.
 */
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { parseBrokerCsv, type BrokerFormat, type ImportedPositionRow } from '@/lib/portfolio/csvImport'

interface Props {
  open:    boolean
  onClose: () => void
}

interface ImportSummary {
  broker:   BrokerFormat
  imported: number
  skipped:  number
  errors:   Array<{ line?: number; isin?: string; reason: string }>
}

const BROKER_LABEL: Record<BrokerFormat, string> = {
  boursorama:     'Boursorama',
  degiro:         'Degiro',
  trade_republic: 'Trade Republic',
  unknown:        'Format inconnu',
}

export function PortfolioImportCSVModal({ open, onClose }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [broker, setBroker] = useState<BrokerFormat>('unknown')
  const [preview, setPreview] = useState<ImportedPositionRow[]>([])
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; reason: string }>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCsv(null); setFileName(null); setBroker('unknown')
    setPreview([]); setParseErrors([])
    setImporting(false); setSummary(null); setError(null)
  }

  function handleClose() { reset(); onClose() }

  async function loadFile(file: File) {
    setError(null); setSummary(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Le fichier doit être un CSV (.csv)')
      return
    }
    const text = await file.text()
    setCsv(text); setFileName(file.name)
    const parsed = parseBrokerCsv(text)
    setBroker(parsed.broker)
    setPreview(parsed.rows.slice(0, 5))
    setParseErrors(parsed.errors)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
  }

  async function doImport() {
    if (!csv) return
    setImporting(true); setError(null)
    try {
      const res = await fetch('/api/portfolio/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csv, broker }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        setImporting(false)
        return
      }
      setSummary(json.data as ImportSummary)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Modal open={open} onClose={handleClose} title="Importer un export CSV" size="lg">
      {/* Étape 1 : dépôt du fichier */}
      {!csv && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-6 py-10 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 bg-surface-2'
          }`}
        >
          <FileUp size={32} className="mx-auto text-accent mb-3" />
          <p className="text-sm text-primary mb-1">Glissez votre export CSV ou cliquez pour le sélectionner</p>
          <p className="text-xs text-muted">Formats supportés : Boursorama · Degiro · Trade Republic</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Étape 2 : aperçu + confirmation */}
      {csv && !summary && (
        <div className="space-y-4">
          {/* Header : nom de fichier + broker détecté */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet size={16} className="text-accent flex-shrink-0" />
              <span className="text-sm text-primary truncate">{fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              {broker !== 'unknown' ? (
                <span className="flex items-center gap-1.5 text-xs text-accent bg-accent/10 border border-accent/30 rounded-full px-2.5 py-1">
                  <CheckCircle2 size={12} />
                  {BROKER_LABEL[broker]} détecté
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-warning bg-warning-muted border border-warning/30 rounded-full px-2.5 py-1">
                  <AlertTriangle size={12} />
                  Format non reconnu
                </span>
              )}
              <button onClick={reset} className="text-muted hover:text-primary p-1">
                <X size={14} />
              </button>
            </div>
          </div>

          {broker === 'unknown' && (
            <div className="bg-warning-muted border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning">
              Le format de ce CSV n&apos;est pas reconnu. Vérifiez qu&apos;il s&apos;agit bien d&apos;un export
              Boursorama, Degiro ou Trade Republic, et qu&apos;il contient une ligne d&apos;en-tête avec
              les colonnes attendues (Date, ISIN, Quantité, Prix).
            </div>
          )}

          {/* Aperçu */}
          {preview.length > 0 && (
            <div>
              <p className="text-xs text-secondary uppercase tracking-widest mb-2">
                Aperçu — {preview.length} ligne{preview.length > 1 ? 's' : ''} sur les premières
              </p>
              <div className="bg-surface-2 rounded-lg overflow-hidden border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface border-b border-border text-secondary">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">ISIN</th>
                      <th className="text-left px-3 py-2 font-medium">Nom</th>
                      <th className="text-right px-3 py-2 font-medium">Qté</th>
                      <th className="text-right px-3 py-2 font-medium">Prix</th>
                      <th className="text-right px-3 py-2 font-medium">Devise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted">{row.acquisition_date ?? '—'}</td>
                        <td className="px-3 py-2 financial-value">{row.isin}</td>
                        <td className="px-3 py-2 truncate max-w-[180px]">{row.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right financial-value">{row.quantity}</td>
                        <td className="px-3 py-2 text-right financial-value">{row.average_price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="bg-warning-muted border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning">
              <p className="font-medium mb-1">{parseErrors.length} ligne(s) ignorée(s)</p>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                {parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>· Ligne {e.line} : {e.reason}</li>
                ))}
                {parseErrors.length > 5 && <li>… et {parseErrors.length - 5} autres</li>}
              </ul>
            </div>
          )}

          {error && (
            <div className="bg-danger-muted border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {broker !== 'unknown' && preview.length > 0 && (
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="secondary" onClick={handleClose}>Annuler</Button>
              <Button onClick={doImport} loading={importing}>
                Importer {preview.length > 0 && `(${preview.length}${parseErrors.length > 0 ? ` + ${parseErrors.length} erreurs` : ''})`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Étape 3 : résumé après import */}
      {summary && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-accent" />
            <h3 className="text-base font-semibold text-primary">Import terminé</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Importées" value={summary.imported.toString()} accent="success" />
            <Stat label="Doublons ignorés" value={summary.skipped.toString()} />
            <Stat label="Erreurs" value={summary.errors.length.toString()} accent={summary.errors.length > 0 ? 'warning' : undefined} />
          </div>
          {summary.errors.length > 0 && (
            <div className="bg-warning-muted border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning max-h-32 overflow-y-auto">
              <p className="font-medium mb-1">Détail des erreurs</p>
              {summary.errors.map((e, i) => (
                <p key={i}>· {e.isin ? `${e.isin} — ` : e.line ? `Ligne ${e.line} — ` : ''}{e.reason}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-border">
            <Button onClick={handleClose}>Fermer</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'warning' }) {
  const color = accent === 'success' ? 'text-accent'
              : accent === 'warning' ? 'text-warning'
              : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className={`text-lg font-semibold financial-value mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}
