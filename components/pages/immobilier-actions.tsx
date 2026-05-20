'use client'

import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ImmobilierActions() {
  return (
    <div className="flex items-center gap-2">
      <Link href="/immobilier/simulateur">
        <Button variant="secondary" icon={Search}>Simuler une opportunité</Button>
      </Link>
      {/* Bouton "Ajouter un bien" : redirige vers le wizard 5 étapes
          (app/(app)/immobilier/nouveau/page.tsx) plutôt que d'ouvrir
          l'ancien modal monolithique (gardé en composant mort pour
          rétrocompatibilité — supprimable). */}
      <Link href="/immobilier/nouveau">
        <Button icon={Plus}>Ajouter un bien</Button>
      </Link>
    </div>
  )
}
