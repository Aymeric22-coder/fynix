/**
 * Génération des recommandations personnalisées.
 *
 * Ces règles sont des heuristiques métier, pas du conseil en
 * investissement. L'UI affiche systématiquement le disclaimer AMF.
 *
 * Logique : on parcourt 9 règles en priorité décroissante. Chaque règle
 * peut produire 0 ou 1 recommandation. On retourne entre 3 et 6 recos
 * priorisées (haute > moyenne > info), tronquées si trop nombreuses.
 *
 * Pure (pas d'I/O), sérialisable.
 */

import { calculerImpactEpargne } from './projectionFIRE'
import type { PatrimoineComplet, Recommandation, ScoresComplets } from '@/types/analyse'

const PRIO_RANK: Record<Recommandation['priorite'], number> = {
  haute: 0, moyenne: 1, info: 2,
}

/** Génère la liste des recommandations actives pour ce snapshot. */
export function genererRecommandations(
  p:      PatrimoineComplet,
  scores: ScoresComplets,
): Recommandation[] {
  const out: Recommandation[] = []

  // 1. Surexposition sectorielle (>30 %)
  const secteurMax = p.repartitionSectorielle[0]
  if (secteurMax && secteurMax.pourcentage > 30) {
    out.push({
      id:           'surexpo-secteur',
      priorite:     'haute',
      categorie:    'diversification',
      titre:        `Surexposition ${secteurMax.secteur} détectée`,
      description:  `${secteurMax.pourcentage.toFixed(0)} % de votre portefeuille est concentré sur le secteur ${secteurMax.secteur}. Un choc sur ce secteur impacterait fortement votre patrimoine.`,
      impact_estime: null,
      action:       'Envisagez de diversifier vers les secteurs sous-représentés (Santé, Industrie, Énergie…) pour réduire votre concentration.',
    })
  }

  // 2. Surexposition géographique (>50 %)
  const zoneMax = p.repartitionGeo[0]
  if (zoneMax && zoneMax.pourcentage > 50 && zoneMax.zone !== 'Non classé') {
    out.push({
      id:           'surexpo-geo',
      priorite:     'haute',
      categorie:    'diversification',
      titre:        `Concentration géographique ${zoneMax.zone}`,
      description:  `${zoneMax.pourcentage.toFixed(0)} % de votre portefeuille financier est exposé à la zone ${zoneMax.zone}.`,
      impact_estime: null,
      action:       'Rééquilibrez vers les zones sous-représentées (Europe, Asie, marchés émergents) pour réduire votre dépendance à une seule économie.',
    })
  }

  // 3. Cash excessif (>20 % du patrimoine)
  const partCash = p.totalBrut > 0 ? (p.totalCash / p.totalBrut) * 100 : 0
  if (partCash > 20) {
    const moitieCashAInvestir = p.totalCash * 0.5
    let impact: string | null = null
    // Calcul d'impact : que se passe-t-il si on convertit 50% du cash en
    // épargne mensuelle équivalente (étalée sur 24 mois) ?
    if (p.fireInputs.age && p.fireInputs.age_cible && p.fireInputs.revenu_passif_cible > 0) {
      const deltaEpargneMensuelle = moitieCashAInvestir / 24
      const gainAnnees = calculerImpactEpargne({
        patrimoineActuel:    p.totalNet,
        epargneMensuelle:    p.fireInputs.epargne_mensuelle,
        rendementCentral:    Math.max(p.rendementEstime, 5),
        ageActuel:           p.fireInputs.age,
        ageCible:            p.fireInputs.age_cible,
        revenuPassifCible:   p.fireInputs.revenu_passif_cible,
      }, deltaEpargneMensuelle)
      if (gainAnnees > 0) {
        impact = `Investir 50 % de ce cash accélérerait votre FIRE d'environ ${gainAnnees.toFixed(1)} an${gainAnnees >= 2 ? 's' : ''}.`
      }
    }
    out.push({
      id:           'cash-excessif',
      priorite:     partCash > 30 ? 'haute' : 'moyenne',
      categorie:    'liquidite',
      titre:        'Trop de cash non investi',
      description:  `${p.totalCash.toFixed(0)} € (${partCash.toFixed(0)} % du patrimoine) dort sur vos livrets / comptes.`,
      impact_estime: impact,
      action:       'Envisagez d\'investir progressivement via DCA (Dollar-Cost Averaging) sur votre PEA ou assurance-vie pour faire travailler ce capital.',
    })
  }

  // 4. Cash insuffisant (< 3 mois de charges)
  const charges = p.fireInputs.charges_mensuelles
  if (charges > 0) {
    const moisCouverts = p.totalCash / charges
    if (moisCouverts < 3) {
      out.push({
        id:           'cash-insuffisant',
        priorite:     'haute',
        categorie:    'liquidite',
        titre:        'Épargne de précaution insuffisante',
        description:  `Votre coussin de sécurité couvre seulement ${moisCouverts.toFixed(1)} mois de charges (${charges.toFixed(0)} €/mois).`,
        impact_estime: null,
        action:       'Constituez d\'abord 3 à 6 mois de charges sur un Livret A avant d\'investir davantage. C\'est votre filet de sécurité en cas d\'imprévu.',
      })
    }
  }

  // 5. PEA non ouvert alors que > 5000 € en actions
  const env = (p.fireInputs.enveloppes ?? []).map((e) => e.toLowerCase())
  const peaOuvert = env.some((e) => e.includes('pea'))
  const valActions = p.positions
    .filter((pos) => pos.asset_type === 'stock' || pos.asset_type === 'etf')
    .reduce((s, p) => s + p.current_value, 0)
  if (!peaOuvert && valActions > 5000) {
    out.push({
      id:           'pea-non-ouvert',
      priorite:     'haute',
      categorie:    'fiscalite',
      titre:        'Ouvrez un PEA maintenant',
      description:  `Vous détenez ${valActions.toFixed(0)} € d\'actions/ETF sans enveloppe fiscale optimisée. Le délai fiscal de 5 ans démarre à l'ouverture.`,
      impact_estime: null,
      action:       'Ouvrez un PEA chez un courtier en ligne (Boursorama, Fortuneo, BforBank…) pour faire courir le délai d\'exonération.',
    })
  }

  // 6. Optimisation PEA possible (PEA ouvert + actions EU détenues hors PEA)
  // Approximation : si l'utilisateur a un PEA ouvert ET que actions_eu_value
  // > 1000 €, on suggère une vérification (on ne peut pas distinguer PEA / CTO
  // au niveau positions).
  if (peaOuvert && p.fireInputs.actions_eu_value > 1000) {
    out.push({
      id:           'optim-pea',
      priorite:     'moyenne',
      categorie:    'fiscalite',
      titre:        'Vérifiez l\'allocation de vos actions EU',
      description:  `Vous détenez ${p.fireInputs.actions_eu_value.toFixed(0)} € d\'actions / ETF européens éligibles au PEA.`,
      impact_estime: null,
      action:       'Si certaines de ces positions sont hors PEA, transférez-les pour bénéficier de l\'exonération d\'impôt après 5 ans.',
    })
  }

  // 7. Retard sur objectif FIRE
  if (p.fireInputs.age && p.fireInputs.age_cible && p.fireInputs.revenu_passif_cible > 0) {
    const cible          = p.fireInputs.revenu_passif_cible * 12 * 25
    const anneesObjectif = p.fireInputs.age_cible - p.fireInputs.age
    if (anneesObjectif > 0 && p.totalNet < cible) {
      // anneesNec = à partir des intérêts composés à 7 %
      const r = 0.07 / 12
      let mois = 0
      let cap  = p.totalNet
      while (cap < cible && mois < 600) {
        cap = cap * (1 + r) + p.fireInputs.epargne_mensuelle
        mois++
      }
      const anneesNec = mois / 12
      const ecart     = anneesNec - anneesObjectif
      if (ecart > 3) {
        const ageReel = Math.round(p.fireInputs.age + anneesNec)
        out.push({
          id:           'retard-fire',
          priorite:     'haute',
          categorie:    'fire',
          titre:        `Objectif FIRE décalé de ${ecart.toFixed(1)} ans`,
          description:  `À votre rythme actuel (${p.fireInputs.epargne_mensuelle} €/mois), vous atteignez l'indépendance à ${ageReel} ans au lieu de ${p.fireInputs.age_cible} ans.`,
          impact_estime: 'Augmenter votre épargne ou améliorer votre rendement permettrait de combler ce retard.',
          action:       'Identifiez des postes de dépenses à optimiser, ou envisagez des revenus complémentaires (side project, location courte durée, etc.).',
        })
      }
    }
  }

  // 8. Incohérence profil ↔ portefeuille
  if (scores.coherence_profil.value !== null && scores.coherence_profil.value < 50) {
    out.push({
      id:           'incoherence-profil',
      priorite:     'moyenne',
      categorie:    'risque',
      titre:        `Portefeuille incohérent avec votre profil ${p.profilType ?? ''}`.trim(),
      description:  scores.coherence_profil.label,
      impact_estime: null,
      action:       'Rééquilibrez progressivement (DCA inversé) vers une allocation correspondant à votre tolérance au risque déclarée dans /profil.',
    })
  }

  // 9. Absence de diversification immo (si patrimoine > 50k et profil != Conservateur)
  if (
    p.totalImmo === 0 &&
    p.totalBrut > 50000 &&
    p.profilType !== 'Conservateur'
  ) {
    out.push({
      id:           'pas-immo',
      priorite:     'info',
      categorie:    'diversification',
      titre:        'Aucune exposition immobilière',
      description:  'L\'immobilier apporte stabilité et revenus réguliers non corrélés aux marchés financiers.',
      impact_estime: null,
      action:       'Envisagez une SCPI pour accéder à l\'immobilier sans gestion directe (ticket d\'entrée à partir de ~1 000 €).',
    })
  }

  // Tri par priorité, max 6
  out.sort((a, b) => PRIO_RANK[a.priorite] - PRIO_RANK[b.priorite])
  return out.slice(0, 6)
}
