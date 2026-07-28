/**
 * Executive dashboard derivation layer.
 *
 * One pure builder takes the raw store arrays plus the two page filters (zone,
 * period) and returns every number the screen renders. Keeping it pure means the
 * KPI tiles, the charts, the panels and the exported board pack are all reading the
 * same arithmetic — nothing on the page is computed twice or computed differently.
 *
 * Everything that can be reused from `@/lib/analytics` is reused. What is added here
 * is strictly the *period* dimension the analytics layer does not model: as-of
 * snapshots (portfolio value, NBV, occupancy) and prior-window comparisons that make
 * the KPI deltas real rather than decorative.
 */

import { daysUntil, formatMYRCompact, formatNumber } from '@/lib/format'
import {
  arrearsSummary,
  collectionRate,
  conditionDistribution,
  esgSummary,
  expiringInsurance,
  expiringLeases,
  isLiveLease,
  isOpenWorkOrder,
  leaseExpiryPipeline,
  maintenanceSpendVsBudget,
  occupancySummary,
  portfolioSummary,
  revenueVsTarget,
  riskRegister,
  topRevenueAssets,
  upcomingInspections,
  valueByCategory,
  workOrderSummary,
  zonePerformance,
  type ArrearsSummary,
  type ConditionSlice,
  type EsgSummary,
  type ExpiryBucket,
  type InsuranceExpiry,
  type InspectionDue,
  type PortfolioSummary,
  type RiskRow,
  type SpendVsBudgetPoint,
  type RevenueVsTargetPoint,
  type CategoryValue,
  type AssetRevenueRow,
  type WorkOrderSummary,
  type ZonePerformanceRow,
} from '@/lib/analytics'
import {
  ZONES,
  type Asset,
  type Lease,
  type MonthlyFinancial,
  type Payment,
  type PropertyUnit,
  type WorkOrder,
  type Zone,
} from '@/lib/types'

/* ================================================================== */
/* Filter vocabulary                                                   */
/* ================================================================== */

export const DASHBOARD_PERIODS = [
  { key: 'month', label: 'Bulan Ini', english: 'This Month', short: 'MTD' },
  { key: 'quarter', label: 'Suku Tahun Ini', english: 'This Quarter', short: 'QTD' },
  { key: 'ytd', label: 'Tahun Hingga Kini', english: 'Year to Date', short: 'YTD' },
  { key: 't12m', label: '12 Bulan Terakhir', english: 'Trailing 12 Months', short: 'T12M' },
] as const

export type PeriodKey = (typeof DASHBOARD_PERIODS)[number]['key']
export type ZoneFilter = 'all' | Zone

/** How many whole months the selected period covers, ending with the current month. */
export function periodMonths(period: PeriodKey, now: Date): number {
  switch (period) {
    case 'month':
      return 1
    case 'quarter':
      return 3
    case 'ytd':
      return now.getMonth() + 1
    case 't12m':
      return 12
  }
}

export function periodLabel(period: PeriodKey): string {
  return DASHBOARD_PERIODS.find((p) => p.key === period)?.english ?? 'Year to Date'
}

export function periodShort(period: PeriodKey): string {
  return DASHBOARD_PERIODS.find((p) => p.key === period)?.short ?? 'YTD'
}

/* ================================================================== */
/* Small numeric helpers (mirrors analytics.ts, kept private)          */
/* ================================================================== */

const MS_DAY = 86_400_000

function sum(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

function safePct(part: number, whole: number): number {
  if (!whole || !Number.isFinite(whole)) return 0
  const r = (part / whole) * 100
  return Number.isFinite(r) ? Math.round(r * 10) / 10 : 0
}

/**
 * Percentage change from `prev` to `curr`, or `undefined` when the prior window has no
 * comparable base. Returning `undefined` matters: `KpiCard` then draws no delta chip at
 * all, which is honest, rather than a "0.0%" that reads as "no movement".
 */
function delta(curr: number, prev: number): number | undefined {
  if (!prev || !Number.isFinite(prev) || !Number.isFinite(curr)) return undefined
  const r = ((curr - prev) / Math.abs(prev)) * 100
  if (!Number.isFinite(r)) return undefined
  // Clamp so a tiny base cannot render an absurd "+41,800%" chip on the board deck.
  return Math.max(-999, Math.min(999, Math.round(r * 10) / 10))
}

/** First instant of the month `back` months before the month containing `now`. */
function monthStart(now: Date, back: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - back, 1)
}

/**
 * Distance in months, fractional. Whole-month granularity would make every "This
 * Month" comparison collapse to zero — the window starts on the 1st, so an integer
 * difference is 0 and the tile would claim nothing had moved all month.
 */
const MS_MONTH = 30.436875 * MS_DAY
function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_MONTH
}

/* ================================================================== */
/* Zone scoping                                                        */
/* ================================================================== */

export interface ScopedData {
  assets: Asset[]
  workOrders: WorkOrder[]
  units: PropertyUnit[]
  leases: Lease[]
  payments: Payment[]
  /**
   * Monthly roll-ups apportioned to the selected zone by its share of live contracted
   * rent. The seed only models group-level financials, so this is the honest way to
   * put a zone slice on the same trend chart — and it is labelled as apportioned
   * wherever it is drawn.
   */
  financials: MonthlyFinancial[]
  /** 1 for "All Zones"; the apportionment factor otherwise. */
  zoneShare: number
}

/**
 * Narrow every array to a set of zones and apportion the group financial roll-ups by
 * that set's share of live contracted rent.
 *
 * Applied twice by the builder: once for the signed-in role's RBAC scope, then again
 * for the zone the user picked in the filter row. Composing it is safe because the
 * second pass measures its share against the leases the first pass already kept, so
 * share(zone | rbac) x share(rbac | group) = share(zone | group).
 *
 * `null` means "no narrowing" and returns the inputs untouched with a share of 1.
 */
function scopeToZones(
  zones: Zone[] | null,
  assets: Asset[],
  workOrders: WorkOrder[],
  units: PropertyUnit[],
  leases: Lease[],
  payments: Payment[],
  financials: MonthlyFinancial[],
): ScopedData {
  if (zones === null || zones.length >= ZONES.length) {
    return { assets, workOrders, units, leases, payments, financials, zoneShare: 1 }
  }

  const allowed = new Set<Zone>(zones)
  const zoneLeases = leases.filter((l) => allowed.has(l.zone))
  const leaseIds = new Set(zoneLeases.map((l) => l.id))
  const groupRent = sum(leases.filter(isLiveLease).map((l) => l.monthlyRent))
  const zoneRent = sum(zoneLeases.filter(isLiveLease).map((l) => l.monthlyRent))
  const zoneShare = groupRent > 0 ? zoneRent / groupRent : 0

  return {
    assets: assets.filter((a) => allowed.has(a.location.zone)),
    workOrders: workOrders.filter((w) => allowed.has(w.zone)),
    units: units.filter((u) => allowed.has(u.zone)),
    leases: zoneLeases,
    payments: payments.filter((p) => leaseIds.has(p.leaseId)),
    financials: financials.map((m) => ({
      ...m,
      revenue: Math.round(m.revenue * zoneShare),
      target: Math.round(m.target * zoneShare),
      collections: Math.round(m.collections * zoneShare),
      opex: Math.round(m.opex * zoneShare),
      maintenanceSpend: Math.round(m.maintenanceSpend * zoneShare),
      maintenanceBudget: Math.round(m.maintenanceBudget * zoneShare),
    })),
    zoneShare,
  }
}

/* ================================================================== */
/* As-of snapshots — what makes the KPI deltas real                    */
/* ================================================================== */

/**
 * Portfolio value at `cutoff`: assets already acquired by then, each walked back along
 * its own realised value curve. The monthly factor is implied by how far the asset has
 * moved from acquisition cost to today's valuation over the months it has been held,
 * clamped to a sane band so a freak record cannot distort the group figure.
 */
function valueAsOf(assets: Asset[], cutoff: Date, now: Date): number {
  const t = cutoff.getTime()
  const back = Math.max(0, monthsBetween(cutoff, now))
  if (back <= 0) return sum(assets.map((a) => a.currentValue))

  return sum(
    assets
      .filter((a) => new Date(a.acquisitionDate).getTime() < t)
      .map((a) => {
        const held = Math.max(1, monthsBetween(new Date(a.acquisitionDate), now))
        if (a.acquisitionCost <= 0 || a.currentValue <= 0) return a.currentValue
        const raw = (a.currentValue / a.acquisitionCost) ** (1 / held)
        // 0.5%/month either way covers everything from a depreciating plant item to a
        // fast-appreciating Desaru land parcel without letting outliers run away.
        const monthly = Math.min(1.005, Math.max(0.995, raw))
        return a.currentValue / monthly ** back
      }),
  )
}

/**
 * Net book value at `cutoff`, walking depreciation back at the asset's own average
 * monthly rate (accumulated depreciation spread over the months it has been held).
 */
function nbvAsOf(assets: Asset[], cutoff: Date, now: Date): number {
  const t = cutoff.getTime()
  const back = Math.max(0, monthsBetween(cutoff, now))
  return sum(
    assets
      .filter((a) => new Date(a.acquisitionDate).getTime() < t)
      .map((a) => {
        const held = Math.max(1, monthsBetween(new Date(a.acquisitionDate), now))
        const monthly = a.accumulatedDepreciation / held
        return a.netBookValue + monthly * back
      }),
  )
}

/**
 * Point-in-time occupancy straight from the lease book: distinct units under a lease
 * that had commenced and had not yet ended at `cutoff`. Reading the book rather than
 * today's unit flags is what makes the comparison symmetric — leases that have since
 * expired still count towards the past, which a naive "today minus new lettings"
 * calculation silently drops (and so overstates every improvement).
 */
function occupiedAsOf(leases: Lease[], cutoff: Date): number {
  const t = cutoff.getTime()
  const occupied = new Set<string>()
  for (const l of leases) {
    if (l.status === 'Draft') continue
    const start = new Date(l.startDate).getTime()
    const end = new Date(l.endDate).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && start <= t && end > t) occupied.add(l.unitId)
  }
  return occupied.size
}

/**
 * SLA compliance for outcomes *settled* inside a window. A ticket's outcome date is its
 * completion, or its SLA deadline if it is still open and already breached — measuring
 * by raise date instead would judge a period by tickets that have not finished yet, and
 * because breaches land fast it biases recent months downwards.
 */
function slaComplianceInWindow(workOrders: WorkOrder[], from: Date, to: Date): number {
  const a = from.getTime()
  const b = to.getTime()
  const rows = workOrders.filter((w) => {
    if (w.slaStatus !== 'Met' && w.slaStatus !== 'Breached') return false
    const t = new Date(w.completedAt ?? w.slaDueAt).getTime()
    return Number.isFinite(t) && t >= a && t < b
  })
  return safePct(rows.filter((w) => w.slaStatus === 'Met').length, rows.length)
}

/* ================================================================== */
/* KPI shapes                                                          */
/* ================================================================== */

export interface HeroKpi {
  key: string
  label: string
  value: number
  /** Pre-formatted display string — the builder owns formatting decisions. */
  display: string
  sublabel: string
  /** Undefined when the prior window offers no comparable base — the chip is then omitted. */
  delta?: number
  spark: number[]
  /** Route the tile navigates to. */
  href: string
  intent: 'default' | 'positive' | 'warning' | 'critical'
}

export interface SecondaryMetric {
  key: string
  label: string
  display: string
  detail: string
  href: string
  tone: 'positive' | 'warning' | 'critical' | 'neutral' | 'info'
}

export interface AttentionItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  category: string
  title: string
  detail: string
  /** Sort key — smaller is more urgent (days overdue render negative). */
  urgency: number
  /** Human-readable urgency, e.g. "6 hari lewat". */
  urgencyLabel: string
  amount?: number
  href: string
}

export interface ArrearsBucketRow {
  key: string
  label: string
  amount: number
  share: number
  critical: boolean
}

export interface DashboardData {
  scope: ScopedData
  windowMonths: number
  /** ISO-ish label for the exported pack, e.g. "Aug 2025 – Jul 2026". */
  windowLabel: string

  portfolio: PortfolioSummary
  occupancy: ReturnType<typeof occupancySummary>
  workOrders: WorkOrderSummary
  arrears: ArrearsSummary
  esg: EsgSummary

  heroKpis: HeroKpi[]
  secondary: SecondaryMetric[]
  /** Full count before the feed is truncated for display. */
  attentionTotal: number

  revenueSeries: RevenueVsTargetPoint[]
  maintenanceSeries: SpendVsBudgetPoint[]
  categoryValues: CategoryValue[]
  conditions: ConditionSlice[]
  zoneRows: ZonePerformanceRow[]

  attention: AttentionItem[]
  expiryPipeline: ExpiryBucket[]
  topRevenue: AssetRevenueRow[]
  arrearsBuckets: ArrearsBucketRow[]
  risks: RiskRow[]

  inspectionsDue: InspectionDue[]
  insuranceDue: InsuranceExpiry[]

  /** Rows handed straight to `downloadCsv` for the board pack. */
  exportRows: Record<string, unknown>[]
}

/* ================================================================== */
/* The builder                                                         */
/* ================================================================== */

export interface BuildDashboardInput {
  assets: Asset[]
  workOrders: WorkOrder[]
  units: PropertyUnit[]
  leases: Lease[]
  payments: Payment[]
  monthlyFinancials: MonthlyFinancial[]
  /**
   * Zones the signed-in role is permitted to see. Everything is narrowed to this set
   * *before* the zone filter is applied, so "Semua Zon" means "every zone this role can
   * see" — matching Registry, Property, Maintenance and the GIS map, which all scope by
   * `visibleZones(user)`. Omit for group-wide scope.
   */
  allowedZones?: Zone[]
  zone: ZoneFilter
  period: PeriodKey
  now?: Date
}

export function buildDashboard({
  assets,
  workOrders,
  units,
  leases,
  payments,
  monthlyFinancials,
  allowedZones,
  zone,
  period,
  now = new Date(),
}: BuildDashboardInput): DashboardData {
  /* RBAC scope first, then the user's zone filter within it. */
  const rbac = scopeToZones(
    allowedZones ?? null,
    assets,
    workOrders,
    units,
    leases,
    payments,
    monthlyFinancials,
  )
  const picked = scopeToZones(
    zone === 'all' ? null : [zone],
    rbac.assets,
    rbac.workOrders,
    rbac.units,
    rbac.leases,
    rbac.payments,
    rbac.financials,
  )
  const scope: ScopedData = { ...picked, zoneShare: rbac.zoneShare * picked.zoneShare }
  const windowMonths = Math.max(1, periodMonths(period, now))

  /* ---- financial windows ------------------------------------------------ */
  const allMonths = revenueVsTarget(scope.financials)
  const curr = allMonths.slice(-windowMonths)
  const prev = allMonths.slice(-(windowMonths * 2), -windowMonths)
  const windowLabel =
    curr.length > 0
      ? `${curr[0].label} ${curr[0].period.slice(0, 4)} – ${curr[curr.length - 1].label} ${curr[curr.length - 1].period.slice(0, 4)}`
      : '—'

  /* Charts always show a full 12 months for shape; the window is highlighted. */
  const revenueSeries = allMonths.slice(-12)
  const maintenanceSeries = maintenanceSpendVsBudget(scope.financials).slice(-12)

  /* ---- core analytics --------------------------------------------------- */
  const portfolio = portfolioSummary(scope.assets)
  const occupancy = occupancySummary(scope.units)
  const woSummary = workOrderSummary(scope.workOrders, now)
  const arrears = arrearsSummary(scope.leases, 6)
  const esg = esgSummary(scope.assets)
  const categoryValues = valueByCategory(scope.assets)
  const conditions = conditionDistribution(scope.assets)
  /* Deliberately built from the RBAC scope, not the picked zone: the comparison table
     must still show every zone the role may see when one zone is filtered in. */
  const zoneRows = zonePerformance(rbac.assets, rbac.leases, rbac.units, rbac.workOrders)
  const expiryPipeline = leaseExpiryPipeline(scope.leases, now)
  const topRevenue = topRevenueAssets(scope.assets, 8)
  const risks = riskRegister(scope.assets, scope.workOrders, 6, now)
  const inspectionsDue = upcomingInspections(scope.assets, 30, now)
  const insuranceDue = expiringInsurance(scope.assets, 60, now)

  /* ---- as-of boundaries ------------------------------------------------- */
  const windowStart = monthStart(now, windowMonths - 1)
  const priorStart = monthStart(now, windowMonths * 2 - 1)

  /* ---- hero KPI 1: total portfolio value -------------------------------- */
  const valueNow = portfolio.totalCurrentValue
  const valuePrior = valueAsOf(scope.assets, windowStart, now)
  const valueSpark = Array.from({ length: 12 }, (_, i) =>
    valueAsOf(scope.assets, monthStart(now, 11 - i), now),
  )
  valueSpark[11] = valueNow

  /* ---- hero KPI 2: net book value --------------------------------------- */
  const nbvNow = portfolio.totalNbv
  const nbvPrior = nbvAsOf(scope.assets, windowStart, now)
  const nbvSpark = Array.from({ length: 12 }, (_, i) => nbvAsOf(scope.assets, monthStart(now, 11 - i), now))
  nbvSpark[11] = nbvNow

  /* ---- hero KPI 3: rental revenue --------------------------------------- */
  const revenueCurr = sum(curr.map((m) => m.revenue))
  const revenuePrior = sum(prev.map((m) => m.revenue))
  const targetCurr = sum(curr.map((m) => m.target))

  /* ---- hero KPI 4: collection rate -------------------------------------- */
  const priorNow = new Date(windowStart.getTime() - MS_DAY)
  const collCurr = collectionRate(scope.payments, windowMonths, now)
  const collPrior = collectionRate(scope.payments, windowMonths, priorNow)
  const collSpark = Array.from({ length: 12 }, (_, i) => {
    const m = revenueSeries[i]
    return m ? safePct(m.collections, m.revenue) : 0
  })

  /* ---- hero KPI 5: occupancy --------------------------------------------
   * Headline comes from the unit register (the authoritative "now"); the movement is
   * measured lease-book against lease-book so both sides of the comparison are
   * calculated the same way. */
  const occNow = occupancy.occupancyRate
  const unitCount = scope.units.length
  const occBookNow = safePct(occupiedAsOf(scope.leases, now), unitCount)
  const occBookPrior = safePct(occupiedAsOf(scope.leases, windowStart), unitCount)
  const occSpark = Array.from({ length: 12 }, (_, i) =>
    safePct(occupiedAsOf(scope.leases, monthStart(now, 11 - i)), unitCount),
  )

  /* ---- hero KPI 6: SLA compliance ----------------------------------------
   * Same treatment as occupancy: the headline is the standing book figure from
   * `analytics.workOrderSummary()` — the identical number the Maintenance page and the
   * Copilot quote — so the KPI never contradicts itself across screens. The movement is
   * measured window against window, both sides computed the same way. */
  const slaNow = woSummary.slaCompliancePct
  const slaCurr = slaComplianceInWindow(scope.workOrders, windowStart, now)
  const slaPrior = slaComplianceInWindow(scope.workOrders, priorStart, windowStart)
  const slaSpark = Array.from({ length: 6 }, (_, i) =>
    slaComplianceInWindow(scope.workOrders, monthStart(now, 5 - i), monthStart(now, 4 - i)),
  )

  const heroKpis: HeroKpi[] = [
    {
      key: 'portfolio-value',
      label: 'Nilai Portfolio',
      value: valueNow,
      display: compactMyr(valueNow),
      sublabel: `${portfolio.totalAssets} aset · kos perolehan ${compactMyr(portfolio.totalAcquisitionCost)}`,
      delta: delta(valueNow, valuePrior),
      spark: valueSpark,
      href: '/registry',
      intent: 'default',
    },
    {
      key: 'nbv',
      label: 'Nilai Buku Bersih',
      value: nbvNow,
      display: compactMyr(nbvNow),
      sublabel: `Susut nilai terkumpul ${compactMyr(portfolio.totalAccumulatedDepreciation)}`,
      delta: delta(nbvNow, nbvPrior),
      spark: nbvSpark,
      href: '/registry',
      intent: 'default',
    },
    {
      key: 'revenue',
      label: `Hasil Sewaan ${periodShort(period)}`,
      value: revenueCurr,
      display: compactMyr(revenueCurr),
      sublabel: `${safePct(revenueCurr, targetCurr).toFixed(1)}% daripada sasaran ${compactMyr(targetCurr)}`,
      delta: delta(revenueCurr, revenuePrior),
      spark: revenueSeries.map((m) => m.revenue),
      href: '/property',
      intent: revenueCurr >= targetCurr ? 'positive' : 'warning',
    },
    {
      key: 'collection',
      label: 'Kadar Kutipan',
      value: collCurr,
      display: `${collCurr.toFixed(1)}%`,
      sublabel: `Tunggakan terkumpul ${compactMyr(arrears.totalOutstanding)}`,
      delta: delta(collCurr, collPrior),
      spark: collSpark,
      href: '/property',
      intent: collCurr >= 95 ? 'positive' : collCurr >= 90 ? 'warning' : 'critical',
    },
    {
      key: 'occupancy',
      label: 'Kadar Penghunian',
      value: occNow,
      display: `${occNow.toFixed(1)}%`,
      sublabel: `${occupancy.occupied} daripada ${occupancy.total} unit disewa`,
      delta: delta(occBookNow, occBookPrior),
      spark: occSpark,
      href: '/property',
      intent: occNow >= 90 ? 'positive' : occNow >= 80 ? 'warning' : 'critical',
    },
    {
      key: 'sla',
      label: 'Pematuhan SLA',
      value: slaNow,
      display: `${slaNow.toFixed(1)}%`,
      sublabel: `${woSummary.overdue} tiket melepasi SLA · purata ${woSummary.avgResolutionHours.toFixed(0)} jam`,
      delta: delta(slaCurr, slaPrior),
      spark: slaSpark,
      href: '/maintenance',
      intent: slaNow >= 92 ? 'positive' : slaNow >= 85 ? 'warning' : 'critical',
    },
  ]

  /* ---- secondary strip --------------------------------------------------- */
  const expiring90 = expiringLeases(scope.leases, 90, now)
  const inspectionsOverdue = inspectionsDue.filter((r) => r.overdue).length
  const insuranceExpired = insuranceDue.filter((r) => r.expired).length

  const secondary: SecondaryMetric[] = [
    {
      key: 'assets',
      label: 'Jumlah Aset',
      display: intFmt(portfolio.totalAssets),
      detail: `${categoryValues.length} kategori`,
      href: '/registry',
      tone: 'neutral',
    },
    {
      key: 'open-wo',
      label: 'Arahan Kerja Terbuka',
      display: intFmt(woSummary.open),
      detail: `${woSummary.inProgress} sedang dijalankan`,
      href: '/maintenance',
      tone: woSummary.open > 0 ? 'info' : 'positive',
    },
    {
      key: 'overdue-wo',
      label: 'SLA Dilanggar',
      display: intFmt(woSummary.overdue),
      detail: woSummary.overdue > 0 ? 'Perlu tindakan segera' : 'Tiada pelanggaran',
      href: '/maintenance?sla=Breached',
      tone: woSummary.overdue > 0 ? 'critical' : 'positive',
    },
    {
      key: 'expiring',
      label: 'Sewaan Tamat 90 Hari',
      display: intFmt(expiring90.length),
      detail: `${compactMyr(sum(expiring90.map((l) => l.monthlyRent)))} sebulan berisiko`,
      href: '/property?status=Expiring+Soon',
      tone: expiring90.length > 0 ? 'warning' : 'positive',
    },
    {
      key: 'arrears',
      label: 'Jumlah Tunggakan',
      display: compactMyr(arrears.totalOutstanding),
      detail: `${arrears.accountsInArrears} akaun · ${arrears.arrearsRatePct.toFixed(1)}% hasil tahunan`,
      href: '/property',
      tone: arrears.arrearsRatePct > 3 ? 'critical' : arrears.totalOutstanding > 0 ? 'warning' : 'positive',
    },
    {
      key: 'condition',
      label: 'Purata Keadaan Aset',
      display: `${portfolio.avgConditionScore.toFixed(1)}`,
      detail: 'Skor keadaan 0–100',
      href: '/registry',
      tone: portfolio.avgConditionScore >= 75 ? 'positive' : portfolio.avgConditionScore >= 60 ? 'warning' : 'critical',
    },
    {
      key: 'inspections',
      label: 'Pemeriksaan Perlu Dibuat',
      display: intFmt(inspectionsDue.length),
      detail: inspectionsOverdue > 0 ? `${inspectionsOverdue} sudah lewat` : 'Dalam tempoh 30 hari',
      href: '/maintenance',
      tone: inspectionsOverdue > 0 ? 'critical' : inspectionsDue.length > 0 ? 'warning' : 'positive',
    },
    {
      key: 'insurance',
      label: 'Insurans Tamat 60 Hari',
      display: intFmt(insuranceDue.length),
      detail: insuranceExpired > 0 ? `${insuranceExpired} sudah tamat` : `Nilai dilindungi ${compactMyr(sum(insuranceDue.map((r) => r.sumInsured)))}`,
      href: '/registry',
      tone: insuranceExpired > 0 ? 'critical' : insuranceDue.length > 0 ? 'warning' : 'positive',
    },
  ]

  /* ---- attention feed ---------------------------------------------------- */
  const attention: AttentionItem[] = []

  for (const w of scope.workOrders.filter((x) => isOpenWorkOrder(x) && x.slaStatus === 'Breached')) {
    const late = Math.max(0, Math.round((now.getTime() - new Date(w.slaDueAt).getTime()) / MS_DAY))
    attention.push({
      id: `wo-${w.id}`,
      severity: 'critical',
      category: 'SLA',
      title: `${w.code} · ${w.title}`,
      detail: `${w.assetName} (${w.assetCode}) · ${w.priority} · ${w.assignedTo}`,
      urgency: -late,
      urgencyLabel: late > 0 ? `${late} hari lewat` : 'Tamat hari ini',
      amount: w.estimatedCost,
      href: `/maintenance?wo=${w.id}`,
    })
  }

  for (const l of scope.leases.filter((x) => x.ageing.d90plus > 0 || x.noticeStage === 'Legal Action')) {
    attention.push({
      id: `lease-${l.id}`,
      severity: 'critical',
      category: 'Tunggakan',
      title: `${l.tenantName} · ${l.propertyName} ${l.unitNo}`,
      detail: `${l.code} · ${l.noticeStage} · tertunggak ${l.daysOverdue} hari`,
      urgency: -l.daysOverdue,
      urgencyLabel: `${l.daysOverdue} hari`,
      amount: l.outstandingAmount,
      href: `/property?lease=${l.id}`,
    })
  }

  for (const l of scope.leases.filter(
    (x) => x.outstandingAmount > 0 && x.ageing.d90plus === 0 && (x.noticeStage === 'Final Notice' || x.ageing.d90 > 0),
  )) {
    attention.push({
      id: `lease-w-${l.id}`,
      severity: 'warning',
      category: 'Tunggakan',
      title: `${l.tenantName} · ${l.propertyName} ${l.unitNo}`,
      detail: `${l.code} · ${l.noticeStage} · tertunggak ${l.daysOverdue} hari`,
      urgency: -l.daysOverdue,
      urgencyLabel: `${l.daysOverdue} hari`,
      amount: l.outstandingAmount,
      href: `/property?lease=${l.id}`,
    })
  }

  for (const r of insuranceDue.filter((x) => x.daysRemaining <= 30)) {
    attention.push({
      id: `ins-${r.asset.id}`,
      severity: r.expired ? 'critical' : 'warning',
      category: 'Insurans',
      title: `${r.asset.name} · polisi ${r.policyNo}`,
      detail: `${r.insurer} · jumlah dilindungi ${compactMyr(r.sumInsured)} · ${r.asset.location.zone}`,
      urgency: r.daysRemaining,
      urgencyLabel: r.expired ? `Tamat ${Math.abs(r.daysRemaining)} hari lalu` : `${r.daysRemaining} hari lagi`,
      amount: r.sumInsured,
      href: `/registry?asset=${r.asset.id}`,
    })
  }

  for (const r of inspectionsDue.filter((x) => x.overdue)) {
    attention.push({
      id: `insp-${r.asset.id}`,
      severity: r.asset.criticality === 'Critical' ? 'critical' : 'warning',
      category: 'Pemeriksaan',
      title: `${r.asset.name} (${r.asset.code})`,
      detail: `Pemeriksaan berkanun tertunggak · ${r.asset.criticality} · ${r.asset.location.town}`,
      urgency: r.daysRemaining,
      urgencyLabel: `${Math.abs(r.daysRemaining)} hari lewat`,
      href: `/registry?asset=${r.asset.id}`,
    })
  }

  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }
  attention.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.urgency - b.urgency,
  )
  /* The queue is for triage, not archaeology — the tail lives on the owning screen. */
  const attentionTop = attention.slice(0, 40)

  /* ---- arrears ageing buckets -------------------------------------------- */
  const ag = arrears.ageing
  const ageTotal = ag.current + ag.d30 + ag.d60 + ag.d90 + ag.d90plus
  const arrearsBuckets: ArrearsBucketRow[] = [
    { key: 'current', label: 'Semasa', amount: ag.current, share: safePct(ag.current, ageTotal), critical: false },
    { key: 'd30', label: '1–30 hari', amount: ag.d30, share: safePct(ag.d30, ageTotal), critical: false },
    { key: 'd60', label: '31–60 hari', amount: ag.d60, share: safePct(ag.d60, ageTotal), critical: false },
    { key: 'd90', label: '61–90 hari', amount: ag.d90, share: safePct(ag.d90, ageTotal), critical: false },
    { key: 'd90plus', label: 'Melebihi 90 hari', amount: ag.d90plus, share: safePct(ag.d90plus, ageTotal), critical: true },
  ]

  /* ---- board pack export -------------------------------------------------- */
  const scopeLabel = zone === 'all' ? 'All Zones' : zone
  const stamp = (metric: string, value: string, basis: string) => ({
    Section: '',
    Metric: metric,
    Value: value,
    Basis: basis,
    Scope: scopeLabel,
    Period: periodLabel(period),
    Window: windowLabel,
  })

  const exportRows: Record<string, unknown>[] = [
    { ...stamp('Total Portfolio Value', String(Math.round(valueNow)), 'Sum of current valuation'), Section: 'Portfolio' },
    { ...stamp('Net Book Value', String(Math.round(nbvNow)), 'Cost less accumulated depreciation'), Section: 'Portfolio' },
    { ...stamp('Accumulated Depreciation', String(Math.round(portfolio.totalAccumulatedDepreciation)), 'Register total'), Section: 'Portfolio' },
    { ...stamp('Total Assets', String(portfolio.totalAssets), 'Active register count'), Section: 'Portfolio' },
    { ...stamp('Average Condition Score', portfolio.avgConditionScore.toFixed(1), 'Mean of asset condition scores'), Section: 'Portfolio' },
    { ...stamp('Rental Revenue', String(Math.round(revenueCurr)), 'Monthly roll-up, selected period'), Section: 'Financial' },
    { ...stamp('Revenue Target', String(Math.round(targetCurr)), 'Board target, selected period'), Section: 'Financial' },
    { ...stamp('Target Achievement %', safePct(revenueCurr, targetCurr).toFixed(1), 'Revenue / target'), Section: 'Financial' },
    { ...stamp('Collection Rate %', collCurr.toFixed(1), 'Paid / billed over period'), Section: 'Financial' },
    { ...stamp('Total Arrears', String(Math.round(arrears.totalOutstanding)), 'Outstanding across live leases'), Section: 'Financial' },
    { ...stamp('Arrears Over 90 Days', String(Math.round(ag.d90plus)), 'Oldest ageing bucket'), Section: 'Financial' },
    { ...stamp('Portfolio Occupancy %', occNow.toFixed(1), 'Occupied units / total units'), Section: 'Property' },
    { ...stamp('Occupied Units', String(occupancy.occupied), 'Unit register'), Section: 'Property' },
    { ...stamp('Vacant Units', String(occupancy.vacant), 'Unit register'), Section: 'Property' },
    { ...stamp('Vacant Lettable Area (sqft)', String(Math.round(occupancy.vacantLettableSqft)), 'Sum of vacant unit areas'), Section: 'Property' },
    { ...stamp('Leases Expiring 90 Days', String(expiring90.length), 'Live leases by end date'), Section: 'Property' },
    { ...stamp('SLA Compliance %', slaNow.toFixed(1), 'Met / resolved tickets, all time'), Section: 'Operations' },
    { ...stamp('SLA Compliance % (period)', slaCurr.toFixed(1), 'Met / resolved tickets settled in period'), Section: 'Operations' },
    { ...stamp('Open Work Orders', String(woSummary.open), 'Non-terminal statuses'), Section: 'Operations' },
    { ...stamp('SLA Breached Work Orders', String(woSummary.overdue), 'Open tickets past SLA'), Section: 'Operations' },
    { ...stamp('Average Resolution Hours', woSummary.avgResolutionHours.toFixed(1), 'Closed tickets, raise to completion'), Section: 'Operations' },
    { ...stamp('Inspections Due 30 Days', String(inspectionsDue.length), 'Next inspection date'), Section: 'Compliance' },
    { ...stamp('Insurance Expiring 60 Days', String(insuranceDue.length), 'Policy expiry date'), Section: 'Compliance' },
    { ...stamp('Assets at High Risk', String(risks.filter((r) => r.score >= 60).length), 'Composite risk score >= 60'), Section: 'Compliance' },
    { ...stamp('Total Energy (kWh/yr)', String(Math.round(esg.totalEnergyKwh)), 'Assets reporting ESG telemetry'), Section: 'ESG' },
    { ...stamp('Total Water (m3/yr)', String(Math.round(esg.totalWaterM3)), 'Assets reporting ESG telemetry'), Section: 'ESG' },
    { ...stamp('Carbon (tCO2e/yr)', esg.totalCarbonTonnes.toFixed(1), 'Assets reporting ESG telemetry'), Section: 'ESG' },
    { ...stamp('Average Green Score', esg.avgGreenScore.toFixed(1), 'Mean green score, reporting assets'), Section: 'ESG' },
    { ...stamp('Solar-Ready Assets', String(esg.solarReadyCount), 'Roof / land solar assessment'), Section: 'ESG' },
    ...zoneRows.map((z) => ({
      Section: 'Zone',
      Metric: z.zone,
      Value: String(Math.round(z.portfolioValue)),
      Basis: `Occupancy ${z.occupancyRate}% · Monthly revenue ${Math.round(z.monthlyRevenue)} · Open WO ${z.openWorkOrders} · Condition ${z.avgConditionScore}`,
      Scope: scopeLabel,
      Period: periodLabel(period),
      Window: windowLabel,
    })),
  ]

  return {
    scope,
    windowMonths,
    windowLabel,
    portfolio,
    occupancy,
    workOrders: woSummary,
    arrears,
    esg,
    heroKpis,
    secondary,
    attentionTotal: attention.length,
    revenueSeries,
    maintenanceSeries,
    categoryValues,
    conditions,
    zoneRows,
    attention: attentionTop,
    expiryPipeline,
    topRevenue,
    arrearsBuckets,
    risks,
    inspectionsDue,
    insuranceDue,
    exportRows,
  }
}

/* ================================================================== */
/* Formatters — thin aliases over the shared helpers in `@/lib/format` */
/* ================================================================== */

/** Alias kept for readability inside the builder; the money format lives in format.ts. */
const compactMyr = formatMYRCompact
const intFmt = formatNumber

/** Re-exported so panels can show "in 12 days" consistently with the rest of the app. */
export { daysUntil }
