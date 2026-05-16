/**
 * Client orchestrant le dashboard /analyse.
 *
 * Chaque section affiche son propre skeleton jusqu'à ce que les données
 * arrivent — pas de spinner global pour éviter le flash.
 */
'use client'

import { Briefcase, RefreshCw, Wallet, Building2, PiggyBank, TrendingUp, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils/format'
import { usePatrimoineAnalyse } from '@/hooks/use-patrimoine-analyse'
import { RepartitionChart }    from '@/components/analyse/RepartitionChart'
import { SectorielleChart }    from '@/components/analyse/SectorielleChart'
import { GeographiqueChart }   from '@/components/analyse/GeographiqueChart'
import { PositionsTable }      from '@/components/analyse/PositionsTable'
import { ImmoSummary }         from '@/components/analyse/ImmoSummary'
import { CashSummary }         from '@/components/analyse/CashSummary'
import { ScoresBand }          from '@/components/analyse/ScoresBand'
import { ProjectionFIRE }      from '@/components/analyse/ProjectionFIRE'
import { Recommandations }     from '@/components/analyse/Recommandations'
import { FiabiliteBadge }      from '@/components/analyse/FiabiliteBadge'
import { CryptoSummary }       from '@/components/analyse/CryptoSummary'

export function AnalyseClient() {
  const { data, isLoading, error, refresh, refreshing } = usePatrimoineAnalyse()

  // ── Chargement initial (pas de data) ───────────────────────────────
  if (isLoading && !data) {
    return (
      <div>
        <PageHeader title="Analyse patrimoniale" subtitle="Récupération des cours en temps réel…" />
        <SkeletonsGrid />
      </div>
    )
  }

  // ── Erreur bloquante ───────────────────────────────────────────────
  if (error && !data) {
    return (
      <div>
        <PageHeader title="Analyse patrimoniale" />
        <div className="card p-6 text-center">
          <p className="text-sm text-danger">Erreur : {error}</p>
          <Button onClick={refresh} icon={RefreshCw} className="mt-3">Réessayer</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  // ── Patrimoine vide ────────────────────────────────────────────────
  const isEmpty = data.totalBrut === 0
  if (isEmpty) {
    return (
      <div>
        <PageHeader title="Analyse patrimoniale" />
        <EmptyState
          icon={Briefcase}
          title="Patrimoine vide"
          description="Ajoutez des positions, biens ou comptes dans Portefeuille / Immobilier / Cash pour voir votre analyse consolidée."
        />
      </div>
    )
  }

  // ── Vue normale ────────────────────────────────────────────────────
  const lastUpdatedFr = new Date(data.lastUpdated).toLocaleString('fr-FR', {
    dateStyle: 'short', timeStyle: 'short',
  })

  return (
    <div>
      {/* 1. HEADER */}
      <PageHeader
        title="Analyse patrimoniale"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap text-xs text-secondary">
            <span>Mis à jour {lastUpdatedFr}</span>
            {data.profilType && (
              <Badge variant="success">{data.profilType}</Badge>
            )}
            {data.prenom && <span>· {data.prenom}</span>}
          </span>
        }
        action={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={refreshing}
            onClick={refresh}
          >
            Actualiser les prix
          </Button>
        }
      />

      {error && (
        <p className="text-xs text-warning bg-warning-muted px-3 py-2 rounded-lg mb-4">
          ⚠ {error} (les données affichées peuvent être anciennes)
        </p>
      )}

      {/* 2. KPIs (5 cartes) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi icon={Wallet}     label="Patrimoine net"      value={formatCurrency(data.totalNet, 'EUR', { compact: true })} accent />
        <Kpi icon={TrendingUp} label="Portefeuille"        value={formatCurrency(data.totalPortefeuille, 'EUR', { compact: true })} />
        <Kpi icon={Building2}  label="Immobilier"          value={formatCurrency(data.totalImmo, 'EUR', { compact: true })} />
        <Kpi icon={PiggyBank}  label="Cash"                value={formatCurrency(data.totalCash, 'EUR', { compact: true })} />
        <Kpi icon={Sparkles}   label="Revenu passif / mois" value={formatCurrency(data.revenuPassifActuel, 'EUR', { decimals: 0 })} accent />
      </div>

      {/* 3. RÉPARTITION PATRIMONIALE */}
      <div className="mb-6">
        <RepartitionChart classes={data.repartitionClasses} totalNet={data.totalNet} />
      </div>

      {/* 4 + 5. ANALYSE SECTORIELLE + GÉOGRAPHIQUE — uniquement si le
          portefeuille financier est non vide (l'immo et le cash ont leurs
          sections dédiées et ne polluent PAS ces graphiques). */}
      {data.totalPortefeuille >= 1 ? (
        <>
          <FiabiliteBadge fiabilite={data.analyseFiabilite} unmappedAll={data.unmappedAll} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <SectorielleChart  buckets={data.repartitionSectorielle} score={data.scoreDiversificationSectorielle} />
            <GeographiqueChart buckets={data.repartitionGeo}         score={data.scoreDiversificationGeo} />
          </div>
          {data.cryptoTotal > 0 && (
            <div className="mb-6">
              <CryptoSummary cryptoTotal={data.cryptoTotal} cryptoBreakdown={data.cryptoBreakdown} />
            </div>
          )}
        </>
      ) : (
        <div className="card p-6 mb-6 text-center">
          <p className="text-sm text-secondary">
            Ajoutez des positions dans <a href="/portefeuille" className="text-accent underline">votre portefeuille financier</a> pour voir l&apos;analyse sectorielle et géographique.
          </p>
          <p className="text-xs text-muted mt-2">
            (L&apos;immobilier physique et le cash ne sont volontairement pas inclus dans ces graphiques.)
          </p>
        </div>
      )}

      {/* 6. DÉTAIL DES POSITIONS */}
      <div className="mb-6">
        <PositionsTable positions={data.positions} />
      </div>

      {/* 7 + 8. IMMO + CASH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
        <ImmoSummary biens={data.biens} totalImmo={data.totalImmo} totalDettes={data.totalDettes} />
        <CashSummary comptes={data.comptes} totalCash={data.totalCash} totalBrut={data.totalBrut} />
      </div>

      {/* ─── Phase 3 : Intelligence ────────────────────────────── */}

      {/* 9. Bande des 5 scores */}
      <div className="mb-6">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Scores d&apos;intelligence</p>
        <ScoresBand scores={data.scores} />
      </div>

      {/* 10. Projection FIRE interactive */}
      <div className="mb-6">
        <ProjectionFIRE patrimoine={data} />
      </div>

      {/* 11. Recommandations personnalisées */}
      <Recommandations recos={data.recommandations} />
    </div>
  )
}

interface KpiProps {
  icon:    React.ComponentType<{ size?: number; className?: string }>
  label:   string
  value:   string
  accent?: boolean
}

function Kpi({ icon: Icon, label, value, accent }: KpiProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        <Icon size={11} />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-lg sm:text-xl font-semibold financial-value mt-2 ${accent ? 'text-accent' : 'text-primary'}`}>
        {value}
      </p>
    </div>
  )
}

function SkeletonsGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
      </div>
      <div className="skeleton h-64" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
      <div className="skeleton h-96" />
    </div>
  )
}
