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
    explanation: {
      formule:
        'Score = (sect × 0.35) + (géo × 0.35) + (classes × 0.30)\n' +
        '  • sect    = 100 − 2 × % du plus gros secteur\n' +
        '  • géo     = 100 − 1.5 × % de la plus grosse zone\n' +
        '  • classes = barème (1→20, 2→50, 3→75, 4+→100)',
      inputs: [
        { label: 'Plus gros secteur',  value: `${(p.repartitionSectorielle[0]?.secteur ?? '—')} : ${maxSecteur.toFixed(1)} %` },
        { label: 'Plus grosse zone',   value: `${(p.repartitionGeo[0]?.zone ?? '—')} : ${maxZone.toFixed(1)} %` },
        { label: 'Nombre de classes',  value: `${nbClasses}` },
        { label: 'Score sectoriel',    value: `${sSect.toFixed(0)} / 100` },
        { label: 'Score géographique', value: `${sGeo.toFixed(0)} / 100` },
        { label: 'Score classes',      value: `${sCls} / 100` },
        { label: 'Score final',        value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? 'Excellent équilibre entre secteurs, zones et classes d\'actifs. Un choc localisé aurait peu d\'impact.'
          : value >= 60
          ? 'Diversification correcte mais perfectible. Vérifiez qu\'aucun secteur ne dépasse 30 % et aucune zone 50 %.'
          : value >= 40
          ? 'Concentration excessive sur un secteur ou une zone. Risque d\'effondrement si choc localisé.'
          : 'Très peu diversifié. Une crise sur un secteur ou un pays mettrait en péril une grande partie du patrimoine.',
      action: value < 60
        ? `Réduisez l'exposition à ${p.repartitionSectorielle[0]?.secteur ?? 'votre plus gros secteur'} (actuellement ${maxSecteur.toFixed(0)} %, cible < 30 %) en ajoutant des ETF sur d'autres secteurs.`
        : undefined,
    },
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
  metal:   30,    // or = volatilité modérée, valeur refuge mais peut chuter
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

  return {
    value, niveau, label, details,
    explanation: {
      formule: 'Score = 100 − |risque déclaré (profil) − risque réel (portefeuille)|\nRisque réel = moyenne pondérée par classe : crypto 95, stock 60, etf 45, metal 30, scpi 25, bond 10, cash 0',
      inputs: [
        { label: 'Risque déclaré (profil)', value: `${p.fireInputs.risk_score} / 100` },
        { label: 'Risque réel (portefeuille)', value: `${risqueReel} / 100` },
        { label: 'Écart', value: `${ecart > 0 ? '+' : ''}${ecart}` },
        { label: 'Score final', value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 70
          ? 'Votre portefeuille reflète bien votre tolérance au risque déclarée. Pas de rééquilibrage nécessaire.'
          : ecart > 0
          ? `Votre portefeuille prend ${Math.abs(ecart)} points de risque DE PLUS que votre profil. Un krach pourrait être psychologiquement difficile à supporter et vous pousser à vendre au pire moment.`
          : `Votre portefeuille prend ${Math.abs(ecart)} points de risque DE MOINS que votre profil. Vous laissez du rendement sur la table par rapport à vos objectifs.`,
      action: value < 70
        ? ecart > 0
          ? 'Réduisez les actifs risqués (crypto, actions individuelles) au profit d\'ETF diversifiés et d\'obligations.'
          : 'Augmentez la part d\'ETF actions monde / Nasdaq, ou ajoutez de la crypto modérément pour matcher votre tolérance déclarée.'
        : undefined,
    },
  }
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
  const manque = Math.max(0, cible - actuel)
  return {
    value, niveau, label,
    details: `${cheminPct} % du chemin · ${ecartTexte}`,
    explanation: {
      formule:
        'Cible FIRE = revenu passif × 12 × 25 (règle des 4 %)\n' +
        'Années nécessaires = simulation intérêts composés à 7 %/an avec votre épargne mensuelle\n' +
        'Score = 100 si arrivé, 80+ si dans les temps, dégradé selon le retard',
      inputs: [
        { label: 'Patrimoine net actuel', value: `${actuel.toFixed(0)} €` },
        { label: 'Cible FIRE',            value: `${cible.toFixed(0)} €` },
        { label: 'Reste à constituer',    value: `${manque.toFixed(0)} €` },
        { label: 'Épargne mensuelle',     value: `${epargne_mensuelle.toFixed(0)} € / mois` },
        { label: 'Âge actuel',            value: `${age} ans` },
        { label: 'Âge cible FIRE',        value: `${age_cible} ans (${anneesObjectif} ans pour y arriver)` },
        { label: 'Années nécessaires',    value: anneesNec >= 99 ? '∞ (inatteignable)' : `${anneesNec.toFixed(1)} ans` },
        { label: 'Chemin parcouru',       value: `${cheminPct} %` },
        { label: 'Score final',           value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? `Sur la bonne trajectoire. À ce rythme vous atteindrez l'indépendance vers ${Math.round(age + anneesNec)} ans (${anneesObjectif - Math.round(anneesNec)} ans d'avance sur votre objectif).`
          : value >= 60
          ? 'Trajectoire serrée — vous êtes sur le fil. Une petite augmentation de l\'épargne sécuriserait l\'objectif.'
          : value >= 40
          ? `Objectif décalé de ${Math.round(anneesNec - anneesObjectif)} ans. Sans changement, vous atteindrez l'indépendance vers ${Math.round(age + anneesNec)} ans au lieu de ${age_cible}.`
          : 'Très en retard. Sans augmenter significativement votre épargne (ou réduire la cible), l\'objectif FIRE est inatteignable.',
      action: value < 80 && anneesNec < 99
        ? 'Utilisez les sliders de la projection FIRE (ci-dessous) pour voir l\'impact d\'une augmentation de votre épargne mensuelle sur l\'âge d\'indépendance.'
        : undefined,
    },
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

  const moisCouverts = charges > 0 ? p.totalCash / charges : 0
  return {
    value, niveau, label,
    details: `${coussinTxt} · refuge ${partRefuge.toFixed(0)} % · krach -${partImpact.toFixed(0)} % du net`,
    explanation: {
      formule:
        'Score base 60, ajusté par 4 facteurs :\n' +
        '  a) Coussin cash : < 6 mois charges → −20, > 12 mois → +10\n' +
        '  b) Actifs refuge (immo + cash) : > 40 % → +20, < 15 % → −20\n' +
        '  c) Dettes : > 60 % du brut → −30\n' +
        '  d) Simulation krach −30 % sur actions/ETF/crypto : impact > 30 % du net → −10, < 10 % → +10',
      inputs: [
        { label: 'Cash disponible',     value: `${p.totalCash.toFixed(0)} €` },
        { label: 'Charges mensuelles',  value: charges > 0 ? `${charges.toFixed(0)} € / mois` : 'Non renseigné' },
        { label: 'Coussin de sécurité', value: charges > 0 ? `${moisCouverts.toFixed(1)} mois couverts (cible 6-12)` : '—' },
        { label: 'Actifs refuge',       value: `${partRefuge.toFixed(0)} % (immo + cash)` },
        { label: 'Ratio dettes',        value: `${(ratioDettes * 100).toFixed(0)} % du brut` },
        { label: 'Impact krach −30 %',  value: `${impactKrach.toFixed(0)} € (soit ${partImpact.toFixed(0)} % du net)` },
        { label: 'Score final',         value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? 'Portefeuille très résilient. Vous traverserez un krach sans devoir vendre dans la panique.'
          : value >= 60
          ? 'Solide. Quelques ajustements (coussin, refuge) renforceraient la résistance.'
          : value >= 40
          ? 'Résistance limitée. Un krach prolongé ou un coup dur personnel mettrait le patrimoine en tension.'
          : 'Portefeuille fragile. Risque d\'avoir à vendre au pire moment ou de basculer dans la précarité en cas d\'imprévu.',
      action: value < 60
        ? moisCouverts < 6
          ? 'Priorité : constituer 6 mois de charges sur Livret A/LDDS avant tout nouvel investissement risqué.'
          : 'Ajoutez de la diversification non corrélée (SCPI, oblig, immo) pour réduire la dépendance aux marchés actions.'
        : undefined,
    },
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
    explanation: {
      formule:
        'Score base 50, ajusté par 6 règles (cf. /profil pour les enveloppes) :\n' +
        '  a) PEA ouvert + actions EU → +25 (sinon malus −25 si actions EU > 10 k€)\n' +
        '  b) Assurance-vie ouverte → +20 (exonération après 8 ans)\n' +
        '  c) Actions/ETF EU hors PEA = manque à gagner fiscal (couvert par a)\n' +
        '  d) PER ouvert si TMI > 30 % → +15 (sinon −10)\n' +
        '  e) Cash > 5 000 € en compte courant → −15 (argent qui dort)',
      inputs: [
        { label: 'PEA',                  value: peaOuvert ? '✓ Ouvert' : '✗ Non ouvert' },
        { label: 'Assurance-vie',        value: avOuverte ? '✓ Ouverte' : '✗ Non ouverte' },
        { label: 'PER',                  value: perOuvert ? '✓ Ouvert' : '✗ Non ouvert' },
        { label: 'Actions EU détenues',  value: `${actionsEU.toFixed(0)} €` },
        { label: 'TMI',                  value: tmi > 0 ? `${tmi} %` : 'Non renseignée' },
        { label: 'Cash en compte courant', value: `${compteCourant.toFixed(0)} €` },
        { label: 'Score final',          value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? 'Excellente utilisation des enveloppes fiscales. Vous optimisez votre fiscalité au maximum de ce que la loi française permet.'
          : value >= 60
          ? 'Bonne base. Quelques optimisations supplémentaires (PER si TMI haute, transfert PEA) pourraient encore améliorer le rendement net.'
          : value >= 40
          ? 'Marges d\'amélioration importantes. Certaines enveloppes manquent ou ne sont pas exploitées.'
          : 'Enveloppes fiscales sous-exploitées. Vous payez plus d\'impôt que nécessaire sur vos plus-values et dividendes.',
      action:
        !peaOuvert && actionsEU > 5000
          ? 'Ouvrez un PEA dès maintenant pour faire courir le délai d\'exonération de 5 ans (Boursorama, Fortuneo, BforBank).'
          : !avOuverte
          ? 'Ouvrez une assurance-vie même avec 100 € pour prendre date — l\'avantage fiscal débute après 8 ans.'
          : tmi > 30 && !perOuvert
          ? 'Avec une TMI > 30 %, un PER vous fait économiser ~30 % d\'impôt sur les versements.'
          : compteCourant > 5000
          ? 'Transférez l\'excédent au-delà de 3-5 k€ sur un Livret A (3 %) puis investissez progressivement.'
          : undefined,
    },
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
