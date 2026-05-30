/**
 * Page /analyse — refonte 3 onglets (remplace l'ancienne structure 8 onglets) :
 *
 *   1. Où j'en suis  — 5 scores + répartition patrimoine +
 *                       analyse portefeuille (6 sous-onglets MSCI) +
 *                       couverture cash en mois.
 *   2. Simuler       — Projection FIRE (chart + sliders) + acquisitions
 *                       futures + stress tests (« Et si… ») + simulateur
 *                       What-if (épargne / immobilier / allocation).
 *   3. Optimiser     — Hero gains fiscaux récupérables €/an +
 *                       8 opportunités fiscales chiffrées + recommandations
 *                       mensuelles (avec bouton « Fait » de session).
 *
 * Les onglets supprimés (Global, Immo physique, Cash en doublon, Simulateur
 * séparé) ont vu leur contenu redistribué ci-dessus ou retiré quand il
 * faisait doublon avec les pages dédiées (/immobilier, /cash, Dashboard).
 *
 * Un paramètre URL `?tab=situation|simuler|optimiser` active l'onglet
 * correspondant (deep-linking depuis le Dashboard, /paramètres, ARIA…).
 */
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { RefreshCw, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { openAriaWithPrompt } from '@/lib/aria/openAria'
import { usePatrimoineAnalyse } from '@/hooks/use-patrimoine-analyse'

import { ScoresBand }              from '@/components/analyse/ScoresBand'
import { RepartitionChart }        from '@/components/analyse/RepartitionChart'
import { CouvertureCash }          from '@/components/analyse/CouvertureCash'
import { PortefeuilleAnalyse }     from '@/components/analyse/tabs/PortefeuilleAnalyse'
import { ProjectionFIRE }          from '@/components/analyse/ProjectionFIRE'
import { WhatIfSimulator }         from '@/components/analyse/WhatIfSimulator'
import { OptimiseurHero }          from '@/components/analyse/OptimiseurHero'
import { OptimiseurFiscal }        from '@/components/analyse/OptimiseurFiscal'
import { Recommandations }         from '@/components/analyse/Recommandations'
import { TmiMissingBanner }        from '@/components/analyse/TmiMissingBanner'
import { calculerOpportunitesFiscales } from '@/lib/analyse/optimiseurFiscal'

export function AnalyseClient() {
  const { data, isLoading, error, refresh, refreshing, lastUpdatedAt } = usePatrimoineAnalyse()

  // Pré-calcul des opportunités fiscales pour le hero de l'onglet Optimiser.
  // useMemo TOUJOURS appelé (rules of hooks) — early returns plus bas.
  const opportunites = useMemo(
    () => (data ? calculerOpportunitesFiscales({ patrimoine: data }).opportunites : []),
    [data],
  )

  const tabs: TabItem[] = useMemo(() => {
    if (!data) return []
    return [
      {
        id: 'situation',
        label: 'Où j’en suis',
        content: (
          <div className="space-y-6">
            {/* Scores cliquables */}
            <section>
              <p className="text-xs text-secondary uppercase tracking-widest mb-3">
                Scores d&apos;intelligence
              </p>
              <ScoresBand scores={data.scores} />
              <p className="text-xs text-muted mt-2">
                Clique sur une carte pour voir le détail du calcul et l&apos;action recommandée.
              </p>
            </section>

            {/* Répartition patrimoine par classe d'actif */}
            <RepartitionChart classes={data.repartitionClasses} totalNet={data.totalNet} />

            {/* Couverture cash en mois (seul élément utile de l'ancien onglet Cash) */}
            {data.comptes.length > 0 && <CouvertureCash data={data} />}

            {/* Analyse portefeuille détaillée (6 sous-onglets MSCI) — unique à /analyse */}
            {(data.positions.length > 0 || data.cryptoTotal > 0) && (
              <section>
                <p className="text-xs text-secondary uppercase tracking-widest mb-3">
                  Analyse du portefeuille financier
                </p>
                <PortefeuilleAnalyse data={data} />
              </section>
            )}
          </div>
        ),
      },
      {
        id: 'simuler',
        label: 'Simuler',
        content: (
          <div className="space-y-6">
            {/* Projection FIRE (chart + sliders) + acquisitions futures
                + stress tests « Et si… » sont déjà orchestrés en interne. */}
            <ProjectionFIRE patrimoine={data} lastUpdatedAt={lastUpdatedAt} />

            {/* What-if épargne / immobilier / allocation (ancien onglet Simulateur) */}
            <WhatIfSimulator patrimoine={data} />
          </div>
        ),
      },
      {
        id: 'optimiser',
        label: 'Optimiser',
        badge: data.recommandations.length > 0
          ? <Badge variant="warning">{data.recommandations.length}</Badge>
          : undefined,
        content: (
          <div className="space-y-6">
            {/* Hero gains fiscaux récupérables */}
            <OptimiseurHero opportunites={opportunites} />

            {/* 8 opportunités fiscales détaillées */}
            <OptimiseurFiscal patrimoine={data} />

            {/* Recommandations mensuelles avec bouton « Fait » de session */}
            <Recommandations recos={data.recommandations} />
          </div>
        ),
      },
    ]
  }, [data, lastUpdatedAt, opportunites])

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
  // On garde les 3 onglets visibles : Scores & Projection peuvent utiliser
  // les objectifs de profil même sans actif.
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

      {/* CS1 — Bandeau « Renseigne ta TMI » (s'affiche conditionnellement). */}
      <TmiMissingBanner />

      {isEmpty && (
        <div className="card p-4 mb-4 border-l-4 border-l-accent">
          <p className="text-sm text-primary font-medium">Patrimoine vide</p>
          <p className="text-xs text-secondary mt-1">
            Tu n&apos;as pas encore d&apos;actif. La projection ci-dessous est basée
            uniquement sur tes objectifs de profil. Ajoute des positions dans
            <Link href="/portefeuille" className="text-accent hover:underline ml-1">Portefeuille</Link>,
            <Link href="/immobilier" className="text-accent hover:underline ml-1">Immobilier</Link> ou
            <Link href="/cash" className="text-accent hover:underline ml-1">Cash</Link> pour
            débloquer l&apos;analyse complète.
          </p>
          <button
            type="button"
            onClick={() => openAriaWithPrompt(
              "Je débute. Donne-moi une projection d'indépendance financière réaliste avec 2 000 €/mois de revenu et 300 €/mois d'épargne.",
            )}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       border border-border text-xs text-secondary hover:text-primary
                       hover:border-accent/40 hover:bg-accent/5 transition-colors"
          >
            <MessageCircle size={12} />
            💬 Demander à ARIA
          </button>
        </div>
      )}

      <Tabs tabs={tabs} defaultTab="situation" urlParam="tab" />
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
