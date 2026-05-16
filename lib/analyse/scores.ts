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
import { trackingErrorScore, BENCHMARK_CLASSES_PATRIMOINE } from './benchmarks'

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

  // Refonte (Phase 10) : utilise les MEMES scores d'alignement marché
  // que ceux affichés sur les graphiques sectoriel/géo (basés MSCI),
  // au lieu de la formule legacy "100 − 2 × max_secteur".
  //
  // Ça résout l'incohérence "Diversification 57" vs "Sectoriel 89 /
  // Géo 81" — désormais les 3 chiffres viennent de la même source.
  const sSect = p.scoreDiversificationSectorielle      // déjà 0-100 (vs MSCI World)
  const sGeo  = p.scoreDiversificationGeo              // déjà 0-100 (vs MSCI ACWI)

  // Score classes : tracking error vs BENCHMARK_CLASSES_PATRIMOINE
  // (allocation équilibrée 20 Actions / 20 ETF / 35 Immo / 10 Cash /
  //  5 Crypto / 10 Obligataire).
  const sCls = trackingErrorScore(
    p.repartitionClasses.map((c) => ({ label: c.label, pct: c.pourcentage })),
    BENCHMARK_CLASSES_PATRIMOINE,
  )

  const value = Math.round(sSect * 0.35 + sGeo * 0.35 + sCls * 0.30)
  const niveau = niveauScore(value)

  const label =
    value >= 80 ? 'Bien diversifié' :
    value >= 60 ? 'Diversification correcte' :
    value >= 40 ? 'Diversification insuffisante' :
    'Concentration dangereuse'

  // Identifie la classe la plus surpondérée vs benchmark pour l'action
  const ecartParClasse = p.repartitionClasses.map((c) => ({
    label: c.label,
    ecart: c.pourcentage - (BENCHMARK_CLASSES_PATRIMOINE[c.label] ?? 0),
  })).sort((a, b) => b.ecart - a.ecart)
  const surpondMax = ecartParClasse[0]

  return {
    value, niveau, label,
    details: `secteur ${sSect}/100 · géo ${sGeo}/100 · classes ${sCls}/100`,
    explanation: {
      formule:
        'Score = (sectoriel × 0.35) + (géo × 0.35) + (classes × 0.30)\n' +
        '  • sectoriel = tracking error inverse vs MSCI World (11 secteurs GICS)\n' +
        '  • géo       = tracking error inverse vs MSCI ACWI (9 zones)\n' +
        '  • classes   = tracking error inverse vs allocation équilibrée\n' +
        '    (20 Actions / 20 ETF / 35 Immo / 10 Cash / 5 Crypto / 10 Oblig)',
      inputs: [
        { label: 'Alignement sectoriel (MSCI World)', value: `${sSect} / 100` },
        { label: 'Alignement géographique (MSCI ACWI)', value: `${sGeo} / 100` },
        { label: 'Alignement classes (benchmark patrimoine)', value: `${sCls} / 100` },
        ...(surpondMax && surpondMax.ecart > 10 ? [
          { label: 'Classe la plus surpondérée',
            value: `${surpondMax.label} : +${surpondMax.ecart.toFixed(0)} pts vs benchmark` },
        ] : []),
        { label: 'Score final', value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? 'Patrimoine bien équilibré entre secteurs, zones et classes d\'actifs. Un choc localisé aurait peu d\'impact.'
          : value >= 60
          ? `Diversification correcte. ${surpondMax && surpondMax.ecart > 10 ? `La classe "${surpondMax.label}" est surpondérée vs un benchmark patrimoine équilibré, mais reste compatible avec une stratégie active.` : 'Légères surpondérations sans impact majeur.'}`
          : value >= 40
          ? `Surpondération marquée sur ${surpondMax?.label ?? 'une classe'}. Le score sectoriel/géo restent ${sSect >= 70 ? 'bons' : 'à améliorer'}, le déséquilibre vient de l\'allocation par classe.`
          : 'Très concentré. La répartition par classe d\'actif s\'écarte fortement d\'un patrimoine équilibré.',
      action: value < 60 && surpondMax && surpondMax.ecart > 15
        ? `Renforcez les classes sous-représentées pour rééquilibrer (cible : ${surpondMax.label} ≈ ${BENCHMARK_CLASSES_PATRIMOINE[surpondMax.label] ?? 0} % du patrimoine).`
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

const RISQUE_CASH = 0

export function calculerCoherenceProfil(p: PatrimoineComplet): Score {
  if (p.totalBrut <= 0) return insufficientData('Cohérence profil')
  if (typeof p.fireInputs.risk_score !== 'number') {
    return insufficientData('Cohérence profil')
  }

  // Risque pondéré sur la "richesse réelle" = portefeuille + equity_immo
  // + cash. On utilise l'equity immo (et non la valeur brute) parce que
  // c'est la part réellement détenue ; le reste est financé par la banque.
  //
  // Pour l'immo : risque dynamique calculé par calculerRisqueImmoGlobal
  // (par défaut 30, modulé selon LTV et cashflow par bien).
  const richesseReelle = p.totalPortefeuille + p.totalImmoEquity + p.totalCash
  if (richesseReelle <= 0) return insufficientData('Cohérence profil')

  let risqueReel = 0
  for (const pos of p.positions) {
    const r = RISQUE_PAR_CLASSE[pos.asset_type] ?? 0
    risqueReel += (pos.current_value / richesseReelle) * r
  }
  if (p.totalImmoEquity > 0) risqueReel += (p.totalImmoEquity / richesseReelle) * p.risqueImmoGlobal
  if (p.totalCash > 0)       risqueReel += (p.totalCash       / richesseReelle) * RISQUE_CASH

  risqueReel = Math.round(risqueReel)
  const value = clamp(100 - Math.abs(p.fireInputs.risk_score - risqueReel))
  const niveau = niveauCoherence(value)

  // Part immobilier dans la richesse réelle (pour le message)
  const partImmoPct = richesseReelle > 0 ? Math.round((p.totalImmoEquity / richesseReelle) * 100) : 0

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

  // Si l'utilisateur a beaucoup d'immo, le portefeuille apparaît "trop
  // prudent" — c'est une lecture nuancée à exposer dans le message.
  const dominanceImmo = partImmoPct >= 60

  return {
    value, niveau, label, details,
    explanation: {
      formule:
        'Score = 100 − |risque déclaré (profil) − risque réel (patrimoine total)|\n' +
        'Risque réel = pondéré par les actifs détenus :\n' +
        '  - financier : crypto 95 / stock 60 / etf 45 / metal 30 / bond 10 / cash 0\n' +
        '  - immobilier (equity) : risque dynamique 30-75 selon LTV + cashflow par bien',
      inputs: [
        { label: 'Risque déclaré (profil)',         value: `${p.fireInputs.risk_score} / 100` },
        { label: 'Risque réel (patrimoine total)',  value: `${risqueReel} / 100` },
        { label: 'Risque immobilier pondéré',       value: p.totalImmoEquity > 0 ? `${p.risqueImmoGlobal} / 100` : '— (pas d\'immo)' },
        { label: 'Part immobilier (equity / richesse)', value: `${partImmoPct} %` },
        { label: 'Écart',                            value: `${ecart > 0 ? '+' : ''}${ecart}` },
        { label: 'Score final',                      value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 70
          ? 'Votre patrimoine reflète bien votre tolérance au risque déclarée. Pas de rééquilibrage nécessaire.'
          : dominanceImmo && ecart < 0
          ? `Votre patrimoine est majoritairement immobilier (${partImmoPct} %), ce qui le rend plus stable que votre profil déclaré "${p.profilType ?? 'défini'}". Si vous souhaitez vraiment un profil plus dynamique, augmentez la part de vos actifs financiers (ETF, actions).`
          : ecart > 0
          ? `Votre patrimoine prend ${Math.abs(ecart)} points de risque DE PLUS que votre profil. Un krach pourrait être psychologiquement difficile à supporter.`
          : `Votre patrimoine prend ${Math.abs(ecart)} points de risque DE MOINS que votre profil. Vous laissez du rendement sur la table par rapport à vos objectifs.`,
      action: value < 70
        ? ecart > 0
          ? 'Réduisez les actifs risqués (crypto, actions individuelles) au profit d\'ETF diversifiés et d\'obligations.'
          : dominanceImmo
          ? 'Augmentez vos versements ETF mensuels pour rééquilibrer progressivement vers le financier, sans toucher à votre immobilier.'
          : 'Augmentez la part d\'ETF actions monde / Nasdaq pour matcher votre tolérance déclarée.'
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

  // Réduction de la cible par les loyers nets déjà perçus :
  // les revenus immo sont du revenu passif "déjà acquis" → le portefeuille
  // financier n'a besoin de générer que le RESTE.
  const revenuImmoMensuel    = Math.max(0, p.revenuPassifImmo)
  const cibleRestanteMensuel = Math.max(0, revenu_passif_cible - revenuImmoMensuel)
  const cible                = cibleRestanteMensuel * 12 * 25
  // Patrimoine financier (les loyers immo couvrent déjà leur part).
  const actuel               = p.totalPortefeuille + p.totalCash
  const anneesObjectif       = age_cible - age
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

  const cheminPct = cible > 0 ? Math.round((actuel / cible) * 100) : 100   // si cible=0 (déjà FIRE via loyers), 100 %
  const label =
    value >= 80 ? 'Sur la bonne trajectoire' :
    value >= 60 ? 'Trajectoire serrée' :
    value >= 40 ? 'Objectif décalé' :
    'Très en retard sur l\'objectif'
  const ecartTexte = anneesNec >= 99
    ? 'objectif inatteignable au rythme actuel'
    : cible === 0
    ? 'objectif déjà couvert par vos loyers'
    : `${anneesNec.toFixed(1)} ans nécessaires vs ${anneesObjectif} d\'objectif`
  const manque = Math.max(0, cible - actuel)
  const couvertureFirePct = Math.round((revenuImmoMensuel / revenu_passif_cible) * 100)

  return {
    value, niveau, label,
    details: `${cheminPct} % du chemin · ${ecartTexte}`,
    explanation: {
      formule:
        'Étape 1 : revenu immo net mensuel REDUIT la cible (déjà acquis)\n' +
        '  cible_restante = max(0, revenu_passif_cible − loyers_nets_actuels)\n' +
        'Étape 2 : cible patrimoine = cible_restante × 12 × 25 (règle des 4 %)\n' +
        'Étape 3 : simulation intérêts composés à 7 %/an sur le patrimoine financier\n' +
        'Score = 100 si arrivé, 80+ si dans les temps, dégradé selon le retard',
      inputs: [
        { label: 'Revenu passif cible',                    value: `${revenu_passif_cible.toFixed(0)} € / mois` },
        { label: 'Loyers nets actuels (immo)',             value: `${revenuImmoMensuel.toFixed(0)} € / mois (${couvertureFirePct} % de la cible)` },
        { label: 'Cible restante à générer (financier)',   value: `${cibleRestanteMensuel.toFixed(0)} € / mois` },
        { label: 'Patrimoine financier à constituer',      value: `${cible.toFixed(0)} €` },
        { label: 'Patrimoine financier actuel',            value: `${actuel.toFixed(0)} €` },
        { label: 'Reste à constituer',                     value: `${manque.toFixed(0)} €` },
        { label: 'Épargne mensuelle',                      value: `${epargne_mensuelle.toFixed(0)} € / mois` },
        { label: 'Âge actuel',                             value: `${age} ans` },
        { label: 'Âge cible FIRE',                         value: `${age_cible} ans (${anneesObjectif} ans pour y arriver)` },
        { label: 'Années nécessaires',                     value: anneesNec >= 99 ? '∞ (inatteignable)' : `${anneesNec.toFixed(1)} ans` },
        { label: 'Score final',                            value: `${value} / 100`, highlight: true },
      ],
      lecture:
        cible === 0
          ? `Vos loyers nets (${revenuImmoMensuel.toFixed(0)} €/mois) couvrent déjà 100 % de votre objectif FIRE de ${revenu_passif_cible.toFixed(0)} €/mois. Vous êtes financièrement indépendant.`
          : revenuImmoMensuel > 0
          ? `Vos loyers nets couvrent déjà ${revenuImmoMensuel.toFixed(0)} €/mois (${couvertureFirePct} % de votre objectif). Il vous manque ${cibleRestanteMensuel.toFixed(0)} €/mois à générer via votre portefeuille financier.`
          : value >= 80
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

  // Phase 10 — Refonte : on évalue la CAPACITE de remboursement
  // (pas le montant brut de dette). Un crédit immo locatif à LTV 82 %
  // n'est PAS une fragilité — c'est une stratégie levier classique tant
  // que les mensualités sont supportées.
  //
  // 4 facteurs :
  //   a) Taux d'effort : mensualités / revenus
  //   b) Couverture des mensualités par les loyers
  //   c) Coussin de sécurité (cash / charges réelles)
  //   d) Simulation krach −30 % sur actifs risqués

  const revenuMensuel = p.fireInputs.revenu_mensuel_total

  // Loyers bruts mensuels (somme des loyers des biens) — diff. du
  // revenuPassifImmo qui est NET (cashflow après charges et mensualité).
  const loyersBrutsTotal = p.biens.reduce((s, b) => s + b.loyer_mensuel, 0)

  let pts = 60

  // a) Taux d'effort
  const tauxEffort = revenuMensuel > 0 ? (p.mensualitesImmoTotal / revenuMensuel) * 100 : 0
  let tauxEffortTxt = '—'
  if (revenuMensuel > 0 && p.mensualitesImmoTotal > 0) {
    if (tauxEffort < 33)      { pts += 20; tauxEffortTxt = `${tauxEffort.toFixed(0)} % (sain)` }
    else if (tauxEffort < 40) { pts +=  5; tauxEffortTxt = `${tauxEffort.toFixed(0)} % (attention)` }
    else                      { pts -= 20; tauxEffortTxt = `${tauxEffort.toFixed(0)} % (risqué)` }
  }

  // b) Couverture des mensualités par les loyers bruts
  const tauxCouverture = p.mensualitesImmoTotal > 0
    ? (loyersBrutsTotal / p.mensualitesImmoTotal) * 100
    : 0
  let couvTxt = '—'
  if (p.mensualitesImmoTotal > 0) {
    if (tauxCouverture > 110)       { pts += 25; couvTxt = `${tauxCouverture.toFixed(0)} % (autofinancé)` }
    else if (tauxCouverture >= 90)  { pts += 10; couvTxt = `${tauxCouverture.toFixed(0)} % (quasi autofinancé)` }
    else if (tauxCouverture >= 70)  {            couvTxt = `${tauxCouverture.toFixed(0)} % (effort modéré)` }
    else                            { pts -= 10; couvTxt = `${tauxCouverture.toFixed(0)} % (effort important)` }
  }

  // c) Coussin de sécurité — uniquement les charges réelles
  //    (charges perso + effort mensuel net immo s'il est négatif).
  const effortImmoMensuelNet = p.revenuPassifImmo < 0 ? -p.revenuPassifImmo : 0
  const chargesACouvrir = p.fireInputs.charges_mensuelles + effortImmoMensuelNet
  const moisCouverts = chargesACouvrir > 0 ? p.totalCash / chargesACouvrir : 0
  let coussinTxt = 'coussin OK'
  if (chargesACouvrir > 0) {
    if (moisCouverts < 3)       { pts -= 20; coussinTxt = `${moisCouverts.toFixed(1)} mois (fragile)` }
    else if (moisCouverts < 6)  { pts +=  5; coussinTxt = `${moisCouverts.toFixed(1)} mois (correct)` }
    else                        { pts += 20; coussinTxt = `${moisCouverts.toFixed(0)} mois (très bien)` }
  }

  // d) Krach −30 % sur actifs risqués (inchangé)
  let valeurRisquee = 0
  for (const pos of p.positions) {
    if (ASSET_RISKY.includes(pos.asset_type)) valeurRisquee += pos.current_value
  }
  const impactKrach = valeurRisquee * 0.30
  const partImpact  = p.totalNet > 0 ? (impactKrach / p.totalNet) * 100 : 0
  if (partImpact > 30)      pts -= 10
  else if (partImpact < 10) pts += 10

  // NOTE : on NE pénalise PLUS le ratio dettes/brut. La dette immo est
  // adossée à un actif réel et n'est PAS comparable à une dette sans
  // garantie (crédit conso, découvert). Seul le taux d'effort compte.

  const value = clamp(Math.round(pts))
  const niveau = niveauScore(value)
  const label =
    value >= 80 ? 'Très résilient' :
    value >= 60 ? 'Portefeuille solide' :
    value >= 40 ? 'Résistance limitée' :
    'Portefeuille fragile'

  return {
    value, niveau, label,
    details: `${coussinTxt} · effort ${tauxEffortTxt} · loyers couvrent ${couvTxt}`,
    explanation: {
      formule:
        'Score base 60, ajusté par 4 facteurs de CAPACITÉ DE REMBOURSEMENT\n' +
        '(la dette immo adossée à un actif n\'est PAS pénalisée en soi) :\n' +
        '  a) Taux d\'effort (mensualités / revenus) :\n' +
        '     < 33 % → +20 sain / 33-40 % → +5 / > 40 % → −20\n' +
        '  b) Couverture loyers/mensualités :\n' +
        '     > 110 % → +25 / 90-110 % → +10 / 70-90 % → 0 / < 70 % → −10\n' +
        '  c) Coussin cash vs charges réelles (perso + effort immo net) :\n' +
        '     < 3 mois → −20 / 3-6 mois → +5 / ≥ 6 mois → +20\n' +
        '  d) Krach −30 % sur actifs risqués : impact > 30 % du net → −10, < 10 % → +10',
      inputs: [
        { label: 'Revenu mensuel total',          value: revenuMensuel > 0 ? `${revenuMensuel.toFixed(0)} €` : 'Non renseigné' },
        { label: 'Mensualités immo / mois',       value: `${p.mensualitesImmoTotal.toFixed(0)} €` },
        { label: 'Taux d\'effort',                value: revenuMensuel > 0 && p.mensualitesImmoTotal > 0 ? tauxEffortTxt : '—' },
        { label: 'Loyers bruts / mois',           value: `${loyersBrutsTotal.toFixed(0)} €` },
        { label: 'Couverture mensualités',        value: p.mensualitesImmoTotal > 0 ? couvTxt : '—' },
        { label: 'Cash disponible',               value: `${p.totalCash.toFixed(0)} €` },
        { label: 'Coussin de sécurité',           value: chargesACouvrir > 0 ? `${moisCouverts.toFixed(1)} mois (sur ${chargesACouvrir.toFixed(0)} €/mois de charges)` : '—' },
        { label: 'Impact krach −30 %',            value: `${impactKrach.toFixed(0)} € (${partImpact.toFixed(0)} % du net)` },
        { label: 'Score final',                   value: `${value} / 100`, highlight: true },
      ],
      lecture:
        value >= 80
          ? 'Patrimoine très résilient. Capacité de remboursement saine, coussin solide.'
          : value >= 60
          ? 'Solide. Le levier immo (s\'il existe) est correctement supporté par les revenus et/ou loyers.'
          : value >= 40
          ? 'Résistance limitée. Vérifiez votre taux d\'effort et constituez un coussin > 6 mois de charges.'
          : tauxEffort > 40
          ? 'Taux d\'effort très élevé. Une vacance locative ou perte de revenus pourrait basculer en défaut.'
          : 'Coussin de sécurité insuffisant — priorité absolue à constituer du cash avant de continuer à investir.',
      action: value < 60
        ? moisCouverts < 3
          ? 'Priorité absolue : constituer 3-6 mois de charges sur Livret A avant tout nouvel investissement.'
          : tauxEffort > 40
          ? 'Taux d\'effort > 40 % — envisagez un rachat de crédit ou la vente d\'un bien si vous voulez investir davantage.'
          : tauxCouverture < 70 && p.mensualitesImmoTotal > 0
          ? 'Renégociez vos loyers (IRL) ou cherchez des biens mieux rentables — vos loyers ne couvrent que ' + tauxCouverture.toFixed(0) + ' % des mensualités.'
          : 'Ajoutez de la diversification non corrélée (oblig, SCPI) pour réduire la dépendance aux marchés actions.'
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
