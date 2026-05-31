/**
 * Composant client orchestrant l'UI de la page /profil.
 *
 * Logique :
 *  - charge le profile via useUserProfile
 *  - si `profile_completed_at` est null OU si l'utilisateur a cliqué
 *    "Modifier mon profil" → affiche le wizard
 *  - sinon → affiche la carte de profil
 *
 * Tâche B :
 *  - Si le wizard a été abandonné (wizard_step_completed > 0 et < STEPS.length sans
 *    profile_completed_at), propose une bannière "Reprendre à l'étape X"
 *    avec deux CTA : reprendre où l'utilisateur en était, ou recommencer.
 *  - L'étape initiale du wizard est lue depuis profile.wizard_step_completed.
 *  - À chaque changement d'étape dans le wizard, la progression est
 *    sauvegardée via le hook `saveStep`.
 *
 * Le profile de base (id, display_name, etc.) existe toujours grâce au
 * trigger on_auth_user_created — pas besoin de gérer le cas "row inexistante".
 */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PlayCircle, RotateCcw, Sparkles, ArrowLeft, Compass } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { ProfilQuestionnaire } from '@/components/profil/ProfilQuestionnaire'
import { ProfilCard } from '@/components/profil/ProfilCard'
import { STEPS } from '@/lib/profil/calculs'
import { computeActivePath, getNextStep, END, type StepId } from '@/lib/profil/routing'
import { getChapterForStep, getChapterIndex, CHAPTERS } from '@/lib/profil/chaptersConstants'
import { useUserProfile } from '@/hooks/use-user-profile'
import { EMPTY_VALUES, type QuestionnaireValues } from '@/components/profil/questionnaire-types'
import type { LifeEventDraft } from '@/components/profil/lifeEventsDraft'

export function ProfilClient() {
  const { profile, loading, error, save, saveStep } = useUserProfile()
  const [editing, setEditing]     = useState(false)
  const [startFresh, setStartFresh] = useState(false)
  /** Étape de départ choisie via la bannière de reprise. Null = laisser le
   *  wizard utiliser profile.wizard_step_completed + 1 (comportement par
   *  défaut, ouverture sur la prochaine étape à compléter). */
  const [resumeStep, setResumeStep] = useState<number | null>(null)
  /** CS5 — Évènements de vie chargés depuis la table life_events au mount. */
  const [initialLifeEvents, setInitialLifeEvents] = useState<LifeEventDraft[]>([])

  // Charge les évènements de vie au mount (un seul fetch, pas dans le hook
  // useUserProfile qui reste centré sur la table profiles).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res  = await fetch('/api/profile/life-events')
        const json = await res.json().catch(() => ({}))
        if (!cancelled && Array.isArray(json?.data?.events)) {
          setInitialLifeEvents(json.data.events as LifeEventDraft[])
        }
      } catch { /* silent : pas d'events = comportement vide identique */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-12 w-1/3" />
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div>
        <PageHeader title="Profil investisseur" />
        <div className="card p-6 text-center">
          <p className="text-sm text-danger">Erreur de chargement du profil : {error ?? 'profil introuvable'}.</p>
        </div>
      </div>
    )
  }

  const isComplete = !!profile.profile_completed_at
  // CS1 — utiliser STEPS.length (= 9 après CS1) plutôt que hardcoder.
  const LAST_STEP  = STEPS.length
  const lastStep   = Math.min(LAST_STEP, Math.max(0, profile.wizard_step_completed ?? 0))

  // CS10 — La reprise utilise `getNextStep` (path-aware) au lieu de
  // `lastStep + 1` (broken depuis le réordonnement de ALL_STEPS qui
  // intercale Step 9 entre 3 et 4).
  const _initialValues = extractInitialValues(profile)
  const _activeValues  = { ...EMPTY_VALUES, ..._initialValues }
  const _resumeCursor  = lastStep > 0
    ? getNextStep(lastStep as StepId, _activeValues)
    : (1 as StepId)
  const _resumeAt: StepId | null = _resumeCursor === END ? null : (_resumeCursor as StepId)

  const hasPartial = !isComplete && lastStep > 0 && _resumeAt !== null
  // Affiche le bandeau « tu affines » si l'utilisateur arrive du nouvel
  // onboarding 60s (quick_done = true) et n'a pas encore terminé le wizard.
  const showQuickAffinerBanner = profile.onboarding_quick_done && !isComplete
  // CS4 — Bandeau « Affine tes priorités ». Visible uniquement pour les
  // profils complets dont la priorité a été saisie au format LEGACY (mono-axe)
  // et qui n'ont pas encore migré vers la boussole 4 axes. Le moteur recos
  // continue de fonctionner via PRIORITE_BOOST, mais l'utilisateur perd la
  // granularité (sécurité 80, optim 50…). Le clic ouvre le wizard à la step
  // Risque & FIRE pour saisir les axes.
  const showCs4MigrationBanner =
    isComplete && !editing && profile.priorite !== null && profile.objectifs_axes === null
  // Si on a une reprise possible et que l'utilisateur n'a pas encore choisi
  // (resumeStep null, startFresh false), on affiche d'abord la bannière.
  const showResumeBanner = hasPartial && resumeStep === null && !startFresh
  const showWizard       = (!isComplete || editing) && !showResumeBanner
  // Étape d'ouverture du wizard : choix utilisateur > reprise auto > 1.
  const wizardInitialStep = resumeStep ?? (_resumeAt ?? 1)

  async function handleSubmit(v: QuestionnaireValues, lifeEvents: LifeEventDraft[]) {
    const res = await save(v)
    if (res.error) return res
    // CS5 — Sync wholesale des évènements après save profil. Échec non
    // bloquant : on logue mais on bascule quand même sur la carte profil
    // (les events seront re-tentables via le bouton Modifier).
    try {
      const r = await fetch('/api/profile/life-events/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ events: lifeEvents }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) {
        // Sync échouée mais profile sauvegardé : on prévient.
        return { error: `Profil enregistré, mais synchro évènements échouée : ${j.error ?? 'erreur inconnue'}` }
      }
    } catch (e) {
      return { error: `Profil enregistré, synchro évènements indisponible : ${String(e)}` }
    }
    setEditing(false)
    setResumeStep(null)
    setStartFresh(false)
    return res
  }

  async function handleStepSave(step: number, partial: Partial<QuestionnaireValues>) {
    return saveStep(step, partial)
  }

  return (
    <div>
      <PageHeader
        title="Profil investisseur"
        subtitle={
          showResumeBanner
            ? 'Tu as déjà commencé le questionnaire — reprends où tu en étais.'
            : showWizard
            ? 'Quelques minutes pour calibrer ton accompagnement FIRECORE.'
            : 'Ta synthèse globale — recalculée à chaque modification.'
        }
      />

      {showQuickAffinerBanner && (
        <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Sparkles size={18} className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-primary font-medium">Tu affines ta projection</p>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                Plus tu renseignes (TMI, enveloppes, biens immobiliers…), plus FIRECORE est précis.
                Tu peux aussi t&apos;arrêter ici et revenir plus tard.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-secondary hover:text-primary hover:border-accent/40 transition-colors whitespace-nowrap"
          >
            <ArrowLeft size={12} />
            Revenir au dashboard
          </Link>
        </div>
      )}

      {showCs4MigrationBanner && (
        <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Compass size={18} className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-primary font-medium">Affine tes priorités</p>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                Tu avais déclaré « <span className="text-primary font-medium">{profile.priorite}</span> » comme priorité unique.
                FIRECORE évolue : tu peux maintenant pondérer 4 axes (Rendement, Sécurité, Optimisation, Transmission)
                pour des recommandations plus fines.
              </p>
            </div>
          </div>
          <Button
            icon={Compass}
            onClick={() => { setEditing(true); setResumeStep(9) }}
          >
            Configurer la boussole
          </Button>
        </div>
      )}

      {showResumeBanner && _resumeAt ? ((() => {
        // CS3 — Sémantique E1 amendée. Plus de "X sur 9" trompeur :
        // on affiche le TITRE de la prochaine étape + nombre d'étapes
        // restantes dans le parcours ACTIF de cet utilisateur.
        // CS10 — Enrichi avec le chapitre courant ("Chapitre 2 « Tes
        // savoirs »"). Pluriel adaptatif.
        const activePath = computeActivePath(_activeValues)
        const positionInPath = activePath.indexOf(_resumeAt)
        const remaining = positionInPath >= 0
          ? activePath.length - positionInPath
          : activePath.length // fallback : étape de reprise sautée ? on prend la longueur totale
        const stepTitle = STEPS[_resumeAt - 1]?.title ?? 'la suite'
        const chapter   = getChapterForStep(_resumeAt)
        const chapterNo = getChapterIndex(chapter) + 1
        // Détecte si on COMMENCE un nouveau chapitre (resume est la 1re step
        // du chapitre) → libellé "tu commences" au lieu de "tu en es".
        const isFirstOfChapter = chapter.stepIds[0] === _resumeAt
        return (
        <div className="max-w-2xl mx-auto">
          <div className="card p-6 sm:p-8 text-center">
            <p className="text-xs text-accent uppercase tracking-widest mb-2">
              Chapitre {chapterNo} / {CHAPTERS.length} — {chapter.title}
            </p>
            <p className="text-base text-primary font-medium">
              {isFirstOfChapter
                ? <>Tu commences le chapitre «&nbsp;{chapter.title}&nbsp;» — étape «&nbsp;{stepTitle}&nbsp;».</>
                : <>Tu en es à l&apos;étape «&nbsp;{stepTitle}&nbsp;».</>}
            </p>
            <p className="text-sm text-secondary mt-2">
              Encore {remaining} étape{remaining > 1 ? 's' : ''} pour finaliser ton profil.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
              <Button icon={PlayCircle} onClick={() => setResumeStep(_resumeAt)}>
                Reprendre
              </Button>
              <Button variant="secondary" icon={RotateCcw} onClick={() => setStartFresh(true)}>
                Recommencer
              </Button>
            </div>
          </div>
        </div>
      )})()) : showWizard ? (
        <ProfilQuestionnaire
          initialValues={extractInitialValues(profile)}
          initialStep={wizardInitialStep}
          onSubmit={handleSubmit}
          onStepSave={handleStepSave}
          onCancel={isComplete ? () => setEditing(false) : undefined}
          initialLifeEvents={initialLifeEvents}
        />
      ) : (
        <ProfilCard profile={profile} onEdit={() => { setEditing(true); setResumeStep(1) }} />
      )}
    </div>
  )
}

/**
 * Extrait du profile (chargé en DB) le subset géré par le questionnaire.
 * Les valeurs absentes ou `null` sont laissées telles quelles : EMPTY_VALUES
 * fait office de défaut côté ProfilQuestionnaire.
 */
function extractInitialValues(p: ReturnType<typeof useUserProfile>['profile']): Partial<QuestionnaireValues> {
  if (!p) return {}
  return {
    prenom: p.prenom, age: p.age, situation_familiale: p.situation_familiale,
    enfants: p.enfants, statut_pro: p.statut_pro,
    revenu_mensuel: p.revenu_mensuel, revenu_conjoint: p.revenu_conjoint,
    autres_revenus: p.autres_revenus, stabilite_revenus: p.stabilite_revenus,
    loyer: p.loyer, autres_credits: p.autres_credits,
    charges_fixes: p.charges_fixes, depenses_courantes: p.depenses_courantes,
    epargne_mensuelle: p.epargne_mensuelle,
    enveloppes: p.enveloppes ?? [],
    quiz_bourse: p.quiz_bourse ?? [], quiz_crypto: p.quiz_crypto ?? [], quiz_immo: p.quiz_immo ?? [],
    // CS3 R5 — domaines auto-déclarés expert.
    quiz_self_declared_domains: p.quiz_self_declared_domains ?? [],
    risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4,
    fire_type: p.fire_type, revenu_passif_cible: p.revenu_passif_cible,
    age_cible: p.age_cible, priorite: p.priorite,
    // CS4 — Boussole 4 axes (jsonb). Pré-rempli si déjà saisi, null sinon
    // (fallback legacy `priorite` côté moteur recos).
    objectifs_axes: p.objectifs_axes,
    // CS1 — TMI (étape 9). Pré-rempli depuis /parametres si déjà saisi.
    tmi_rate: p.tmi_rate,
    // CS5 — statut propriétaire RP (étape 10).
    proprietaire_rp_status: p.proprietaire_rp_status,
  }
}
