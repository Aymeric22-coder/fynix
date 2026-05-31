/**
 * CS2 LOT 5 — Hint doux affiché dans /analyse quand le patrimoine semble
 * PARTIELLEMENT renseigné (positions OU comptes OU immo manquant).
 *
 * Critère "partiel" (heuristique MVP) :
 *   - L'utilisateur a au moins une catégorie d'actifs renseignée (donc
 *     pas la même cible que PatrimoineEmptyBanner qui est totalNet === 0),
 *   - MAIS au moins une catégorie majeure manque :
 *       totalPortefeuille === 0  → suggère ajouter placements
 *       totalCash === 0          → suggère ajouter comptes / livrets
 *       totalImmo === 0          → suggère ajouter biens immo
 *
 * Affichage : carte muted avec icône + texte court + lien soft (pas un
 * CTA agressif). Don't oversell.
 */
'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'

interface Props {
  totalPortefeuille: number
  totalCash:         number
  totalImmo:         number
}

interface MissingPiece {
  label: string
  href:  string
}

export function PatrimoineCoverageHint({
  totalPortefeuille, totalCash, totalImmo,
}: Props) {
  // Aucune catégorie renseignée → laisser PatrimoineEmptyBanner gérer.
  if (totalPortefeuille + totalCash + totalImmo <= 0) return null

  const missing: MissingPiece[] = []
  if (totalPortefeuille <= 0) missing.push({ label: 'tes placements financiers', href: '/portefeuille' })
  if (totalCash         <= 0) missing.push({ label: 'tes comptes / livrets',     href: '/cash' })
  if (totalImmo         <= 0) missing.push({ label: 'tes biens immobiliers',     href: '/immobilier' })

  // Tout est renseigné → pas de hint nécessaire.
  if (missing.length === 0) return null

  return (
    <div
      data-testid="patrimoine-coverage-hint"
      className="rounded-lg border border-border bg-surface-2 p-3.5 mb-4 flex items-start gap-2.5"
    >
      <Info size={14} className="text-secondary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-secondary leading-relaxed">
          Pour une projection plus précise, pense à ajouter{' '}
          {missing.map((m, i) => (
            <span key={m.href}>
              <Link href={m.href} className="text-accent underline hover:text-accent-hover">
                {m.label}
              </Link>
              {i < missing.length - 2 ? ', ' :
               i === missing.length - 2 ? ' et ' : ''}
            </span>
          ))}
          .
        </p>
      </div>
    </div>
  )
}
