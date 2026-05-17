/**
 * Page /analyse — structure en 6 onglets (style /portefeuille) :
 *   1. Global               — KPIs + donut + score global
 *   2. Portefeuille         — sous-onglets par classe d'actif
 *   3. Immo physique        — synthèse biens + KPIs
 *   4. Cash                 — répartition + rendement + couverture
 *   5. Scores & Projection  — 5 scores + projection FIRE + simulateur
 *   6. Recommandations      — liste priorisée + disclaimer AMF
 *
 * Un onglet est masqué si l'utilisateur n'a aucun actif dans cette classe.
 */
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { usePatrimoineAnalyse } from '@/hooks/use-patrimoine-analyse'

import { GlobalAnalyse }            from '@/components/analyse/tabs/GlobalAnalyse'
import { PortefeuilleAnalyse }      from '@/components/analyse/tabs/PortefeuilleAnalyse'
import { ImmoPhysiqueAnalyse }      from '@/components/analyse/tabs/ImmoPhysiqueAnalyse'
import { CashAnalyse }              from '@/components/analyse/tabs/CashAnalyse'
import { ScoresProjectionAnalyse }  from '@/components/analyse/tabs/ScoresProjectionAnalyse'
import { WhatIfSimulator }          from '@/components/analyse/WhatIfSimulator'
import { OptimiseurFiscal }         from '@/components/analyse/OptimiseurFiscal'
import { Recommandations }          from '@/components/analyse/Recommandations'

export function AnalyseClient() {
  const { data, isLoading, error, refresh, refreshing, lastUpdatedAt } = usePatrimoineAnalyse()

  // Construit la liste des onglets visibles (sauf si data nulle)
  const tabs: TabItem[] = useMemo(() => {
    if (!data) return []
    const out: TabItem[] = [
      { id: 'global',       label: 'Global',       content: <GlobalAnalyse data={data} /> },
    ]
    // Portefeuille visible dès qu'il y a au moins une position (financier)
    if (data.positions.length > 0 || data.cryptoTotal > 0) {
      out.push({ id: 'portefeuille', label: 'Portefeuille', content: <PortefeuilleAnalyse data={data} /> })
    }
    if (data.biens.length > 0) {
      out.push({ id: 'immo', label: 'Immo physique', content: <ImmoPhysiqueAnalyse data={data} /> })
    }
    if (data.comptes.length > 0) {
      out.push({ id: 'cash', label: 'Cash', content: <CashAnalyse data={data} /> })
    }
    out.push({ id: 'scores', label: 'Scores & Projection', content: <ScoresProjectionAnalyse data={data} lastUpdatedAt={lastUpdatedAt} /> })
    out.push({ id: 'simulateur', label: 'Simulateur', content: <WhatIfSimulator patrimoine={data} /> })
    out.push({ id: 'recos',  label: 'Recommandations',
               badge: data.recommandations.length > 0 ? <Badge variant="warning">{data.recommandations.length}</Badge> : undefined,
               content: <Recommandations recos={data.recommandations} /> })
    out.push({ id: 'fiscal', label: 'Optimisation fiscale', content: <OptimiseurFiscal patrimoine={data} /> })
    return out
  }, [data, lastUpdatedAt])

  // ── Chargement initial ────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div>
        <PageHeader title="Analyse patrimoniale" subtitle="Récupération des cours en temps réel…" />
        <SkeletonsGrid />
      </div>
    )
  }

  // ── Erreur bloquante ──────────────────────────────────────────────
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

  // ── Patrimoine vide ──────────────────────────────────────────────
  // On affiche un bandeau explicatif + on garde Scores & Projection visibles
  // pour guider un utilisateur fraichement onboarde (la projection peut
  // utiliser ses objectifs de profil meme sans actif).
  const isEmpty = data.totalBrut === 0

  const lastUpdatedFr = new Date(data.lastUpdated).toLocaleString('fr-FR', {
    dateStyle: 'short', timeStyle: 'short',
  })

  return (
    <div>
      <PageHeader
        title="Analyse patrimoniale"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap text-xs text-secondary">
            <span>Mis à jour {lastUpdatedFr}</span>
            {data.profilType && <Badge variant="success">{data.profilType}</Badge>}
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

      {isEmpty && (
        <div className="card p-4 mb-4 border-l-4 border-l-accent">
          <p className="text-sm text-primary font-medium">Patrimoine vide</p>
          <p className="text-xs text-secondary mt-1">
            Tu n&apos;as pas encore d&apos;actif. La projection ci-dessous est basee
            uniquement sur tes objectifs de profil. Ajoute des positions dans
            <Link href="/portefeuille" className="text-accent hover:underline ml-1">Portefeuille</Link>,
            <Link href="/immobilier" className="text-accent hover:underline ml-1">Immobilier</Link> ou
            <Link href="/cash" className="text-accent hover:underline ml-1">Cash</Link> pour
            debloquer l&apos;analyse complete.
          </p>
        </div>
      )}

      <Tabs tabs={tabs} urlParam="tab" />
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
