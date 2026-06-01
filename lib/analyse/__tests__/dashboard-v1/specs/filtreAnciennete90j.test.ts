/**
 * Spec P0.7 — Filtre d'ancienneté 90 jours sur Meilleur/Pire.
 *
 * Cible : exclure du calcul Meilleur/Pire toute position dont la détention
 * est < 90 jours (depuis `acquisition_date` ou première transaction `purchase`).
 *
 * Raison : éviter le biais statistique d\'une position fraîche qui aurait
 * fait +50 % en 2 semaines (souvent crypto / actions spéculatives).
 */
import { describe, it } from 'vitest'

describe('P0.7 — Filtre ancienneté 90 jours', () => {
  it.todo('position achetée il y a 30 jours avec TWR +50 % : exclue du Meilleur/Pire')
  it.todo('position achetée il y a 91 jours avec TWR +5 % : éligible')
  it.todo('position héritée d\'une date passée (acquisition_date présente, mais transactions vides) : on prend acquisition_date pour calculer l\'ancienneté')
  it.todo('classe entière sans aucune position éligible (toutes < 90 j) : afficher « Pas assez d\'historique » au lieu d\'un Meilleur/Pire fantaisiste')
  it.todo('biens immo : ancienneté = depuis acquisition_date du bien (pas du dernier travaux)')
  it.todo('livrets : pas de filtre (rendement nominal connu instantanément)')
})
