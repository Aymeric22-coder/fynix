'use client'

import { PinelPanel } from './pinel-panel'
import { DenormandiePanel } from './denormandie-panel'
import { LocAvantagesPanel } from './loc-avantages-panel'
import { MhPanel } from './mh-panel'

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
  incentive:     IncentiveRow | null
  annualRentHC:  number
  purchasePrice: number
  surfaceM2:     number
  tmiPct:        number
}

/**
 * Contenu de l'onglet "Dispositif fiscal" — dispatch vers le panel
 * correspondant au type de dispositif. Si aucun dispositif n'est
 * configuré, affiche un message d'incitation.
 */
export function IncentiveTabContent({
  incentive, annualRentHC, purchasePrice, surfaceM2, tmiPct,
}: Props) {
  if (!incentive) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-sm text-secondary">
          Aucun dispositif de défiscalisation actif sur ce bien.
        </p>
        <p className="text-xs text-muted">
          Dispositifs supportés : Pinel / Pinel+, Denormandie, Loc&apos;Avantages,
          Monuments Historiques.
        </p>
        <p className="text-xs text-muted">
          L&apos;ajout d&apos;un dispositif se fait directement en base
          via la table <code className="bg-surface-2 px-1 py-0.5 rounded">property_tax_incentives</code>
          (formulaire d&apos;édition à venir).
        </p>
      </div>
    )
  }

  // Dispatch selon le type
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
