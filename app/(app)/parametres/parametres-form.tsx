'use client'

import { useState } from 'react'
import { Save, User, Percent, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database.types'

const TMI_OPTIONS = [0, 11, 30, 41, 45]
const FISCAL_SITUATIONS = [
  { value: 'single',   label: 'Célibataire / Divorcé(e)' },
  { value: 'married',  label: 'Marié(e)' },
  { value: 'pacs',     label: 'Pacsé(e)' },
]

interface Props { profile: Profile | null; userEmail: string }

export default function ParametresForm({ profile, userEmail }: Props) {
  const [displayName,     setDisplayName]     = useState(profile?.display_name ?? '')
  const [tmiRate,         setTmiRate]         = useState(profile?.tmi_rate ?? 30)
  const [fiscalSituation, setFiscalSituation] = useState(profile?.fiscal_situation ?? 'single')
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('profiles').update({
      display_name: displayName || null,
      tmi_rate: tmiRate,
      fiscal_situation: fiscalSituation,
    }).eq('id', (await supabase.auth.getUser()).data.user!.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const SECTION = 'card p-6 space-y-5'
  const LABEL   = 'block text-sm text-secondary mb-1.5'
  const INPUT   = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-accent transition-colors'

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Profil */}
      <div className={SECTION}>
        <div className="flex items-center gap-2 mb-2">
          <User size={15} className="text-muted" />
          <h2 className="text-sm font-medium text-primary">Profil</h2>
        </div>
        <div>
          <label className={LABEL}>E-mail</label>
          <input disabled value={userEmail} className={INPUT + ' opacity-50 cursor-not-allowed'} />
        </div>
        <div>
          <label className={LABEL}>Nom d'affichage</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Votre prénom"
            className={INPUT}
          />
        </div>
      </div>

      {/* Fiscalité */}
      <div className={SECTION}>
        <div className="flex items-center gap-2 mb-2">
          <Percent size={15} className="text-muted" />
          <h2 className="text-sm font-medium text-primary">Situation fiscale</h2>
          <span className="text-xs text-secondary ml-1">
            Utilisée pour l'estimation du rendement net après impôt
          </span>
        </div>

        <div>
          <label className={LABEL}>Tranche marginale d'imposition (TMI)</label>
          <div className="flex gap-2 flex-wrap">
            {TMI_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setTmiRate(rate)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tmiRate === rate
                    ? 'bg-accent-muted border-accent/30 text-accent'
                    : 'bg-surface-2 border-border text-secondary hover:text-primary'
                }`}
              >
                {rate} %
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL}>Situation familiale</label>
          <select
            value={fiscalSituation}
            onChange={(e) => setFiscalSituation(e.target.value)}
            className={INPUT}
          >
            {FISCAL_SITUATIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Flat tax / PFU info */}
        <div className="bg-surface-2 rounded-lg p-4 text-xs text-secondary space-y-1">
          <p className="text-primary font-medium text-sm mb-2">Règles fiscales appliquées</p>
          <p>· Bourse (CTO) : Flat tax 30 % (PFU) ou barème si plus favorable</p>
          <p>· PEA : Exonéré après 5 ans (hors prélèvements sociaux 17,2 %)</p>
          <p>· Crypto : Flat tax 30 % sur les plus-values de cession</p>
          <p>· SCPI direct : Revenus fonciers — TMI + 17,2 % PS</p>
          <p>· LMNP réel : Amortissement — fiscalité selon résultat</p>
        </div>
      </div>

      {/* Devise */}
      <div className={SECTION}>
        <div className="flex items-center gap-2 mb-2">
          <Globe size={15} className="text-muted" />
          <h2 className="text-sm font-medium text-primary">Devise de référence</h2>
        </div>
        <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg">
          <span className="text-2xl">🇪🇺</span>
          <div>
            <p className="text-sm text-primary font-medium">EUR — Euro</p>
            <p className="text-xs text-secondary">Toutes les valorisations sont converties en EUR</p>
          </div>
          <Badge className="ml-auto">Défaut</Badge>
        </div>
        <p className="text-xs text-secondary">Support multi-devise (USD, GBP…) disponible en Phase 2.</p>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button type="submit" icon={Save} loading={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
        {saved && <span className="text-sm text-accent">✓ Paramètres sauvegardés</span>}
      </div>
    </form>
  )
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`px-2 py-0.5 bg-accent-muted text-accent text-xs rounded-md border border-accent/20 ${className ?? ''}`}>
      {children}
    </span>
  )
}
