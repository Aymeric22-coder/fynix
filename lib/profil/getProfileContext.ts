/**
 * `getProfileContext` — Lecture du contexte Profil pour la section Cash
 * (Cash Refactor V1.1, Volet C.1).
 *
 * Server-only. Lit la table `profiles` pour l'utilisateur authentifié et
 * retourne les 4 champs consommés par le bloc « Votre matelas de sécurité »
 * de `/cash` :
 *
 *   - `revenuMensuel`      → libellé « ≈ X mois de salaire » (info bonus)
 *   - `chargesMensuelles`  → base de calcul du matelas cible
 *   - `statutPro`          → multiplicateur statut (cf. MATELAS_MULTIPLIERS)
 *   - `stabiliteRevenus`   → override stable/instable
 *
 * Convention V1.1 : tout champ absent, `null`, NaN ou ≤ 0 est exposé comme
 * `null` (et non `0`). Le helper `computeMatelasCible` distingue ces cas
 * (raisons `charges_manquantes` / `statut_manquant`) pour proposer un CTA
 * vers Profil au lieu d'afficher un matelas erroné.
 *
 * Mapping libellés DB → enums helper :
 *   - `statut_pro`        : libellés FR du wizard → `StatutPro` (cdi /
 *     independant / dirigeant / retraite / autre).
 *   - `stabilite_revenus` : libellés FR du wizard → `'stable' | 'instable'`,
 *     `'moyenne'` pour les cas intermédiaires (n'override pas la table).
 *
 * Pas d'exception levée : si Supabase échoue ou si la ligne profile
 * n'existe pas, retourne tous les champs à `null`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatutPro, StabiliteRevenus } from '@/lib/cash/matelas'
import { computeChargesMensuelles } from './charges'

export interface ProfileContext {
  revenuMensuel:     number | null
  chargesMensuelles: number | null
  statutPro:         StatutPro | null
  stabiliteRevenus:  StabiliteRevenus
}

const NULL_CONTEXT: ProfileContext = {
  revenuMensuel:     null,
  chargesMensuelles: null,
  statutPro:         null,
  stabiliteRevenus:  null,
}

/** Convertit une valeur Supabase en number positif strict, sinon null. */
function toPositiveNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Mappe le libellé `statut_pro` du wizard (FR) vers l'enum `StatutPro`
 * consommé par `computeMatelasCible`. Inconnu → null.
 *
 * Cas couverts (cf. `lib/profil/calculs.ts > STATUTS_PRO`) :
 *   - 'Salarié'                 → 'cdi' (cas dominant FR, présomption CDI)
 *   - 'Indépendant / Freelance' → 'independant'
 *   - "Chef d'entreprise"       → 'dirigeant'
 *   - 'Retraité'                → 'retraite'
 *   - 'Autre' / vide            → null (cf. règle 4 de computeMatelasCible)
 */
export function mapStatutProToEnum(raw: string | null | undefined): StatutPro | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  // Tester chef AVANT salarié (« chef d'entreprise » contient « entreprise »
  // mais on évite que d'autres patterns le capturent par erreur).
  if (s.includes('chef') || s.includes('dirigeant'))                     return 'dirigeant'
  if (s.includes('salarié') || s.includes('salarie') || s === 'cdi')     return 'cdi'
  if (s.includes('fonction publique') || s.includes('fonctionnaire'))    return 'fonction_publique'
  if (s.includes('cdd'))                                                  return 'cdd'
  if (s.includes('intérim') || s.includes('interim'))                    return 'interim'
  if (s.includes('demandeur') || s.includes('chômage') || s.includes('chomage')) return 'demandeur_emploi'
  if (s.includes('indépendant') || s.includes('independant')
   || s.includes('freelance'))                                           return 'independant'
  if (s.includes('tns'))                                                  return 'tns'
  if (s.includes('libéral') || s.includes('liberal') || s.includes('profession lib')) return 'profession_liberale'
  if (s.includes('étudiant') || s.includes('etudiant'))                  return 'etudiant'
  if (s.includes('retrait'))                                              return 'retraite'
  if (s.includes('sans activité') || s.includes('sans activite'))        return 'sans_activite'
  if (s.includes('autre'))                                                return 'autre'
  return null
}

/**
 * Mappe le libellé `stabilite_revenus` du wizard vers l'enum override
 * `StabiliteRevenus` du helper matelas. Inconnu / vide → null.
 *
 * Cas couverts (cf. `STABILITES_REVENUS` du wizard) :
 *   - 'Très stables (CDI)'     → 'stable'
 *   - 'Stables mais variables' → 'moyenne'  (n'override PAS la table statut)
 *   - 'Irréguliers'            → 'instable'
 *   - 'Très variables'         → 'instable'
 *   - 'Chômage longue durée'   → 'instable'
 */
export function mapStabiliteToEnum(raw: string | null | undefined): StabiliteRevenus {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  if (s.includes('très stable') || s.includes('tres stable')) return 'stable'
  if (s.includes('chômage') || s.includes('chomage'))         return 'instable'
  if (s.includes('irrégul') || s.includes('irregul')
   || s.includes('très variable') || s.includes('tres variable')) return 'instable'
  if (s.includes('stable'))                                    return 'moyenne'
  return null
}

/**
 * Lit `profiles` pour l'utilisateur donné et retourne le contexte.
 * Sans throw : toute erreur Supabase ⇒ contexte tout-`null`.
 */
export async function getProfileContext(
  supabase: SupabaseClient,
  userId:   string,
): Promise<ProfileContext> {
  try {
    // V1.1-PATCH — Lecture des 4 sous-postes de charges (migration 015) au
    // lieu de la colonne `charges_mensuelles` qui N'EXISTE PAS sur la table
    // `profiles` (elle n'existe que sur `acquisitions_futures`, cf. mig 017).
    // L'aggregateur calcule déjà cette même somme à la volée (aggregateur.ts
    // :496) — on partage maintenant le helper `computeChargesMensuelles`.
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        revenu_mensuel,
        loyer, autres_credits, charges_fixes, depenses_courantes,
        statut_pro, stabilite_revenus
      `)
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return { ...NULL_CONTEXT }
    const row = data as Record<string, unknown>
    const chargesSum = computeChargesMensuelles({
      loyer:              row.loyer              as number | string | null,
      autres_credits:     row.autres_credits     as number | string | null,
      charges_fixes:      row.charges_fixes      as number | string | null,
      depenses_courantes: row.depenses_courantes as number | string | null,
    })
    return {
      revenuMensuel:     toPositiveNumber(row.revenu_mensuel),
      // `null` plutôt que `0` quand aucune charge n'est déclarée — sinon
      // `computeMatelasCible` retournerait `charges_manquantes` ET
      // `chargesMensuelles: 0` simultanément, confusion potentielle.
      chargesMensuelles: chargesSum > 0 ? chargesSum : null,
      statutPro:         mapStatutProToEnum(row.statut_pro as string | null),
      stabiliteRevenus:  mapStabiliteToEnum(row.stabilite_revenus as string | null),
    }
  } catch {
    return { ...NULL_CONTEXT }
  }
}
