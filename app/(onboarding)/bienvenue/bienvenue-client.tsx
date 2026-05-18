/**
 * Client orchestrant l'onboarding 60 secondes.
 *
 * État local minimal :
 *   - formData null  → affiche QuickForm
 *   - formData rempli → calcule la projection à la volée et affiche
 *                       ProjectionResult.
 *
 * Le calcul est pur (lib/onboarding/quickProjection) donc client-side
 * suffit. La sauvegarde des inputs vers Supabase est déclenchée par
 * ProjectionResult (fire-and-forget au moment du CTA final).
 */
'use client'

import { useMemo, useState } from 'react'
import { QuickForm, type QuickFormData } from '@/components/onboarding/quick-form'
import { ProjectionResult } from '@/components/onboarding/projection-result'
import { calculerQuickProjection } from '@/lib/onboarding/quickProjection'

export function BienvenueClient() {
  const [formData, setFormData] = useState<QuickFormData | null>(null)

  const projection = useMemo(
    () => (formData ? calculerQuickProjection(formData) : null),
    [formData],
  )

  if (!formData || !projection) {
    return <QuickForm onSubmit={setFormData} />
  }

  return <ProjectionResult result={projection} inputs={formData} />
}
