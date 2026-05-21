'use client'

/**
 * Bouton "Exporter le bilan" + modale de selection d'annee.
 *
 * Au clic : ouvre une modale avec un select des annees depuis
 * l'acquisition jusqu'a aujourd'hui. Le bouton "Generer le PDF"
 * navigue vers /api/real-estate/[id]/export-pdf?year=YYYY qui
 * declenche le download navigateur (Content-Disposition: attachment).
 */

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/field'

interface Props {
  propertyId:        string
  /** Date d'acquisition (ISO) pour determiner les annees disponibles. */
  acquisitionDate:   string | null
}

export function ExportPdfButton({ propertyId, acquisitionDate }: Props) {
  const [open, setOpen] = useState(false)
  const currentYear = new Date().getUTCFullYear()
  const acqYear = acquisitionDate ? new Date(acquisitionDate).getUTCFullYear() : currentYear
  const [year, setYear] = useState<number>(currentYear)

  // Annees disponibles : acquisition -> annee courante (decroissant)
  const years: number[] = []
  for (let y = currentYear; y >= acqYear && y >= currentYear - 10; y--) years.push(y)
  if (years.length === 0) years.push(currentYear)

  function handleGenerate() {
    // Force le download via une navigation directe (Content-Disposition: attachment)
    window.location.href = `/api/real-estate/${propertyId}/export-pdf?year=${year}`
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-secondary hover:text-primary border border-border hover:border-accent/40 rounded-lg transition-colors"
        title="Exporter le bilan annuel en PDF"
      >
        <FileDown size={13} />
        Exporter le bilan
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Exporter le bilan annuel" size="sm">
        <div className="space-y-5">
          <p className="text-sm text-secondary">
            Quelle année souhaitez-vous exporter ?
          </p>

          <Field label="Année du bilan">
            <Select value={String(year)} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>

          <p className="text-xs text-muted">
            Le PDF contient 4 pages : synthèse · amortissement du crédit ·
            détail des charges · résumé fiscal. Conforme pour partage avec votre
            expert-comptable.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={handleGenerate} icon={FileDown}>
              Générer le PDF
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
