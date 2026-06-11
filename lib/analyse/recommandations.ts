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

import { calculerImpactEpargne, INFLATION_DEFAUT_PCT } from './projectionFIRE'
import { calculerCiblePatrimoine, swrPctFromFireType } from './constants'
import { formatEur } from '@/lib/utils/format'
import type { PatrimoineComplet, Recommandation, ScoresComplets } from '@/types/analyse'
import { normalizePriorite, type PrioriteId } from '../profil/calculs'
import { computeObjectifsBoost } from '@/lib/profil/objectifsConstants'

const PRIO_RANK: Record<Recommandation['priorite'], number> = {
  haute: 0, moyenne: 1, info: 2,
}

// ─────────────────────────────────────────────────────────────────
// Type étendu local — gain estimé en € + mois gagnés sur FIRE
// ─────────────────────────────────────────────────────────────────
//
// Tâche C : enrichir les recos avec un impact chiffré ("Économisez ~120 €/an"
// est plus convaincant que "Ouvrez un PEA"). On NE modifie PAS types/analyse.ts
// (l'autre session bosse dessus) — on étend localement via un super-type.
//
// `genererRecommandations` retourne toujours `Recommandation[]` pour ne pas
// casser les appelants existants (aggregateur, front), mais les recos
// produites sont en réalité des `RecommandationEnrichie` (compatible par
// héritage). Le front peut caster vers ce type pour afficher les nouveaux
// champs structurés s'il en a besoin.

export interface RecommandationEnrichie extends Recommandation {
  /** Gain estimé en euros (annuel pour fiscalité, ponctuel pour rééquilibrage).
   *  null si la reco ne s'y prête pas (qualitative). */
  gain_estime_eur?:   number | null
  /** Libellé court à afficher à côté du montant. Ex: "/an", " économisés
   *  après 5 ans", " à rééquilibrer". */
  gain_estime_label?: string
  /** Nombre de mois gagnés sur l'âge FIRE si l'utilisateur applique
   *  l'action proposée. null si non calculable. */
  mois_gagnes_fire?:  number | null
}

/** Helper pour pousser une reco enrichie (cast sécurisé vers Recommandation). */
function push(out: Recommandation[], reco: RecommandationEnrichie): void {
  out.push(reco as Recommandation)
}

/** Rendement annuel par défaut utilisé pour estimer les gains fiscaux
 *  (prélèvements sociaux 17,2 % évités sur PEA après 5 ans). */
const RENDEMENT_DEFAUT = 0.07
const PRELEVEMENTS_SOCIAUX = 0.172

// ─────────────────────────────────────────────────────────────────
// Boost de tri selon la priorité du profil
// ─────────────────────────────────────────────────────────────────
//
// L'utilisateur choisit dans le wizard sa priorité de vie. On utilise cette
// info pour faire REMONTER (ou redescendre) certaines catégories de recos
// sans changer leur niveau de priorité absolu (haute/moyenne/info), ce qui
// pourrait masquer une vraie alerte (cash insuffisant) au profit d'une reco
// "préférentielle". Le tri principal reste haute > moyenne > info ; à
// niveau égal, on applique ce boost.
//
// Valeurs négatives = remonter dans la liste. Positives = redescendre.

// QW4 — Boost catégoriel par bucket de priorité de vie (4 buckets remappés).
// Négatif = remonte dans la liste (à niveau de priorité absolu égal),
// positif = redescend. Le tri primaire reste haute > moyenne > info.
const PRIORITE_BOOST: Record<PrioriteId, Partial<Record<Recommandation['categorie'], number>>> = {
  // Pas de biais : tri purement par priorité haute/moyenne/info.
  equilibre:        {},
  // Sécuriser le foyer : coussin cash prioritaire, alerte cohérence remonte,
  // l'indépendance précoce passe après.
  securite_famille: { liquidite: -2, risque: -1, fire: 1 },
  // Atteindre l'indépendance : objectif FIRE central, optimisation fiscale
  // pour accélérer, on fait travailler le cash plutôt que l'accumuler.
  independance:     { fire: -2, fiscalite: -1, liquidite: 1 },
  // Transmettre : patrimoine équilibré (partageable) + enveloppes à rôle
  // successoral (AV) remontent ; l'indépendance précoce redescend.
  // ⚠️ Boost-proxy FAIBLE assumé : le catalogue de recommandations n'a
  // aucune reco de transmission directe (donation, démembrement, clause
  // bénéficiaire AV, SCI). Cf. follow-up « Recos catalogue transmission ».
  transmission:     { diversification: -1, fiscalite: -1, fire: 1 },
}

/** Type étendu local pour lire `priorite` LEGACY + `objectifs_axes` CS4
 *  depuis fireInputs sans modifier types/analyse.ts. */
type FireInputsExt = PatrimoineComplet['fireInputs'] & {
  priorite?:        string | null
  objectifs_axes?:  import('@/lib/profil/objectifsConstants').ObjectifsAxes | null
}

/** Génère la liste des recommandations actives pour ce snapshot. */
export function genererRecommandations(
  p:      PatrimoineComplet,
  scores: ScoresComplets,
): Recommandation[] {
  const out: Recommandation[] = []

  // Filtre les buckets "fallback" qui ne sont pas des insights actionnables.
  const isInsightful = (label: string) =>
    !['Non mappé', 'Non identifié', 'Sans secteur', 'ETF Diversifié', 'Non classé', 'Autres'].includes(label)
  const realSecteurs = p.repartitionSectorielle.filter((s) => isInsightful(s.secteur))
  const realZones    = p.repartitionGeo.filter((z) => isInsightful(z.zone))

  // 1. Surexposition sectorielle vs MSCI World (déviation > +15pts)
  // On cible le secteur le PLUS surexposé en valeur absolue de déviation,
  // pas le plus gros en % (ex: Tech 35 % avec benchmark 23 = +12pts → pas
  // une alerte, alors qu'Industrie 25 % avec benchmark 11 = +14pts l'est).
  const secteursOver = realSecteurs
    .filter((s) => s.status === 'overweight' || s.status === 'overweight_strong')
    .sort((a, b) => b.deviation - a.deviation)
  const sectMax = secteursOver[0]
  if (sectMax) {
    const sourcesTxt = sectMax.positions.length > 0
      ? ` (principalement via ${sectMax.positions.slice(0, 3).join(', ')})`
      : ''
    // € à rééquilibrer pour aligner sur le benchmark : on prend la part
    // financière (totalPortefeuille) car les secteurs s'appliquent au
    // portefeuille, pas au patrimoine immo/cash.
    const eurosADeplacer = Math.round((sectMax.deviation / 100) * p.totalPortefeuille)
    push(out, {
      id:           'surexpo-secteur',
      priorite:     sectMax.status === 'overweight_strong' ? 'haute' : 'moyenne',
      categorie:    'diversification',
      titre:        `Surpondération ${sectMax.secteur} vs marché mondial`,
      description:  `Votre exposition ${sectMax.secteur} atteint ${sectMax.pourcentage.toFixed(0)} %${sourcesTxt}, soit +${sectMax.deviation.toFixed(0)} points au-delà du benchmark MSCI World (${sectMax.benchmark.toFixed(0)} % attendu). Un choc sur ce secteur amplifierait l'impact sur votre portefeuille.`,
      impact_estime: `Réduire votre exposition ${sectMax.secteur} de ${sectMax.deviation.toFixed(0)} points → ~${formatEur(eurosADeplacer, { decimals: 0 })} à rééquilibrer.`,
      gain_estime_eur:   eurosADeplacer,
      gain_estime_label: ' à rééquilibrer',
      action:       'Diversifiez vers les secteurs sous-représentés du MSCI World pour vous rapprocher d\'une allocation neutre marché.',
    })
  }

  // 2. Surpondération géographique vs MSCI ACWI (déviation > +15pts)
  const zonesOver = realZones
    .filter((z) => z.status === 'overweight' || z.status === 'overweight_strong')
    .sort((a, b) => b.deviation - a.deviation)
  const zoneMax = zonesOver[0]
  if (zoneMax) {
    const paysExtra = zoneMax.pays.length > 0 ? ` (${zoneMax.pays.slice(0, 3).join(', ')})` : ''
    const isHomeBias = zoneMax.zone === 'Europe' || zoneMax.zone === 'Amérique du Nord'
    const eurosADeplacer = Math.round((zoneMax.deviation / 100) * p.totalPortefeuille)
    push(out, {
      id:           'surexpo-geo',
      priorite:     zoneMax.status === 'overweight_strong' ? 'haute' : 'moyenne',
      categorie:    'diversification',
      titre:        `Surpondération ${zoneMax.zone} vs marché mondial`,
      description:  `Vous êtes exposé à ${zoneMax.pourcentage.toFixed(0)} % sur ${zoneMax.zone}${paysExtra}, soit +${zoneMax.deviation.toFixed(0)} points au-delà du benchmark MSCI ACWI (${zoneMax.benchmark.toFixed(0)} % attendu). ${isHomeBias ? 'Cela reflète un biais home country classique.' : ''}`.trim(),
      impact_estime: `Réduire votre exposition ${zoneMax.zone} de ${zoneMax.deviation.toFixed(0)} points → ~${formatEur(eurosADeplacer, { decimals: 0 })} à rééquilibrer.`,
      gain_estime_eur:   eurosADeplacer,
      gain_estime_label: ' à rééquilibrer',
      action:       'Rééquilibrez vers les zones sous-représentées (Amérique du Nord, Asie développée) pour vous aligner sur la capitalisation boursière mondiale.',
    })
  }

  // 3. Cash excessif (>20 % du patrimoine)
  // V1.2 Volet D — La règle d'alerte consomme `cashEffectif` (= totalCash
  // − Σ intents actives). L'utilisateur qui a déclaré un projet ne se voit
  // plus reprocher son cash mis de côté volontairement (ferme le faux
  // positif P5 de l'audit § 7). Fallback `?? totalCash` pour la rétro-
  // compatibilité tests dont la fixture pre-V1.2 n'expose pas le champ.
  const cashAlerte = p.cashEffectif ?? p.totalCash
  const partCash = p.totalBrut > 0 ? (cashAlerte / p.totalBrut) * 100 : 0
  if (partCash > 20) {
    const moitieCashAInvestir = cashAlerte * 0.5
    let impact: string | null = null
    // Calcul d'impact : que se passe-t-il si on convertit 50% du cash en
    // épargne mensuelle équivalente (étalée sur 24 mois) ?
    let moisGagnes: number | null = null
    if (p.fireInputs.age && p.fireInputs.age_cible && p.fireInputs.revenu_passif_cible_ajuste > 0) {
      const deltaEpargneMensuelle = moitieCashAInvestir / 24
      const gainAnnees = calculerImpactEpargne({
        patrimoineActuel:    p.totalNet,
        epargneMensuelle:    p.fireInputs.epargne_mensuelle,
        rendementCentral:    Math.max(p.rendementEstime, 5),
        ageActuel:           p.fireInputs.age,
        ageCible:            p.fireInputs.age_cible,
        // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
        revenuPassifCible:   p.fireInputs.revenu_passif_cible_ajuste,
      }, deltaEpargneMensuelle)
      if (gainAnnees > 0) {
        moisGagnes = Math.round(gainAnnees * 12)
        impact = `Investir 50 % de ce cash accélérerait votre FIRE d'environ ${moisGagnes} mois.`
      }
    }
    push(out, {
      id:           'cash-excessif',
      priorite:     partCash > 30 ? 'haute' : 'moyenne',
      categorie:    'liquidite',
      titre:        'Trop de cash non investi',
      description:  `${cashAlerte.toFixed(0)} € (${partCash.toFixed(0)} % du patrimoine) dort sur vos livrets / comptes.`,
      impact_estime: impact,
      gain_estime_eur:   Math.round(moitieCashAInvestir),
      gain_estime_label: ' à investir progressivement',
      mois_gagnes_fire:  moisGagnes,
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
    // Économie fiscale annuelle estimée : les rendements générés sur PEA
    // (après 5 ans) sont exonérés de prélèvements sociaux (17,2 %). Sur le
    // capital actuel, l'économie ≈ capital × rendement × 17,2 %.
    const economieAnnuelle = Math.round(valActions * RENDEMENT_DEFAUT * PRELEVEMENTS_SOCIAUX)
    push(out, {
      id:           'pea-non-ouvert',
      priorite:     'haute',
      categorie:    'fiscalite',
      titre:        'Ouvrez un PEA maintenant',
      description:  `Vous détenez ${formatEur(valActions, { decimals: 0 })} d\'actions/ETF sans enveloppe fiscale optimisée. Le délai fiscal de 5 ans démarre à l'ouverture.`,
      impact_estime: `Économie estimée ~${formatEur(economieAnnuelle, { decimals: 0 })}/an de prélèvements sociaux après 5 ans (sur la base d\'un rendement annuel de 7 %).`,
      gain_estime_eur:   economieAnnuelle,
      gain_estime_label: '/an économisés après 5 ans',
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
  // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
  if (p.fireInputs.age && p.fireInputs.age_cible && p.fireInputs.revenu_passif_cible_ajuste > 0) {
    const anneesObjectif = p.fireInputs.age_cible - p.fireInputs.age
    // P1 — cible unifiée avec la projection FIRE (années réelles + inflation
    // + SWR du fire_type), au lieu de l'ancien × 25 figé.
    const fireType       = (p.fireInputs as { fire_type?: string | null }).fire_type ?? null
    const cible          = calculerCiblePatrimoine(
      p.fireInputs.revenu_passif_cible_ajuste,
      Math.max(0, anneesObjectif),
      INFLATION_DEFAUT_PCT,
      swrPctFromFireType(fireType),
    )
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
        // Combien de mois gagnés si l'utilisateur ajoute +200 €/mois d'épargne ?
        // Permet de chiffrer l'impact concret d'un petit effort supplémentaire.
        const DELTA_EPARGNE_TEST = 200
        // TODO P4 : migrer vers projectionGlobale (calculerImpactEpargne s'appuie
        // encore sur le legacy simulerProjection, hors périmètre du commit P1).
        const gainAnnees = calculerImpactEpargne({
          patrimoineActuel:    p.totalNet,
          epargneMensuelle:    p.fireInputs.epargne_mensuelle,
          rendementCentral:    Math.max(p.rendementEstime, 5),
          ageActuel:           p.fireInputs.age,
          ageCible:            p.fireInputs.age_cible,
          // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
          revenuPassifCible:   p.fireInputs.revenu_passif_cible_ajuste,
        }, DELTA_EPARGNE_TEST)
        const moisGagnes = gainAnnees > 0 ? Math.round(gainAnnees * 12) : null
        push(out, {
          id:           'retard-fire',
          priorite:     'haute',
          categorie:    'fire',
          titre:        `Objectif FIRE décalé de ${ecart.toFixed(1)} ans`,
          description:  `À votre rythme actuel (${p.fireInputs.epargne_mensuelle} €/mois), vous atteignez l'indépendance à ${ageReel} ans au lieu de ${p.fireInputs.age_cible} ans.`,
          impact_estime: moisGagnes !== null
            ? `Augmenter votre épargne de +${DELTA_EPARGNE_TEST} €/mois ferait gagner ~${moisGagnes} mois sur votre indépendance financière.`
            : 'Augmenter votre épargne ou améliorer votre rendement permettrait de combler ce retard.',
          mois_gagnes_fire: moisGagnes,
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

  // ───────────────────────────────────────────────────────────────
  // CS4 — Recos catégorie 'transmission' (#10..#12)
  // ───────────────────────────────────────────────────────────────
  // Combler le « trou catalogue transmission » identifié en pré-CS4 :
  // l'AFFINITY_MATRIX prévoit une colonne dédiée, mais sans reco produite
  // l'axe transmission=100 ne pourrait rien remonter. Heuristiques simples,
  // déclenchées sur signaux objectifs (âge, patrimoine, enveloppes, enfants).
  // Toutes en priorité 'info' ou 'moyenne' (pas d'alerte critique).

  const enfantsBrut    = p.fireInputs.enfants
  const aEnfants       = enfantsBrut !== null && enfantsBrut !== '0'
  const avOuverte      = env.some((e) => e.includes('assurance-vie') || e.includes('assurance vie') || e === 'av')
  const patrimoineNet  = p.totalNet
  const ageUser        = p.fireInputs.age

  // 10. Désigner / vérifier bénéficiaires AV (si AV ouverte)
  if (avOuverte) {
    push(out, {
      id:           'transmission-clause-beneficiaire',
      priorite:     'info',
      categorie:    'transmission',
      titre:        'Vérifiez la clause bénéficiaire de votre assurance-vie',
      description:  `Vous détenez une assurance-vie : c'est l'enveloppe la plus efficace pour transmettre hors succession (jusqu'à 152 500 € par bénéficiaire, hors droits). Une clause mal rédigée fait perdre l'avantage.`,
      impact_estime: aEnfants
        ? `Jusqu'à 152 500 € transmissibles par enfant hors droits de succession (versements avant 70 ans).`
        : `Jusqu'à 152 500 € par bénéficiaire désigné hors droits de succession (versements avant 70 ans).`,
      action:       'Demandez à votre assureur de revoir la clause bénéficiaire (formulation libre conseillée par un notaire si patrimoine complexe).',
    })
  }

  // 11. Programme de donations (si patrimoine > 200k et a des enfants)
  if (patrimoineNet > 200_000 && aEnfants) {
    push(out, {
      id:           'transmission-donations',
      priorite:     'moyenne',
      categorie:    'transmission',
      titre:        'Anticipez la transmission via un programme de donations',
      description:  `Avec ${formatEur(patrimoineNet, { decimals: 0 })} de patrimoine net, vous pouvez transmettre 100 000 € par enfant tous les 15 ans en franchise de droits.`,
      impact_estime: `Une donation de 100 000 € à un enfant aujourd\'hui = ~20 000 € de droits évités (TMI moyenne 20 %), répétable tous les 15 ans.`,
      gain_estime_eur:   20_000,
      gain_estime_label: ' de droits évités par enfant et par cycle 15 ans',
      action:       'Consultez un notaire pour mettre en place une stratégie pluriannuelle (donation simple, donation-partage, démembrement).',
    })
  }

  // 12. Ouvrir une AV pour transmission (si AV PAS ouverte et patrimoine > 50k)
  if (!avOuverte && patrimoineNet > 50_000) {
    const ageHint = ageUser !== null && ageUser < 70
      ? ' Ouvrir avant 70 ans maximise l\'abattement (152 500 € par bénéficiaire vs 30 500 € au global après).'
      : ''
    push(out, {
      id:           'transmission-ouvrir-av',
      priorite:     'info',
      categorie:    'transmission',
      titre:        'Ouvrir une assurance-vie pour préparer la transmission',
      description:  `Aucune assurance-vie dans vos enveloppes. C'est l'outil n°1 de transmission hors succession en France.${ageHint}`,
      impact_estime: aEnfants
        ? `Jusqu'à 152 500 € transmissibles par enfant hors droits de succession.`
        : null,
      action:       'Ouvrez une assurance-vie (versement initial libre, dès 100 €). Le délai fiscal des 8 ans démarre à l\'ouverture — plus tôt = mieux.',
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

  // CS4 — Tri par priorité (haute > moyenne > info dominant), puis par
  // boost catégoriel. Préférence : OBJECTIFS_BOOST (4 axes) si l'user a
  // migré CS4 (objectifs_axes IS NOT NULL). Fallback : PRIORITE_BOOST
  // legacy (4 buckets) pour les profils pré-CS4.
  //
  // INVARIANT critique : axes neutres (tous à 50) → boost = 0 strict.
  // C'est ce qui préserve les cas-tests Marc CS1 41 %.
  const fi              = p.fireInputs as FireInputsExt
  const axesCS4         = fi.objectifs_axes
  const prioriteLegacy  = normalizePriorite(fi.priorite)
  const legacyBoostMap  = prioriteLegacy ? PRIORITE_BOOST[prioriteLegacy] : undefined

  out.sort((a, b) => {
    const dPrio = PRIO_RANK[a.priorite] - PRIO_RANK[b.priorite]
    if (dPrio !== 0) return dPrio

    if (axesCS4) {
      // CS4 — Matrice d'affinité : convention « boost POSITIF = recommandation
      // affiliée à un axe poussé par l'user → remonter ». Tri DESCENDANT
      // (= bb - ba pour faire passer bb devant si bb > ba).
      const ba = computeObjectifsBoost(axesCS4, a.categorie as 'diversification' | 'fiscalite' | 'fire' | 'risque' | 'liquidite' | 'transmission')
      const bb = computeObjectifsBoost(axesCS4, b.categorie as 'diversification' | 'fiscalite' | 'fire' | 'risque' | 'liquidite' | 'transmission')
      return bb - ba
    }
    // Pré-CS4 fallback : PRIORITE_BOOST legacy avec convention INVERSE
    // (boost NÉGATIF = remonter). Tri ASCENDANT (comportement original).
    const ba = legacyBoostMap?.[a.categorie] ?? 0
    const bb = legacyBoostMap?.[b.categorie] ?? 0
    return ba - bb
  })

  return out.slice(0, 6)
}

// ─────────────────────────────────────────────────────────────────
// Helpers locaux
// ─────────────────────────────────────────────────────────────────

