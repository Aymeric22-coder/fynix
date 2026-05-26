'use client'

import { AlertTriangle } from 'lucide-react'
import { PinelPanel } from './pinel-panel'
import { DenormandiePanel } from './denormandie-panel'
import { LocAvantagesPanel } from './loc-avantages-panel'
import { MhPanel } from './mh-panel'
import { IncentiveForm } from './incentive-form'
import {
  isPinelClosedForAcquisition,
  PINEL_CLOSING_DATE,
} from '@/lib/real-estate/fiscal/incentives/reduction-schedule'

/**
 * Ligne `property_tax_incentives` (migration 038).
 * Tous les champs spécifiques sont nullables — utilisés selon `kind`.
 */
export interface IncentiveRow {
  id:                string
  property_id:       string
  kind:              string
  duration_years:    number | null
  zone:              string | null
  start_year:        number | null
  rent_cap_monthly:  number | null
  is_pinel_plus:     boolean | null
  works_amount:      number | null
  classification:    string | null
  occupancy:         string | null
  conservation_end_year: number | null
  reduction_rate_pct: number | null
  convention_type:   string | null
  convention_start:  string | null
  convention_end:    string | null
  market_rent_annual: number | null
  notes:             string | null
}

interface Props {
  propertyId:    string
  incentive:     IncentiveRow | null
  annualRentHC:  number
  purchasePrice: number
  surfaceM2:     number
  tmiPct:        number
  /**
   * V13 — Date d'acquisition du bien (ISO `YYYY-MM-DD`). Sert au
   * garde-fou Pinel fermé (PINEL_CLOSING_DATE = 2024-12-31). Optionnel —
   * si absent, aucune alerte.
   */
  acquisitionDate?: string | null
}

/**
 * Contenu de l'onglet "Dispositif fiscal" — dispatch vers le panel
 * correspondant au type de dispositif. Si aucun dispositif n'est
 * configuré, affiche un message d'incitation.
 */
export function IncentiveTabContent({
  propertyId, incentive, annualRentHC, purchasePrice, surfaceM2, tmiPct,
  acquisitionDate,
}: Props) {
  if (!incentive) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center space-y-2">
          <p className="text-sm text-secondary">
            Aucun dispositif de défiscalisation actif sur ce bien.
          </p>
          <p className="text-xs text-muted">
            {/* V13 — MH et Malraux retirés de la liste : présents dans le
                sélecteur mais désactivés faute de calcul branché. */}
            Dispositifs supportés : Pinel / Pinel+, Denormandie,
            Loc&apos;Avantages.
          </p>
        </div>
        <IncentiveForm propertyId={propertyId} existing={null} />
      </div>
    )
  }

  // V13 — garde-fou Pinel fermé : bandeau d'alerte critique si le bien
  // a été acquis après le 31/12/2024 et qu'un Pinel/Pinel+ est saisi.
  // La réduction est forcée à 0 côté moteur (cf. reduction-schedule.ts).
  const pinelClosed = isPinelClosedForAcquisition(incentive.kind, acquisitionDate)

  // Encart d'édition + dispatcher de panel selon le type
  return (
    <div className="space-y-4">
      <IncentiveForm propertyId={propertyId} existing={incentive} />
      {pinelClosed && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-muted px-4 py-3"
        >
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-danger leading-relaxed">
            <p className="font-medium mb-1">Dispositif non applicable</p>
            <p>
              Le Pinel est fermé aux nouveaux investissements depuis le {PINEL_CLOSING_DATE.split('-').reverse().join('/')}
              {' '}— non applicable à un bien acquis après cette date. La réduction
              d&apos;impôt n&apos;est pas calculée. Si l&apos;acquisition est en réalité
              antérieure, corrigez la date dans la fiche du bien ; sinon, supprimez
              le dispositif ou choisissez Denormandie (prolongé jusqu&apos;au 31/12/2027).
            </p>
          </div>
        </div>
      )}
      {!pinelClosed && renderIncentivePanel(incentive, annualRentHC, purchasePrice, surfaceM2, tmiPct)}
    </div>
  )
}

function renderIncentivePanel(
  incentive:     IncentiveRow,
  annualRentHC:  number,
  purchasePrice: number,
  surfaceM2:     number,
  tmiPct:        number,
) {
  switch (incentive.kind) {
    case 'pinel':
    case 'pinel_plus': {
      const duration = (incentive.duration_years ?? 9) as 6 | 9 | 12
      const zone = (incentive.zone ?? 'A') as 'A_bis' | 'A' | 'B1' | 'B2' | 'C'
      return (
        <PinelPanel
          isPinelPlus={incentive.kind === 'pinel_plus' || !!incentive.is_pinel_plus}
          duration={duration}
          zone={zone}
          purchasePrice={purchasePrice}
          surfaceM2={surfaceM2}
          startYear={incentive.start_year ?? new Date().getFullYear()}
          annualRentHC={annualRentHC}
          tmiPct={tmiPct}
        />
      )
    }
    case 'monuments_historiques': {
      const classification = (incentive.classification ?? 'inscrit') as 'classe' | 'inscrit' | 'agree'
      const occupancy = (incentive.occupancy ?? 'rented') as 'owner_occupied' | 'rented' | 'mixed'
      const currentYear = new Date().getFullYear()
      return (
        <MhPanel
          classification={classification}
          occupancy={occupancy}
          worksAmount={incentive.works_amount ?? 0}
          annualCharges={0}     // pas de champ DB dédié — pourra être enrichi
          annualRentHC={annualRentHC}
          acquisitionYear={incentive.start_year ?? currentYear}
          conservationEndYear={incentive.conservation_end_year ?? (currentYear + 15)}
          tmiPct={tmiPct}
        />
      )
    }
    case 'loc_avantages': {
      const convention = (incentive.convention_type ?? 'loc1') as 'loc1' | 'loc2' | 'loc3'
      const startDate = incentive.convention_start ? new Date(incentive.convention_start) : new Date()
      const endDate   = incentive.convention_end   ? new Date(incentive.convention_end)   : new Date()
      return (
        <LocAvantagesPanel
          convention={convention}
          annualRentHC={annualRentHC}
          marketRentAnnual={incentive.market_rent_annual ?? 0}
          conventionStartDate={startDate}
          conventionEndDate={endDate}
          tmiPct={tmiPct}
        />
      )
    }
    case 'denormandie': {
      const duration = (incentive.duration_years ?? 9) as 6 | 9 | 12
      const zone = (incentive.zone ?? 'A') as 'A_bis' | 'A' | 'B1' | 'B2' | 'C'
      return (
        <DenormandiePanel
          duration={duration}
          zone={zone}
          purchasePrice={purchasePrice}
          worksAmount={incentive.works_amount ?? 0}
          surfaceM2={surfaceM2}
          startYear={incentive.start_year ?? new Date().getFullYear()}
          annualRentHC={annualRentHC}
          tmiPct={tmiPct}
        />
      )
    }
    default:
      return (
        <div className="card p-6 text-sm text-secondary">
          Dispositif &laquo;&nbsp;{incentive.kind}&nbsp;&raquo; — affichage à venir.
        </div>
      )
  }
}
