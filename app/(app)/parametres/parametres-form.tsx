'use client'

import { useState } from 'react'
import { Save, User, Percent, Globe, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database.types'

// `null` = "Non renseigné" → fallback TMI 30 % côté fiscaliteImmo / optimiseur.
const TMI_OPTIONS: Array<number | null> = [null, 0, 11, 30, 41, 45]
const FISCAL_SITUATIONS = [
  { value: 'single',   label: 'Célibataire / Divorcé(e)' },
  { value: 'married',  label: 'Marié(e)' },
  { value: 'pacs',     label: 'Pacsé(e)' },
]

interface Props { profile: Profile | null; userEmail: string }

export default function ParametresForm({ profile, userEmail }: Props) {
  const [displayName,     setDisplayName]     = useState(profile?.display_name ?? '')
  // U11 — null = TMI non renseigné (fallback 30 % côté calcul, badge "estimée" affiché).
  const [tmiRate,         setTmiRate]         = useState<number | null>(profile?.tmi_rate ?? null)
  const [fiscalSituation, setFiscalSituation] = useState(profile?.fiscal_situation ?? 'single')
  // Migration 036 — revenus pro foyer (LMP detection) + parts fiscales
  const [proIncomeEur,    setProIncomeEur]    = useState<number | ''>(
    profile?.professional_income_eur ?? '',
  )
  const [foyerParts,      setFoyerParts]      = useState<number | ''>(
    profile?.foyer_fiscal_parts ?? '',
  )
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)

  // Sprint 6 — préférences email
  const [emailMonthly,    setEmailMonthly]    = useState(profile?.email_monthly_report ?? true)
  const [emailToggleBusy, setEmailToggleBusy] = useState(false)
  const [sendingTest,     setSendingTest]     = useState(false)
  const [testStatus,      setTestStatus]      = useState<string | null>(null)

  /** Toggle opt-in mensuel (PATCH unsubscribe / POST resubscribe). */
  async function handleEmailToggle(nextValue: boolean) {
    setEmailToggleBusy(true)
    setTestStatus(null)
    try {
      if (nextValue) {
        // Réactivation : POST /api/email/resubscribe (régénère le token)
        const res = await fetch('/api/email/resubscribe', { method: 'POST' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setEmailMonthly(true)
      } else {
        // Désactivation : update direct (l'utilisateur est connecté ici,
        // pas besoin du lien public unsubscribe — on patch profiles)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Non authentifié')
        const { error } = await supabase
          .from('profiles')
          .update({ email_monthly_report: false })
          .eq('id', user.id)
        if (error) throw error
        setEmailMonthly(false)
      }
    } catch (e) {
      setTestStatus(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEmailToggleBusy(false)
    }
  }

  /** Envoie un rapport de test à l'utilisateur courant. */
  async function handleSendTest() {
    setSendingTest(true)
    setTestStatus(null)
    try {
      const res  = await fetch('/api/email/monthly-report', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      const success = json.data?.success
      if (success) {
        setTestStatus(`✓ Email envoyé à ${userEmail}`)
      } else {
        setTestStatus(`Échec : ${json.data?.error ?? 'erreur inconnue'}`)
      }
    } catch (e) {
      setTestStatus(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSendingTest(false)
      // Auto-clear le message au bout de 6 s
      setTimeout(() => setTestStatus(null), 6000)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('profiles').update({
      display_name: displayName || null,
      // U11 — `null` accepté côté DB (colonne nullable) ; fallback 30 % côté calculs.
      tmi_rate: tmiRate,
      fiscal_situation: fiscalSituation,
      // Migration 036 — contexte foyer pour détection LMP
      professional_income_eur: proIncomeEur === '' ? 0 : proIncomeEur,
      foyer_fiscal_parts:      foyerParts   === '' ? 1 : foyerParts,
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
          <label className={LABEL}>Nom d&apos;affichage</label>
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
            Utilisée pour l&apos;estimation du rendement net après impôt
          </span>
        </div>

        <div>
          <label className={LABEL}>Tranche marginale d&apos;imposition (TMI)</label>
          <div className="flex gap-2 flex-wrap">
            {TMI_OPTIONS.map((rate) => (
              <button
                key={rate === null ? 'none' : rate}
                type="button"
                onClick={() => setTmiRate(rate)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tmiRate === rate
                    ? 'bg-accent-muted border-accent/30 text-accent'
                    : 'bg-surface-2 border-border text-secondary hover:text-primary'
                }`}
              >
                {rate === null ? 'Non renseigné' : `${rate} %`}
              </button>
            ))}
          </div>
          {tmiRate === null && (
            <p className="text-xs text-muted mt-2">
              Estimation 30 % appliquée par défaut dans les calculs fiscaux.
            </p>
          )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Revenus professionnels du foyer (€/an)
              <span className="text-muted ml-1">(facultatif)</span>
            </label>
            <input
              type="number" min={0} step={100}
              value={proIncomeEur === '' ? '' : proIncomeEur}
              onChange={(e) => setProIncomeEur(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="35 000"
              className={INPUT}
            />
            <p className="text-xs text-muted mt-1.5">
              Salaires + BNC + BIC pro + pensions. Hors loyers. Sert à détecter
              automatiquement si vous êtes LMP (recettes meublées &gt; revenus pro).
            </p>
          </div>
          <div>
            <label className={LABEL}>Parts fiscales du foyer</label>
            <input
              type="number" min={0.5} step={0.5}
              value={foyerParts === '' ? '' : foyerParts}
              onChange={(e) => setFoyerParts(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="2"
              className={INPUT}
            />
            <p className="text-xs text-muted mt-1.5">Quotient familial.</p>
          </div>
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

      {/* Notifications email (Sprint 6) */}
      <div className={SECTION}>
        <div className="flex items-center gap-2 mb-2">
          <Mail size={15} className="text-muted" />
          <h2 className="text-sm font-medium text-primary">Notifications</h2>
        </div>

        <div className="flex items-start justify-between gap-4 bg-surface-2 rounded-lg p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-primary font-medium">Rapport mensuel par email</p>
            <p className="text-xs text-secondary mt-1 leading-relaxed">
              Recevez chaque 1er du mois un récap de votre patrimoine et vos 3 actions prioritaires.
              Envoyé à <span className="text-primary">{userEmail}</span>.
            </p>
            {profile?.last_monthly_report_sent_at && (
              <p className="text-[11px] text-muted mt-2">
                Dernier envoi : {new Date(profile.last_monthly_report_sent_at).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleEmailToggle(!emailMonthly)}
            disabled={emailToggleBusy}
            aria-pressed={emailMonthly}
            aria-label={emailMonthly ? 'Désactiver le rapport mensuel' : 'Activer le rapport mensuel'}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              emailMonthly ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                emailMonthly ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant="secondary"
            icon={Send}
            loading={sendingTest}
            onClick={handleSendTest}
            disabled={!emailMonthly || sendingTest}
            title={!emailMonthly
              ? 'Active les emails mensuels pour tester le rapport'
              : undefined}
          >
            Recevoir un rapport test maintenant
          </Button>
          {testStatus && (
            <span className={`text-sm ${testStatus.startsWith('✓') ? 'text-accent' : 'text-warning'}`}>
              {testStatus}
            </span>
          )}
        </div>
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
