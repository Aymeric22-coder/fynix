/**
 * Bouton d'export CSV (Sprint 4) — Client Component.
 *
 * Reçoit des lignes déjà sérialisées depuis un Server Component parent et
 * déclenche, au clic, la génération du CSV + le téléchargement côté navigateur
 * (Blob + URL.createObjectURL). Aucune route API : la donnée est déjà chargée
 * côté serveur et passée en prop.
 *
 * Action secondaire discrète (style `secondary`, pas un gros bouton primaire).
 */

'use client'

import { Download } from 'lucide-react'
import {
  buildPositionsCsv,
  buildTransactionsCsv,
  downloadCsv,
  type PositionCsvRow,
  type TransactionCsvRow,
} from '@/lib/portfolio/export-csv'

type Props =
  | {
      kind:           'positions'
      rows:           PositionCsvRow[]
      filenamePrefix: string
      refCurrency?:   string
      label?:         string
    }
  | {
      kind:           'transactions'
      rows:           TransactionCsvRow[]
      filenamePrefix: string
      refCurrency?:   string
      label?:         string
    }

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CsvExportButton(props: Props) {
  const { kind, filenamePrefix, label } = props
  const disabled = props.rows.length === 0

  function handleClick() {
    const content =
      kind === 'positions'
        ? buildPositionsCsv(props.rows, props.refCurrency ?? 'EUR')
        : buildTransactionsCsv(props.rows)
    downloadCsv(`${filenamePrefix}-${todayStamp()}.csv`, content)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label ?? 'Exporter en CSV'}
      title={disabled ? 'Aucune donnée à exporter' : (label ?? 'Exporter en CSV')}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                 text-secondary border border-border hover:text-primary hover:bg-surface-2
                 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-secondary"
    >
      <Download size={13} />
      {label ?? 'Exporter (CSV)'}
    </button>
  )
}
