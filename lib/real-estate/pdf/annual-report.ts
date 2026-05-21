/**
 * Generateur PDF du bilan annuel d'un bien immobilier (pdfkit).
 *
 * 4 pages A4 :
 *  1. Identification + synthese (situation + performance)
 *  2. Extrait du tableau d'amortissement de l'annee
 *  3. Detail des charges deductibles vs non deductibles
 *  4. Resume fiscal (regime, impot du, dispositif fiscal eventuel)
 *
 * Utilise pdfkit en mode buffer (pas de stream fichier). Le buffer est
 * concatene en Uint8Array et retourne pour etre stream-e dans la response.
 */

import PDFDocument from 'pdfkit'
import type {
  DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile,
} from '../build-from-db'
import type { SimulationResult, FiscalRegimeKind } from '../types'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnnualReportInput {
  year:         number
  propertyName: string
  property:     DbProperty
  asset:        DbAsset | null
  lots:         DbLot[]
  charges:      DbCharges | null
  debt:         DbDebt | null
  profile:      DbProfile | null
  simulation:   SimulationResult
  /** Optionnel : nom du dispositif fiscal actif. */
  incentiveLabel?: string
  /** Optionnel : reduction d'impot Pinel/Denormandie/LocAv pour l'annee. */
  incentiveReductionEur?: number
}

const FISCAL_REGIME_LABELS: Record<FiscalRegimeKind, string> = {
  foncier_micro: 'Foncier micro',
  foncier_nu:    'Foncier réel (nu)',
  lmnp_micro:    'LMNP micro-BIC',
  lmnp_reel:     'LMNP réel',
  lmp:           'LMP',
  sci_ir:        'SCI IR',
  sci_is:        'SCI IS',
}

// ─── Styles ────────────────────────────────────────────────────────────────

const COLORS = {
  primary:   '#111111',
  secondary: '#555555',
  muted:     '#888888',
  accent:    '#10b981',
  danger:    '#ef4444',
  border:    '#e5e5e5',
} as const

const MARGINS = { top: 50, bottom: 50, left: 50, right: 50 }

// ─── Helpers ───────────────────────────────────────────────────────────────

function eur(v: number | null | undefined, opts?: { sign?: boolean }): string {
  if (v == null) return '—'
  const sign = opts?.sign && v > 0 ? '+' : ''
  const rounded = Math.round(v)
  return `${sign}${rounded.toLocaleString('fr-FR')} €`
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(2)} %`
}

function frenchDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Generateur principal ──────────────────────────────────────────────────

export async function generateAnnualReport(input: AnnualReportInput): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGINS,
    info: {
      Title:    `Bilan immobilier ${input.year} — ${input.propertyName}`,
      Author:   'Fynix',
      Subject:  `Bilan annuel ${input.year}`,
      Creator:  'Fynix · firecore',
      Producer: 'pdfkit',
    },
  })

  const chunks: Uint8Array[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)))

  const done = new Promise<Uint8Array>((resolve) => {
    doc.on('end', () => {
      const total = chunks.reduce((s, c) => s + c.length, 0)
      const out = new Uint8Array(total)
      let off = 0
      for (const c of chunks) { out.set(c, off); off += c.length }
      resolve(out)
    })
  })

  // ─── PAGE 1 — Identification & synthese ──────────────────────────
  renderPage1(doc, input)

  // ─── PAGE 2 — Extrait amortissement ──────────────────────────────
  doc.addPage()
  renderPage2(doc, input)

  // ─── PAGE 3 — Detail charges ─────────────────────────────────────
  doc.addPage()
  renderPage3(doc, input)

  // ─── PAGE 4 — Resume fiscal ──────────────────────────────────────
  doc.addPage()
  renderPage4(doc, input)

  doc.end()
  return done
}

// ─── PAGE 1 ────────────────────────────────────────────────────────────────

function renderPage1(doc: PDFKit.PDFDocument, input: AnnualReportInput) {
  const projYear = input.simulation.projection.find(p => p.year === input.year)
                ?? input.simulation.projection[0]
                ?? null

  // En-tete
  doc.fillColor(COLORS.muted).fontSize(9)
    .text(`FYNIX · BILAN IMMOBILIER ${input.year}`, MARGINS.left, MARGINS.top, { continued: true })
    .text(`Généré le ${frenchDate(new Date().toISOString())}`, { align: 'right' })

  doc.moveDown(2)

  // Titre du bien dans un cadre
  const yStart = doc.y
  doc.rect(MARGINS.left, yStart, doc.page.width - MARGINS.left - MARGINS.right, 65).stroke(COLORS.border)

  doc.fillColor(COLORS.primary).fontSize(18).font('Helvetica-Bold')
    .text(input.propertyName, MARGINS.left + 15, yStart + 12, { width: doc.page.width - 2*MARGINS.left - 30 })

  const addressParts = [
    input.property as unknown as { address_line1?: string | null }, // not in DbProperty type
  ]
  void addressParts
  const addressText = [
    (input.property as unknown as Record<string, string | null>).address_line1,
    [(input.property as unknown as Record<string, string | null>).address_zip,
     (input.property as unknown as Record<string, string | null>).address_city].filter(Boolean).join(' '),
  ].filter(Boolean).join(' · ') || 'Adresse non renseignee'

  doc.fontSize(10).font('Helvetica').fillColor(COLORS.secondary)
    .text(addressText, MARGINS.left + 15, doc.y + 4)

  const typeText = [
    (input.property as unknown as { property_type?: string }).property_type ?? '—',
    input.property.fiscal_regime ? (FISCAL_REGIME_LABELS[input.property.fiscal_regime as FiscalRegimeKind] ?? input.property.fiscal_regime) : '—',
  ].join(' · ')
  doc.fontSize(9).fillColor(COLORS.muted).text(typeText, MARGINS.left + 15, doc.y + 2)

  doc.y = yStart + 80

  // ACQUISITION
  sectionTitle(doc, 'ACQUISITION')
  const acqCost = (input.property.purchase_price ?? 0) + (input.property.purchase_fees ?? 0) + (input.property.works_amount ?? 0)
  const apport = Math.max(0, acqCost - (input.debt?.initial_amount ?? 0))
  twoColLine(doc, 'Prix de revient total', eur(acqCost))
  twoColLine(doc, "Date d'acquisition", frenchDate((input.asset as unknown as { acquisition_date?: string | null })?.acquisition_date ?? null))
  twoColLine(doc, 'Apport personnel', eur(apport))

  doc.moveDown(1)

  // SITUATION
  sectionTitle(doc, `SITUATION AU 31/12/${input.year}`)
  const k = input.simulation.kpis
  const currentValue = input.asset?.current_value ?? 0
  const latentGain = currentValue - acqCost
  // CRD : on prend amortization.years.find(y => year correspond) si dispo,
  // sinon le KPI currentNetPropertyValue pour Y courante
  const amortYears = input.simulation.amortization?.years ?? []
  const debtStartYear = input.debt?.start_date ? new Date(input.debt.start_date).getUTCFullYear() : input.year
  const yearOffset = input.year - debtStartYear + 1
  const amortYearRow = amortYears.find(y => y.year === yearOffset)
  const crd = amortYearRow?.remainingCapital ?? (currentValue - k.currentNetPropertyValue)
  twoColLine(doc, 'Valeur estimée', eur(currentValue))
  twoColLine(doc, 'Capital restant dû', eur(crd))
  twoColLine(doc, 'Valeur nette', eur(currentValue - crd), { accent: 'positive' })
  twoColLine(doc, 'Plus-value latente', eur(latentGain, { sign: true }),
    { accent: latentGain >= 0 ? 'positive' : 'negative' })

  doc.moveDown(1)

  // PERFORMANCE
  sectionTitle(doc, `PERFORMANCE ${input.year}`)
  if (projYear) {
    twoColLine(doc, 'Loyers bruts perçus', eur(projYear.grossRent))
    twoColLine(doc, 'Charges déductibles', eur(-projYear.charges))
    twoColLine(doc, 'Mensualités crédit',  eur(-projYear.loanPayment))
    twoColLine(doc, 'Impôts estimés',      eur(-projYear.taxPaid))
    sepLine(doc)
    twoColLine(doc, `Cash-flow net ${input.year}`, eur(projYear.cashFlowAfterTax, { sign: true }),
      { bold: true, accent: projYear.cashFlowAfterTax >= 0 ? 'positive' : 'negative' })
  } else {
    twoColLine(doc, 'Données', 'Année hors projection')
  }

  doc.moveDown(1)
  twoColLine(doc, 'Rendement brut',   pct(k.grossYieldFAI))
  twoColLine(doc, 'Rendement net-net', pct(k.netNetYield))
}

// ─── PAGE 2 — Amortissement ────────────────────────────────────────────────

function renderPage2(doc: PDFKit.PDFDocument, input: AnnualReportInput) {
  pageHeader(doc, `Tableau d'amortissement ${input.year}`, input)

  const months = input.simulation.amortization?.months ?? []
  if (months.length === 0 || !input.debt?.start_date) {
    doc.fontSize(11).fillColor(COLORS.muted).text('Aucun crédit actif sur ce bien.')
    return
  }

  // Filtre les mois tombant sur l'annee demandee
  const startDate = new Date(input.debt.start_date)
  const rows = months.filter(m => {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + m.monthIndex - 1)
    return d.getUTCFullYear() === input.year
  }).slice(0, 12)

  if (rows.length === 0) {
    doc.fontSize(11).fillColor(COLORS.muted)
      .text(`Le crédit n'a pas d'échéance en ${input.year} (déjà soldé ou pas encore débuté).`)
    return
  }

  // En-tete tableau
  const cols = [
    { x: MARGINS.left,       w: 80,  label: 'Mois' },
    { x: MARGINS.left + 80,  w: 80,  label: 'Mensualité' },
    { x: MARGINS.left + 160, w: 80,  label: 'Intérêts' },
    { x: MARGINS.left + 240, w: 80,  label: 'Capital' },
    { x: MARGINS.left + 320, w: 80,  label: 'Assurance' },
    { x: MARGINS.left + 400, w: 95,  label: 'CRD fin de mois' },
  ]
  doc.fontSize(9).fillColor(COLORS.muted)
  for (const c of cols) doc.text(c.label, c.x, doc.y, { width: c.w, align: 'right' })
  doc.moveDown(0.4)
  sepLine(doc)
  doc.moveDown(0.4)

  let totalPay = 0, totalInt = 0, totalCap = 0, totalIns = 0
  doc.fontSize(9).fillColor(COLORS.primary).font('Helvetica')
  for (const r of rows) {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + r.monthIndex - 1)
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    const payment = r.payment + r.insurance
    const vals = [
      label,
      eur(payment),
      eur(r.interest),
      eur(r.principal),
      eur(r.insurance),
      eur(r.remainingCapital),
    ]
    const y0 = doc.y
    for (let i = 0; i < cols.length; i++) {
      doc.text(vals[i]!, cols[i]!.x, y0, { width: cols[i]!.w, align: 'right' })
    }
    doc.moveDown(0.3)
    totalPay += payment
    totalInt += r.interest
    totalCap += r.principal
    totalIns += r.insurance
  }

  // Total annuel
  doc.moveDown(0.4)
  sepLine(doc)
  doc.moveDown(0.4)
  doc.font('Helvetica-Bold').fillColor(COLORS.primary)
  const totalVals = ['Total', eur(totalPay), eur(totalInt), eur(totalCap), eur(totalIns), '']
  const y0 = doc.y
  for (let i = 0; i < cols.length; i++) {
    doc.text(totalVals[i]!, cols[i]!.x, y0, { width: cols[i]!.w, align: 'right' })
  }
  doc.font('Helvetica').moveDown(2)

  doc.fontSize(10).fillColor(COLORS.secondary)
  twoColLine(doc, 'Capital emprunté initial', eur(input.debt.initial_amount ?? 0))
  twoColLine(doc, 'Taux nominal', pct(input.debt.interest_rate ?? null))
  twoColLine(doc, 'Durée totale', `${input.debt.duration_months ?? 0} mois`)
}

// ─── PAGE 3 — Charges ──────────────────────────────────────────────────────

function renderPage3(doc: PDFKit.PDFDocument, input: AnnualReportInput) {
  pageHeader(doc, `Détail des charges ${input.year}`, input)

  if (!input.charges) {
    doc.fontSize(11).fillColor(COLORS.muted)
      .text('Aucune charge réelle saisie pour cette année — bilan basé sur les estimations par défaut.')
    return
  }

  const c = input.charges
  const regimeAllowsDeduction = ['foncier_nu', 'lmnp_reel', 'lmp', 'sci_ir', 'sci_is'].includes(
    input.property.fiscal_regime ?? '',
  )

  doc.fontSize(9).fillColor(COLORS.muted).text(
    regimeAllowsDeduction
      ? 'Régime réel : la majorité des charges sont déductibles du revenu locatif.'
      : 'Régime micro : abattement forfaitaire — charges réelles non déductibles.',
  )
  doc.moveDown(0.8)

  sectionTitle(doc, 'CHARGES SAISIES')
  let total = 0
  const charges: Array<[string, number, boolean]> = [
    ['Taxe foncière',       c.taxe_fonciere ?? 0, regimeAllowsDeduction],
    ['Assurance PNO',       c.insurance ?? 0,     regimeAllowsDeduction],
    ['Honoraires comptable', c.accountant ?? 0,   regimeAllowsDeduction],
    ['CFE',                 c.cfe ?? 0,           regimeAllowsDeduction],
    ['Charges copropriété', c.condo_fees ?? 0,    regimeAllowsDeduction],
    ['Entretien · travaux', c.maintenance ?? 0,   regimeAllowsDeduction],
    ['Autres',              c.other ?? 0,         regimeAllowsDeduction],
  ]
  for (const [label, amount, ded] of charges) {
    if (amount <= 0) continue
    total += amount
    twoColLine(doc, `${label}${ded ? ' (déductible)' : ' (non déductible)'}`, eur(amount))
  }

  doc.moveDown(0.4)
  sepLine(doc)
  doc.moveDown(0.4)
  twoColLine(doc, 'Total charges annuelles', eur(total), { bold: true })

  if (regimeAllowsDeduction) {
    doc.moveDown(1)
    sectionTitle(doc, 'IMPACT FISCAL')
    twoColLine(doc, 'Charges déductibles', eur(total))
    twoColLine(doc, 'Économie d\'impôt estimée (TMI 30 %)', eur(total * 0.30),
      { accent: 'positive' })
  }
}

// ─── PAGE 4 — Resume fiscal ────────────────────────────────────────────────

function renderPage4(doc: PDFKit.PDFDocument, input: AnnualReportInput) {
  pageHeader(doc, `Résumé fiscal ${input.year}`, input)

  const regime = (input.property.fiscal_regime ?? 'foncier_nu') as FiscalRegimeKind
  sectionTitle(doc, 'RÉGIME FISCAL ACTIF')
  twoColLine(doc, 'Régime', FISCAL_REGIME_LABELS[regime] ?? regime)
  twoColLine(doc, 'TMI utilisée', pct(input.profile?.tmi_rate ?? 30))

  doc.moveDown(1)

  // Performance fiscale annuelle
  const perf = input.simulation.projection.find(p => p.year === input.year)
            ?? input.simulation.projection[0]
            ?? null
  if (perf) {
    sectionTitle(doc, `CALCUL ${input.year}`)
    twoColLine(doc, 'Recettes imposables', eur(perf.netRent))
    twoColLine(doc, 'Charges déductibles', eur(-perf.charges))
    twoColLine(doc, 'Amortissements',     eur(-perf.amortizations))
    twoColLine(doc, "Intérêts d'emprunt", eur(-perf.interest))
    sepLine(doc)
    twoColLine(doc, 'Résultat fiscal', eur(perf.fiscalResult),
      { bold: true, accent: perf.fiscalResult >= 0 ? 'negative' : 'positive' })
    twoColLine(doc, 'Impôt dû', eur(perf.taxPaid),
      { accent: 'negative' })
  }

  // Dispositif fiscal eventuel
  if (input.incentiveLabel) {
    doc.moveDown(1.2)
    sectionTitle(doc, 'DISPOSITIF FISCAL')
    twoColLine(doc, 'Dispositif', input.incentiveLabel)
    if (input.incentiveReductionEur != null && input.incentiveReductionEur > 0) {
      twoColLine(doc, `Réduction d'impôt ${input.year}`, eur(-input.incentiveReductionEur),
        { accent: 'positive' })
    }
  }

  // Avertissement
  doc.moveDown(2)
  doc.fontSize(8).fillColor(COLORS.muted)
    .text(
      'AVERTISSEMENT : ce document est une estimation basée sur les données saisies dans ' +
      'Fynix. Il ne constitue pas une déclaration fiscale officielle. Consultez votre ' +
      'expert-comptable pour votre déclaration.',
      MARGINS.left, doc.page.height - MARGINS.bottom - 30,
      { width: doc.page.width - 2*MARGINS.left, align: 'center' },
    )
}

// ─── Helpers de rendu ──────────────────────────────────────────────────────

function pageHeader(doc: PDFKit.PDFDocument, title: string, input: AnnualReportInput) {
  doc.fillColor(COLORS.muted).fontSize(9)
    .text(`FYNIX · ${input.propertyName} · Bilan ${input.year}`, MARGINS.left, MARGINS.top)
  doc.moveDown(0.5)
  doc.fillColor(COLORS.primary).fontSize(14).font('Helvetica-Bold')
    .text(title, MARGINS.left, doc.y)
  doc.font('Helvetica').moveDown(0.8)
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(10).fillColor(COLORS.muted).font('Helvetica-Bold')
    .text(title, MARGINS.left, doc.y)
  doc.font('Helvetica').moveDown(0.4)
}

function twoColLine(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  opts?: { bold?: boolean; accent?: 'positive' | 'negative' },
) {
  const y = doc.y
  doc.fontSize(10).fillColor(COLORS.secondary).font('Helvetica')
    .text(label, MARGINS.left, y, { width: 300 })
  const color =
    opts?.accent === 'positive' ? COLORS.accent :
    opts?.accent === 'negative' ? COLORS.danger : COLORS.primary
  doc.fillColor(color).font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(value, MARGINS.left + 300, y,
      { width: doc.page.width - 2*MARGINS.left - 300, align: 'right' })
  doc.font('Helvetica').moveDown(0.25)
}

function sepLine(doc: PDFKit.PDFDocument) {
  const y = doc.y + 1
  doc.moveTo(MARGINS.left, y)
    .lineTo(doc.page.width - MARGINS.right, y)
    .strokeColor(COLORS.border).lineWidth(0.5).stroke()
  doc.moveDown(0.4)
}
