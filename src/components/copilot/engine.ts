/**
 * KDH One Asset — Management Copilot reasoning engine.
 *
 * There is no LLM and no network here. This is a deterministic, rule-based
 * natural-language engine:
 *
 *   1. `parseQuery`   — normalises the question and pulls out entities
 *                       (zones, categories, conditions, priorities, a day
 *                       window, a month, an asset code, a money threshold,
 *                       a "top N").
 *   2. `INTENTS`      — a registry of intents, each scored against the question
 *                       by a weighted cue matcher (not a single if-chain).
 *   3. `run(...)`     — the winning intent computes its answer from the REAL
 *                       records handed in via `CopilotScope`, reusing
 *                       `@/lib/analytics` so every figure agrees with the rest
 *                       of the application.
 *
 * Every answer carries `sources` (record types + counts actually read) and
 * `working` (a plain-English derivation) so the numbers are auditable.
 *
 * Nothing in this file invents a figure. If confidence is too low the engine
 * returns a `fallback` answer listing what it *can* do.
 */

import {
  arrearsSummary,
  collectionRate,
  collectionTrend,
  conditionDistribution,
  criticalityDistribution,
  dataQualitySummary,
  esgSummary,
  expiringInsurance,
  expiringLeases,
  isLiveLease,
  isOpenWorkOrder,
  leaseExpiryPipeline,
  maintenanceSpendVsBudget,
  mttrByCategory,
  occupancyByProperty,
  occupancySummary,
  portfolioSummary,
  rentRoll,
  revenueVsTarget,
  riskRegister,
  slaTrend,
  statusDistribution,
  technicianWorkload,
  topRevenueAssets,
  upcomingInspections,
  valueByCategory,
  valueByZone,
  vendorPerformance,
  woByPriority,
  woByStatus,
  workOrderSummary,
  zonePerformance,
} from '@/lib/analytics'
import {
  daysUntil,
  formatDate,
  formatMYR,
  formatMYRCompact,
  formatNumber,
  formatPct,
} from '@/lib/format'
import {
  ASSET_CATEGORIES,
  CONDITIONS,
  ZONES,
  type AppUser,
  type Asset,
  type AssetCategory,
  type Condition,
  type Criticality,
  type Lease,
  type MaintenanceSchedule,
  type MonthlyFinancial,
  type Payment,
  type Priority,
  type PropertyUnit,
  type Technician,
  type Tenant,
  type Vendor,
  type WorkOrder,
  type Zone,
} from '@/lib/types'

/* ================================================================== */
/* Public answer contract                                              */
/* ================================================================== */

export const ANSWER_KINDS = [
  'metric',
  'breakdown',
  'table',
  'profile',
  'comparison',
  'fallback',
] as const
export type AnswerKind = (typeof ANSWER_KINDS)[number]

export type AnswerTone = 'default' | 'positive' | 'warning' | 'critical'

export interface AnswerMetric {
  label: string
  value: string
  sublabel?: string
  tone?: AnswerTone
}

export interface AnswerFact {
  label: string
  value: string
  /** Render the value through StatusBadge instead of plain text. */
  badge?: boolean
  mono?: boolean
}

export interface AnswerColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
  badge?: boolean
}

export interface AnswerTable {
  columns: AnswerColumn[]
  rows: Record<string, string | number>[]
  totalRow?: Record<string, string | number>
  /** File stem used by the CSV export button. */
  csvName: string
  /** Deep link into the matching full page. */
  link?: { label: string; to: string }
  note?: string
}

export interface AnswerSeries {
  key: string
  label: string
  color: string
}

export interface AnswerChart {
  type: 'bar' | 'line' | 'area' | 'pie'
  data: Record<string, string | number>[]
  xKey: string
  series: AnswerSeries[]
  format: 'myr' | 'number' | 'pct' | 'hours'
  stacked?: boolean
  /** Horizontal bars — used when the category labels are long. */
  horizontal?: boolean
  title?: string
  height?: string
  /** Per-slice colours for pie charts. */
  sliceColors?: string[]
}

export interface AnswerSource {
  label: string
  count: number
}

export interface CopilotAnswer {
  kind: AnswerKind
  intent: string
  intentLabel: string
  /** Big figure at the top of the answer, already formatted. */
  headline?: string
  headlineLabel?: string
  headlineTone?: AnswerTone
  narrative: string
  metrics?: AnswerMetric[]
  facts?: AnswerFact[]
  table?: AnswerTable
  chart?: AnswerChart
  /** Plain-English derivation, rendered under "Show working". */
  working: string[]
  sources: AnswerSource[]
  followUps: string[]
  /** 0–100 match confidence. */
  confidence: number
}

/* ================================================================== */
/* Scope — what this signed-in user is allowed to be asked about       */
/* ================================================================== */

export interface CopilotScope {
  user: AppUser | null
  /** Zones the user may query. */
  zones: Zone[]
  /** True when the user has group-wide visibility. */
  allZones: boolean
  assets: Asset[]
  workOrders: WorkOrder[]
  units: PropertyUnit[]
  tenants: Tenant[]
  leases: Lease[]
  payments: Payment[]
  vendors: Vendor[]
  technicians: Technician[]
  schedules: MaintenanceSchedule[]
  monthlyFinancials: MonthlyFinancial[]
  now: Date
}

export interface RawData {
  assets: Asset[]
  workOrders: WorkOrder[]
  units: PropertyUnit[]
  tenants: Tenant[]
  leases: Lease[]
  payments: Payment[]
  vendors: Vendor[]
  technicians: Technician[]
  schedules: MaintenanceSchedule[]
  monthlyFinancials: MonthlyFinancial[]
}

/**
 * Applies row-level zone security. A user whose `zoneScope` is not `'all'`
 * genuinely cannot see records outside their zones — the copilot reads from
 * this filtered scope only, so switching role in the sidebar really does
 * change the answers.
 */
export function buildScope(user: AppUser | null, data: RawData, now: Date = new Date()): CopilotScope {
  const allZones = !user || user.zoneScope === 'all'
  const zones: Zone[] = allZones ? [...ZONES] : ZONES.filter((z) => (user.zoneScope as Zone[]).includes(z))
  const zoneSet = new Set<Zone>(zones)

  const assets = allZones ? data.assets : data.assets.filter((a) => zoneSet.has(a.location.zone))
  const assetIds = new Set(assets.map((a) => a.id))
  const units = allZones ? data.units : data.units.filter((u) => zoneSet.has(u.zone))
  const leases = allZones ? data.leases : data.leases.filter((l) => zoneSet.has(l.zone))
  const leaseIds = new Set(leases.map((l) => l.id))
  const tenantIds = new Set(leases.map((l) => l.tenantId))

  return {
    user,
    zones,
    allZones,
    assets,
    workOrders: allZones ? data.workOrders : data.workOrders.filter((w) => zoneSet.has(w.zone)),
    units,
    tenants: allZones ? data.tenants : data.tenants.filter((t) => tenantIds.has(t.id)),
    leases,
    payments: allZones ? data.payments : data.payments.filter((p) => leaseIds.has(p.leaseId)),
    vendors: data.vendors,
    technicians: allZones ? data.technicians : data.technicians.filter((t) => zoneSet.has(t.zone)),
    schedules: allZones ? data.schedules : data.schedules.filter((s) => assetIds.has(s.assetId)),
    monthlyFinancials: data.monthlyFinancials,
    now,
  }
}

/* ================================================================== */
/* Query parsing                                                       */
/* ================================================================== */

const CHART = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const

const MONTH_NAMES: readonly { index: number; terms: string[]; label: string }[] = [
  { index: 0, terms: ['january', 'jan', 'januari'], label: 'January' },
  { index: 1, terms: ['february', 'feb', 'februari'], label: 'February' },
  { index: 2, terms: ['march', 'mar', 'mac'], label: 'March' },
  { index: 3, terms: ['april', 'apr'], label: 'April' },
  { index: 4, terms: ['may', 'mei'], label: 'May' },
  { index: 5, terms: ['june', 'jun'], label: 'June' },
  { index: 6, terms: ['july', 'jul', 'julai'], label: 'July' },
  { index: 7, terms: ['august', 'aug', 'ogos'], label: 'August' },
  { index: 8, terms: ['september', 'sep', 'sept'], label: 'September' },
  { index: 9, terms: ['october', 'oct', 'oktober'], label: 'October' },
  { index: 10, terms: ['november', 'nov'], label: 'November' },
  { index: 11, terms: ['december', 'dec', 'disember'], label: 'December' },
]

const ZONE_ALIASES: readonly { zone: Zone; terms: string[] }[] = [
  { zone: 'Zon Desaru–Penawar', terms: ['desaru', 'penawar'] },
  { zone: 'Zon Pengerang–Sungai Rengit', terms: ['pengerang', 'sungai rengit', 'rengit'] },
  { zone: 'Zon Bandar Tenggara', terms: ['bandar tenggara', 'tenggara'] },
  { zone: 'Zon Bandar Mas–Air Tawar', terms: ['bandar mas', 'air tawar'] },
  { zone: 'Zon Sedili–Kota Tinggi', terms: ['sedili', 'kota tinggi'] },
  { zone: 'Zon Mersing', terms: ['mersing'] },
]

const CATEGORY_ALIASES: readonly { category: AssetCategory; terms: string[] }[] = [
  { category: 'Commercial Property', terms: ['commercial property', 'commercial', 'komersial', 'shoplot', 'shop lot', 'retail'] },
  { category: 'Industrial', terms: ['industrial', 'industri', 'kilang', 'factory'] },
  { category: 'Land', terms: ['land bank', 'landbank', 'land', 'tanah'] },
  { category: 'Tourism & Hospitality', terms: ['tourism', 'hospitality', 'chalet', 'resort', 'pelancongan'] },
  { category: 'Infrastructure', terms: ['infrastructure', 'infrastruktur'] },
  { category: 'Building & Facility', terms: ['building & facility', 'building and facility', 'dewan', 'surau'] },
  { category: 'Plant & Equipment', terms: ['plant & equipment', 'plant and equipment', 'plant', 'genset', 'chiller'] },
  { category: 'ICT & Digital', terms: ['ict', 'digital', 'server room', 'cctv'] },
]

const PRIORITY_ALIASES: readonly { priority: Priority; terms: string[] }[] = [
  { priority: 'P1 - Critical', terms: ['p1', 'priority 1'] },
  { priority: 'P2 - High', terms: ['p2', 'priority 2'] },
  { priority: 'P3 - Medium', terms: ['p3', 'priority 3'] },
  { priority: 'P4 - Low', terms: ['p4', 'priority 4'] },
]

export interface ParsedQuery {
  raw: string
  norm: string
  zones: Zone[]
  categories: AssetCategory[]
  conditions: Condition[]
  priorities: Priority[]
  criticalities: Criticality[]
  /** Explicit day window, e.g. "next 60 days". */
  days?: number
  month?: { index: number; year: number; label: string }
  assetCode?: string
  /** Money floor parsed from "above RM 1 million". */
  amountAbove?: number
  topN?: number
  /** True when the phrasing asks for a ranking. */
  wantsRanking: boolean
}

function normalise(q: string): string {
  return ` ${q
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9%.\-/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Word-boundary aware term test that also handles multi-word phrases. */
function hasTerm(norm: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`).test(norm)
}

function hasAny(norm: string, terms: readonly string[]): boolean {
  return terms.some((t) => hasTerm(norm, t))
}

const MONEY_MULTIPLIER: readonly { terms: string[]; factor: number }[] = [
  { terms: ['billion', 'bilion', 'bn'], factor: 1_000_000_000 },
  { terms: ['million', 'juta', 'mil'], factor: 1_000_000 },
  { terms: ['thousand', 'ribu'], factor: 1_000 },
]

function parseAmountAbove(norm: string): number | undefined {
  const m = /(?:above|over|more than|greater than|exceed(?:ing|s)?|at least|>=?|worth more than)\s*(?:rm\s*)?([\d,.]+)\s*(billion|bilion|bn|million|juta|mil|thousand|ribu|[kmb])?/.exec(
    norm,
  )
  if (!m) return undefined
  const value = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return undefined
  const unit = m[2]
  if (!unit) return value
  if (unit === 'k') return value * 1_000
  if (unit === 'm') return value * 1_000_000
  if (unit === 'b') return value * 1_000_000_000
  const found = MONEY_MULTIPLIER.find((x) => x.terms.includes(unit))
  return found ? value * found.factor : value
}

export function parseQuery(raw: string, now: Date = new Date()): ParsedQuery {
  // "Johor Tenggara" is the agency's name, not the zone — neutralise it first.
  const norm = normalise(raw).replace(/ johor tenggara /g, ' johor ')

  const zones = ZONE_ALIASES.filter((z) => hasAny(norm, z.terms)).map((z) => z.zone)
  const categories = CATEGORY_ALIASES.filter((c) => hasAny(norm, c.terms)).map((c) => c.category)
  const conditions = CONDITIONS.filter((c) => hasTerm(norm, c.toLowerCase()))
  const priorities = PRIORITY_ALIASES.filter((p) => hasAny(norm, p.terms)).map((p) => p.priority)

  const criticalities: Criticality[] = []
  if (hasTerm(norm, 'mission critical') || /critical(?:ity)? asset/.test(norm)) criticalities.push('Critical')

  let days: number | undefined
  const dayMatch = /(\d+)\s*(?:day|days|hari)/.exec(norm)
  if (dayMatch) days = Number(dayMatch[1])
  else if (hasAny(norm, ['next month', 'coming month', 'within a month', 'bulan depan'])) days = 30
  else if (hasAny(norm, ['next quarter', 'coming quarter', 'this quarter'])) days = 90
  else if (hasAny(norm, ['next 6 months', 'next six months', 'half year'])) days = 180
  else if (hasAny(norm, ['next year', 'coming year', 'twelve months', '12 months'])) days = 365
  const weekMatch = /(\d+)\s*(?:week|weeks|minggu)/.exec(norm)
  if (!dayMatch && weekMatch) days = Number(weekMatch[1]) * 7
  const monthCountMatch = /(?:next|coming|within)\s*(\d+)\s*months?/.exec(norm)
  if (monthCountMatch) days = Number(monthCountMatch[1]) * 30

  let month: ParsedQuery['month']
  for (const m of MONTH_NAMES) {
    if (hasAny(norm, m.terms)) {
      const yearMatch = /(20\d{2})/.exec(norm)
      const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear()
      month = { index: m.index, year, label: m.label }
      break
    }
  }

  const codeMatch = /(kdh-[a-z]{2}-\d{2,5})/.exec(norm)
  const topMatch = /(?:top|first|best|worst|highest|largest)\s+(\d{1,2})/.exec(norm)

  return {
    raw,
    norm,
    zones,
    categories,
    conditions,
    priorities,
    criticalities,
    days,
    month,
    assetCode: codeMatch ? codeMatch[1].toUpperCase() : undefined,
    amountAbove: parseAmountAbove(norm),
    topN: topMatch ? Math.min(25, Math.max(1, Number(topMatch[1]))) : undefined,
    wantsRanking: hasAny(norm, ['top', 'highest', 'largest', 'biggest', 'worst', 'best', 'rank', 'ranking', 'most valuable']),
  }
}

/* ================================================================== */
/* Small shared helpers                                               */
/* ================================================================== */

function fmtHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—'
  if (h >= 48) return `${(h / 24).toFixed(1)} days`
  return `${h.toFixed(1)} h`
}

function src(label: string, count: number): AnswerSource {
  return { label, count }
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function zoneShort(zone: Zone): string {
  return zone.replace(/^Zon\s+/, '')
}

/** Applies the entity filters a question carried onto an asset list. */
function filterAssets(q: ParsedQuery, assets: Asset[]): { rows: Asset[]; filters: string[] } {
  let rows = assets
  const filters: string[] = []
  if (q.zones.length > 0) {
    rows = rows.filter((a) => q.zones.includes(a.location.zone))
    filters.push(`zone in ${joinList(q.zones.map(zoneShort))}`)
  }
  if (q.categories.length > 0) {
    rows = rows.filter((a) => q.categories.includes(a.category))
    filters.push(`category in ${joinList(q.categories)}`)
  }
  if (q.amountAbove !== undefined) {
    rows = rows.filter((a) => a.currentValue >= (q.amountAbove as number))
    filters.push(`current value ≥ ${formatMYR(q.amountAbove)}`)
  }
  return { rows, filters }
}

function scopeSentence(s: CopilotScope): string {
  return s.allZones
    ? 'Scope: all six KEJORA operational zones.'
    : `Scope: ${s.zones.length} of 6 zones authorised for your role (${joinList(s.zones.map(zoneShort))}).`
}

/* ================================================================== */
/* Intent registry                                                     */
/* ================================================================== */

interface Cue {
  terms: string[]
  weight: number
  /** All terms must be present rather than any one of them. */
  all?: boolean
}

interface IntentDef {
  id: string
  label: string
  theme: 'Portfolio' | 'Maintenance' | 'Property & Revenue' | 'Risk & Compliance'
  cues: Cue[]
  /** Subtracted from the score when present — keeps neighbouring intents apart. */
  penalties?: Cue[]
  /** Structural boost derived from parsed entities rather than keywords. */
  boost?: (q: ParsedQuery) => number
  examples: string[]
  run: (q: ParsedQuery, s: CopilotScope) => Omit<CopilotAnswer, 'intent' | 'intentLabel' | 'confidence'>
}

/* ---------- 1. Portfolio value ---------------------------------- */

const portfolioValueIntent: IntentDef = {
  id: 'portfolio.value',
  label: 'Portfolio value',
  theme: 'Portfolio',
  cues: [
    { terms: ['portfolio value', 'total value', 'net book value', 'book value', 'nbv', 'asset value', 'worth'], weight: 6 },
    { terms: ['value', 'valuation', 'nilai'], weight: 3 },
    { terms: ['total', 'how much', 'what is'], weight: 1 },
    { terms: ['depreciation', 'accumulated depreciation'], weight: 3 },
  ],
  penalties: [
    { terms: ['occupancy', 'arrears', 'work order', 'sla', 'lease expir'], weight: 5 },
    { terms: ['which assets', 'list assets', 'name the assets', 'top', 'highest', 'most valuable'], weight: 5 },
  ],
  examples: [
    'What is the total portfolio value?',
    'Net book value of industrial assets in Pengerang',
    'How much is the Desaru portfolio worth?',
  ],
  run: (q, s) => {
    const { rows, filters } = filterAssets(q, s.assets)
    const p = portfolioSummary(rows)
    const byCategory = valueByCategory(rows)
    const byZone = valueByZone(rows).filter((z) => z.count > 0)
    const wantsNbv = /net book|nbv|book value|depreciat/.test(q.norm)
    const headlineValue = wantsNbv ? p.totalNbv : p.totalCurrentValue
    const depreciationPct = p.totalAcquisitionCost > 0 ? (p.totalAccumulatedDepreciation / p.totalAcquisitionCost) * 100 : 0

    const lead = filters.length > 0 ? `Filtered to ${joinList(filters)}, ` : ''
    const narrative =
      `${lead}KDH holds ${formatNumber(rows.length)} registered assets with a current market value of ` +
      `${formatMYR(p.totalCurrentValue)} against an acquisition cost of ${formatMYR(p.totalAcquisitionCost)}. ` +
      `Net book value stands at ${formatMYR(p.totalNbv)} after ${formatMYR(p.totalAccumulatedDepreciation)} of accumulated depreciation ` +
      `(${formatPct(depreciationPct)} of cost written down). ` +
      `${byCategory[0] ? `${byCategory[0].category} is the largest holding at ${formatMYRCompact(byCategory[0].value)} — ${formatPct(byCategory[0].share)} of value.` : ''} ` +
      `${byZone[0] ? `${zoneShort(byZone[0].zone)} leads by zone with ${formatMYRCompact(byZone[0].value)} across ${byZone[0].count} assets.` : ''}`

    return {
      kind: 'metric',
      headline: formatMYRCompact(headlineValue),
      headlineLabel: wantsNbv ? 'Net book value' : 'Current portfolio value',
      narrative,
      metrics: [
        { label: 'Registered assets', value: formatNumber(rows.length) },
        { label: 'Acquisition cost', value: formatMYRCompact(p.totalAcquisitionCost) },
        { label: 'Net book value', value: formatMYRCompact(p.totalNbv), tone: 'positive' },
        { label: 'Accumulated depreciation', value: formatMYRCompact(p.totalAccumulatedDepreciation), sublabel: `${formatPct(depreciationPct)} of cost`, tone: 'warning' },
      ],
      chart: {
        type: 'bar',
        title: 'Current value by asset category',
        data: byCategory.map((c) => ({ name: c.category, value: c.value, count: c.count })),
        xKey: 'name',
        series: [{ key: 'value', label: 'Current value', color: CHART[0] }],
        format: 'myr',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'category', label: 'Category' },
          { key: 'assets', label: 'Assets', align: 'right' },
          { key: 'value', label: 'Current value', align: 'right', mono: true },
          { key: 'share', label: 'Share', align: 'right' },
        ],
        rows: byCategory.map((c) => ({
          category: c.category,
          assets: c.count,
          value: formatMYR(c.value),
          share: formatPct(c.share),
        })),
        totalRow: { category: 'Total', assets: rows.length, value: formatMYR(p.totalCurrentValue), share: '100.0%' },
        csvName: 'kdh-portfolio-value-by-category',
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `Read ${formatNumber(s.assets.length)} asset records visible to your role${filters.length > 0 ? `, then applied ${joinList(filters)} leaving ${formatNumber(rows.length)} records` : ''}.`,
        'Current portfolio value = Σ Asset.currentValue over those records.',
        'Net book value = Σ Asset.netBookValue; accumulated depreciation = Σ Asset.accumulatedDepreciation.',
        'Category and zone splits use analytics.valueByCategory() / valueByZone(), the same functions that drive the Dashboard tiles.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: [
        'Break the portfolio down by zone',
        'Which assets are worth more than RM 20 million?',
        'Show me assets in poor or critical condition',
      ],
    }
  },
}

/* ---------- 2. Asset counts & breakdowns ------------------------- */

const portfolioBreakdownIntent: IntentDef = {
  id: 'portfolio.breakdown',
  label: 'Asset breakdown',
  theme: 'Portfolio',
  cues: [
    { terms: ['how many assets', 'asset count', 'number of assets', 'count of assets'], weight: 6 },
    { terms: ['break down', 'breakdown', 'split', 'distribution', 'composition', 'mix', 'by category', 'by zone', 'by status', 'by condition'], weight: 5 },
    { terms: ['assets', 'aset', 'register', 'registry'], weight: 2 },
    { terms: ['how many', 'count'], weight: 2 },
  ],
  penalties: [
    { terms: ['work order', 'lease', 'tenant', 'arrears', 'occupancy'], weight: 5 },
    { terms: ['solar', 'carbon', 'esg', 'energy', 'green score', 'emissions'], weight: 7 },
    { terms: ['complete', 'completeness', 'data quality'], weight: 6 },
  ],
  examples: [
    'How many assets do we have by category?',
    'Break the portfolio down by zone',
    'Show the asset status distribution',
  ],
  run: (q, s) => {
    const { rows, filters } = filterAssets(q, s.assets)
    const byZone = /zone|zon|region|geograph/.test(q.norm)
    const byStatus = /status|active|idle|disposed|vacant|under construction/.test(q.norm)
    const byCondition = /condition|keadaan|health/.test(q.norm)
    const byCriticality = /criticality|mission critical/.test(q.norm)

    let dimension: string
    let data: { name: string; count: number; value: number }[]

    if (byZone) {
      dimension = 'zone'
      data = valueByZone(rows).filter((z) => z.count > 0).map((z) => ({ name: zoneShort(z.zone), count: z.count, value: z.value }))
    } else if (byStatus) {
      dimension = 'operational status'
      data = statusDistribution(rows)
        .filter((x) => x.count > 0)
        .map((x) => ({
          name: x.status,
          count: x.count,
          value: rows.filter((a) => a.status === x.status).reduce((t, a) => t + a.currentValue, 0),
        }))
    } else if (byCondition) {
      dimension = 'condition grade'
      data = conditionDistribution(rows)
        .filter((x) => x.count > 0)
        .map((x) => ({
          name: x.condition,
          count: x.count,
          value: rows.filter((a) => a.condition === x.condition).reduce((t, a) => t + a.currentValue, 0),
        }))
    } else if (byCriticality) {
      dimension = 'criticality'
      data = criticalityDistribution(rows)
        .filter((x) => x.count > 0)
        .map((x) => ({
          name: x.criticality,
          count: x.count,
          value: rows.filter((a) => a.criticality === x.criticality).reduce((t, a) => t + a.currentValue, 0),
        }))
    } else {
      dimension = 'category'
      data = valueByCategory(rows).map((c) => ({ name: c.category, count: c.count, value: c.value }))
    }

    const total = rows.length
    const top = data.slice().sort((a, b) => b.count - a.count)[0]
    const dq = dataQualitySummary(rows)

    return {
      kind: 'breakdown',
      headline: formatNumber(total),
      headlineLabel: `Assets in scope${filters.length > 0 ? ' (filtered)' : ''}`,
      narrative:
        `${filters.length > 0 ? `After applying ${joinList(filters)}, t` : 'T'}he register holds ${formatNumber(total)} assets ` +
        `split across ${data.length} ${dimension} groups. ` +
        `${top ? `${top.name} is the largest group with ${formatNumber(top.count)} assets (${formatPct((top.count / Math.max(1, total)) * 100)}) carrying ${formatMYRCompact(top.value)} of value.` : ''} ` +
        `Record completeness averages ${formatPct(dq.avgScore)}, with ${formatNumber(dq.incomplete)} records below the 60% data-quality threshold.`,
      metrics: [
        { label: 'Assets in scope', value: formatNumber(total) },
        { label: `${dimension} groups`, value: formatNumber(data.length) },
        { label: 'Avg data quality', value: formatPct(dq.avgScore), tone: dq.avgScore >= 80 ? 'positive' : 'warning' },
        { label: 'Records needing attention', value: formatNumber(dq.needsAttention + dq.incomplete), tone: 'warning' },
      ],
      chart: {
        type: 'bar',
        title: `Asset count by ${dimension}`,
        data: data.map((d) => ({ name: d.name, count: d.count, value: d.value })),
        xKey: 'name',
        series: [{ key: 'count', label: 'Assets', color: CHART[1] }],
        format: 'number',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'group', label: dimension.replace(/^\w/, (c) => c.toUpperCase()) },
          { key: 'assets', label: 'Assets', align: 'right' },
          { key: 'share', label: 'Share', align: 'right' },
          { key: 'value', label: 'Current value', align: 'right', mono: true },
        ],
        rows: data.map((d) => ({
          group: d.name,
          assets: d.count,
          share: formatPct((d.count / Math.max(1, total)) * 100),
          value: formatMYR(d.value),
        })),
        totalRow: {
          group: 'Total',
          assets: total,
          share: '100.0%',
          value: formatMYR(data.reduce((t, d) => t + d.value, 0)),
        },
        csvName: `kdh-assets-by-${dimension.replace(/\s+/g, '-')}`,
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `Counted ${formatNumber(s.assets.length)} authorised asset records${filters.length > 0 ? `, filtered by ${joinList(filters)}` : ''}.`,
        `Grouped by ${dimension}; share = group count ÷ ${formatNumber(total)} total assets.`,
        'Value column sums Asset.currentValue inside each group — it reconciles with the Portfolio value answer.',
        'Data quality figures come from analytics.dataQualitySummary() (complete ≥ 90, attention 60–89, incomplete < 60).',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: ['What is the total portfolio value?', 'Which assets are in critical condition?', 'Compare Desaru and Pengerang'],
    }
  },
}

/* ---------- 3. Poor / critical condition ------------------------- */

const conditionIntent: IntentDef = {
  id: 'asset.condition',
  label: 'Condition watchlist',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['poor condition', 'critical condition', 'bad condition', 'deteriorat', 'dilapidat', 'condition watchlist'], weight: 7 },
    { terms: ['condition', 'keadaan', 'health', 'refurbish', 'repair backlog'], weight: 4 },
    { terms: ['poor', 'critical', 'worst'], weight: 2 },
  ],
  penalties: [{ terms: ['sla', 'work order', 'occupancy', 'arrears'], weight: 4 }],
  examples: [
    'Which assets are in poor or critical condition?',
    'Show me the condition watchlist for Mersing',
    'How many assets are rated Fair or worse?',
  ],
  run: (q, s) => {
    const { rows, filters } = filterAssets(q, s.assets)
    const wanted: Condition[] = q.conditions.length > 0 ? q.conditions : ['Poor', 'Critical']
    const flagged = rows
      .filter((a) => wanted.includes(a.condition) && a.status !== 'Disposed')
      .sort((a, b) => a.conditionScore - b.conditionScore)
    const exposure = flagged.reduce((t, a) => t + a.currentValue, 0)
    const dist = conditionDistribution(rows)
    const openByAsset = new Map<string, number>()
    for (const w of s.workOrders) {
      if (!isOpenWorkOrder(w)) continue
      openByAsset.set(w.assetId, (openByAsset.get(w.assetId) ?? 0) + 1)
    }

    return {
      kind: 'table',
      headline: formatNumber(flagged.length),
      headlineLabel: `Assets rated ${joinList(wanted)}`,
      headlineTone: flagged.length > 0 ? 'critical' : 'positive',
      narrative:
        `${formatNumber(flagged.length)} of ${formatNumber(rows.length)} assets in scope are rated ${joinList(wanted)} ` +
        `(${formatPct((flagged.length / Math.max(1, rows.length)) * 100)} of the register), representing ${formatMYR(exposure)} of book exposure. ` +
        `${flagged[0] ? `The weakest record is ${flagged[0].name} (${flagged[0].code}) in ${zoneShort(flagged[0].location.zone)} with a condition score of ${formatNumber(flagged[0].conditionScore)}/100.` : 'No assets currently sit in these grades.'} ` +
        `${filters.length > 0 ? `Filters applied: ${joinList(filters)}.` : ''} These records should be prioritised for the capital replacement plan.`,
      metrics: [
        { label: 'Flagged assets', value: formatNumber(flagged.length), tone: 'critical' },
        { label: 'Book exposure', value: formatMYRCompact(exposure), tone: 'warning' },
        { label: 'Avg condition score', value: `${formatNumber(flagged.length > 0 ? flagged.reduce((t, a) => t + a.conditionScore, 0) / flagged.length : 0, 1)}/100`, tone: 'warning' },
        { label: 'Open work orders on them', value: formatNumber(flagged.reduce((t, a) => t + (openByAsset.get(a.id) ?? 0), 0)) },
      ],
      chart: {
        type: 'bar',
        title: 'Condition grade distribution',
        data: dist.map((d) => ({ name: d.condition, count: d.count })),
        xKey: 'name',
        series: [{ key: 'count', label: 'Assets', color: CHART[2] }],
        format: 'number',
        height: 'h-[220px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'name', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'condition', label: 'Condition', badge: true },
          { key: 'score', label: 'Score', align: 'right' },
          { key: 'open', label: 'Open WO', align: 'right' },
          { key: 'value', label: 'Current value', align: 'right', mono: true },
        ],
        rows: flagged.slice(0, q.topN ?? 12).map((a) => ({
          code: a.code,
          name: a.name,
          zone: zoneShort(a.location.zone),
          condition: a.condition,
          score: a.conditionScore,
          open: openByAsset.get(a.id) ?? 0,
          value: formatMYR(a.currentValue),
        })),
        csvName: 'kdh-condition-watchlist',
        link: { label: 'Open registry filtered to Critical', to: '/registry?condition=Critical' },
        note: flagged.length > (q.topN ?? 12) ? `Showing the ${q.topN ?? 12} weakest of ${formatNumber(flagged.length)} flagged assets.` : undefined,
      },
      working: [
        `Filtered ${formatNumber(s.assets.length)} authorised assets to condition ∈ {${wanted.join(', ')}} and status ≠ Disposed.`,
        'Sorted ascending by Asset.conditionScore so the weakest record leads.',
        'Book exposure = Σ Asset.currentValue over the flagged records.',
        'Open work-order counts join WorkOrder.assetId against the flagged assets, excluding Closed and Cancelled tickets.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length), src('Work orders', s.workOrders.length)],
      followUps: ['Show the risk register', 'Which inspections are overdue?', 'What is our maintenance spend versus budget?'],
    }
  },
}

/* ---------- 4. Highest value assets ------------------------------ */

const topValueIntent: IntentDef = {
  id: 'asset.top.value',
  label: 'Highest value assets',
  theme: 'Portfolio',
  cues: [
    { terms: ['highest value', 'most valuable', 'largest assets', 'biggest assets', 'top assets by value'], weight: 7 },
    { terms: ['worth more than', 'more than rm', 'above rm', 'over rm', 'worth above', 'valued above'], weight: 7 },
    { terms: ['by value', 'by current value', 'by book value', 'by nbv', 'by net book value'], weight: 6 },
    { terms: ['top', 'highest', 'largest', 'biggest'], weight: 2 },
    { terms: ['asset', 'assets', 'property'], weight: 2 },
    { terms: ['above', 'more than', 'exceeding'], weight: 2 },
  ],
  penalties: [{ terms: ['revenue', 'income', 'earning', 'arrears', 'work order'], weight: 5 }],
  examples: [
    'What are our highest value assets?',
    'Which assets are worth more than RM 20 million?',
    'Top 10 assets by current value',
  ],
  run: (q, s) => {
    const { rows, filters } = filterAssets(q, s.assets)
    const n = q.topN ?? 10
    const ranked = rows.slice().sort((a, b) => b.currentValue - a.currentValue)
    const shown = q.amountAbove !== undefined ? ranked : ranked.slice(0, n)
    const total = rows.reduce((t, a) => t + a.currentValue, 0)
    const shownValue = shown.reduce((t, a) => t + a.currentValue, 0)

    return {
      kind: 'table',
      headline: formatMYRCompact(shownValue),
      headlineLabel: q.amountAbove !== undefined ? `Value of ${formatNumber(shown.length)} qualifying assets` : `Value of the top ${formatNumber(shown.length)}`,
      narrative:
        `${q.amountAbove !== undefined ? `${formatNumber(shown.length)} assets carry a current value at or above ${formatMYR(q.amountAbove)}` : `The ${formatNumber(shown.length)} most valuable assets`} ` +
        `total ${formatMYR(shownValue)} — ${formatPct((shownValue / Math.max(1, total)) * 100)} of the ${formatMYR(total)} in scope. ` +
        `${shown[0] ? `${shown[0].name} (${shown[0].code}) leads at ${formatMYR(shown[0].currentValue)}, held in ${zoneShort(shown[0].location.zone)} and rated ${shown[0].condition}.` : ''} ` +
        `${filters.length > 0 ? `Filters applied: ${joinList(filters)}.` : ''} Concentration of this order makes these records the priority for valuation refresh and insurance adequacy checks.`,
      metrics: [
        { label: 'Assets listed', value: formatNumber(shown.length) },
        { label: 'Combined value', value: formatMYRCompact(shownValue), tone: 'positive' },
        { label: 'Share of portfolio', value: formatPct((shownValue / Math.max(1, total)) * 100) },
        { label: 'Insured sum on these', value: formatMYRCompact(shown.reduce((t, a) => t + (a.insurance?.sumInsured ?? 0), 0)) },
      ],
      chart: {
        type: 'bar',
        title: 'Current value of the leading assets',
        data: shown.slice(0, 10).map((a) => ({ name: a.code, value: a.currentValue })),
        xKey: 'name',
        series: [{ key: 'value', label: 'Current value', color: CHART[0] }],
        format: 'myr',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'name', label: 'Asset' },
          { key: 'category', label: 'Category' },
          { key: 'zone', label: 'Zone' },
          { key: 'condition', label: 'Condition', badge: true },
          { key: 'value', label: 'Current value', align: 'right', mono: true },
          { key: 'nbv', label: 'Net book value', align: 'right', mono: true },
        ],
        rows: shown.slice(0, 25).map((a) => ({
          code: a.code,
          name: a.name,
          category: a.category,
          zone: zoneShort(a.location.zone),
          condition: a.condition,
          value: formatMYR(a.currentValue),
          nbv: formatMYR(a.netBookValue),
        })),
        csvName: 'kdh-highest-value-assets',
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `Sorted ${formatNumber(rows.length)} authorised assets descending by Asset.currentValue.`,
        q.amountAbove !== undefined
          ? `Kept every record with currentValue ≥ ${formatMYR(q.amountAbove)} — ${formatNumber(shown.length)} matched.`
          : `Kept the leading ${formatNumber(shown.length)} records.`,
        'Share of portfolio = Σ value of listed assets ÷ Σ value of all assets in scope.',
        'Insured sum reads Asset.insurance.sumInsured; assets without a policy contribute zero and are visible in the compliance answer.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: ['Which assets generate the most revenue?', 'Which insurance policies expire soon?', 'What is the total portfolio value?'],
    }
  },
}

/* ---------- 5. Top revenue assets -------------------------------- */

const topRevenueIntent: IntentDef = {
  id: 'asset.top.revenue',
  label: 'Revenue-generating assets',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['most revenue', 'top revenue', 'highest earning', 'revenue generating', 'best performing asset', 'income generating'], weight: 7 },
    { terms: ['losing money', 'loss making', 'loss-making', 'unprofitable', 'net margin', 'net contribution'], weight: 8 },
    { terms: ['revenue', 'income', 'earnings', 'yield', 'margin', 'profitab'], weight: 4 },
    { terms: ['asset', 'assets'], weight: 1 },
  ],
  penalties: [{ terms: ['collection rate', 'versus target', 'vs target', 'arrears'], weight: 5 }],
  examples: [
    'Which assets generate the most revenue?',
    'Show me the top 8 assets by net margin',
    'Which assets are losing money?',
  ],
  run: (q, s) => {
    const { rows, filters } = filterAssets(q, s.assets)
    const n = q.topN ?? 10
    const ranked = topRevenueAssets(rows, n)
    const totalRevenue = rows.reduce((t, a) => t + a.revenueYtd, 0)
    const totalOpex = rows.reduce((t, a) => t + a.opexYtd, 0)
    const loss = rows.filter((a) => a.revenueYtd - a.opexYtd < 0)

    return {
      kind: 'table',
      headline: formatMYRCompact(totalRevenue),
      headlineLabel: 'Year-to-date asset revenue',
      narrative:
        `Assets in scope have generated ${formatMYR(totalRevenue)} year to date against ${formatMYR(totalOpex)} of operating expenditure, ` +
        `a net contribution of ${formatMYR(totalRevenue - totalOpex)} and a margin of ${formatPct(((totalRevenue - totalOpex) / Math.max(1, totalRevenue)) * 100)}. ` +
        `${ranked[0] ? `${ranked[0].asset.name} (${ranked[0].asset.code}) is the single largest earner at ${formatMYR(ranked[0].revenueYtd)} with a ${formatPct(ranked[0].marginPct)} margin.` : ''} ` +
        `${loss.length > 0 ? `${formatNumber(loss.length)} assets are currently running at a net operating loss and warrant a repositioning review.` : 'No asset is currently running at a net operating loss.'} ` +
        `${filters.length > 0 ? `Filters applied: ${joinList(filters)}.` : ''}`,
      metrics: [
        { label: 'Revenue YTD', value: formatMYRCompact(totalRevenue), tone: 'positive' },
        { label: 'Opex YTD', value: formatMYRCompact(totalOpex), tone: 'warning' },
        { label: 'Net contribution', value: formatMYRCompact(totalRevenue - totalOpex), tone: totalRevenue - totalOpex >= 0 ? 'positive' : 'critical' },
        { label: 'Loss-making assets', value: formatNumber(loss.length), tone: loss.length > 0 ? 'critical' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Revenue vs opex — leading assets (YTD)',
        data: ranked.map((r) => ({ name: r.asset.code, revenue: r.revenueYtd, opex: r.opexYtd })),
        xKey: 'name',
        series: [
          { key: 'revenue', label: 'Revenue YTD', color: CHART[0] },
          { key: 'opex', label: 'Opex YTD', color: CHART[3] },
        ],
        format: 'myr',
        height: 'h-[260px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'name', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'revenue', label: 'Revenue YTD', align: 'right', mono: true },
          { key: 'opex', label: 'Opex YTD', align: 'right', mono: true },
          { key: 'net', label: 'Net YTD', align: 'right', mono: true },
          { key: 'margin', label: 'Margin', align: 'right' },
        ],
        rows: ranked.map((r) => ({
          code: r.asset.code,
          name: r.asset.name,
          zone: zoneShort(r.asset.location.zone),
          revenue: formatMYR(r.revenueYtd),
          opex: formatMYR(r.opexYtd),
          net: formatMYR(r.netYtd),
          margin: formatPct(r.marginPct),
        })),
        totalRow: {
          code: '',
          name: 'Portfolio total',
          zone: '',
          revenue: formatMYR(totalRevenue),
          opex: formatMYR(totalOpex),
          net: formatMYR(totalRevenue - totalOpex),
          margin: formatPct(((totalRevenue - totalOpex) / Math.max(1, totalRevenue)) * 100),
        },
        csvName: 'kdh-top-revenue-assets',
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `Ranked ${formatNumber(rows.length)} authorised assets with analytics.topRevenueAssets(assets, ${n}) — descending Asset.revenueYtd.`,
        'Net YTD = Asset.revenueYtd − Asset.opexYtd; margin = net ÷ revenue.',
        'Portfolio totals sum the same two fields across every asset in scope, so they tie back to the Dashboard revenue tile.',
        'Loss-making count = assets where revenueYtd − opexYtd < 0.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: ['What is our collection rate?', 'What is the occupancy rate?', 'Show the rent roll'],
    }
  },
}

/* ---------- 6. Occupancy ----------------------------------------- */

const occupancyIntent: IntentDef = {
  id: 'property.occupancy',
  label: 'Occupancy',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['occupancy', 'occupied', 'take up', 'takeup', 'penghunian'], weight: 7 },
    { terms: ['units', 'unit', 'shoplot', 'stall', 'lot'], weight: 2 },
    { terms: ['rate', 'kadar'], weight: 1 },
  ],
  penalties: [{ terms: ['vacant units worth', 'vacancy cost'], weight: 3 }],
  examples: [
    'What is the occupancy rate?',
    'Show occupancy by property',
    'Occupancy in Desaru and Mersing',
  ],
  run: (q, s) => {
    const units = q.zones.length > 0 ? s.units.filter((u) => q.zones.includes(u.zone)) : s.units
    const summary = occupancySummary(units)
    const byProperty = occupancyByProperty(units)
    const byZone = s.zones
      .map((zone) => {
        const zu = units.filter((u) => u.zone === zone)
        const occ = zu.filter((u) => u.status === 'Occupied').length
        return { zone, total: zu.length, occupied: occ, rate: zu.length > 0 ? (occ / zu.length) * 100 : 0 }
      })
      .filter((z) => z.total > 0)
      .sort((a, b) => b.rate - a.rate)
    const weakest = byProperty.slice().filter((p) => p.total >= 3).sort((a, b) => a.occupancyRate - b.occupancyRate)[0]

    return {
      kind: 'metric',
      headline: formatPct(summary.occupancyRate),
      headlineLabel: 'Portfolio occupancy',
      headlineTone: summary.occupancyRate >= 85 ? 'positive' : summary.occupancyRate >= 75 ? 'warning' : 'critical',
      narrative:
        `${formatNumber(summary.occupied)} of ${formatNumber(summary.total)} lettable units are occupied, an occupancy rate of ${formatPct(summary.occupancyRate)}. ` +
        `${formatNumber(summary.vacant)} units are vacant, holding ${formatNumber(summary.vacantLettableSqft)} sqft of idle lettable area. ` +
        `${byZone[0] ? `${zoneShort(byZone[0].zone)} is the strongest zone at ${formatPct(byZone[0].rate)}` : ''}` +
        `${byZone.length > 1 ? `, while ${zoneShort(byZone[byZone.length - 1].zone)} trails at ${formatPct(byZone[byZone.length - 1].rate)}.` : '.'} ` +
        `${weakest ? `${weakest.propertyName} is the weakest individual property at ${formatPct(weakest.occupancyRate)} across ${formatNumber(weakest.total)} units.` : ''}`,
      metrics: [
        { label: 'Occupied units', value: formatNumber(summary.occupied), tone: 'positive' },
        { label: 'Vacant units', value: formatNumber(summary.vacant), tone: 'warning' },
        { label: 'Total lettable units', value: formatNumber(summary.total) },
        { label: 'Idle lettable area', value: `${formatNumber(summary.vacantLettableSqft)} sqft`, tone: 'warning' },
      ],
      chart: {
        type: 'bar',
        title: 'Occupancy rate by zone',
        data: byZone.map((z) => ({ name: zoneShort(z.zone), rate: Number(z.rate.toFixed(1)), units: z.total })),
        xKey: 'name',
        series: [{ key: 'rate', label: 'Occupancy', color: CHART[0] }],
        format: 'pct',
        horizontal: true,
        height: 'h-[260px]',
      },
      table: {
        columns: [
          { key: 'property', label: 'Property' },
          { key: 'zone', label: 'Zone' },
          { key: 'units', label: 'Units', align: 'right' },
          { key: 'occupied', label: 'Occupied', align: 'right' },
          { key: 'rate', label: 'Occupancy', align: 'right' },
          { key: 'area', label: 'Lettable area', align: 'right', mono: true },
        ],
        rows: byProperty.slice(0, 14).map((p) => ({
          property: p.propertyName,
          zone: zoneShort(p.zone),
          units: p.total,
          occupied: p.occupied,
          rate: formatPct(p.occupancyRate),
          area: `${formatNumber(p.lettableSqft)} sqft`,
        })),
        totalRow: {
          property: 'Portfolio',
          zone: '',
          units: summary.total,
          occupied: summary.occupied,
          rate: formatPct(summary.occupancyRate),
          area: '',
        },
        csvName: 'kdh-occupancy-by-property',
        link: { label: 'Open Property & Leasing', to: '/property' },
      },
      working: [
        `Read ${formatNumber(s.units.length)} property-unit records visible to your role${q.zones.length > 0 ? `, filtered to ${joinList(q.zones.map(zoneShort))}` : ''}.`,
        'Occupancy rate = units with status "Occupied" ÷ total units, via analytics.occupancySummary().',
        'Units in Under Renovation, Reserved or Legal Action count in the denominator but not as occupied — this is deliberately the conservative reading.',
        'Idle lettable area sums PropertyUnit.lettableAreaSqft over vacant units only.',
        scopeSentence(s),
      ],
      sources: [src('Property units', units.length), src('Leases', s.leases.length)],
      followUps: ['How much revenue are vacant units costing us?', 'Which leases expire in the next 90 days?', 'Show the rent roll'],
    }
  },
}

/* ---------- 7. Vacancy cost -------------------------------------- */

const vacancyIntent: IntentDef = {
  id: 'property.vacancy',
  label: 'Vacancy exposure',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['vacant', 'vacancy', 'empty units', 'kosong', 'void'], weight: 7 },
    { terms: ['costing', 'foregone', 'lost revenue', 'opportunity', 'potential revenue', 'market rate'], weight: 4 },
    { terms: ['units', 'unit'], weight: 1 },
  ],
  examples: [
    'How much revenue are vacant units costing us?',
    'List vacant units and their market rent',
    'Where is our vacancy concentrated?',
  ],
  run: (q, s) => {
    const units = q.zones.length > 0 ? s.units.filter((u) => q.zones.includes(u.zone)) : s.units
    const vacant = units.filter((u) => u.status === 'Vacant')
    const monthlyPotential = vacant.reduce((t, u) => t + u.lettableAreaSqft * u.marketRatePsf, 0)
    const area = vacant.reduce((t, u) => t + u.lettableAreaSqft, 0)
    const byZone = s.zones
      .map((zone) => {
        const zv = units.filter((u) => u.zone === zone && u.status === 'Vacant')
        return {
          zone,
          count: zv.length,
          potential: zv.reduce((t, u) => t + u.lettableAreaSqft * u.marketRatePsf, 0),
        }
      })
      .filter((z) => z.count > 0)
      .sort((a, b) => b.potential - a.potential)
    const ranked = vacant
      .slice()
      .sort((a, b) => b.lettableAreaSqft * b.marketRatePsf - a.lettableAreaSqft * a.marketRatePsf)

    return {
      kind: 'metric',
      headline: formatMYR(monthlyPotential),
      headlineLabel: 'Foregone rent per month at market rate',
      headlineTone: 'warning',
      narrative:
        `${formatNumber(vacant.length)} units are vacant across ${formatNumber(byZone.length)} zones, covering ${formatNumber(area)} sqft. ` +
        `Let at prevailing market rates those units would contract ${formatMYR(monthlyPotential)} a month — ${formatMYR(monthlyPotential * 12)} annualised. ` +
        `${byZone[0] ? `${zoneShort(byZone[0].zone)} carries the largest exposure with ${formatNumber(byZone[0].count)} vacant units worth ${formatMYR(byZone[0].potential)} a month.` : ''} ` +
        `${ranked[0] ? `The single biggest void is ${ranked[0].propertyName} ${ranked[0].unitNo} (${formatNumber(ranked[0].lettableAreaSqft)} sqft at RM ${ranked[0].marketRatePsf.toFixed(2)} psf).` : ''}`,
      metrics: [
        { label: 'Vacant units', value: formatNumber(vacant.length), tone: 'warning' },
        { label: 'Idle lettable area', value: `${formatNumber(area)} sqft` },
        { label: 'Monthly opportunity', value: formatMYR(monthlyPotential), tone: 'warning' },
        { label: 'Annualised opportunity', value: formatMYRCompact(monthlyPotential * 12), tone: 'critical' },
      ],
      chart: {
        type: 'bar',
        title: 'Monthly vacancy exposure by zone',
        data: byZone.map((z) => ({ name: zoneShort(z.zone), value: Math.round(z.potential), units: z.count })),
        xKey: 'name',
        series: [{ key: 'value', label: 'Foregone rent / month', color: CHART[3] }],
        format: 'myr',
        horizontal: true,
        height: 'h-[240px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Unit code', mono: true },
          { key: 'property', label: 'Property' },
          { key: 'unit', label: 'Unit', mono: true },
          { key: 'type', label: 'Type' },
          { key: 'zone', label: 'Zone' },
          { key: 'area', label: 'Area', align: 'right', mono: true },
          { key: 'psf', label: 'Market psf', align: 'right', mono: true },
          { key: 'potential', label: 'Rent / month', align: 'right', mono: true },
        ],
        rows: ranked.slice(0, 14).map((u) => ({
          code: u.code,
          property: u.propertyName,
          unit: u.unitNo,
          type: u.type,
          zone: zoneShort(u.zone),
          area: formatNumber(u.lettableAreaSqft),
          psf: u.marketRatePsf.toFixed(2),
          potential: formatMYR(u.lettableAreaSqft * u.marketRatePsf),
        })),
        totalRow: {
          code: '',
          property: `All ${formatNumber(vacant.length)} vacant units`,
          unit: '',
          type: '',
          zone: '',
          area: formatNumber(area),
          psf: '',
          potential: formatMYR(monthlyPotential),
        },
        csvName: 'kdh-vacant-units',
        link: { label: 'Open Property & Leasing', to: '/property' },
      },
      working: [
        `Selected PropertyUnit records with status = "Vacant" from ${formatNumber(units.length)} units in scope — ${formatNumber(vacant.length)} matched.`,
        'Foregone rent per unit = PropertyUnit.lettableAreaSqft × PropertyUnit.marketRatePsf (a market benchmark, not a signed rent).',
        'Annualised figure multiplies the monthly total by 12 with no letting-up allowance, so treat it as the gross upper bound.',
        'Units under renovation or reserved are excluded — they are not immediately lettable.',
        scopeSentence(s),
      ],
      sources: [src('Property units', units.length)],
      followUps: ['What is the occupancy rate?', 'Which leases expire in the next 90 days?', 'What is our total arrears?'],
    }
  },
}

/* ---------- 8. Arrears -------------------------------------------- */

const arrearsIntent: IntentDef = {
  id: 'finance.arrears',
  label: 'Arrears & collections risk',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['arrears', 'outstanding', 'overdue rent', 'debtors', 'tunggakan', 'bad debt', 'ageing', 'aging'], weight: 7 },
    { terms: ['owe', 'owes', 'owing', 'unpaid', 'default'], weight: 4 },
    { terms: ['worst offenders', 'legal action', 'notice'], weight: 4 },
  ],
  penalties: [{ terms: ['collection rate', 'work order'], weight: 3 }],
  examples: [
    'What is our total arrears?',
    'Who are the worst arrears offenders?',
    'Show the arrears ageing breakdown',
  ],
  run: (q, s) => {
    const leases = q.zones.length > 0 ? s.leases.filter((l) => q.zones.includes(l.zone)) : s.leases
    const a = arrearsSummary(leases, q.topN ?? 10)
    const legal = leases.filter((l) => l.noticeStage === 'Legal Action')
    const ageingData = [
      { name: 'Current', value: a.ageing.current },
      { name: '1–30 days', value: a.ageing.d30 },
      { name: '31–60 days', value: a.ageing.d60 },
      { name: '61–90 days', value: a.ageing.d90 },
      { name: '90+ days', value: a.ageing.d90plus },
    ]
    const over90 = a.ageing.d90 + a.ageing.d90plus

    return {
      kind: 'metric',
      headline: formatMYR(a.totalOutstanding),
      headlineLabel: 'Total rental arrears',
      headlineTone: 'critical',
      narrative:
        `${formatNumber(a.accountsInArrears)} tenant accounts are in arrears for a combined ${formatMYR(a.totalOutstanding)}, ` +
        `equal to ${formatPct(a.arrearsRatePct)} of annualised contracted rent. ` +
        `${formatMYR(over90)} of that (${formatPct((over90 / Math.max(1, a.totalOutstanding)) * 100)}) has aged beyond 60 days and is at material risk of write-off. ` +
        `${formatNumber(legal.length)} accounts have escalated to Legal Action. ` +
        `${a.worstOffenders[0] ? `${a.worstOffenders[0].tenantName} at ${a.worstOffenders[0].propertyName} ${a.worstOffenders[0].unitNo} is the single largest exposure at ${formatMYR(a.worstOffenders[0].outstandingAmount)}, ${formatNumber(a.worstOffenders[0].daysOverdue)} days overdue.` : ''}`,
      metrics: [
        { label: 'Accounts in arrears', value: formatNumber(a.accountsInArrears), tone: 'critical' },
        { label: 'Arrears rate', value: formatPct(a.arrearsRatePct), sublabel: 'of annualised rent', tone: 'warning' },
        { label: 'Aged 60 days+', value: formatMYR(over90), tone: 'critical' },
        { label: 'At Legal Action', value: formatNumber(legal.length), tone: legal.length > 0 ? 'critical' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Arrears ageing profile',
        data: ageingData,
        xKey: 'name',
        series: [{ key: 'value', label: 'Outstanding', color: CHART[3] }],
        format: 'myr',
        height: 'h-[240px]',
      },
      table: {
        columns: [
          { key: 'lease', label: 'Lease', mono: true },
          { key: 'tenant', label: 'Tenant' },
          { key: 'property', label: 'Property / unit' },
          { key: 'zone', label: 'Zone' },
          { key: 'outstanding', label: 'Outstanding', align: 'right', mono: true },
          { key: 'days', label: 'Days overdue', align: 'right' },
          { key: 'stage', label: 'Notice stage', badge: true },
        ],
        rows: a.worstOffenders.map((l) => ({
          lease: l.code,
          tenant: l.tenantName,
          property: `${l.propertyName} ${l.unitNo}`,
          zone: zoneShort(l.zone),
          outstanding: formatMYR(l.outstandingAmount),
          days: l.daysOverdue,
          stage: l.noticeStage,
        })),
        totalRow: {
          lease: '',
          tenant: `All ${formatNumber(a.accountsInArrears)} accounts`,
          property: '',
          zone: '',
          outstanding: formatMYR(a.totalOutstanding),
          days: '',
          stage: '',
        },
        csvName: 'kdh-arrears-worst-offenders',
        link: { label: 'Open Property & Leasing', to: '/property' },
      },
      working: [
        `Filtered ${formatNumber(leases.length)} authorised lease records to those with Lease.outstandingAmount > 0 — ${formatNumber(a.accountsInArrears)} accounts.`,
        'Total arrears = Σ Lease.outstandingAmount over those accounts (analytics.arrearsSummary()).',
        'Ageing buckets sum Lease.ageing.current / d30 / d60 / d90 / d90plus, which are maintained by the payment posting logic.',
        'Arrears rate = total arrears ÷ (Σ monthly rent of live leases × 12). Live = Active, Expiring Soon or Renewal In Progress.',
        scopeSentence(s),
      ],
      sources: [src('Leases', leases.length), src('Tenants', s.tenants.length), src('Payments', s.payments.length)],
      followUps: ['What is our collection rate?', 'Which leases expire in the next 90 days?', 'What is the occupancy rate?'],
    }
  },
}

/* ---------- 9. Lease expiry --------------------------------------- */

const leaseExpiryIntent: IntentDef = {
  id: 'property.expiry',
  label: 'Lease expiry pipeline',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['expiring', 'expire', 'expires', 'expiry', 'renewal', 'renew', 'tamat tempoh', 'lease end', 'ending'], weight: 7 },
    { terms: ['lease', 'leases', 'tenancy', 'tenancies', 'tenant', 'sewa'], weight: 3 },
    { terms: ['end', 'ends', 'finish', 'due to expire', 'run out'], weight: 4 },
    { terms: ['pipeline', 'next'], weight: 1 },
  ],
  penalties: [{ terms: ['insurance', 'policy', 'polisi'], weight: 6 }],
  examples: [
    'Which leases expire in the next 90 days?',
    'Show the lease renewal pipeline',
    'Which tenancies end in December?',
  ],
  run: (q, s) => {
    const base = q.zones.length > 0 ? s.leases.filter((l) => q.zones.includes(l.zone)) : s.leases
    const pipeline = leaseExpiryPipeline(base, s.now)

    let rows: Lease[]
    let windowLabel: string
    if (q.month) {
      const { index, year, label } = q.month
      rows = base
        .filter((l) => l.status !== 'Terminated' && l.status !== 'Draft')
        .filter((l) => {
          const d = new Date(l.endDate)
          return d.getMonth() === index && d.getFullYear() === year
        })
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
      windowLabel = `${label} ${year}`
    } else {
      const days = q.days ?? 90
      rows = expiringLeases(base, days, s.now)
      windowLabel = `the next ${formatNumber(days)} days`
    }

    const monthlyAtRisk = rows.reduce((t, l) => t + l.monthlyRent, 0)
    const withOption = rows.filter((l) => l.hasRenewalOption).length

    return {
      kind: 'table',
      headline: formatNumber(rows.length),
      headlineLabel: `Leases expiring in ${windowLabel}`,
      headlineTone: rows.length > 0 ? 'warning' : 'positive',
      narrative:
        `${formatNumber(rows.length)} leases reach expiry in ${windowLabel}, putting ${formatMYR(monthlyAtRisk)} of monthly rent ` +
        `(${formatMYR(monthlyAtRisk * 12)} annualised) up for renegotiation. ` +
        `${formatNumber(withOption)} of them carry a contractual renewal option, which materially improves the retention odds. ` +
        `${rows[0] ? `The nearest expiry is ${rows[0].tenantName} at ${rows[0].propertyName} ${rows[0].unitNo} on ${formatDate(rows[0].endDate)} (${formatNumber(Math.max(0, daysUntil(rows[0].endDate, s.now)))} days).` : 'Nothing falls due inside this window.'} ` +
        `Across the whole book, ${formatNumber(pipeline[0].count)} leases expire within 30 days and ${formatNumber(pipeline[1].count)} in the 31–60 day band.`,
      metrics: [
        { label: 'Leases expiring', value: formatNumber(rows.length), tone: 'warning' },
        { label: 'Monthly rent at risk', value: formatMYR(monthlyAtRisk), tone: 'warning' },
        { label: 'Annualised exposure', value: formatMYRCompact(monthlyAtRisk * 12), tone: 'critical' },
        { label: 'With renewal option', value: `${formatNumber(withOption)} of ${formatNumber(rows.length)}`, tone: 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Lease expiry pipeline by band',
        data: pipeline.map((b) => ({ name: b.bucket, count: b.count, value: b.monthlyValue })),
        xKey: 'name',
        series: [
          { key: 'count', label: 'Leases', color: CHART[1] },
        ],
        format: 'number',
        height: 'h-[240px]',
      },
      table: {
        columns: [
          { key: 'lease', label: 'Lease', mono: true },
          { key: 'tenant', label: 'Tenant' },
          { key: 'property', label: 'Property / unit' },
          { key: 'zone', label: 'Zone' },
          { key: 'end', label: 'Expires', mono: true },
          { key: 'days', label: 'Days left', align: 'right' },
          { key: 'rent', label: 'Monthly rent', align: 'right', mono: true },
          { key: 'status', label: 'Status', badge: true },
        ],
        rows: rows.slice(0, 15).map((l) => ({
          lease: l.code,
          tenant: l.tenantName,
          property: `${l.propertyName} ${l.unitNo}`,
          zone: zoneShort(l.zone),
          end: formatDate(l.endDate),
          days: Math.max(0, daysUntil(l.endDate, s.now)),
          rent: formatMYR(l.monthlyRent),
          status: l.status,
        })),
        totalRow: {
          lease: '',
          tenant: `All ${formatNumber(rows.length)} expiries`,
          property: '',
          zone: '',
          end: '',
          days: '',
          rent: formatMYR(monthlyAtRisk),
          status: '',
        },
        csvName: 'kdh-lease-expiries',
        link: { label: 'Open leases expiring soon', to: '/property?status=Expiring+Soon' },
        note: rows.length > 15 ? `Showing the 15 nearest of ${formatNumber(rows.length)} expiries.` : undefined,
      },
      working: [
        q.month
          ? `Selected leases whose Lease.endDate falls inside ${windowLabel}, excluding Terminated and Draft records.`
          : `Called analytics.expiringLeases(leases, ${formatNumber(q.days ?? 90)}) against ${formatNumber(base.length)} authorised leases; Terminated and Draft records are excluded.`,
        'Days left = ceil((endDate − today) ÷ 1 day) using the shared daysUntil() helper.',
        'Monthly rent at risk = Σ Lease.monthlyRent over the matched leases; annualised multiplies by 12 and assumes no re-letting.',
        'The pipeline chart buckets the full authorised book into 0–30 / 31–60 / 61–90 / 91–180 / 180+ day bands.',
        scopeSentence(s),
      ],
      sources: [src('Leases', base.length), src('Property units', s.units.length)],
      followUps: ['What is the occupancy rate?', 'What is our total arrears?', 'How much revenue are vacant units costing us?'],
    }
  },
}

/* ---------- 10. Collections / revenue vs target ------------------- */

const collectionIntent: IntentDef = {
  id: 'finance.collection',
  label: 'Collections & revenue performance',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['collection rate', 'collections', 'collected', 'kutipan'], weight: 7 },
    { terms: ['revenue versus target', 'revenue vs target', 'against target', 'achievement', 'budget revenue'], weight: 6 },
    { terms: ['revenue', 'billing', 'billed', 'invoiced'], weight: 3 },
    { terms: ['target', 'performance', 'trend'], weight: 2 },
  ],
  examples: [
    'What is our collection rate?',
    'Show revenue versus target for the year',
    'How are collections trending?',
  ],
  run: (q, s) => {
    const months = q.days ? Math.max(3, Math.min(12, Math.round(q.days / 30))) : 12
    const rate = collectionRate(s.payments, months, s.now)
    const trend = collectionTrend(s.payments, months, s.now)
    // MONTHLY_FINANCIALS holds 24 months. Every label below says "{months}
    // months", so the window has to be sliced to match — otherwise this quotes
    // roughly double the dashboard's figure for the same question.
    const rvt = revenueVsTarget(s.monthlyFinancials).slice(-months)
    const latest = rvt[rvt.length - 1]
    const ytdRevenue = rvt.reduce((t, m) => t + m.revenue, 0)
    const ytdTarget = rvt.reduce((t, m) => t + m.target, 0)
    const ytdCollections = rvt.reduce((t, m) => t + m.collections, 0)
    const achievement = ytdTarget > 0 ? (ytdRevenue / ytdTarget) * 100 : 0
    const best = trend.slice().sort((a, b) => b.ratePct - a.ratePct)[0]
    const worst = trend.filter((t) => t.billed > 0).slice().sort((a, b) => a.ratePct - b.ratePct)[0]

    return {
      kind: 'metric',
      headline: formatPct(rate),
      headlineLabel: `Collection rate, trailing ${formatNumber(months)} months`,
      headlineTone: rate >= 92 ? 'positive' : rate >= 85 ? 'warning' : 'critical',
      narrative:
        `Rent collections over the trailing ${formatNumber(months)} months stand at ${formatPct(rate)} of billed value. ` +
        `Group revenue for the period is ${formatMYR(ytdRevenue)} against a target of ${formatMYR(ytdTarget)} — ${formatPct(achievement)} achievement — ` +
        `with ${formatMYR(ytdCollections)} banked. ` +
        `${latest ? `The latest month, ${latest.label}, delivered ${formatMYR(latest.revenue)} revenue (${formatPct(latest.achievementPct)} of target) and a net operating income of ${formatMYR(latest.netOperatingIncome)}.` : ''} ` +
        `${best && worst ? `Collection performance peaked in ${best.label} at ${formatPct(best.ratePct)} and was weakest in ${worst.label} at ${formatPct(worst.ratePct)}.` : ''}`,
      metrics: [
        { label: 'Collection rate', value: formatPct(rate), tone: rate >= 92 ? 'positive' : 'warning' },
        { label: 'Revenue', value: formatMYRCompact(ytdRevenue), sublabel: `${formatNumber(months)} months` },
        { label: 'Target achievement', value: formatPct(achievement), tone: achievement >= 100 ? 'positive' : 'warning' },
        { label: 'Net operating income', value: formatMYRCompact(rvt.reduce((t, m) => t + m.netOperatingIncome, 0)), tone: 'positive' },
      ],
      chart: {
        type: 'line',
        title: 'Revenue, target and collections by month',
        data: rvt.map((m) => ({ name: m.label, revenue: m.revenue, target: m.target, collections: m.collections })),
        xKey: 'name',
        series: [
          { key: 'revenue', label: 'Revenue', color: CHART[0] },
          { key: 'target', label: 'Target', color: CHART[2] },
          { key: 'collections', label: 'Collections', color: CHART[1] },
        ],
        format: 'myr',
        height: 'h-[260px]',
      },
      table: {
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'billed', label: 'Billed', align: 'right', mono: true },
          { key: 'collected', label: 'Collected', align: 'right', mono: true },
          { key: 'rate', label: 'Collection rate', align: 'right' },
        ],
        rows: trend.map((t) => ({
          month: `${t.label} ${t.period.slice(0, 4)}`,
          billed: formatMYR(t.billed),
          collected: formatMYR(t.collected),
          rate: formatPct(t.ratePct),
        })),
        totalRow: {
          month: 'Period total',
          billed: formatMYR(trend.reduce((t, x) => t + x.billed, 0)),
          collected: formatMYR(trend.reduce((t, x) => t + x.collected, 0)),
          rate: formatPct(rate),
        },
        csvName: 'kdh-collection-trend',
        link: { label: 'Open Property & Leasing', to: '/property' },
      },
      working: [
        `Collection rate = Σ Payment.amountPaid ÷ Σ Payment.amountDue across the trailing ${formatNumber(months)} billing periods (${formatNumber(s.payments.length)} payment records in scope).`,
        'Monthly trend groups payments by their YYYY-MM period key, so a payment counts against the month it was billed for, not the month it was banked.',
        'Revenue, target and collections come from the MonthlyFinancial roll-up used by the Dashboard — group-level figures covering rent, land lease income, estate charges and tourism operations.',
        'Net operating income = revenue − opex for each month.',
        s.allZones
          ? scopeSentence(s)
          : `${scopeSentence(s)} Note: MonthlyFinancial roll-ups are reported at group level and are not partitioned by zone.`,
      ],
      sources: [src('Payments', s.payments.length), src('Monthly financials', s.monthlyFinancials.length), src('Leases', s.leases.length)],
      followUps: ['What is our total arrears?', 'Show the rent roll', 'What is our maintenance spend versus budget?'],
    }
  },
}

/* ---------- 11. Rent roll ----------------------------------------- */

const rentRollIntent: IntentDef = {
  id: 'property.rentroll',
  label: 'Rent roll',
  theme: 'Property & Revenue',
  cues: [
    { terms: ['rent roll', 'rentroll', 'contracted rent', 'contracted monthly rent', 'monthly rent', 'annualised rent', 'gross rent'], weight: 8 },
    { terms: ['rent', 'rental', 'sewa', 'psf'], weight: 3 },
    { terms: ['average rate', 'rate psf'], weight: 3 },
  ],
  penalties: [{ terms: ['arrears', 'expire', 'vacant', 'occupancy'], weight: 4 }],
  examples: ['Show the rent roll', 'What is our contracted monthly rent?', 'What is the average rate psf?'],
  run: (q, s) => {
    const leases = q.zones.length > 0 ? s.leases.filter((l) => q.zones.includes(l.zone)) : s.leases
    const roll = rentRoll(leases)
    const byZone = s.zones
      .map((zone) => {
        const live = leases.filter((l) => l.zone === zone && isLiveLease(l))
        return {
          zone,
          leases: live.length,
          monthly: live.reduce((t, l) => t + l.monthlyRent, 0),
          avgPsf: live.length > 0 ? live.reduce((t, l) => t + l.ratePsf, 0) / live.length : 0,
        }
      })
      .filter((z) => z.leases > 0)
      .sort((a, b) => b.monthly - a.monthly)

    return {
      kind: 'metric',
      headline: formatMYR(roll.monthlyContracted),
      headlineLabel: 'Contracted monthly rent',
      headlineTone: 'positive',
      narrative:
        `${formatNumber(roll.leaseCount)} live leases contract ${formatMYR(roll.monthlyContracted)} of rent every month — ` +
        `${formatMYR(roll.annualisedContracted)} annualised — at an average of RM ${roll.avgRatePsf.toFixed(2)} per square foot. ` +
        `Service charges add a further ${formatMYR(roll.monthlyServiceCharge)} a month. ` +
        `${byZone[0] ? `${zoneShort(byZone[0].zone)} contributes the most at ${formatMYR(byZone[0].monthly)} a month from ${formatNumber(byZone[0].leases)} leases.` : ''} ` +
        `Live leases are those in Active, Expiring Soon or Renewal In Progress status; drafts and terminated agreements are excluded.`,
      metrics: [
        { label: 'Live leases', value: formatNumber(roll.leaseCount) },
        { label: 'Annualised rent', value: formatMYRCompact(roll.annualisedContracted), tone: 'positive' },
        { label: 'Average rate', value: `${formatMYR(roll.avgRatePsf, true)} psf` },
        { label: 'Service charge / month', value: formatMYR(roll.monthlyServiceCharge) },
      ],
      chart: {
        type: 'bar',
        title: 'Contracted monthly rent by zone',
        data: byZone.map((z) => ({ name: zoneShort(z.zone), value: Math.round(z.monthly) })),
        xKey: 'name',
        series: [{ key: 'value', label: 'Monthly rent', color: CHART[0] }],
        format: 'myr',
        horizontal: true,
        height: 'h-[240px]',
      },
      table: {
        columns: [
          { key: 'zone', label: 'Zone' },
          { key: 'leases', label: 'Live leases', align: 'right' },
          { key: 'monthly', label: 'Monthly rent', align: 'right', mono: true },
          { key: 'annual', label: 'Annualised', align: 'right', mono: true },
          { key: 'psf', label: 'Avg psf', align: 'right', mono: true },
        ],
        rows: byZone.map((z) => ({
          zone: zoneShort(z.zone),
          leases: z.leases,
          monthly: formatMYR(z.monthly),
          annual: formatMYR(z.monthly * 12),
          psf: z.avgPsf.toFixed(2),
        })),
        totalRow: {
          zone: 'Total',
          leases: roll.leaseCount,
          monthly: formatMYR(roll.monthlyContracted),
          annual: formatMYR(roll.annualisedContracted),
          psf: roll.avgRatePsf.toFixed(2),
        },
        csvName: 'kdh-rent-roll-by-zone',
        link: { label: 'Open Property & Leasing', to: '/property' },
      },
      working: [
        `analytics.rentRoll() over ${formatNumber(leases.length)} authorised leases, keeping the ${formatNumber(roll.leaseCount)} that are contractually live.`,
        'Monthly contracted = Σ Lease.monthlyRent; annualised = × 12 with no escalation applied.',
        'Average rate psf is the mean of Lease.ratePsf across live leases (unweighted by area, matching the Property page).',
        'Service charge is billed separately from rent and is shown as its own line.',
        scopeSentence(s),
      ],
      sources: [src('Leases', leases.length), src('Property units', s.units.length)],
      followUps: ['What is the occupancy rate?', 'Which leases expire in the next 90 days?', 'What is our collection rate?'],
    }
  },
}

/* ---------- 12. Work orders --------------------------------------- */

const workOrderIntent: IntentDef = {
  id: 'maintenance.workorders',
  label: 'Work order load',
  theme: 'Maintenance',
  cues: [
    { terms: ['work order', 'work orders', 'wo', 'tickets', 'jobs', 'arahan kerja'], weight: 6 },
    { terms: ['open', 'outstanding jobs', 'backlog', 'pending'], weight: 3 },
    { terms: ['breached', 'breach', 'overdue', 'late'], weight: 4 },
    { terms: ['maintenance', 'repair', 'fault'], weight: 2 },
  ],
  penalties: [
    { terms: ['average resolution', 'mttr', 'compliance trend', 'spend', 'budget', 'technician', 'vendor'], weight: 5 },
  ],
  examples: [
    'How many work orders are open?',
    'Show breached SLA work orders by zone',
    'Which P1 tickets are still open?',
  ],
  run: (q, s) => {
    let wos = s.workOrders
    const filters: string[] = []
    if (q.zones.length > 0) {
      wos = wos.filter((w) => q.zones.includes(w.zone))
      filters.push(`zone in ${joinList(q.zones.map(zoneShort))}`)
    }
    if (q.priorities.length > 0) {
      wos = wos.filter((w) => q.priorities.includes(w.priority))
      filters.push(`priority in ${joinList(q.priorities)}`)
    }
    if (/p1|critical|urgent|emergency/.test(q.norm) && q.priorities.length === 0) {
      wos = wos.filter((w) => w.priority === 'P1 - Critical' || w.type === 'Emergency')
      filters.push('P1 - Critical or Emergency type')
    }

    const summary = workOrderSummary(wos, s.now)
    const open = wos.filter(isOpenWorkOrder)
    const breached = open.filter((w) => w.slaStatus === 'Breached')
    const atRisk = open.filter((w) => w.slaStatus === 'At Risk')
    const onlyBreached = /breach|overdue|late|missed sla/.test(q.norm)
    const listed = (onlyBreached ? breached : open)
      .slice()
      .sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime())

    const byZone = s.zones
      .map((zone) => {
        const zw = wos.filter((w) => w.zone === zone)
        const zo = zw.filter(isOpenWorkOrder)
        return {
          zone,
          open: zo.length,
          breached: zo.filter((w) => w.slaStatus === 'Breached').length,
        }
      })
      .filter((z) => z.open > 0 || z.breached > 0)
      .sort((a, b) => b.open - a.open)

    const priorityMix = woByPriority(open).filter((p) => p.count > 0)

    return {
      kind: 'metric',
      headline: formatNumber(onlyBreached ? breached.length : open.length),
      headlineLabel: onlyBreached ? 'Work orders past SLA' : 'Open work orders',
      headlineTone: breached.length > 0 ? 'critical' : 'positive',
      narrative:
        `${formatNumber(open.length)} work orders are open out of ${formatNumber(wos.length)} raised${filters.length > 0 ? ` (${joinList(filters)})` : ''}. ` +
        `${formatNumber(breached.length)} have already breached their SLA and ${formatNumber(atRisk.length)} are inside the final quarter of their response window. ` +
        `${formatNumber(summary.inProgress)} are actively in progress and ${formatNumber(summary.closedThisMonth)} were closed this month. ` +
        `${byZone[0] ? `${zoneShort(byZone[0].zone)} carries the heaviest load with ${formatNumber(byZone[0].open)} open tickets, ${formatNumber(byZone[0].breached)} of them breached.` : ''} ` +
        `Overall SLA compliance across resolved tickets is ${formatPct(summary.slaCompliancePct)}.`,
      metrics: [
        { label: 'Open work orders', value: formatNumber(open.length) },
        { label: 'SLA breached', value: formatNumber(breached.length), tone: 'critical' },
        { label: 'At risk', value: formatNumber(atRisk.length), tone: 'warning' },
        { label: 'Closed this month', value: formatNumber(summary.closedThisMonth), tone: 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Open and breached work orders by zone',
        data: byZone.map((z) => ({ name: zoneShort(z.zone), open: z.open, breached: z.breached })),
        xKey: 'name',
        series: [
          { key: 'open', label: 'Open', color: CHART[1] },
          { key: 'breached', label: 'Breached', color: CHART[3] },
        ],
        format: 'number',
        horizontal: true,
        height: 'h-[260px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'WO', mono: true },
          { key: 'title', label: 'Title' },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'priority', label: 'Priority', badge: true },
          { key: 'status', label: 'Status', badge: true },
          { key: 'sla', label: 'SLA', badge: true },
          { key: 'due', label: 'Due', mono: true },
        ],
        rows: listed.slice(0, 15).map((w) => ({
          code: w.code,
          title: w.title,
          asset: w.assetName,
          zone: zoneShort(w.zone),
          priority: w.priority,
          status: w.status,
          sla: w.slaStatus,
          due: formatDate(w.slaDueAt),
        })),
        csvName: onlyBreached ? 'kdh-breached-work-orders' : 'kdh-open-work-orders',
        link: onlyBreached
          ? { label: 'Open breached work orders', to: '/maintenance?sla=Breached' }
          : { label: 'Open Maintenance & Work Orders', to: '/maintenance' },
        note: listed.length > 15 ? `Showing the 15 most urgent of ${formatNumber(listed.length)} tickets.` : undefined,
      },
      facts: priorityMix.map((p) => ({ label: p.key, value: `${formatNumber(p.count)} open (${formatPct(p.pct)})`, badge: true })),
      working: [
        `Read ${formatNumber(s.workOrders.length)} authorised work orders${filters.length > 0 ? `, filtered by ${joinList(filters)}` : ''}.`,
        '"Open" means any status other than Closed or Cancelled — the analytics.isOpenWorkOrder() definition used everywhere in the app.',
        'SLA status is recomputed from raisedAt, slaDueAt and completedAt: Breached once the due time passes, At Risk inside the final 25% of the window.',
        'SLA compliance = tickets marked Met ÷ (Met + Breached); tickets still running are excluded from the denominator.',
        scopeSentence(s),
      ],
      sources: [src('Work orders', wos.length), src('Assets', s.assets.length)],
      followUps: ['What is our average resolution time?', 'Show technician workload', 'What is our maintenance spend versus budget?'],
    }
  },
}

/* ---------- 13. SLA & resolution time ----------------------------- */

const slaIntent: IntentDef = {
  id: 'maintenance.sla',
  label: 'SLA performance',
  theme: 'Maintenance',
  cues: [
    { terms: ['average resolution', 'resolution time', 'mttr', 'mean time to repair', 'time to fix', 'turnaround'], weight: 8 },
    { terms: ['sla compliance', 'sla performance', 'sla trend', 'response time'], weight: 7 },
    { terms: ['sla', 'compliance'], weight: 3 },
    { terms: ['trend', 'improving', 'getting better', 'worse'], weight: 2 },
  ],
  examples: [
    'What is our average resolution time?',
    'How is SLA compliance trending?',
    'Mean time to repair by asset category',
  ],
  run: (q, s) => {
    const wos = q.zones.length > 0 ? s.workOrders.filter((w) => q.zones.includes(w.zone)) : s.workOrders
    const summary = workOrderSummary(wos, s.now)
    const trend = slaTrend(wos, 6, s.now)
    const mttr = mttrByCategory(wos, s.assets)
    const withData = trend.filter((t) => t.total > 0)
    const first = withData[0]
    const last = withData[withData.length - 1]
    const delta = first && last ? last.compliancePct - first.compliancePct : 0
    const statusMix = woByStatus(wos).filter((x) => x.count > 0)

    return {
      kind: 'metric',
      headline: fmtHours(summary.avgResolutionHours),
      headlineLabel: 'Average resolution time',
      headlineTone: summary.avgResolutionHours <= 48 ? 'positive' : 'warning',
      narrative:
        `Closed work orders take an average of ${fmtHours(summary.avgResolutionHours)} from being raised to completion. ` +
        `SLA compliance across all resolved tickets is ${formatPct(summary.slaCompliancePct)}, with ${formatNumber(summary.overdue)} open tickets currently in breach. ` +
        `${first && last ? `Over the last ${formatNumber(withData.length)} months compliance moved from ${formatPct(first.compliancePct)} in ${first.label} to ${formatPct(last.compliancePct)} in ${last.label} — ${delta >= 0 ? 'an improvement' : 'a deterioration'} of ${formatPct(Math.abs(delta))}.` : ''} ` +
        `${mttr[0] ? `${mttr[0].category} is the slowest category to resolve at ${fmtHours(mttr[0].hours)} across ${formatNumber(mttr[0].count)} closed jobs.` : ''}`,
      metrics: [
        { label: 'Avg resolution', value: fmtHours(summary.avgResolutionHours) },
        { label: 'SLA compliance', value: formatPct(summary.slaCompliancePct), tone: summary.slaCompliancePct >= 90 ? 'positive' : 'warning' },
        { label: 'Currently breached', value: formatNumber(summary.overdue), tone: 'critical' },
        { label: 'Closed this month', value: formatNumber(summary.closedThisMonth), tone: 'positive' },
      ],
      chart: {
        type: 'area',
        title: 'SLA compliance by month raised',
        data: trend.map((t) => ({ name: t.label, compliance: t.compliancePct, raised: t.total, breached: t.breached })),
        xKey: 'name',
        series: [{ key: 'compliance', label: 'SLA compliance', color: CHART[0] }],
        format: 'pct',
        height: 'h-[240px]',
      },
      table: {
        columns: [
          { key: 'category', label: 'Asset category' },
          { key: 'mttr', label: 'Mean time to repair', align: 'right' },
          { key: 'jobs', label: 'Closed jobs', align: 'right' },
        ],
        rows: mttr.map((m) => ({ category: m.category, mttr: fmtHours(m.hours), jobs: m.count })),
        csvName: 'kdh-mttr-by-category',
        link: { label: 'Open Maintenance & Work Orders', to: '/maintenance' },
      },
      facts: statusMix.map((x) => ({ label: x.key, value: `${formatNumber(x.count)} (${formatPct(x.pct)})`, badge: true })),
      working: [
        `Average resolution = mean of (completedAt − raisedAt) across every Closed work order with a completion stamp, from ${formatNumber(wos.length)} authorised tickets.`,
        'SLA compliance = Met ÷ (Met + Breached). Tickets still running carry On Track / At Risk and are excluded from the ratio.',
        'The trend chart groups tickets by the month they were RAISED, so each bar is a cohort rather than a snapshot.',
        'Mean time to repair is grouped by the category of the asset the ticket sits on (analytics.mttrByCategory()).',
        scopeSentence(s),
      ],
      sources: [src('Work orders', wos.length), src('Assets', s.assets.length)],
      followUps: ['How many work orders are open?', 'Show technician workload', 'How are our vendors performing?'],
    }
  },
}

/* ---------- 14. Maintenance spend vs budget ----------------------- */

const spendIntent: IntentDef = {
  id: 'maintenance.spend',
  label: 'Maintenance spend vs budget',
  theme: 'Maintenance',
  cues: [
    { terms: ['maintenance spend', 'maintenance budget', 'spend versus budget', 'spend vs budget', 'over budget', 'under budget'], weight: 8 },
    { terms: ['spend', 'spending', 'cost', 'budget', 'perbelanjaan'], weight: 4 },
    { terms: ['maintenance', 'repair'], weight: 2 },
  ],
  penalties: [{ terms: ['revenue', 'collection rate', 'arrears'], weight: 4 }],
  examples: [
    'What is our maintenance spend versus budget?',
    'Are we over budget on maintenance?',
    'Show maintenance cost trend',
  ],
  run: (_q, s) => {
    const rows = maintenanceSpendVsBudget(s.monthlyFinancials)
    const spend = rows.reduce((t, r) => t + r.spend, 0)
    const budget = rows.reduce((t, r) => t + r.budget, 0)
    const variance = budget - spend
    const overMonths = rows.filter((r) => r.overBudget)
    const woCost = s.workOrders
      .filter((w) => w.status === 'Closed')
      .reduce((t, w) => t + (w.actualCost ?? w.estimatedCost), 0)
    const openCommitment = s.workOrders.filter(isOpenWorkOrder).reduce((t, w) => t + w.estimatedCost, 0)

    return {
      kind: 'metric',
      headline: formatMYR(spend),
      headlineLabel: 'Maintenance spend to date',
      headlineTone: variance >= 0 ? 'positive' : 'critical',
      narrative:
        `Maintenance spend across the reported months totals ${formatMYR(spend)} against a budget of ${formatMYR(budget)} — ` +
        `${variance >= 0 ? `${formatMYR(variance)} under budget (${formatPct((variance / Math.max(1, budget)) * 100)} headroom)` : `${formatMYR(Math.abs(variance))} over budget`}. ` +
        `${formatNumber(overMonths.length)} of ${formatNumber(rows.length)} months ran over their monthly allocation${overMonths.length > 0 ? `, the worst being ${overMonths.slice().sort((a, b) => a.variance - b.variance)[0].label}` : ''}. ` +
        `Closed work orders account for ${formatMYR(woCost)} of recorded job cost, and open tickets carry a further ${formatMYR(openCommitment)} of estimated commitment not yet incurred.`,
      metrics: [
        { label: 'Spend', value: formatMYRCompact(spend) },
        { label: 'Budget', value: formatMYRCompact(budget) },
        { label: 'Variance', value: formatMYRCompact(variance), tone: variance >= 0 ? 'positive' : 'critical' },
        { label: 'Open commitment', value: formatMYRCompact(openCommitment), tone: 'warning' },
      ],
      chart: {
        type: 'bar',
        title: 'Maintenance spend against budget by month',
        data: rows.map((r) => ({ name: r.label, spend: r.spend, budget: r.budget })),
        xKey: 'name',
        series: [
          { key: 'budget', label: 'Budget', color: CHART[2] },
          { key: 'spend', label: 'Spend', color: CHART[0] },
        ],
        format: 'myr',
        height: 'h-[260px]',
      },
      table: {
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'budget', label: 'Budget', align: 'right', mono: true },
          { key: 'spend', label: 'Spend', align: 'right', mono: true },
          { key: 'variance', label: 'Variance', align: 'right', mono: true },
          { key: 'variancePct', label: 'Variance %', align: 'right' },
        ],
        rows: rows.map((r) => ({
          month: `${r.label} ${r.period.slice(0, 4)}`,
          budget: formatMYR(r.budget),
          spend: formatMYR(r.spend),
          variance: formatMYR(r.variance),
          variancePct: formatPct(r.variancePct),
        })),
        totalRow: {
          month: 'Total',
          budget: formatMYR(budget),
          spend: formatMYR(spend),
          variance: formatMYR(variance),
          variancePct: formatPct((variance / Math.max(1, budget)) * 100),
        },
        csvName: 'kdh-maintenance-spend-vs-budget',
        link: { label: 'Open Maintenance & Work Orders', to: '/maintenance' },
      },
      working: [
        `analytics.maintenanceSpendVsBudget() over ${formatNumber(s.monthlyFinancials.length)} MonthlyFinancial records.`,
        'Variance = budget − spend, so a positive variance means headroom remains.',
        'Job cost cross-check sums WorkOrder.actualCost (falling back to estimatedCost) over Closed tickets.',
        'Open commitment sums WorkOrder.estimatedCost over tickets that are neither Closed nor Cancelled — money committed but not yet spent.',
        'MonthlyFinancial roll-ups are reported at group level and are not partitioned by zone.',
      ],
      sources: [src('Monthly financials', s.monthlyFinancials.length), src('Work orders', s.workOrders.length)],
      followUps: ['How many work orders are open?', 'How are our vendors performing?', 'What is our average resolution time?'],
    }
  },
}

/* ---------- 15. Technician workload ------------------------------- */

const technicianIntent: IntentDef = {
  id: 'maintenance.technicians',
  label: 'Technician workload',
  theme: 'Maintenance',
  cues: [
    { terms: ['technician', 'technicians', 'juruteknik', 'crew', 'crews', 'workforce', 'workload', 'utilisation', 'utilization'], weight: 8 },
    { terms: ['team', 'teams', 'staff', 'assigned', 'capacity', 'over capacity'], weight: 3 },
  ],
  penalties: [{ terms: ['vendor', 'contractor'], weight: 5 }],
  examples: ['Show technician workload', 'Who is the most loaded technician?', 'Which crews are over capacity?'],
  run: (q, s) => {
    const techs = q.zones.length > 0 ? s.technicians.filter((t) => q.zones.includes(t.zone)) : s.technicians
    const rows = technicianWorkload(s.workOrders, techs, s.now)
    const totalOpen = rows.reduce((t, r) => t + r.open, 0)
    const totalOverdue = rows.reduce((t, r) => t + r.overdue, 0)
    const avgUtil = rows.length > 0 ? rows.reduce((t, r) => t + r.utilisation, 0) / rows.length : 0
    const stretched = rows.filter((r) => r.utilisation >= 85)

    return {
      kind: 'table',
      headline: formatPct(avgUtil),
      headlineLabel: 'Average technician utilisation',
      headlineTone: avgUtil >= 85 ? 'critical' : avgUtil >= 70 ? 'warning' : 'positive',
      narrative:
        `${formatNumber(rows.length)} technicians in scope are carrying ${formatNumber(totalOpen)} open jobs, ${formatNumber(totalOverdue)} of which are past SLA. ` +
        `Average utilisation is ${formatPct(avgUtil)} and ${formatNumber(stretched.length)} technicians are at or above 85% — the point where new jobs start queueing rather than starting. ` +
        `${rows[0] ? `${rows[0].technician.name} (${rows[0].technician.team}, ${zoneShort(rows[0].technician.zone)}) has the heaviest book with ${formatNumber(rows[0].open)} open jobs and ${formatNumber(rows[0].overdue)} breached.` : ''} ` +
        `${formatNumber(rows.reduce((t, r) => t + r.closedThisMonth, 0))} jobs have been closed by this group this month.`,
      metrics: [
        { label: 'Technicians', value: formatNumber(rows.length) },
        { label: 'Open jobs carried', value: formatNumber(totalOpen) },
        { label: 'Breached jobs', value: formatNumber(totalOverdue), tone: 'critical' },
        { label: 'At/over 85% utilisation', value: formatNumber(stretched.length), tone: stretched.length > 0 ? 'warning' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Open jobs and breaches by technician',
        data: rows.slice(0, 10).map((r) => ({ name: r.technician.name.split(' ').slice(0, 2).join(' '), open: r.open, overdue: r.overdue })),
        xKey: 'name',
        series: [
          { key: 'open', label: 'Open jobs', color: CHART[1] },
          { key: 'overdue', label: 'Breached', color: CHART[3] },
        ],
        format: 'number',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'name', label: 'Technician' },
          { key: 'team', label: 'Team' },
          { key: 'zone', label: 'Zone' },
          { key: 'open', label: 'Open', align: 'right' },
          { key: 'overdue', label: 'Breached', align: 'right' },
          { key: 'closed', label: 'Closed this month', align: 'right' },
          { key: 'util', label: 'Utilisation', align: 'right' },
        ],
        rows: rows.map((r) => ({
          name: r.technician.name,
          team: r.technician.team,
          zone: zoneShort(r.technician.zone),
          open: r.open,
          overdue: r.overdue,
          closed: r.closedThisMonth,
          util: formatPct(r.utilisation, 0),
        })),
        totalRow: {
          name: 'Total',
          team: '',
          zone: '',
          open: totalOpen,
          overdue: totalOverdue,
          closed: rows.reduce((t, r) => t + r.closedThisMonth, 0),
          util: formatPct(avgUtil, 0),
        },
        csvName: 'kdh-technician-workload',
        link: { label: 'Open Maintenance & Work Orders', to: '/maintenance' },
      },
      working: [
        `analytics.technicianWorkload() joined ${formatNumber(s.workOrders.length)} authorised work orders onto ${formatNumber(techs.length)} technicians by WorkOrder.assignedTo = Technician.name.`,
        'Open = tickets not Closed/Cancelled; Breached = open tickets whose slaStatus is Breached.',
        'Closed this month counts tickets with a completedAt stamp inside the current calendar month.',
        'Utilisation is the roster figure carried on the Technician record, not derived from ticket hours.',
        scopeSentence(s),
      ],
      sources: [src('Technicians', techs.length), src('Work orders', s.workOrders.length)],
      followUps: ['How are our vendors performing?', 'How many work orders are open?', 'What is our average resolution time?'],
    }
  },
}

/* ---------- 16. Vendor performance -------------------------------- */

const vendorIntent: IntentDef = {
  id: 'maintenance.vendors',
  label: 'Vendor performance',
  theme: 'Maintenance',
  cues: [
    { terms: ['vendor', 'vendors', 'contractor', 'contractors', 'supplier', 'kontraktor', 'panel'], weight: 8 },
    { terms: ['performance', 'rating', 'sla compliance', 'contract expiry'], weight: 3 },
  ],
  examples: ['How are our vendors performing?', 'Which contractor has the worst SLA?', 'Show vendor contract expiries'],
  run: (_q, s) => {
    const rows = vendorPerformance(s.workOrders, s.vendors)
    const active = rows.filter((r) => r.jobs > 0)
    const totalSpend = rows.reduce((t, r) => t + r.totalCost, 0)
    const best = active.slice().sort((a, b) => b.onTimePct - a.onTimePct)[0]
    const worst = active.slice().sort((a, b) => a.onTimePct - b.onTimePct)[0]
    const expiring = s.vendors.filter((v) => {
      const d = daysUntil(v.contractExpiry, s.now)
      return Number.isFinite(d) && d <= 120
    })

    return {
      kind: 'table',
      headline: formatNumber(s.vendors.length),
      headlineLabel: 'Panel contractors under contract',
      narrative:
        `${formatNumber(s.vendors.length)} panel contractors are engaged, ${formatNumber(active.length)} of them with live or historic work in scope, ` +
        `accounting for ${formatMYR(totalSpend)} of closed job cost. ` +
        `${best ? `${best.vendor.name} leads on delivery at ${formatPct(best.onTimePct)} on-time across ${formatNumber(best.jobs)} jobs.` : ''} ` +
        `${worst && worst.vendor.id !== best?.vendor.id ? `${worst.vendor.name} is the weakest at ${formatPct(worst.onTimePct)} and should be reviewed at the next panel meeting.` : ''} ` +
        `${formatNumber(expiring.length)} contracts expire within 120 days and need a renewal or re-tender decision.`,
      metrics: [
        { label: 'Panel contractors', value: formatNumber(s.vendors.length) },
        { label: 'Closed job cost', value: formatMYRCompact(totalSpend) },
        { label: 'Open vendor jobs', value: formatNumber(rows.reduce((t, r) => t + r.open, 0)), tone: 'warning' },
        { label: 'Contracts expiring ≤120d', value: formatNumber(expiring.length), tone: expiring.length > 0 ? 'warning' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'On-time delivery by contractor',
        data: rows.slice(0, 10).map((r) => ({ name: r.vendor.name, onTime: r.onTimePct, jobs: r.jobs })),
        xKey: 'name',
        series: [{ key: 'onTime', label: 'On-time %', color: CHART[0] }],
        format: 'pct',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'vendor', label: 'Contractor' },
          { key: 'spec', label: 'Specialisation' },
          { key: 'jobs', label: 'Jobs', align: 'right' },
          { key: 'open', label: 'Open', align: 'right' },
          { key: 'onTime', label: 'On-time', align: 'right' },
          { key: 'rating', label: 'Rating', align: 'right' },
          { key: 'cost', label: 'Closed cost', align: 'right', mono: true },
          { key: 'expiry', label: 'Contract ends', mono: true },
        ],
        rows: rows.map((r) => ({
          vendor: r.vendor.name,
          spec: r.vendor.specialisation,
          jobs: r.jobs,
          open: r.open,
          onTime: formatPct(r.onTimePct),
          rating: r.rating.toFixed(1),
          cost: formatMYR(r.totalCost),
          expiry: formatDate(r.vendor.contractExpiry),
        })),
        csvName: 'kdh-vendor-performance',
        link: { label: 'Open Maintenance & Work Orders', to: '/maintenance' },
      },
      working: [
        `analytics.vendorPerformance() matched ${formatNumber(s.workOrders.length)} authorised work orders to ${formatNumber(s.vendors.length)} vendors via WorkOrder.vendorId.`,
        'On-time % = tickets with slaStatus Met ÷ (Met + Breached) for that vendor; where a vendor has no resolved ticket in scope the contracted slaCompliance figure is shown instead.',
        'Closed cost sums WorkOrder.actualCost, falling back to estimatedCost when the job has not been costed.',
        'Contract expiry counts Vendor.contractExpiry within 120 days of today.',
        'Vendor records are group-wide and are not zone-partitioned; the job statistics behind them respect your zone scope.',
      ],
      sources: [src('Vendors', s.vendors.length), src('Work orders', s.workOrders.length)],
      followUps: ['Show technician workload', 'What is our maintenance spend versus budget?', 'What is our average resolution time?'],
    }
  },
}

/* ---------- 17. Insurance ----------------------------------------- */

const insuranceIntent: IntentDef = {
  id: 'compliance.insurance',
  label: 'Insurance cover',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['insurance', 'insured', 'uninsured', 'policy', 'policies', 'insurer', 'cover', 'coverage', 'takaful', 'polisi'], weight: 8 },
    { terms: ['expiring', 'expire', 'lapsed', 'renewal', 'without cover', 'no cover'], weight: 3 },
  ],
  examples: ['Which insurance policies expire soon?', 'Are any assets uninsured?', 'Show insurance expiring in 60 days'],
  run: (q, s) => {
    const days = q.days ?? 90
    const rows = expiringInsurance(s.assets, days, s.now)
    const expired = rows.filter((r) => r.expired)
    const uninsured = s.assets.filter((a) => !a.insurance && a.status !== 'Disposed')
    const sumAtRisk = rows.reduce((t, r) => t + r.sumInsured, 0)
    const uninsuredValue = uninsured.reduce((t, a) => t + a.currentValue, 0)
    const buckets = [
      { name: 'Already lapsed', count: expired.length },
      { name: '0–30 days', count: rows.filter((r) => !r.expired && r.daysRemaining <= 30).length },
      { name: '31–60 days', count: rows.filter((r) => r.daysRemaining > 30 && r.daysRemaining <= 60).length },
      { name: '61–90 days', count: rows.filter((r) => r.daysRemaining > 60 && r.daysRemaining <= 90).length },
    ]

    return {
      kind: 'table',
      headline: formatNumber(rows.length),
      headlineLabel: `Policies expiring within ${formatNumber(days)} days`,
      headlineTone: expired.length > 0 ? 'critical' : rows.length > 0 ? 'warning' : 'positive',
      narrative:
        `${formatNumber(rows.length)} insurance policies fall due within ${formatNumber(days)} days, covering ${formatMYR(sumAtRisk)} of sum insured. ` +
        `${expired.length > 0 ? `${formatNumber(expired.length)} have already lapsed and represent an immediate uninsured exposure.` : 'None have lapsed yet.'} ` +
        `Separately, ${formatNumber(uninsured.length)} active assets carry no policy at all on the register, with a combined current value of ${formatMYR(uninsuredValue)}. ` +
        `${rows[0] ? `The most urgent is ${rows[0].asset.name} (${rows[0].asset.code}) with ${rows[0].insurer}, ${rows[0].expired ? `lapsed ${formatNumber(Math.abs(rows[0].daysRemaining))} days ago` : `due in ${formatNumber(rows[0].daysRemaining)} days`}.` : ''}`,
      metrics: [
        { label: 'Policies due', value: formatNumber(rows.length), tone: 'warning' },
        { label: 'Already lapsed', value: formatNumber(expired.length), tone: expired.length > 0 ? 'critical' : 'positive' },
        { label: 'Sum insured at renewal', value: formatMYRCompact(sumAtRisk) },
        { label: 'Assets with no cover', value: formatNumber(uninsured.length), sublabel: formatMYRCompact(uninsuredValue), tone: uninsured.length > 0 ? 'critical' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Policy renewals by urgency band',
        data: buckets,
        xKey: 'name',
        series: [{ key: 'count', label: 'Policies', color: CHART[3] }],
        format: 'number',
        height: 'h-[220px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Asset code', mono: true },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'policy', label: 'Policy no.', mono: true },
          { key: 'insurer', label: 'Insurer' },
          { key: 'expiry', label: 'Expiry', mono: true },
          { key: 'days', label: 'Days left', align: 'right' },
          { key: 'sum', label: 'Sum insured', align: 'right', mono: true },
        ],
        rows: rows.slice(0, 15).map((r) => ({
          code: r.asset.code,
          asset: r.asset.name,
          zone: zoneShort(r.asset.location.zone),
          policy: r.policyNo,
          insurer: r.insurer,
          expiry: formatDate(r.expiry),
          days: r.daysRemaining,
          sum: formatMYR(r.sumInsured),
        })),
        csvName: 'kdh-insurance-renewals',
        link: { label: 'Open Asset Registry', to: '/registry' },
        note: rows.length > 15 ? `Showing the 15 most urgent of ${formatNumber(rows.length)} policies.` : undefined,
      },
      working: [
        `analytics.expiringInsurance(assets, ${formatNumber(days)}) over ${formatNumber(s.assets.length)} authorised assets, excluding Disposed records.`,
        'Days left = ceil((policy expiry − today) ÷ 1 day); negative values mean the policy has already lapsed and are listed first.',
        'Sum insured reads Asset.insurance.sumInsured verbatim from the register.',
        'Uninsured assets are those with no insurance object on the record at all — a data-completeness as well as a risk finding.',
        scopeSentence(s),
      ],
      sources: [src('Assets', s.assets.length)],
      followUps: ['Which inspections are overdue?', 'Show the risk register', 'Which assets are in poor or critical condition?'],
    }
  },
}

/* ---------- 18. Inspections --------------------------------------- */

const inspectionIntent: IntentDef = {
  id: 'compliance.inspections',
  label: 'Statutory inspections',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['inspection', 'inspections', 'pemeriksaan', 'statutory', 'certification', 'audit due'], weight: 8 },
    { terms: ['overdue', 'due', 'lapsed', 'behind'], weight: 3 },
    { terms: ['preventive maintenance', 'planned maintenance', 'pm schedule', 'scheduled maintenance'], weight: 6 },
    { terms: ['schedule', 'schedules'], weight: 4 },
  ],
  examples: ['Which inspections are overdue?', 'Show statutory inspections due in 30 days', 'What preventive maintenance is due?'],
  run: (q, s) => {
    const days = q.days ?? 60
    const rows = upcomingInspections(s.assets, days, s.now)
    const overdue = rows.filter((r) => r.overdue)
    const schedules = s.schedules
      .map((sc) => ({ sc, days: daysUntil(sc.nextDue, s.now) }))
      .filter((x) => Number.isFinite(x.days) && x.days <= days)
      .sort((a, b) => a.days - b.days)
    const statutoryOverdue = schedules.filter((x) => x.sc.isStatutory && x.days < 0)

    return {
      kind: 'table',
      headline: formatNumber(overdue.length),
      headlineLabel: 'Inspections already overdue',
      headlineTone: overdue.length > 0 ? 'critical' : 'positive',
      narrative:
        `${formatNumber(overdue.length)} asset inspections are past their due date and a further ${formatNumber(rows.length - overdue.length)} fall due within ${formatNumber(days)} days. ` +
        `On the planned-maintenance side, ${formatNumber(schedules.length)} scheduled tasks are due in the same window, of which ${formatNumber(statutoryOverdue.length)} are statutory items already running late — ` +
        `these carry regulatory exposure, not just operational risk. ` +
        `${overdue[0] ? `The worst case is ${overdue[0].asset.name} (${overdue[0].asset.code}) in ${zoneShort(overdue[0].asset.location.zone)}, ${formatNumber(Math.abs(overdue[0].daysRemaining))} days past due.` : ''}`,
      metrics: [
        { label: 'Overdue inspections', value: formatNumber(overdue.length), tone: 'critical' },
        { label: `Due within ${formatNumber(days)}d`, value: formatNumber(rows.length - overdue.length), tone: 'warning' },
        { label: 'Scheduled PM tasks due', value: formatNumber(schedules.length) },
        { label: 'Statutory items late', value: formatNumber(statutoryOverdue.length), tone: statutoryOverdue.length > 0 ? 'critical' : 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Inspection status in the window',
        data: [
          { name: 'Overdue', count: overdue.length },
          { name: 'Due ≤ 14 days', count: rows.filter((r) => !r.overdue && r.daysRemaining <= 14).length },
          { name: 'Due 15–30 days', count: rows.filter((r) => r.daysRemaining > 14 && r.daysRemaining <= 30).length },
          { name: `Due 31–${formatNumber(days)} days`, count: rows.filter((r) => r.daysRemaining > 30).length },
        ],
        xKey: 'name',
        series: [{ key: 'count', label: 'Assets', color: CHART[4] }],
        format: 'number',
        height: 'h-[220px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Asset code', mono: true },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'criticality', label: 'Criticality', badge: true },
          { key: 'due', label: 'Inspection due', mono: true },
          { key: 'days', label: 'Days', align: 'right' },
          { key: 'last', label: 'Last inspected', mono: true },
        ],
        rows: rows.slice(0, 15).map((r) => ({
          code: r.asset.code,
          asset: r.asset.name,
          zone: zoneShort(r.asset.location.zone),
          criticality: r.asset.criticality,
          due: formatDate(r.dueDate),
          days: r.daysRemaining,
          last: formatDate(r.asset.lastInspection),
        })),
        csvName: 'kdh-inspections-due',
        link: { label: 'Open Asset Registry', to: '/registry' },
        note: rows.length > 15 ? `Showing the 15 most urgent of ${formatNumber(rows.length)} inspections.` : undefined,
      },
      working: [
        `analytics.upcomingInspections(assets, ${formatNumber(days)}) over ${formatNumber(s.assets.length)} authorised assets with a nextInspection date, excluding Disposed records.`,
        'A negative "days" value means the inspection is overdue; those rows sort first.',
        `Planned-maintenance figures read ${formatNumber(s.schedules.length)} MaintenanceSchedule records and flag MaintenanceSchedule.isStatutory separately.`,
        'Assets with no inspection date at all are not counted here but are penalised in the risk register.',
        scopeSentence(s),
      ],
      sources: [src('Assets', s.assets.length), src('Maintenance schedules', s.schedules.length)],
      followUps: ['Which insurance policies expire soon?', 'Show the risk register', 'How many work orders are open?'],
    }
  },
}

/* ---------- 19. ESG ----------------------------------------------- */

const esgIntent: IntentDef = {
  id: 'esg.summary',
  label: 'ESG & sustainability',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['esg', 'sustainability', 'carbon', 'emissions', 'energy', 'water', 'green score', 'solar', 'net zero', 'lestari'], weight: 8 },
    { terms: ['kwh', 'consumption', 'footprint', 'renewable'], weight: 4 },
  ],
  examples: ['What is our ESG position?', 'How many assets are solar ready?', 'Show carbon emissions by category'],
  run: (q, s) => {
    const { rows } = filterAssets(q, s.assets)
    const e = esgSummary(rows)
    const withEsg = rows.filter((a) => a.esg)
    const byCategory = ASSET_CATEGORIES.map((category) => {
      const list = withEsg.filter((a) => a.category === category)
      return {
        name: category,
        carbon: Number(list.reduce((t, a) => t + (a.esg?.carbonTonnesPerYear ?? 0), 0).toFixed(1)),
        energy: Math.round(list.reduce((t, a) => t + (a.esg?.energyKwhPerYear ?? 0), 0)),
        count: list.length,
      }
    })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.carbon - a.carbon)
    const topGreen = withEsg
      .slice()
      .sort((a, b) => (b.esg?.greenScore ?? 0) - (a.esg?.greenScore ?? 0))
      .slice(0, 10)

    return {
      kind: 'metric',
      headline: formatNumber(e.totalCarbonTonnes, 1),
      headlineLabel: 'Tonnes CO₂e reported per year',
      headlineTone: 'warning',
      narrative:
        `${formatNumber(e.reportedAssets)} assets carry ESG telemetry — ${formatPct(e.coveragePct)} of the register in scope. ` +
        `Together they consume ${formatNumber(e.totalEnergyKwh)} kWh of electricity and ${formatNumber(e.totalWaterM3)} m³ of water a year, ` +
        `emitting ${formatNumber(e.totalCarbonTonnes, 1)} tonnes of CO₂e. ` +
        `The average green score is ${formatNumber(e.avgGreenScore, 1)} out of 100 and ${formatNumber(e.solarReadyCount)} assets are already solar-ready — ` +
        `a material head start on any rooftop PV programme. ` +
        `${byCategory[0] ? `${byCategory[0].name} is the largest emitter at ${formatNumber(byCategory[0].carbon, 1)} tonnes a year across ${formatNumber(byCategory[0].count)} assets.` : ''}`,
      metrics: [
        { label: 'Energy per year', value: `${formatNumber(e.totalEnergyKwh)} kWh` },
        { label: 'Water per year', value: `${formatNumber(e.totalWaterM3)} m³` },
        { label: 'Avg green score', value: `${formatNumber(e.avgGreenScore, 1)}/100`, tone: e.avgGreenScore >= 70 ? 'positive' : 'warning' },
        { label: 'Solar-ready assets', value: formatNumber(e.solarReadyCount), sublabel: `${formatPct((e.solarReadyCount / Math.max(1, e.reportedAssets)) * 100)} of reported`, tone: 'positive' },
      ],
      chart: {
        type: 'bar',
        title: 'Annual carbon emissions by asset category (tCO₂e)',
        data: byCategory.map((c) => ({ name: c.name, carbon: c.carbon })),
        xKey: 'name',
        series: [{ key: 'carbon', label: 'tCO₂e / year', color: CHART[4] }],
        format: 'number',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'green', label: 'Green score', align: 'right' },
          { key: 'energy', label: 'kWh / year', align: 'right', mono: true },
          { key: 'water', label: 'm³ / year', align: 'right', mono: true },
          { key: 'carbon', label: 'tCO₂e / year', align: 'right', mono: true },
          { key: 'solar', label: 'Solar ready' },
        ],
        rows: topGreen.map((a) => ({
          code: a.code,
          asset: a.name,
          zone: zoneShort(a.location.zone),
          green: a.esg?.greenScore ?? 0,
          energy: formatNumber(a.esg?.energyKwhPerYear ?? 0),
          water: formatNumber(a.esg?.waterM3PerYear ?? 0),
          carbon: formatNumber(a.esg?.carbonTonnesPerYear ?? 0, 1),
          solar: a.esg?.solarReady ? 'Yes' : 'No',
        })),
        csvName: 'kdh-esg-leaders',
        link: { label: 'Open Asset Registry', to: '/registry' },
        note: 'Ranked by green score — the ten strongest ESG performers in scope.',
      },
      working: [
        `analytics.esgSummary() over ${formatNumber(rows.length)} authorised assets; only the ${formatNumber(e.reportedAssets)} carrying an ESG block contribute to the totals.`,
        'Coverage % = assets with ESG telemetry ÷ all assets in scope. Assets without telemetry are excluded from the totals rather than assumed to be zero.',
        'Energy, water and carbon are annualised figures held on Asset.esg and are not extrapolated.',
        'Solar-ready is the Asset.esg.solarReady flag set during the technical survey.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: ['What is the total portfolio value?', 'Show the risk register', 'Which assets are in poor or critical condition?'],
    }
  },
}

/* ---------- 20. Risk register ------------------------------------- */

const riskIntent: IntentDef = {
  id: 'risk.register',
  label: 'Risk register',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['risk register', 'highest risk', 'riskiest', 'risk exposure', 'top risks', 'risk score'], weight: 8 },
    { terms: ['risk', 'risiko', 'exposure', 'threat'], weight: 4 },
  ],
  penalties: [{ terms: ['arrears', 'occupancy', 'revenue'], weight: 4 }],
  examples: ['Show the risk register', 'Which assets carry the highest risk?', 'What are the top risks in Mersing?'],
  run: (q, s) => {
    const { rows } = filterAssets(q, s.assets)
    const register = riskRegister(rows, s.workOrders, q.topN ?? 12, s.now)
    const severe = register.filter((r) => r.score >= 70)
    const exposure = register.reduce((t, r) => t + r.asset.currentValue, 0)

    return {
      kind: 'table',
      headline: register[0] ? `${formatNumber(register[0].score, 1)}/100` : '—',
      headlineLabel: register[0] ? `Highest composite risk score — ${register[0].asset.code}` : 'Risk index',
      headlineTone: (register[0]?.score ?? 0) >= 70 ? 'critical' : 'warning',
      narrative:
        `The risk index blends each asset's own risk score with live operational signals — condition grade, criticality, SLA breaches, overdue inspections and lapsed insurance. ` +
        `${formatNumber(severe.length)} of the ${formatNumber(register.length)} ranked assets score 70 or above, and the ranked set carries ${formatMYR(exposure)} of book value. ` +
        `${register[0] ? `${register[0].asset.name} (${register[0].asset.code}) tops the register at ${formatNumber(register[0].score, 1)}/100 — ${register[0].reasons.join('; ').toLowerCase()}.` : ''} ` +
        `${formatNumber(register.reduce((t, r) => t + r.breachedWorkOrders, 0))} SLA breaches sit against these assets right now.`,
      metrics: [
        { label: 'Assets ranked', value: formatNumber(register.length) },
        { label: 'Scoring 70+', value: formatNumber(severe.length), tone: 'critical' },
        { label: 'Book value at risk', value: formatMYRCompact(exposure), tone: 'warning' },
        { label: 'Open WOs on them', value: formatNumber(register.reduce((t, r) => t + r.openWorkOrders, 0)) },
      ],
      chart: {
        type: 'bar',
        title: 'Composite risk score — ranked assets',
        data: register.slice(0, 10).map((r) => ({ name: r.asset.code, score: r.score })),
        xKey: 'name',
        series: [{ key: 'score', label: 'Risk score', color: CHART[3] }],
        format: 'number',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'score', label: 'Risk score', align: 'right' },
          { key: 'condition', label: 'Condition', badge: true },
          { key: 'open', label: 'Open WO', align: 'right' },
          { key: 'breached', label: 'Breached', align: 'right' },
          { key: 'drivers', label: 'Risk drivers' },
        ],
        rows: register.map((r) => ({
          code: r.asset.code,
          asset: r.asset.name,
          zone: zoneShort(r.asset.location.zone),
          score: r.score,
          condition: r.asset.condition,
          open: r.openWorkOrders,
          breached: r.breachedWorkOrders,
          drivers: r.reasons.join('; '),
        })),
        csvName: 'kdh-risk-register',
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `analytics.riskRegister() scored ${formatNumber(rows.length)} authorised assets against ${formatNumber(s.workOrders.length)} work orders.`,
        'Base = 40% of the asset\'s stored riskScore, then additive penalties: Critical condition +22, Poor +13, Critical criticality +12, each SLA breach +7 (max 18), each open P1 +6 (max 12).',
        'Further penalties: overdue inspection +9, no inspection scheduled +5, lapsed insurance +11, no insurance +7, data quality below 60 +4.',
        'The final score is clamped to 0–100 and the register returns the highest scorers first.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length), src('Work orders', s.workOrders.length)],
      followUps: ['Which insurance policies expire soon?', 'Which inspections are overdue?', 'Which assets are in poor or critical condition?'],
    }
  },
}

/* ---------- 21. Zone comparison ----------------------------------- */

const zoneCompareIntent: IntentDef = {
  id: 'zone.compare',
  label: 'Zone comparison',
  theme: 'Portfolio',
  cues: [
    { terms: ['compare', 'comparison', 'versus', ' vs ', 'against each other', 'benchmark'], weight: 7 },
    { terms: ['zone', 'zones', 'zon', 'region'], weight: 4 },
    { terms: ['which zone', 'best zone', 'worst zone', 'zone performance'], weight: 7 },
  ],
  examples: ['Compare Desaru and Pengerang', 'Which zone performs best?', 'Zone performance table'],
  run: (q, s) => {
    const all = zonePerformance(s.assets, s.leases, s.units, s.workOrders).filter((r) =>
      s.zones.includes(r.zone),
    )
    const selected = q.zones.length >= 2 ? all.filter((r) => q.zones.includes(r.zone)) : all
    const leader = selected.slice().sort((a, b) => b.portfolioValue - a.portfolioValue)[0]
    const bestOcc = selected.slice().filter((z) => z.units > 0).sort((a, b) => b.occupancyRate - a.occupancyRate)[0]
    const worstArrears = selected.slice().sort((a, b) => b.outstandingArrears - a.outstandingArrears)[0]

    const pair = selected.length === 2 ? selected : undefined
    const narrative = pair
      ? `${zoneShort(pair[0].zone)} holds ${formatMYR(pair[0].portfolioValue)} across ${formatNumber(pair[0].assetCount)} assets against ${zoneShort(pair[1].zone)} at ${formatMYR(pair[1].portfolioValue)} across ${formatNumber(pair[1].assetCount)}. ` +
        `On occupancy the split is ${formatPct(pair[0].occupancyRate)} versus ${formatPct(pair[1].occupancyRate)}, and monthly contracted rent is ${formatMYR(pair[0].monthlyRevenue)} versus ${formatMYR(pair[1].monthlyRevenue)}. ` +
        `Arrears stand at ${formatMYR(pair[0].outstandingArrears)} and ${formatMYR(pair[1].outstandingArrears)} respectively, with ${formatNumber(pair[0].openWorkOrders)} and ${formatNumber(pair[1].openWorkOrders)} open work orders. ` +
        `${pair[0].avgConditionScore >= pair[1].avgConditionScore ? `${zoneShort(pair[0].zone)} carries the healthier estate at an average condition score of ${formatNumber(pair[0].avgConditionScore, 1)}.` : `${zoneShort(pair[1].zone)} carries the healthier estate at an average condition score of ${formatNumber(pair[1].avgConditionScore, 1)}.`}`
      : `Across ${formatNumber(selected.length)} authorised zones, ${leader ? `${zoneShort(leader.zone)} is the largest by value at ${formatMYR(leader.portfolioValue)} from ${formatNumber(leader.assetCount)} assets` : ''}. ` +
        `${bestOcc ? `${zoneShort(bestOcc.zone)} leads on occupancy at ${formatPct(bestOcc.occupancyRate)}.` : ''} ` +
        `${worstArrears ? `${zoneShort(worstArrears.zone)} carries the largest arrears balance at ${formatMYR(worstArrears.outstandingArrears)}.` : ''} ` +
        `Total contracted rent across these zones is ${formatMYR(selected.reduce((t, z) => t + z.monthlyRevenue, 0))} a month with ${formatNumber(selected.reduce((t, z) => t + z.openWorkOrders, 0))} open work orders outstanding.`

    return {
      kind: 'comparison',
      headline: formatNumber(selected.length),
      headlineLabel: 'Zones compared',
      narrative,
      metrics: [
        { label: 'Combined value', value: formatMYRCompact(selected.reduce((t, z) => t + z.portfolioValue, 0)) },
        { label: 'Monthly rent', value: formatMYR(selected.reduce((t, z) => t + z.monthlyRevenue, 0)), tone: 'positive' },
        { label: 'Arrears', value: formatMYR(selected.reduce((t, z) => t + z.outstandingArrears, 0)), tone: 'critical' },
        { label: 'Open work orders', value: formatNumber(selected.reduce((t, z) => t + z.openWorkOrders, 0)), tone: 'warning' },
      ],
      chart: {
        type: 'bar',
        title: 'Portfolio value and monthly rent by zone',
        data: selected.map((z) => ({ name: zoneShort(z.zone), value: z.portfolioValue, rent: z.monthlyRevenue * 12 })),
        xKey: 'name',
        series: [
          { key: 'value', label: 'Portfolio value', color: CHART[0] },
          { key: 'rent', label: 'Annualised rent', color: CHART[1] },
        ],
        format: 'myr',
        horizontal: true,
        height: 'h-[280px]',
      },
      table: {
        columns: [
          { key: 'zone', label: 'Zone' },
          { key: 'assets', label: 'Assets', align: 'right' },
          { key: 'value', label: 'Portfolio value', align: 'right', mono: true },
          { key: 'units', label: 'Units', align: 'right' },
          { key: 'occupancy', label: 'Occupancy', align: 'right' },
          { key: 'rent', label: 'Monthly rent', align: 'right', mono: true },
          { key: 'arrears', label: 'Arrears', align: 'right', mono: true },
          { key: 'open', label: 'Open WO', align: 'right' },
          { key: 'condition', label: 'Avg condition', align: 'right' },
        ],
        rows: selected.map((z) => ({
          zone: zoneShort(z.zone),
          assets: z.assetCount,
          value: formatMYR(z.portfolioValue),
          units: z.units,
          occupancy: formatPct(z.occupancyRate),
          rent: formatMYR(z.monthlyRevenue),
          arrears: formatMYR(z.outstandingArrears),
          open: z.openWorkOrders,
          condition: formatNumber(z.avgConditionScore, 1),
        })),
        totalRow: {
          zone: 'Total',
          assets: selected.reduce((t, z) => t + z.assetCount, 0),
          value: formatMYR(selected.reduce((t, z) => t + z.portfolioValue, 0)),
          units: selected.reduce((t, z) => t + z.units, 0),
          occupancy: '',
          rent: formatMYR(selected.reduce((t, z) => t + z.monthlyRevenue, 0)),
          arrears: formatMYR(selected.reduce((t, z) => t + z.outstandingArrears, 0)),
          open: selected.reduce((t, z) => t + z.openWorkOrders, 0),
          condition: '',
        },
        csvName: 'kdh-zone-comparison',
        link: { label: 'Open GIS Map', to: '/map' },
      },
      working: [
        `analytics.zonePerformance() rolled up ${formatNumber(s.assets.length)} assets, ${formatNumber(s.units.length)} units, ${formatNumber(s.leases.length)} leases and ${formatNumber(s.workOrders.length)} work orders into one row per zone.`,
        q.zones.length >= 2 ? `Restricted to the ${formatNumber(q.zones.length)} zones named in your question.` : 'No specific zones were named, so every zone you are authorised to see is included.',
        'Monthly rent counts live leases only; arrears sums Lease.outstandingAmount over every lease in the zone regardless of status.',
        'Occupancy uses PropertyUnit.status = Occupied ÷ total units in the zone.',
        scopeSentence(s),
      ],
      sources: [
        src('Assets', s.assets.length),
        src('Property units', s.units.length),
        src('Leases', s.leases.length),
        src('Work orders', s.workOrders.length),
      ],
      followUps: ['What is the total portfolio value?', 'What is the occupancy rate?', 'How many work orders are open?'],
    }
  },
}

/* ---------- 22. Specific asset lookup ----------------------------- */

const assetLookupIntent: IntentDef = {
  id: 'asset.lookup',
  label: 'Asset profile',
  theme: 'Portfolio',
  cues: [
    { terms: ['tell me about', 'profile of', 'details for', 'look up', 'show me the asset', 'information on', 'asset profile'], weight: 6 },
  ],
  /** An explicit asset code is decisive — no keyword can outweigh it. */
  boost: (q) => (q.assetCode ? 12 : 0),
  examples: ['Tell me about KDH-CP-0001', 'Look up Kompleks Niaga Bandar Penawar', 'Details for KDH-TH-0002'],
  run: (q, s) => {
    let asset: Asset | undefined
    if (q.assetCode) asset = s.assets.find((a) => a.code.toUpperCase() === q.assetCode)
    if (!asset) {
      // Name search — longest matching asset name wins.
      const candidates = s.assets
        .filter((a) => hasTerm(q.norm, a.name.toLowerCase()) || q.norm.includes(a.name.toLowerCase()))
        .sort((a, b) => b.name.length - a.name.length)
      asset = candidates[0]
    }

    if (!asset) {
      return {
        kind: 'fallback',
        narrative:
          `I could not find an asset matching that reference inside your authorised scope. ` +
          `Asset codes follow the pattern KDH-XX-0000 (for example KDH-CP-0012 for a commercial property). ` +
          `You can also ask by full asset name, or open the Asset Registry and search there.`,
        working: [
          `Searched ${formatNumber(s.assets.length)} authorised asset records by exact code match, then by name containment.`,
          'No record matched. Nothing has been inferred or approximated.',
          scopeSentence(s),
        ],
        sources: [src('Assets', s.assets.length)],
        followUps: ['What are our highest value assets?', 'How many assets do we have by category?', 'Show the risk register'],
      }
    }

    const found = asset
    const wos = s.workOrders.filter((w) => w.assetId === found.id)
    const openWos = wos.filter(isOpenWorkOrder)
    const units = s.units.filter((u) => u.assetId === found.id)
    const leases = s.leases.filter((l) => l.assetId === found.id)
    const liveLeases = leases.filter(isLiveLease)
    const monthlyRent = liveLeases.reduce((t, l) => t + l.monthlyRent, 0)
    const risk = riskRegister([found], s.workOrders, 1, s.now)[0]

    return {
      kind: 'profile',
      headline: formatMYR(found.currentValue),
      headlineLabel: `${found.code} — current value`,
      narrative:
        `${found.name} is a ${found.category.toLowerCase()} asset (${found.subCategory}) at ${found.location.address}, ${found.location.town}, in ${zoneShort(found.location.zone)}. ` +
        `It is ${found.status.toLowerCase()}, rated ${found.condition} with a condition score of ${formatNumber(found.conditionScore)}/100 and ${found.criticality} criticality. ` +
        `Acquired on ${formatDate(found.acquisitionDate)} for ${formatMYR(found.acquisitionCost)}, it now carries a net book value of ${formatMYR(found.netBookValue)}. ` +
        `${units.length > 0 ? `It contains ${formatNumber(units.length)} lettable units with ${formatNumber(liveLeases.length)} live leases contracting ${formatMYR(monthlyRent)} a month. ` : ''}` +
        `${formatNumber(openWos.length)} work orders are open against it out of ${formatNumber(wos.length)} ever raised. ` +
        `Custody sits with ${found.custodianName}, ${found.custodianDepartment}.`,
      metrics: [
        { label: 'Net book value', value: formatMYRCompact(found.netBookValue) },
        { label: 'Revenue YTD', value: formatMYRCompact(found.revenueYtd), tone: 'positive' },
        { label: 'Opex YTD', value: formatMYRCompact(found.opexYtd), tone: 'warning' },
        { label: 'Risk score', value: risk ? `${formatNumber(risk.score, 1)}/100` : '—', tone: risk && risk.score >= 70 ? 'critical' : 'warning' },
      ],
      facts: [
        { label: 'Code', value: found.code, mono: true },
        { label: 'Status', value: found.status, badge: true },
        { label: 'Condition', value: found.condition, badge: true },
        { label: 'Criticality', value: found.criticality, badge: true },
        { label: 'Category', value: found.category },
        { label: 'Zone', value: zoneShort(found.location.zone) },
        { label: 'Town', value: found.location.town },
        { label: 'Coordinates', value: `${found.location.lat.toFixed(4)}, ${found.location.lng.toFixed(4)}`, mono: true },
        { label: 'Ownership', value: found.ownership },
        { label: 'Custodian', value: `${found.custodianName} · ${found.custodianDepartment}` },
        { label: 'Land title', value: found.landTitle ? `${found.landTitle.titleNo} · Lot ${found.landTitle.lotNo} · ${found.landTitle.mukim} · ${found.landTitle.tenure}` : 'Not recorded', mono: Boolean(found.landTitle) },
        { label: 'Building', value: found.building ? `${formatNumber(found.building.grossFloorAreaSqft)} sqft GFA · ${formatNumber(found.building.floors)} floors · built ${found.building.yearBuilt}` : 'Not applicable' },
        { label: 'Insurance', value: found.insurance ? `${found.insurance.insurer} · ${found.insurance.policyNo} · expires ${formatDate(found.insurance.expiry)}` : 'No policy on record' },
        { label: 'Last inspection', value: formatDate(found.lastInspection) },
        { label: 'Next inspection', value: formatDate(found.nextInspection) },
        { label: 'Utilisation', value: formatPct(found.utilisationRate) },
        { label: 'Data quality', value: formatPct(found.dataQualityScore) },
      ],
      table: wos.length > 0
        ? {
            columns: [
              { key: 'code', label: 'WO', mono: true },
              { key: 'title', label: 'Title' },
              { key: 'type', label: 'Type' },
              { key: 'priority', label: 'Priority', badge: true },
              { key: 'status', label: 'Status', badge: true },
              { key: 'sla', label: 'SLA', badge: true },
              { key: 'raised', label: 'Raised', mono: true },
            ],
            rows: wos
              .slice()
              .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
              .slice(0, 10)
              .map((w) => ({
                code: w.code,
                title: w.title,
                type: w.type,
                priority: w.priority,
                status: w.status,
                sla: w.slaStatus,
                raised: formatDate(w.raisedAt),
              })),
            csvName: `kdh-${found.code.toLowerCase()}-work-orders`,
            link: { label: `Open ${found.code} in the registry`, to: `/registry?asset=${found.id}` },
          }
        : undefined,
      working: [
        q.assetCode
          ? `Matched Asset.code = "${q.assetCode}" exactly against ${formatNumber(s.assets.length)} authorised records.`
          : `Matched the asset by name against ${formatNumber(s.assets.length)} authorised records.`,
        `Joined ${formatNumber(wos.length)} work orders on WorkOrder.assetId, ${formatNumber(units.length)} units and ${formatNumber(leases.length)} leases on assetId.`,
        'Financial fields (acquisition cost, NBV, revenue and opex YTD) are read directly from the asset record — nothing is re-derived.',
        'The risk score re-runs analytics.riskRegister() for this single asset so it matches the register exactly.',
        scopeSentence(s),
      ],
      sources: [
        src('Assets', 1),
        src('Work orders', wos.length),
        src('Property units', units.length),
        src('Leases', leases.length),
      ],
      followUps: [
        'Show the risk register',
        'Which insurance policies expire soon?',
        'What are our highest value assets?',
      ],
    }
  },
}

/* ---------- 23. Data quality --------------------------------------- */

const dataQualityIntent: IntentDef = {
  id: 'portfolio.dataquality',
  label: 'Register data quality',
  theme: 'Risk & Compliance',
  cues: [
    { terms: ['data quality', 'data completeness', 'incomplete records', 'missing data', 'record quality'], weight: 9 },
    { terms: ['complete', 'completeness', 'incomplete', 'gaps', 'missing fields', 'how clean'], weight: 6 },
    { terms: ['quality', 'clean data'], weight: 3 },
    { terms: ['register', 'registry', 'record', 'records'], weight: 2 },
  ],
  examples: ['How complete is our asset register?', 'Which records have poor data quality?', 'Show data completeness by category'],
  run: (q, s) => {
    const { rows } = filterAssets(q, s.assets)
    const dq = dataQualitySummary(rows)
    const worst = rows.slice().sort((a, b) => a.dataQualityScore - b.dataQualityScore).slice(0, 12)
    const noTitle = rows.filter((a) => !a.landTitle).length
    const noInsurance = rows.filter((a) => !a.insurance).length
    const noInspection = rows.filter((a) => !a.nextInspection).length
    const noEsg = rows.filter((a) => !a.esg).length

    return {
      kind: 'metric',
      headline: formatPct(dq.avgScore),
      headlineLabel: 'Average record completeness',
      headlineTone: dq.avgScore >= 85 ? 'positive' : 'warning',
      narrative:
        `The register scores ${formatPct(dq.avgScore)} for completeness across ${formatNumber(rows.length)} assets. ` +
        `${formatNumber(dq.complete)} records are complete (90%+), ${formatNumber(dq.needsAttention)} need attention (60–89%) and ${formatNumber(dq.incomplete)} are materially incomplete (below 60%). ` +
        `The commonest gaps are missing ESG telemetry (${formatNumber(noEsg)} records), no insurance policy (${formatNumber(noInsurance)}), ` +
        `no scheduled inspection (${formatNumber(noInspection)}) and no land title on file (${formatNumber(noTitle)}). ` +
        `Closing the insurance and title gaps should be the first priority — both carry legal as well as reporting consequences.`,
      metrics: [
        { label: 'Complete (90%+)', value: formatNumber(dq.complete), tone: 'positive' },
        { label: 'Needs attention', value: formatNumber(dq.needsAttention), tone: 'warning' },
        { label: 'Incomplete (<60%)', value: formatNumber(dq.incomplete), tone: 'critical' },
        { label: 'No insurance on file', value: formatNumber(noInsurance), tone: 'critical' },
      ],
      chart: {
        type: 'bar',
        title: 'Records by completeness band',
        data: [
          { name: 'Complete (90%+)', count: dq.complete },
          { name: 'Attention (60–89%)', count: dq.needsAttention },
          { name: 'Incomplete (<60%)', count: dq.incomplete },
        ],
        xKey: 'name',
        series: [{ key: 'count', label: 'Assets', color: CHART[1] }],
        format: 'number',
        height: 'h-[220px]',
      },
      table: {
        columns: [
          { key: 'code', label: 'Code', mono: true },
          { key: 'asset', label: 'Asset' },
          { key: 'zone', label: 'Zone' },
          { key: 'score', label: 'Data quality', align: 'right' },
          { key: 'gaps', label: 'Missing' },
        ],
        rows: worst.map((a) => ({
          code: a.code,
          asset: a.name,
          zone: zoneShort(a.location.zone),
          score: formatPct(a.dataQualityScore, 0),
          gaps:
            [
              a.landTitle ? '' : 'land title',
              a.insurance ? '' : 'insurance',
              a.nextInspection ? '' : 'inspection date',
              a.esg ? '' : 'ESG telemetry',
              a.documents.length > 0 ? '' : 'documents',
            ]
              .filter(Boolean)
              .join(', ') || 'minor field gaps',
        })),
        csvName: 'kdh-data-quality-gaps',
        link: { label: 'Open Asset Registry', to: '/registry' },
      },
      working: [
        `analytics.dataQualitySummary() over ${formatNumber(rows.length)} authorised assets, using the Asset.dataQualityScore held on each record.`,
        'Bands: complete ≥ 90, needs attention 60–89, incomplete < 60.',
        'The "missing" column is computed live by testing for the presence of landTitle, insurance, nextInspection, esg and documents on each record.',
        'No score is estimated — every figure is a count of real records.',
        scopeSentence(s),
      ],
      sources: [src('Assets', rows.length)],
      followUps: ['Show the risk register', 'Which insurance policies expire soon?', 'How many assets do we have by category?'],
    }
  },
}

/* ================================================================== */
/* Registry + matcher                                                  */
/* ================================================================== */

export const INTENTS: readonly IntentDef[] = [
  portfolioValueIntent,
  portfolioBreakdownIntent,
  conditionIntent,
  topValueIntent,
  topRevenueIntent,
  occupancyIntent,
  vacancyIntent,
  arrearsIntent,
  leaseExpiryIntent,
  collectionIntent,
  rentRollIntent,
  workOrderIntent,
  slaIntent,
  spendIntent,
  technicianIntent,
  vendorIntent,
  insuranceIntent,
  inspectionIntent,
  esgIntent,
  riskIntent,
  zoneCompareIntent,
  assetLookupIntent,
  dataQualityIntent,
]

const MATCH_THRESHOLD = 5

export interface IntentScore {
  intent: IntentDef
  score: number
}

/** Scores every intent against the question. Exported for the fallback UI. */
export function scoreIntents(q: ParsedQuery): IntentScore[] {
  return INTENTS.map((intent) => {
    let score = 0
    for (const cue of intent.cues) {
      const matched = cue.all ? cue.terms.every((t) => hasTerm(q.norm, t)) : hasAny(q.norm, cue.terms)
      if (matched) score += cue.weight
    }
    for (const cue of intent.penalties ?? []) {
      if (hasAny(q.norm, cue.terms)) score -= cue.weight
    }
    score += intent.boost ? intent.boost(q) : 0
    return { intent, score }
  }).sort((a, b) => b.score - a.score)
}

function fallbackAnswer(q: ParsedQuery, s: CopilotScope, ranked: IntentScore[]): CopilotAnswer {
  const near = ranked.filter((r) => r.score > 0).slice(0, 3)
  const suggestions =
    near.length > 0
      ? near.map((r) => r.intent.examples[0])
      : [
          'What is the total portfolio value?',
          'Which leases expire in the next 90 days?',
          'How many work orders have breached SLA?',
        ]

  return {
    kind: 'fallback',
    intent: 'fallback',
    intentLabel: 'No confident match',
    narrative:
      `I could not map "${q.raw.trim()}" onto a question I can answer from the authorised records with confidence, and I will not estimate a figure I cannot derive. ` +
      `I currently reason over ${formatNumber(s.assets.length)} assets, ${formatNumber(s.units.length)} property units, ${formatNumber(s.leases.length)} leases, ` +
      `${formatNumber(s.payments.length)} payment records, ${formatNumber(s.workOrders.length)} work orders, ${formatNumber(s.vendors.length)} contractors and ${formatNumber(s.technicians.length)} technicians. ` +
      `Try one of the suggestions below, or rephrase using a metric name such as portfolio value, occupancy, arrears, SLA, insurance or ESG.`,
    facts: [
      { label: 'Portfolio', value: 'value, net book value, counts, breakdowns, condition, risk, ESG, data quality' },
      { label: 'Property & revenue', value: 'occupancy, vacancy, rent roll, arrears, collections, lease expiries' },
      { label: 'Maintenance', value: 'open and breached work orders, SLA and MTTR, spend vs budget, technicians, vendors' },
      { label: 'Compliance', value: 'insurance renewals, statutory inspections, risk register' },
    ],
    working: [
      'Scored the question against 23 registered intents using weighted keyword and synonym cues.',
      `The best match scored ${formatNumber(Math.max(0, ranked[0]?.score ?? 0))}, below the confidence threshold of ${formatNumber(MATCH_THRESHOLD)}.`,
      'Rather than return an approximate figure, the engine declines and offers the nearest answerable questions.',
      scopeSentence(s),
    ],
    sources: [
      src('Assets', s.assets.length),
      src('Leases', s.leases.length),
      src('Work orders', s.workOrders.length),
    ],
    followUps: suggestions,
    confidence: Math.max(0, Math.round(((ranked[0]?.score ?? 0) / MATCH_THRESHOLD) * 40)),
  }
}

/**
 * Main entry point. Deterministic: the same question against the same data
 * always produces the same answer.
 */
export function answerQuestion(question: string, scope: CopilotScope): CopilotAnswer {
  const q = parseQuery(question, scope.now)
  const ranked = scoreIntents(q)
  const best = ranked[0]

  if (!best || best.score < MATCH_THRESHOLD) return fallbackAnswer(q, scope, ranked)

  const body = best.intent.run(q, scope)
  const spread = best.score - (ranked[1]?.score ?? 0)
  const confidence = Math.min(99, Math.round(58 + best.score * 2.4 + Math.min(12, spread * 1.6)))

  return {
    ...body,
    intent: best.intent.id,
    intentLabel: best.intent.label,
    confidence,
  }
}

/** Every registered intent as a themed example — powers the suggestion chips. */
export function intentExamples(): { theme: IntentDef['theme']; label: string; question: string }[] {
  return INTENTS.map((i) => ({ theme: i.theme, label: i.label, question: i.examples[0] }))
}
