/**
 * Formulaire d'édition d'une acquisition future (modale simple inline).
 *
 * Calcule en temps réel : mensualité PMT, coût total crédit, cashflow
 * mensuel net, rendement brut, badge autofinancé/équilibre/effort.
 *
 * Toute la logique métier vit dans `lib/analyse/projectionFIRE.ts` —
 * ce composant ne fait que de l'affichage et lance des handlers.
 */
'use client'

import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { Field, Input, Select } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import type { AcquisitionFuture } from '@/types/analyse'

interface Props {
  acquisition: AcquisitionFuture
  onChange:    (a: AcquisitionFuture) => void
  onDelete:    () => void
}

export function AcquisitionFutureForm({ acquisition, onChange, onDelete }: Props) {
  // Recalculs en temps réel
  const calc = useMemo(() => {
    const prixComplet = acquisition.prix_achat * (1 + acquisition.frais_notaire_pct / 100)
    const capitalEmprunt = Math.max(0, prixComplet - acquisition.apport)
    const r = acquisition.taux_interet / 100 / 12
    const n = acquisition.duree_credit_ans * 12
    const mensualite = capitalEmprunt > 0 && r > 0 && n > 0
      ? capitalEmprunt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      : 0
    const coutTotal = mensualite * n
    const coutCredit = coutTotal - capitalEmprunt

    const loyerEffectif = acquisition.loyer_brut_mensuel * (1 - acquisition.taux_vacance_pct / 100)
    const cashflow = acquisition.type === 'locatif'
      ? loyerEffectif - acquisition.charges_mensuelles - mensualite
      : -mensualite

    const rendementBrut = acquisition.prix_achat > 0
      ? (acquisition.loyer_brut_mensuel * 12) / acquisition.prix_achat * 100
      : 0

    return { prixComplet, capitalEmprunt, mensualite, coutTotal, coutCredit, cashflow, rendementBrut }
  }, [acquisition])

  function patch<K extends keyof AcquisitionFuture>(key: K, v: AcquisitionFuture[K]) {
    onChange({ ...acquisition, [key]: v })
  }
  const setNum = <K extends keyof AcquisitionFuture>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => patch(key, Number(e.target.value) as AcquisitionFuture[K])

  const cashflowColor =
    calc.cashflow >    0 ? 'text-accent' :
    calc.cashflow > -200 ? 'text-warning' :
                           'text-danger'
  const cashflowLabel =
    calc.cashflow >    0 ? `Autofinancé +${calc.cashflow.toFixed(0)} €/mois` :
    calc.cashflow > -200 ? `Équilibre ${calc.cashflow.toFixed(0)} €/mois` :
                           `Effort ${calc.cashflow.toFixed(0)} €/mois`

  return (
    <div className="bg-surface-2 rounded-lg p-4 space-y-4 border border-border">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={acquisition.nom}
          onChange={(e) => patch('nom', e.target.value)}
          placeholder="Nom du bien (ex: Appart Lyon T3)"
          className="bg-transparent text-primary text-sm font-medium flex-1 border-b border-border focus:border-accent outline-none pb-1"
        />
        <Button variant="ghost" icon={Trash2} onClick={onDelete} title="Supprimer" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Dans (années)">
          <Input type="number" min={0} max={20}
            value={acquisition.dans_combien_annees}
            onChange={setNum('dans_combien_annees')} />
        </Field>
        <Field label="Type">
          <Select value={acquisition.type} onChange={(e) => patch('type', e.target.value as 'locatif' | 'RP')}>
            <option value="locatif">Locatif</option>
            <option value="RP">Résidence principale</option>
          </Select>
        </Field>
        <Field label="Appréciation /an %">
          <Input type="number" min={0} max={10} step={0.5}
            value={acquisition.appreciation_annuelle_pct}
            onChange={setNum('appreciation_annuelle_pct')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Prix d'achat €">
          <Input type="number" min={0} step={1000}
            value={acquisition.prix_achat}
            onChange={setNum('prix_achat')} />
        </Field>
        <Field label="Frais notaire %">
          <Input type="number" min={0} max={15} step={0.5}
            value={acquisition.frais_notaire_pct}
            onChange={setNum('frais_notaire_pct')} />
        </Field>
        <Field label="Apport €">
          <Input type="number" min={0} step={1000}
            value={acquisition.apport}
            onChange={setNum('apport')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Taux %">
          <Input type="number" min={0} max={10} step={0.1}
            value={acquisition.taux_interet}
            onChange={setNum('taux_interet')} />
        </Field>
        <Field label="Durée crédit (ans)">
          <Select value={acquisition.duree_credit_ans} onChange={(e) => patch('duree_credit_ans', Number(e.target.value))}>
            <option value={10}>10 ans</option>
            <option value={15}>15 ans</option>
            <option value={20}>20 ans</option>
            <option value={25}>25 ans</option>
            <option value={30}>30 ans</option>
          </Select>
        </Field>
        <Field label="Charges €/mois">
          <Input type="number" min={0} step={10}
            value={acquisition.charges_mensuelles}
            onChange={setNum('charges_mensuelles')} />
        </Field>
      </div>

      {acquisition.type === 'locatif' && (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          <Field label="Loyer brut €/mois">
            <Input type="number" min={0} step={10}
              value={acquisition.loyer_brut_mensuel}
              onChange={setNum('loyer_brut_mensuel')} />
          </Field>
          <Field label="Vacance locative %">
            <Input type="number" min={0} max={50} step={1}
              value={acquisition.taux_vacance_pct}
              onChange={setNum('taux_vacance_pct')} />
          </Field>
        </div>
      )}

      {/* Récap calculé en temps réel */}
      <div className="bg-surface rounded-lg p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-secondary">Capital emprunté</span>
          <span className="financial-value text-primary">{formatCurrency(calc.capitalEmprunt, 'EUR', { decimals: 0 })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">Mensualité estimée</span>
          <span className="financial-value text-accent font-medium">{formatCurrency(calc.mensualite, 'EUR', { decimals: 0 })} / mois</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">Coût total du crédit</span>
          <span className="financial-value text-primary">{formatCurrency(calc.coutCredit, 'EUR', { decimals: 0 })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">Coût total opération</span>
          <span className="financial-value text-primary">{formatCurrency(calc.prixComplet + calc.coutCredit, 'EUR', { decimals: 0 })}</span>
        </div>
        {acquisition.type === 'locatif' && (
          <>
            <div className="flex justify-between pt-1.5 border-t border-border">
              <span className="text-secondary">Rendement brut</span>
              <span className="financial-value text-primary">{formatPercent(calc.rendementBrut, { decimals: 1 })}</span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-secondary">Cashflow mensuel net</span>
              <span className={cn('financial-value font-medium', cashflowColor)}>{cashflowLabel}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
