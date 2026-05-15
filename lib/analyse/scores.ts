/**
 * Calcul des 5 scores d'intelligence patrimoniale (Phase 3).
 *
 *   1. Diversification    /100  — répartition sectorielle + géo + classes
 *   2. Cohérence Profil   /100  — alignement portefeuille / risque déclaré
 *   3. Progression FIRE   /100  — distance à l'objectif d'indépendance
 *   4. Solidité           /100  — résistance simulée à un krach -30 %
 *   5. Efficience Fiscale /100  — utilisation des enveloppes
 *
 * Toutes les fonctions sont PURES (pas d'I/O). Chacune renvoie un
 * `Score { value, niveau, label, details }` ou `value: null` si les
 * données sont insuffisantes.
 *
 * Bornes systématiques : `clamp(0, 100)` à la sortie.
 */

import type {
  PatrimoineComplet, Score, ScoresComplets, ScoreNiveau,
  AnalyseAssetType,
} from '@/types/analyse'

// ─────────────────────────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────────────────────────

const clamp = (v: number, min = 0, max = 100): number => Math.max(min, Math.min(max, v))

function niveauScore(value: number): ScoreNiveau {
  if (value >= 80) return 'vert'
  if (value >= 60) return 'jaune'
  if (value >= 40) return 'orange'
  return 'rouge'
}

/** Niveau spécifique pour Cohérence (3 paliers : rouge/orange/vert). */
function niveauCoherence(value: number): ScoreNiveau {
  if (value >= 70) return 'vert'
  if (value >= 40) return 'orange'
  return 'rouge'
}

const insufficientData = (label: string): Score => ({
  value: null, niveau: 'gris', label, details: 'Données insuffisantes',
})

// ─────────────────────────────────────────────────────────────────
// 1. Diversification
// ─────────────────────────────────────────────────────────────────

/**
 * Score diversification = moyenne pondérée :
 *   - sectoriel : 100 - 2 × surexposition_max_secteur (% au-dessus de 30 ?
 *     Spec dit "surexposition_max_secteur * 2", on lit "surexposition" =
 *     pourcentage du plus gros secteur)
 *   - géo       : 100 - 1.5 × surexposition_max_zone
 *   - classes   : barème selon nb classes (1=20, 2=50, 3=75, 4+=100)
 *   pondération : 0.35 / 0.35 / 0.30
 */
export function calculerDiversification(p: PatrimoineComplet): Score {
  if (p.totalBrut <= 0 || p.repartitionClasses.length === 0) {
    return insufficientData('Diversification')
  }

  const maxSecteur = p.repartitionSectorielle[0]?.pourcentage ?? 0
  const maxZone    = p.repartitionGeo[0]?.pourcentage ?? 0
  const nbClasses  = p.repartitionClasses.length

  const sSect = clamp(100 - maxSecteur * 2)
  const sGeo  = clamp(100 - maxZone * 1.5)
  const sCls  =
    nbClasses >= 4 ? 100 :
    nbClasses === 3 ? 75 :
    nbClasses === 2 ? 50 :
    20

  const value = Math.round(sSect * 0.35 + sGeo * 0.35 + sCls * 0.30)
  const niveau = niveauScore(value)

  const label =
    value >= 80 ? 'Bien diversifié' :
    value >= 60 ? 'Diversification correcte' :
    value >= 40 ? 'Diversification insuffisante' :
    'Concentration dangereuse'

  return {
    value, niveau, label,
    details: `${nbClasses} classe${nbClasses > 1 ? 's' : ''} · max secteur ${maxSecteur.toFixed(0)} % · max zone ${maxZone.toFixed(0)} %`,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Cohérence Profil
// ─────────────────────────────────────────────────────────────────

/**
 * Risque réel pondéré par classe d'actif (table interne 0-100).
 * Cohérence = 100 - |risk_score_profil - risque_reel_global|.
 */
const RISQUE_PAR_CLASSE: Record<AnalyseAssetType, number> = {
  stock:   60,
  etf:     45,
  crypto:  95,
  bond:    10,
  scpi:    25,    // SCPI/REIT/SIIC ≈ immobilier financier
  unknown:  0,
}

const RISQUE_IMMO = 25
const RISQUE_CASH = 0

export function calculerCoherenceProfil(p: PatrimoineComplet): Score {
  if (p.totalBrut <= 0) return insufficientData('Cohérence profil')
  if (typeof p.fireInputs.risk_score !== 'number') {
    return insufficientData('Cohérence profil')
  }

  // 1. Risque pondéré du portefeuille (positions par asset_type + immo + cash)
  let risqueReel = 0
  const total    = p.totalBrut

  for (const pos of p.positions) {
    const r = RISQUE_PAR_CLASSE[pos.asset_type] ?? 0
    risqueReel += (pos.current_value / total) * r
  }
  if (p.totalImmo > 0) risqueReel += (p.totalImmo / total) * RISQUE_IMMO
  if (p.totalCash > 0) risqueReel += (p.totalCash / total) * RISQUE_CASH

  risqueReel = Math.round(risqueReel)
  const value = clamp(100 - Math.abs(p.fireInputs.risk_score - risqueReel))
  const niveau = niveauCoherence(value)

  const ecart = risqueReel - p.fireInputs.risk_score
  let label: string
  let details: string
  if (value >= 70) {
    label = 'Cohérent avec votre profil'
    details = `Risque réel ${risqueReel}/100 vs profil ${p.fireInputs.risk_score}/100`
  } else if (ecart > 0) {
    label = 'Portefeuille plus risqué que votre profil'
    details = `Risque réel ${risqueReel}/100 vs profil ${p.fireInputs.risk_score}/100`
  } else {
    label = 'Portefeuille trop prudent vs vos objectifs'
    details = `Risque réel ${risqueReel}/100 vs profil ${p.fireInputs.risk_score}/100`
  }

  return { value, niveau, label, details }
}

// ─────────────────────────────────────────────────────────────────
// 3. Progression FIRE
// ─────────────────────────────────────────────────────────────────

/** Nombre d'années nécessaires pour atteindre `cible` à 7 % par an. */
function anneesPourAtteindre(actuel: number, cible: number, mensualite: number, rendementAnnuel = 0.07): number {
  if (actuel >= cible) return 0
  if (mensualite <= 0) return 99
  const r = rendementAnnuel / 12
  let mois = 0
  let cap  = actuel
  while (cap < cible && mois < 600) {
    cap = cap * (1 + r) + mensualite
    mois++
  }
  return mois / 12
}

export function calculerProgressionFIRE(p: PatrimoineComplet): Score {
  const { age, age_cible, epargne_mensuelle, revenu_passif_cible } = p.fireInputs
  if (!age || !age_cible || revenu_passif_cible <= 0) {
    return insufficientData('Progression FIRE')
  }

  const cible           = revenu_passif_cible * 12 * 25
  const actuel          = p.totalNet
  const anneesObjectif  = age_cible - age
  if (anneesObjectif <= 0) return insufficientData('Progression FIRE')

  const anneesNec = anneesPourAtteindre(actuel, cible, epargne_mensuelle)

  let value: number
  if (actuel >= cible) {
    value = 100
  } else if (anneesNec <= anneesObjectif) {
    const marge = anneesObjectif - anneesNec
    value = Math.round(80 + 20 * (marge / anneesObjectif))
  } else {
    const ecart = anneesNec - anneesObjectif
    if (ecart < 5)        value = Math.round(50 + (5 - ecart) * 6)        // 50..79
    else if (ecart < 10)  value = Math.round(25 + (10 - ecart) * 5)       // 25..49
    else                  value = Math.round(Math.max(0, 24 - (ecart - 10) * 2))
  }
  value = clamp(value)
  const niveau = niveauScore(value)

  const cheminPct = cible > 0 ? Math.round((actuel / cible) * 100) : 0
  const label =
    value >= 80 ? 'Sur la bonne trajectoire' :
    value >= 60 ? 'Trajectoire serrée' :
    value >= 40 ? 'Objectif décalé' :
    'Très en retard sur l\'objectif'
  const ecartTexte = anneesNec >= 99
    ? 'objectif inatteignable au rythme actuel'
    : `${anneesNec.toFixed(1)} ans nécessaires vs ${anneesObjectif} d\'objectif`
  return {
    value, niveau, label,
    details: `${cheminPct} % du chemin · ${ecartTexte}`,
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. Solidité (résistance à un krach -30 %)
// ─────────────────────────────────────────────────────────────────

const ASSET_RISKY: AnalyseAssetType[] = ['stock', 'etf', 'crypto']

export function calculerSolidite(p: PatrimoineComplet): Score {
  if (p.totalBrut <= 0) return insufficientData('Solidité')

  // a) Coussin de sécurité : cash / (charges × 6)
  const charges  = p.fireInputs.charges_mensuelles
  let pts        = 60   // base
  let coussinTxt = 'coussin OK'
  if (charges > 0) {
    const moisCouverts = p.totalCash / charges
    if (moisCouverts < 6)  { pts -= 20; coussinTxt = `${moisCouverts.toFixed(1)} mois de cash` }
    else if (moisCouverts > 12) { pts += 10; coussinTxt = `${moisCouverts.toFixed(0)} mois de cash` }
    else { coussinTxt = `${moisCouverts.toFixed(1)} mois de cash` }
  }

  // b) Part d'actifs non corrélés (immo + cash) / patrimoine brut
  const partRefuge = (p.totalImmo + p.totalCash) / p.totalBrut * 100
  if (partRefuge > 40)      pts += 20
  else if (partRefuge < 15) pts -= 20

  // c) Dettes lourdes
  const ratioDettes = p.totalDettes / p.totalBrut
  if (ratioDettes > 0.6) pts -= 30

  // Bonus / malus krach -30 % sur les actifs risqués
  let valeurRisquee = 0
  for (const pos of p.positions) {
    if (ASSET_RISKY.includes(pos.asset_type)) valeurRisquee += pos.current_value
  }
  const impactKrach = valeurRisquee * 0.30
  const partImpact  = p.totalNet > 0 ? (impactKrach / p.totalNet) * 100 : 0
  if (partImpact > 30)      pts -= 10
  else if (partImpact < 10) pts += 10

  const value = clamp(Math.round(pts))
  const niveau = niveauScore(value)
  const label =
    value >= 80 ? 'Très résilient' :
    value >= 60 ? 'Portefeuille solide' :
    value >= 40 ? 'Résistance limitée' :
    'Portefeuille fragile'

  return {
    value, niveau, label,
    details: `${coussinTxt} · refuge ${partRefuge.toFixed(0)} % · krach -${partImpact.toFixed(0)} % du net`,
  }
}

// ─────────────────────────────────────────────────────────────────
// 5. Efficience Fiscale
// ─────────────────────────────────────────────────────────────────

export function calculerEfficienceFiscale(p: PatrimoineComplet): Score {
  const env = p.fireInputs.enveloppes ?? []
  const has = (e: string) => env.some((x) => x.toLowerCase().includes(e.toLowerCase()))

  const peaOuvert  = has('PEA')
  const avOuverte  = has('Assurance')
  const perOuvert  = has('PER')
  const actionsEU  = p.fireInputs.actions_eu_value
  const tmi        = p.fireInputs.tmi_rate ?? 0
  const totalCash  = p.totalCash

  let pts = 50          // base neutre

  // a) PEA
  if (peaOuvert && actionsEU > 0) pts += 25
  else if (!peaOuvert && actionsEU > 10000) pts -= 25

  // b) Assurance-vie
  if (avOuverte) pts += 20

  // c) Actions/ETF en CTO alors que PEA dispo : on ne peut pas distinguer ici
  //    (pas de info "broker = CTO" dans positions). On approxime : si PEA non
  //    ouvert ET actions EU détenues, c'est forcément en CTO. Déjà pris en
  //    compte par le malus -25 ci-dessus.

  // d) Crypto — neutre

  // e) PER si TMI > 30 %
  if (tmi > 30 && perOuvert) pts += 15
  else if (tmi > 30 && !perOuvert) pts -= 10

  // f) Cash sur compte courant > 5000 €
  const compteCourant = p.comptes
    .filter((c) => c.type === 'compte_courant')
    .reduce((s, c) => s + c.solde, 0)
  if (compteCourant > 5000) pts -= 15

  void totalCash  // pas de règle directe sur totalCash ici (couvert par solidité)

  const value = clamp(Math.round(pts))
  const niveau = niveauScore(value)
  const label =
    value >= 80 ? 'Optimisation fiscale forte' :
    value >= 60 ? 'Bonne optimisation' :
    value >= 40 ? 'Optimisation à améliorer' :
    'Enveloppes mal exploitées'

  const detailsParts: string[] = []
  if (peaOuvert) detailsParts.push('PEA ✓')
  if (avOuverte) detailsParts.push('AV ✓')
  if (perOuvert) detailsParts.push('PER ✓')
  if (compteCourant > 5000) detailsParts.push(`${compteCourant.toFixed(0)} € en CC`)

  return {
    value, niveau, label,
    details: (detailsParts.join(' · ') || 'Aucune enveloppe déclarée') + ' · simulation, pas un conseil fiscal',
  }
}

// ─────────────────────────────────────────────────────────────────
// Agrégat des 5 scores
// ─────────────────────────────────────────────────────────────────

export function calculerTousLesScores(p: PatrimoineComplet): ScoresComplets {
  return {
    diversification:    calculerDiversification(p),
    coherence_profil:   calculerCoherenceProfil(p),
    progression_fire:   calculerProgressionFIRE(p),
    solidite:           calculerSolidite(p),
    efficience_fiscale: calculerEfficienceFiscale(p),
  }
}
