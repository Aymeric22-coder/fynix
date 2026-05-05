import { Metadata } from 'next'
import { notFound }   from 'next/navigation'
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }     from '@/components/shared/page-header'
import { Badge }          from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/shared/confidence-badge'
import { PropertyLotActions, PropertyValuationActions } from '@/components/pages/property-detail-actions'
import { LotEditButton } from '@/components/pages/lot-edit-button'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Détail bien' }

type Props = { params: Promise<{ id: string }> }

export default async function ImmobilierDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id (*),
      lots:real_estate_lots (*),
      valuations:property_valuations ( id, valuation_date, value, price_per_m2, source, confidence ),
      charges:property_charges (*)
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .order('valuation_date', { referencedTable: 'valuations', ascending: false })
    .single()

  if (!prop) notFound()

  // Calculs
  const lots         = prop.lots ?? []
  const currentYear  = new Date().getFullYear()
  const charges      = (prop.charges ?? []).find((c: { year: number }) => c.year === currentYear)
  const monthlyRents = lots.filter((l: { status: string }) => l.status === 'rented')
    .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0)
  const annualRents  = monthlyRents * 12
  const annualCharges = charges
    ? Object.entries(charges)
        .filter(([k]) => ['taxe_fonciere','insurance','accountant','cfe','condo_fees','maintenance','other'].includes(k))
        .reduce((s, [, v]) => s + (Number(v) ?? 0), 0)
    : 0
  const acqCost     = (prop.purchase_price ?? 0) + (prop.purchase_fees ?? 0) + (prop.works_amount ?? 0)
  const currentVal  = prop.asset?.current_value ?? 0
  const grossYield  = acqCost > 0 ? (annualRents / acqCost) * 100 : 0
  const netYield    = acqCost > 0 ? ((annualRents - annualCharges) / acqCost) * 100 : 0
  const latentGain  = currentVal - acqCost
  const latentPct   = acqCost > 0 ? (latentGain / acqCost) * 100 : 0

  const LOT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
    rented:         { label: 'Loué',     variant: 'success' },
    vacant:         { label: 'Vacant',   variant: 'warning' },
    owner_occupied: { label: 'Occupé',   variant: 'info' },
    works:          { label: 'Travaux',  variant: 'muted' },
  }

  return (
    <div className="space-y-8">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l'immobilier
      </Link>

      <PageHeader
        title={prop.asset?.name ?? 'Bien immobilier'}
        subtitle={[prop.address_zip, prop.address_city].filter(Boolean).join(' ') || undefined}
        action={<ConfidenceBadge level={prop.asset?.confidence ?? 'medium'} />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Valeur estimée',  value: formatCurrency(currentVal, 'EUR', { compact: true }), sub: formatDate(prop.asset?.last_valued_at, 'medium'), accent: true },
          { label: 'Prix de revient', value: formatCurrency(acqCost, 'EUR', { compact: true }), sub: `Dont travaux : ${formatCurrency(prop.works_amount, 'EUR')}` },
          { label: 'Rendement brut',  value: grossYield > 0 ? formatPercent(grossYield) : '—', sub: `Net : ${netYield > 0 ? formatPercent(netYield) : '—'}` },
          { label: 'Plus-value latente', value: formatCurrency(latentGain, 'EUR', { compact: true, sign: true }), sub: formatPercent(latentPct, { sign: true }) },
        ].map((kpi) => (
          <div key={kpi.label} className={`card p-5 ${kpi.accent ? 'border-accent/20' : ''}`}>
            <p className="text-xs text-secondary uppercase tracking-widest">{kpi.label}</p>
            <p className="text-xl font-semibold financial-value text-primary mt-2">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-secondary mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Lots */}
        <div className="lg:col-span-3 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-primary">
              Lots locatifs {monthlyRents > 0 && <span className="text-accent ml-1">{formatCurrency(monthlyRents, 'EUR')} / mois</span>}
            </h2>
            <PropertyLotActions propertyId={prop.id} />
          </div>
          {!lots.length ? (
            <p className="text-sm text-secondary">Aucun lot — ajoutez des unités locatives.</p>
          ) : (
            <div className="space-y-2">
              {lots.map((lot: {
                id: string; name: string; lot_type: string | null; surface_m2: number | null;
                status: string; rent_amount: number | null; charges_amount: number | null;
                tenant_name: string | null; lease_start: string | null; lease_end: string | null
              }) => {
                const statusInfo = LOT_STATUS[lot.status] ?? { label: lot.status, variant: 'muted' as const }
                return (
                  <div key={lot.id} className="flex items-center gap-4 p-3 bg-surface-2 rounded-lg group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-primary font-medium">{lot.name}</p>
                      {lot.tenant_name && <p className="text-xs text-secondary">{lot.tenant_name}</p>}
                    </div>
                    {lot.surface_m2 && <p className="text-xs text-secondary">{lot.surface_m2} m²</p>}
                    {lot.rent_amount && (
                      <p className="text-sm financial-value text-accent">
                        {formatCurrency(lot.rent_amount, 'EUR')}
                      </p>
                    )}
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    <LotEditButton lot={lot} propertyId={prop.id} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Historique valorisations */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-primary">Historique des estimations</h2>
            <PropertyValuationActions propertyId={prop.id} surfaceM2={prop.surface_m2} />
          </div>
          {!(prop.valuations ?? []).length ? (
            <p className="text-sm text-secondary">Aucune estimation enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {(prop.valuations ?? []).slice(0, 6).map((v: {
                id: string; valuation_date: string; value: number;
                price_per_m2: number | null; confidence: string
              }, i: number) => {
                const prev = (prop.valuations ?? [])[i + 1]
                const delta = prev ? v.value - prev.value : null
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm financial-value text-primary">{formatCurrency(v.value, 'EUR', { compact: true })}</p>
                      <p className="text-xs text-secondary">{formatDate(v.valuation_date, 'medium')}</p>
                    </div>
                    {delta !== null && (
                      <p className={`text-xs flex items-center gap-0.5 ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {formatCurrency(Math.abs(delta), 'EUR', { compact: true })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Charges annuelles */}
      {charges && (
        <div className="card p-6">
          <h2 className="text-sm font-medium text-primary mb-4">
            Charges {currentYear} · {formatCurrency(annualCharges, 'EUR')} total
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Taxe foncière', value: charges.taxe_fonciere },
              { label: 'Assurance',     value: charges.insurance },
              { label: 'Expert-comptable', value: charges.accountant },
              { label: 'CFE',           value: charges.cfe },
              { label: 'Copropriété',   value: charges.condo_fees },
              { label: 'Entretien',     value: charges.maintenance },
              { label: 'Autres',        value: charges.other },
            ].filter(c => c.value > 0).map(c => (
              <div key={c.label}>
                <p className="text-xs text-secondary">{c.label}</p>
                <p className="text-sm financial-value text-primary mt-0.5">{formatCurrency(c.value, 'EUR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
