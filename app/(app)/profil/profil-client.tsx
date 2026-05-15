/**
 * Composant client orchestrant l'UI de la page /profil.
 *
 * Logique :
 *  - charge le profile via useUserProfile
 *  - si `profile_completed_at` est null OU si l'utilisateur a cliqué
 *    "Modifier mon profil" → affiche le wizard
 *  - sinon → affiche la carte de profil
 *
 * Le profile de base (id, display_name, etc.) existe toujours grâce au
 * trigger on_auth_user_created — pas besoin de gérer le cas "row inexistante".
 */
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ProfilQuestionnaire } from '@/components/profil/ProfilQuestionnaire'
import { ProfilCard } from '@/components/profil/ProfilCard'
import { useUserProfile } from '@/hooks/use-user-profile'
import type { QuestionnaireValues } from '@/components/profil/questionnaire-types'

export function ProfilClient() {
  const { profile, loading, error, save } = useUserProfile()
  const [editing, setEditing] = useState(false)

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
  const showWizard = !isComplete || editing

  async function handleSubmit(v: QuestionnaireValues) {
    const res = await save(v)
    if (!res.error) setEditing(false)
    return res
  }

  return (
    <div>
      <PageHeader
        title="Profil investisseur"
        subtitle={
          showWizard
            ? 'Quelques minutes pour calibrer ton accompagnement Fynix.'
            : 'Ta synthèse globale — recalculée à chaque modification.'
        }
      />

      {showWizard ? (
        <ProfilQuestionnaire
          initialValues={extractInitialValues(profile)}
          onSubmit={handleSubmit}
          onCancel={isComplete ? () => setEditing(false) : undefined}
        />
      ) : (
        <ProfilCard profile={profile} onEdit={() => setEditing(true)} />
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
    epargne_mensuelle: p.epargne_mensuelle, invest_mensuel: p.invest_mensuel,
    enveloppes: p.enveloppes ?? [],
    quiz_bourse: p.quiz_bourse ?? [], quiz_crypto: p.quiz_crypto ?? [], quiz_immo: p.quiz_immo ?? [],
    risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4,
    fire_type: p.fire_type, revenu_passif_cible: p.revenu_passif_cible,
    age_cible: p.age_cible, priorite: p.priorite,
  }
}
