import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { EditPropertyPanel } from '@/components/real-estate/edit-property-panel'
import type { FiscalRegime, PropertyUsageType } from '@/types/database.types'

export const metadata: Metadata = { title: 'Modifier le bien' }

type Props = { params: Promise<{ id: string }> }

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Charge bien + asset + lots + tax incentive (compte uniquement)
  const { data: prop, error } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id ( id, name, acquisition_date ),
      lots:real_estate_lots ( id ),
      incentive:property_tax_incentives ( id )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !prop) notFound()

  // Compte les credits actifs sur l'asset (multi-credit mig 034)
  const { count: creditsCount } = await supabase
    .from('debts')
    .select('id', { head: true, count: 'exact' })
    .eq('asset_id', prop.asset_id)
    .eq('user_id', user.id)
    .eq('status', 'active')

  const initial = {
    name:              prop.asset?.name ?? '',
    property_type:     prop.property_type ?? 'apartment',
    usage_type:        (prop.usage_type ?? 'long_term_rental') as PropertyUsageType,
    address_line1:     prop.address_line1,
    address_city:      prop.address_city,
    address_zip:       prop.address_zip,
    surface_m2:        prop.surface_m2,
    construction_year: prop.construction_year,
    dpe_class:         prop.dpe_class,
    purchase_price:    prop.purchase_price,
    purchase_fees:     prop.purchase_fees,
    works_amount:      prop.works_amount,
    furniture_amount:  prop.furniture_amount,
    acquisition_date:  prop.asset?.acquisition_date ?? null,
    fiscal_regime:     prop.fiscal_regime as FiscalRegime | null,
    lmnp_micro_abattement_pct: prop.lmnp_micro_abattement_pct,
    nbLots:            (prop.lots ?? []).length,
    nbCredits:         creditsCount ?? 0,
    hasIncentive:      ((prop.incentive ?? []) as unknown[]).length > 0,
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link
        href={`/immobilier/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} />
        Retour à la fiche
      </Link>
      <PageHeader
        title={`Modifier — ${initial.name || 'bien'}`}
        subtitle="Éditez les informations principales. Les modifications sont enregistrées par section."
      />
      <EditPropertyPanel propertyId={id} initial={initial} />
    </div>
  )
}
