/**
 * Carte d'un bien immobilier sur la page liste.
 * Server Component — extrait depuis app/(app)/immobilier/page.tsx
 * pour pouvoir etre embarque dans le PortfolioView client.
 */

import Link from 'next/link'
import { MapPin, TrendingUp, Banknote, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DeletePropertyButton } from '@/components/real-estate/delete-property-button'
import { ReventeButton } from '@/components/real-estate/revente-button'
import {
  mapFiscalRegimeToRevente,
  type TypeUsageBien,
} from '@/lib/real-estate/plusValue'
import { formatCurrency, formatPercent, ASSET_TYPE_LABELS } from '@/lib/utils/format'
import { InfoTip } from '@/components/ui/info-tip'
import { LEXIQUE, getLexiqueDefinition } from '@/lib/real-estate/lexique'
import type { PropertyKPIs } from '@/lib/real-estate/types'

function inferTypeUsage(fiscalRegime: string | null): TypeUsageBien {
  if (!fiscalRegime) return 'secondaire'
  if (fiscalRegime.startsWith('lmnp_')
   || fiscalRegime.startsWith('lmp')
   || fiscalRegime.startsWith('foncier_')
   || fiscalRegime.startsWith('sci_')) return 'locatif'
  return 'secondaire'
}

interface Props {
  id:              string
  name:            string
  addressZip:      string | null
  addressCity:     string | null
  fiscalRegime:    string | null
  purchasePrice:   number | null
  purchaseFees:    number | null
  worksAmount:     number | null
  currentValue:    number | null
  acquisitionDate: string | null
  lots:            Array<{ status: string; rent_amount: number | null }>
  kpis:            PropertyKPIs | null
  capitalRemaining: number
  incompleteData:  boolean
}

export function PropertyCard(p: Props) {
  const rented      = p.lots.filter(l => l.status === 'rented')
  const monthlyRent = rented.reduce((s, l) => s + (l.rent_amount ?? 0), 0)
  // V3.2 — Plus-value latente : dénominateur cohérent avec la fiche détail.
  // `kpis.totalCost` (du moteur) inclut prix + frais notaire + travaux +
  // mobilier + frais bancaires + garantie de tous les prêts. L'ancien
  // `acqCost` local n'incluait pas mobilier ni frais bancaires/garantie,
  // ce qui sous-estimait `latentGain` versus la Synthèse (INCOH-005).
  // Fallback acqCost partiel si kpis null (crédit incomplet — affichage
  // déjà conditionnel sur p.kpis dans le JSX).
  const acqCostFallback = (p.purchasePrice ?? 0) + (p.purchaseFees ?? 0) + (p.worksAmount ?? 0)
  const totalCost   = p.kpis?.totalCost ?? acqCostFallback
  const latentGain  = (p.currentValue ?? 0) - totalCost
  const occupancy   = p.lots.length > 0 ? (rented.length / p.lots.length) * 100 : 0
  const netValue    = (p.currentValue ?? 0) - p.capitalRemaining

  return (
    <Link href={`/immobilier/${p.id}`} className="card p-5 hover:shadow-card-hover transition-shadow block">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-medium text-primary">{p.name}</h3>
          {p.addressCity && (
            <p className="text-xs text-secondary mt-0.5 flex items-center gap-1">
              <MapPin size={11} />
              {p.addressZip} {p.addressCity}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {p.incompleteData && (
            <span title="Données de simulation incomplètes">
              <AlertTriangle size={13} className="text-warning" />
            </span>
          )}
          <Badge variant="muted">{ASSET_TYPE_LABELS['real_estate']}</Badge>
          <DeletePropertyButton
            propertyId={p.id}
            propertyName={p.name}
            variant="icon"
          />
        </div>
      </div>

      {/* Ligne 1 : valeur / CRD / valeur nette */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs text-secondary">Valeur</p>
          <p className="text-sm font-medium financial-value text-primary mt-0.5">
            {formatCurrency(p.currentValue, 'EUR', { compact: true })}
          </p>
        </div>
        <div>
          <p className="text-xs text-secondary flex items-center gap-1">
            CRD
            <InfoTip text={LEXIQUE.remainingCapital} iconSize={11} />
          </p>
          <p className={`text-sm font-medium financial-value mt-0.5 ${p.capitalRemaining > 0 ? 'text-danger' : 'text-secondary'}`}>
            {p.capitalRemaining > 0 ? formatCurrency(p.capitalRemaining, 'EUR', { compact: true }) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-secondary">Valeur nette</p>
          <p className="text-sm font-medium financial-value text-accent mt-0.5">
            {formatCurrency(netValue, 'EUR', { compact: true })}
          </p>
        </div>
      </div>

      {/* Ligne 2 : cash-flow / rentabilite / plus-value */}
      {!p.incompleteData && p.kpis && (
        <div className="grid grid-cols-3 gap-3 mb-3 pt-3 border-t border-border">
          <div>
            <p className="text-xs text-secondary flex items-center gap-1">
              <Banknote size={10} /> Cash-flow
              <InfoTip text={LEXIQUE.monthlyCashFlow} iconSize={11} />
            </p>
            <p className={`text-sm font-medium financial-value mt-0.5 ${p.kpis.monthlyCashFlowYear1 >= 0 ? 'text-accent' : 'text-danger'}`}>
              {formatCurrency(p.kpis.monthlyCashFlowYear1, 'EUR')}
            </p>
            <p className="text-xs text-muted">après impôts /mois</p>
          </div>
          <div>
            <p className="text-xs text-secondary flex items-center gap-1">
              <TrendingUp size={10} /> Rdt net-net
              <InfoTip text={getLexiqueDefinition('netNetYield', p.fiscalRegime)} iconSize={11} />
            </p>
            <p className={`text-sm font-medium financial-value mt-0.5 ${p.kpis.netNetYield > 0 ? 'text-accent' : 'text-secondary'}`}>
              {p.kpis.netNetYield > 0 ? formatPercent(p.kpis.netNetYield) : '—'}
            </p>
            <p className="text-xs text-muted">brut {p.kpis.grossYieldFAI > 0 ? formatPercent(p.kpis.grossYieldFAI) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-secondary flex items-center gap-1">
              PV latente
              <InfoTip text={LEXIQUE.latentGain} iconSize={11} />
            </p>
            <p className={`text-sm font-medium financial-value mt-0.5 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
              {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
            </p>
            <p className="text-xs text-muted">
              {p.kpis.paybackYear !== null ? `Payback an ${p.kpis.paybackYear}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Lots / occupation */}
      {p.lots.length > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="text-xs text-secondary">
              {rented.length}/{p.lots.length} lots loués
            </div>
            <div className="h-1.5 w-20 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${occupancy}%` }} />
            </div>
          </div>
          <p className="text-xs text-secondary">{formatCurrency(monthlyRent, 'EUR')} / mois</p>
        </div>
      )}

      {/* Bouton « Simuler la revente » */}
      {p.acquisitionDate && (p.purchasePrice ?? 0) > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <ReventeButton
            bien={{
              id:               p.id,
              nom:              p.name,
              prixAchat:        p.purchasePrice ?? 0,
              dateAchat:        p.acquisitionDate,
              valeurActuelle:   p.currentValue,
              typeUsage:        inferTypeUsage(p.fiscalRegime),
              regimeFiscal:     mapFiscalRegimeToRevente(p.fiscalRegime),
              fraisAcquisitionReels: (p.purchaseFees ?? 0) > 0 ? p.purchaseFees ?? undefined : undefined,
              travauxReels:          (p.worksAmount  ?? 0) > 0 ? p.worksAmount  ?? undefined : undefined,
              creditCapitalRestantDu: p.capitalRemaining > 0 ? p.capitalRemaining : undefined,
            }}
          />
        </div>
      )}
    </Link>
  )
}
