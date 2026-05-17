/**
 * Definitions JSON-Schema des tools ARIA exposes a Claude.
 *
 * Ces schemas pilotent le `tools` array passe a `client.messages.stream`.
 * Le `name` doit matcher exactement la cle du dispatcher dans `./index.ts`.
 *
 * Convention : noms en camelCase, descriptions FR detaillees (Claude
 * choisit le tool en fonction de la description, donc on est explicite
 * sur QUAND l'invoquer et avec QUOI).
 */

import type Anthropic from '@anthropic-ai/sdk'

export type AriaToolDefinition = Anthropic.Tool

export const ARIA_TOOL_DEFINITIONS: ReadonlyArray<AriaToolDefinition> = [
  {
    name: 'simulerNouveauDCA',
    description:
      'Simule l\'impact d\'un nouveau montant DCA (epargne mensuelle financiere) sur la trajectoire FIRE de l\'utilisateur. ' +
      'Retourne la nouvelle date FIRE estimee et la difference vs la trajectoire actuelle. ' +
      'A utiliser quand l\'utilisateur demande "que se passe-t-il si je passe mon DCA a X" ou "si j\'augmente mon epargne de Y".',
    input_schema: {
      type: 'object',
      properties: {
        nouveau_dca_mensuel: {
          type: 'number',
          description: 'Nouveau montant DCA mensuel en euros (par exemple 1500 pour 1 500 €/mois).',
        },
      },
      required: ['nouveau_dca_mensuel'],
    },
  },

  {
    name: 'simulerStressTest',
    description:
      'Simule un scenario de stress sur la trajectoire FIRE (crash boursier, vacance locative, perte d\'emploi, etc.). ' +
      'Compare a la trajectoire normale et expose le retard, la perte immediate, le revenu passif final. ' +
      'A utiliser quand l\'utilisateur demande "simule un krach", "que se passe-t-il si...", ou veut tester sa resilience.',
    input_schema: {
      type: 'object',
      properties: {
        scenario_id: {
          type: 'string',
          enum: ['crash_marches', 'vacance_locative', 'perte_emploi', 'hausse_taux', 'inflation_forte', 'double_peine'],
          description:
            'Identifiant du scenario : crash_marches (-30 % portefeuille), vacance_locative (loyers nuls 6 mois), ' +
            'perte_emploi (epargne -80 % pendant 12 mois), hausse_taux (-15 % portefeuille + rendement -2 pts), ' +
            'inflation_forte (loyers +10 %, rendement -4 pts, 3 ans), double_peine (crash + perte d\'emploi).',
        },
      },
      required: ['scenario_id'],
    },
  },

  {
    name: 'simulerAcquisitionFuture',
    description:
      'Simule l\'impact d\'une acquisition immobiliere future (RP ou locatif) sur la trajectoire FIRE. ' +
      'Calcule l\'effet de l\'apport, des mensualites, des loyers (si locatif) et de l\'appreciation. ' +
      'A utiliser quand l\'utilisateur demande "si j\'achete un appart de X € dans Y ans".',
    input_schema: {
      type: 'object',
      properties: {
        prix_achat:          { type: 'number', description: 'Prix d\'achat FAI (frais d\'agence inclus) en euros.' },
        apport:              { type: 'number', description: 'Apport personnel en euros.' },
        dans_combien_annees: { type: 'number', description: 'Horizon d\'achat en annees (1 a 20).' },
        type:                { type: 'string', enum: ['locatif', 'RP'], description: 'Type d\'acquisition.' },
        loyer_brut_mensuel:  { type: 'number', description: 'Loyer brut mensuel attendu (0 si RP).' },
        duree_credit_ans:    { type: 'number', description: 'Duree du credit en annees (15/20/25).' },
        taux_interet:        { type: 'number', description: 'Taux d\'interet annuel du credit en % (ex: 3.5).' },
      },
      required: ['prix_achat', 'apport', 'dans_combien_annees', 'type', 'duree_credit_ans', 'taux_interet'],
    },
  },

  {
    name: 'chercherPosition',
    description:
      'Recherche une position financiere (action, ETF, crypto, SCPI...) dans le portefeuille de l\'utilisateur par nom, ticker ou ISIN. ' +
      'Retourne les positions correspondantes avec valeur actuelle, PRU, +/- value latente. ' +
      'A utiliser quand l\'utilisateur demande "ou en est mon LVMH", "combien j\'ai en ETF World", etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texte de recherche (insensible a la casse, partiel). Cherche dans nom, ticker, ISIN.',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'obtenirDetailBien',
    description:
      'Retourne le detail complet d\'un bien immobilier de l\'utilisateur : valeur, equity, loyer, cashflow mensuel, ' +
      'rendement brut/net, LTV, taux d\'effort fiscal, regime fiscal. ' +
      'A utiliser quand l\'utilisateur demande "donne-moi le detail de mon bien a [ville]" ou nomme un bien.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nom du bien, ville ou identifiant (insensible a la casse, partiel).',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'obtenirHistoriquePatrimoine',
    description:
      'Retourne les snapshots quotidiens du patrimoine net sur les derniers N jours (max 120). ' +
      'Sert a expliquer les evolutions, identifier les pics ou creux, contextualiser une variation. ' +
      'A utiliser quand l\'utilisateur demande "comment a evolue mon patrimoine", "depuis quand je suis a X", etc.',
    input_schema: {
      type: 'object',
      properties: {
        jours: {
          type: 'number',
          description: 'Nombre de jours d\'historique (defaut 30, max 120).',
        },
      },
      required: [],
    },
  },
]
