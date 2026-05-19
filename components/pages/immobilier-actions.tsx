'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { AddPropertyForm } from '@/components/forms/add-property-form'

export function ImmobilierActions() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <Link href="/immobilier/simulateur">
        <Button variant="secondary" icon={Search}>Simuler une opportunité</Button>
      </Link>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter un bien</Button>
      <AddPropertyForm open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
