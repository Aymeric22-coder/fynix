/**
 * Formulaire d'édition d'une acquisition future (modale simple inline).
 *
 * Calcule en temps réel : mensualité PMT, coût total crédit, cashflow
 * mensuel net, rendement brut, badge autofinancé/équilibre/effort.
 *
 * Toute la logique métier vit dans `lib/analyse/projectionFIRE.ts` —
 * ce composant ne fait que de l'affichage et lance des handlers.
 *
 * Saisie : les champs sont pilotés par un **état local** (`draft`) et la
 * persistance (`onChange` → hook → PUT Supabase) est **debouncée 500 ms**.
 * Sans cela, chaque frappe déclenchait un PUT + un refetch realtime qui
 * réécrasaient le `value` contrôlé en plein milieu de la saisie (chiffres
 * qui sautent). Les champs numériques sont stockés en `string` pour
 * autoriser un état vide transitoire (effacement) sans forcer un 0.
 */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Brouillon d'édition : champs numériques en `string` (vide autorisé). */
interface Draft {
  nom:                       string
  type:                      AcquisitionFuture['type']
  duree_credit_ans:          number
  dans_combien_annees:       string
  appreciation_annuelle_pct: string
  prix_achat:                string
  frais_notaire_pct:         string
  apport:                    string
  taux_interet:              string
  charges_mensuelles:        string
  loyer_brut_mensuel:        string
  taux_vacance_pct:          string
}

/** Parse robuste : '' / valeur invalide → 0. */
const toNum = (s: string | number): number => {
  const v = typeof s === 'number' ? s : Number(s)
  return Number.isFinite(v) ? v : 0
}

function toDraft(a: AcquisitionFuture): Draft {
  return {
    nom:                       a.nom,
    type:                      a.type,
    duree_credit_ans:          a.duree_credit_ans,
    dans_combien_annees:       String(a.dans_combien_annees),
    appreciation_annuelle_pct: String(a.appreciation_annuelle_pct),
    prix_achat:                String(a.prix_achat),
    frais_notaire_pct:         String(a.frais_notaire_pct),
    apport:                    String(a.apport),
    taux_interet:              String(a.taux_interet),
    charges_mensuelles:        String(a.charges_mensuelles),
    loyer_brut_mensuel:        String(a.loyer_brut_mensuel),
    taux_vacance_pct:          String(a.taux_vacance_pct),
  }
}

function fromDraft(d: Draft, id: string): AcquisitionFuture {
  return {
    id,
    nom:                       d.nom,
    type:                      d.type,
    duree_credit_ans:          d.duree_credit_ans,
    dans_combien_annees:       toNum(d.dans_combien_annees),
    appreciation_annuelle_pct: toNum(d.appreciation_annuelle_pct),
    prix_achat:                toNum(d.prix_achat),
    frais_notaire_pct:         toNum(d.frais_notaire_pct),
    apport:                    toNum(d.apport),
    taux_interet:              toNum(d.taux_interet),
    charges_mensuelles:        toNum(d.charges_mensuelles),
    loyer_brut_mensuel:        toNum(d.loyer_brut_mensuel),
    taux_vacance_pct:          toNum(d.taux_vacance_pct),
  }
}

export function AcquisitionFutureForm({ acquisition, onChange, onDelete }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(acquisition))

  // Refs pour découpler la persistance (debounce) des re-renders.
  const draftRef    = useRef(draft)
  const editingRef  = useRef(false)
  const timerRef    = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { draftRef.current = draft }, [draft])

  // Resync depuis la prop canonique (autre onglet / valeur normalisée
  // serveur) UNIQUEMENT hors édition active — la frappe de l'utilisateur prime.
  useEffect(() => {
    if (editingRef.current) return
    setDraft(toDraft(acquisition))
  }, [acquisition])

  // Nettoyage du timer au démontage (suppression de l'acquisition).
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const schedulePersist = useCallback((next: Draft) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      onChangeRef.current(fromDraft(next, acquisition.id))
    }, 500)
  }, [acquisition.id])

  // Flush immédiat (sortie du bloc) : persiste sans attendre le debounce.
  const flushPersist = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
      onChangeRef.current(fromDraft(draftRef.current, acquisition.id))
    }
  }, [acquisition.id])

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      draftRef.current = next
      schedulePersist(next)
      return next
    })
  }
  const setNum = (key: keyof Draft) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setField(key, e.target.value)

  // Recalculs en temps réel (à partir du brouillon local).
  const calc = useMemo(() => {
    const prix     = toNum(draft.prix_achat)
    const fraisPct = toNum(draft.frais_notaire_pct)
    const apport   = toNum(draft.apport)
    const taux     = toNum(draft.taux_interet)
    const duree    = draft.duree_credit_ans
    const loyer    = toNum(draft.loyer_brut_mensuel)
    const vacance  = toNum(draft.taux_vacance_pct)
    const charges  = toNum(draft.charges_mensuelles)

    const prixComplet = prix * (1 + fraisPct / 100)
    const capitalEmprunt = Math.max(0, prixComplet - apport)
    const r = taux / 100 / 12
    const n = duree * 12
    const mensualite = capitalEmprunt > 0 && r > 0 && n > 0
      ? capitalEmprunt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      : 0
    const coutTotal = mensualite * n
    const coutCredit = coutTotal - capitalEmprunt

    const loyerEffectif = loyer * (1 - vacance / 100)
    const cashflow = draft.type === 'locatif'
      ? loyerEffectif - charges - mensualite
      : -mensualite

    const rendementBrut = prix > 0 ? (loyer * 12) / prix * 100 : 0

    return { prixComplet, capitalEmprunt, mensualite, coutTotal, coutCredit, cashflow, rendementBrut }
  }, [draft])

  const cashflowColor =
    calc.cashflow >    0 ? 'text-accent' :
    calc.cashflow > -200 ? 'text-warning' :
                           'text-danger'
  const cashflowLabel =
    calc.cashflow >    0 ? `Autofinancé +${calc.cashflow.toFixed(0)} €/mois` :
    calc.cashflow > -200 ? `Équilibre ${calc.cashflow.toFixed(0)} €/mois` :
                           `Effort ${calc.cashflow.toFixed(0)} €/mois`

  return (
    <div
      className="bg-surface-2 rounded-lg p-4 space-y-4 border border-border"
      onFocusCapture={() => { editingRef.current = true }}
      onBlurCapture={(e) => {
        // Ne réagit que si le focus quitte VRAIMENT le bloc (pas un saut
        // entre deux champs internes).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          editingRef.current = false
          flushPersist()
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={draft.nom}
          onChange={(e) => setField('nom', e.target.value)}
          placeholder="Nom du bien (ex: Appart Lyon T3)"
          className="bg-transparent text-primary text-sm font-medium flex-1 border-b border-border focus:border-accent outline-none pb-1"
        />
        <Button variant="ghost" icon={Trash2} onClick={onDelete} title="Supprimer" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Dans (années)">
          <Input type="number" min={0} max={20}
            value={draft.dans_combien_annees}
            onChange={setNum('dans_combien_annees')} />
        </Field>
        <Field label="Type">
          <Select value={draft.type} onChange={(e) => setField('type', e.target.value as 'locatif' | 'RP')}>
            <option value="locatif">Locatif</option>
            <option value="RP">Résidence principale</option>
          </Select>
        </Field>
        <Field label="Appréciation /an %">
          <Input type="number" min={0} max={10} step={0.5}
            value={draft.appreciation_annuelle_pct}
            onChange={setNum('appreciation_annuelle_pct')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Prix d'achat €">
          <Input type="number" min={0} step={1000}
            value={draft.prix_achat}
            onChange={setNum('prix_achat')} />
        </Field>
        <Field label="Frais notaire %">
          <Input type="number" min={0} max={15} step={0.5}
            value={draft.frais_notaire_pct}
            onChange={setNum('frais_notaire_pct')} />
        </Field>
        <Field label="Apport €">
          <Input type="number" min={0} step={1000}
            value={draft.apport}
            onChange={setNum('apport')} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Taux %">
          <Input type="number" min={0} max={10} step={0.1}
            value={draft.taux_interet}
            onChange={setNum('taux_interet')} />
        </Field>
        <Field label="Durée crédit (ans)">
          <Select value={draft.duree_credit_ans} onChange={(e) => setField('duree_credit_ans', Number(e.target.value))}>
            <option value={10}>10 ans</option>
            <option value={15}>15 ans</option>
            <option value={20}>20 ans</option>
            <option value={25}>25 ans</option>
            <option value={30}>30 ans</option>
          </Select>
        </Field>
        <Field label="Charges €/mois">
          <Input type="number" min={0} step={10}
            value={draft.charges_mensuelles}
            onChange={setNum('charges_mensuelles')} />
        </Field>
      </div>

      {draft.type === 'locatif' && (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          <Field label="Loyer brut €/mois">
            <Input type="number" min={0} step={10}
              value={draft.loyer_brut_mensuel}
              onChange={setNum('loyer_brut_mensuel')} />
          </Field>
          <Field label="Vacance locative %">
            <Input type="number" min={0} max={50} step={1}
              value={draft.taux_vacance_pct}
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
        {draft.type === 'locatif' && (
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
