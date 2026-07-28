/**
 * KDH One Asset — analytics & derivation layer.
 *
 * Every function here is PURE: it takes explicit arrays and returns plain data. No
 * store access, no side effects, no `Date.now()` hidden anywhere it cannot be
 * overridden. That keeps the dashboard, the property book and the AI copilot all
 * reading from the same arithmetic.
 *
 * Everything is defensive against empty input — nothing here ever divides by zero.
 */

import { daysUntil } from '@/lib/format'
import {
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  PRIORITIES,
  WO_STATUSES,
  WO_TYPES,
  ZONES,
  type ArrearsAgeing,
  type Asset,
  type AssetCategory,
  type AssetStatus,
  type Condition,
  type Criticality,
  type Lease,
  type MonthlyFinancial,
  type Payment,
  type Priority,
  type PropertyUnit,
  type Technician,
  type Vendor,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderType,
  type Zone,
} from '@/lib/types'

/* ================================================================== */
/* Small numeric guards                                                */
/* ================================================================== */

const MS_HOUR = 3_600_000
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** Division that yields 0 instead of NaN/Infinity. */
function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0
  const r = numerator / denominator
  return Number.isFinite(r) ? r : 0
}

/** Percentage that yields 0 instead of NaN. */
function pct(part: number, whole: number): number {
  return round(safeDiv(part, whole) * 100, 1)
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f
}

function mean(values: number[], dp = 1): number {
  if (values.length === 0) return 0
  return round(values.reduce((s, v) => s + v, 0) / values.length, dp)
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

/** 'YYYY-MM' key for a date. */
function periodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The last `n` month keys ending with the month containing `now`, oldest first. */
function recentPeriods(n: number, now: Date): { period: string; label: string }[] {
  const out: { period: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ period: periodKey(d), label: MONTH_SHORT[d.getMonth()] })
  }
  return out
}

/** Work orders that still consume management attention. */
const TERMINAL_STATUSES: readonly WorkOrderStatus[] = ['Closed', 'Cancelled']
export function isOpenWorkOrder(w: WorkOrder): boolean {
  return !TERMINAL_STATUSES.includes(w.status)
}

/** Leases that are contractually live (rent is being billed). */
const LIVE_LEASE_STATUSES = ['Active', 'Expiring Soon', 'Renewal In Progress'] as const
export function isLiveLease(l: Lease): boolean {
  return (LIVE_LEASE_STATUSES as readonly string[]).includes(l.status)
}

/* ================================================================== */
/* 1. Portfolio                                                        */
/* ================================================================== */

export interface PortfolioSummary {
  totalAssets: number
  totalAcquisitionCost: number
  totalCurrentValue: number
  totalNbv: number
  totalAccumulatedDepreciation: number
  avgConditionScore: number
  avgUtilisation: number
  revenueYtd: number
  opexYtd: number
}

export function portfolioSummary(assets: Asset[]): PortfolioSummary {
  return {
    totalAssets: assets.length,
    totalAcquisitionCost: sum(assets.map((a) => a.acquisitionCost)),
    totalCurrentValue: sum(assets.map((a) => a.currentValue)),
    totalNbv: sum(assets.map((a) => a.netBookValue)),
    totalAccumulatedDepreciation: sum(assets.map((a) => a.accumulatedDepreciation)),
    avgConditionScore: mean(assets.map((a) => a.conditionScore)),
    avgUtilisation: mean(assets.map((a) => a.utilisationRate)),
    revenueYtd: sum(assets.map((a) => a.revenueYtd)),
    opexYtd: sum(assets.map((a) => a.opexYtd)),
  }
}

export interface CategoryValue {
  category: AssetCategory
  value: number
  count: number
  /** Share of total portfolio value, percent. */
  share: number
}

export function valueByCategory(assets: Asset[]): CategoryValue[] {
  const total = sum(assets.map((a) => a.currentValue))
  const map = new Map<AssetCategory, { value: number; count: number }>()
  for (const a of assets) {
    const row = map.get(a.category) ?? { value: 0, count: 0 }
    row.value += a.currentValue
    row.count += 1
    map.set(a.category, row)
  }
  return [...map.entries()]
    .map(([category, r]) => ({ category, value: round(r.value), count: r.count, share: pct(r.value, total) }))
    .sort((a, b) => b.value - a.value)
}

export interface ZoneValue {
  zone: Zone
  value: number
  count: number
  share: number
}

export function valueByZone(assets: Asset[]): ZoneValue[] {
  const total = sum(assets.map((a) => a.currentValue))
  return ZONES.map((zone) => {
    const rows = assets.filter((a) => a.location.zone === zone)
    const value = sum(rows.map((a) => a.currentValue))
    return { zone, value: round(value), count: rows.length, share: pct(value, total) }
  }).sort((a, b) => b.value - a.value)
}

export interface ConditionSlice {
  condition: Condition
  count: number
  pct: number
}

export function conditionDistribution(assets: Asset[]): ConditionSlice[] {
  return CONDITIONS.map((condition) => {
    const count = assets.filter((a) => a.condition === condition).length
    return { condition, count, pct: pct(count, assets.length) }
  })
}

export interface StatusSlice {
  status: AssetStatus
  count: number
  pct: number
}

export function statusDistribution(assets: Asset[]): StatusSlice[] {
  return ASSET_STATUSES.map((status) => {
    const count = assets.filter((a) => a.status === status).length
    return { status, count, pct: pct(count, assets.length) }
  })
}

export interface CriticalitySlice {
  criticality: Criticality
  count: number
  pct: number
}

export function criticalityDistribution(assets: Asset[]): CriticalitySlice[] {
  return CRITICALITIES.map((criticality) => {
    const count = assets.filter((a) => a.criticality === criticality).length
    return { criticality, count, pct: pct(count, assets.length) }
  })
}

export interface DataQualitySummary {
  avgScore: number
  /** score >= 90 */
  complete: number
  /** 60 <= score < 90 */
  needsAttention: number
  /** score < 60 */
  incomplete: number
}

export function dataQualitySummary(assets: Asset[]): DataQualitySummary {
  return {
    avgScore: mean(assets.map((a) => a.dataQualityScore)),
    complete: assets.filter((a) => a.dataQualityScore >= 90).length,
    needsAttention: assets.filter((a) => a.dataQualityScore >= 60 && a.dataQualityScore < 90).length,
    incomplete: assets.filter((a) => a.dataQualityScore < 60).length,
  }
}

export interface AssetRevenueRow {
  asset: Asset
  revenueYtd: number
  opexYtd: number
  netYtd: number
  marginPct: number
}

export function topRevenueAssets(assets: Asset[], n = 8): AssetRevenueRow[] {
  return assets
    .slice()
    .sort((a, b) => b.revenueYtd - a.revenueYtd)
    .slice(0, Math.max(0, n))
    .map((asset) => ({
      asset,
      revenueYtd: round(asset.revenueYtd),
      opexYtd: round(asset.opexYtd),
      netYtd: round(asset.revenueYtd - asset.opexYtd),
      marginPct: pct(asset.revenueYtd - asset.opexYtd, asset.revenueYtd),
    }))
}

/* ================================================================== */
/* 2. Property & leasing                                               */
/* ================================================================== */

export interface OccupancySummary {
  total: number
  occupied: number
  vacant: number
  /** Percent. */
  occupancyRate: number
  /** Lettable area sitting empty, sqft. */
  vacantLettableSqft: number
}

export function occupancySummary(units: PropertyUnit[]): OccupancySummary {
  const occupied = units.filter((u) => u.status === 'Occupied')
  const vacant = units.filter((u) => u.status === 'Vacant')
  return {
    total: units.length,
    occupied: occupied.length,
    vacant: vacant.length,
    occupancyRate: pct(occupied.length, units.length),
    vacantLettableSqft: round(sum(vacant.map((u) => u.lettableAreaSqft))),
  }
}

export interface PropertyOccupancyRow {
  propertyName: string
  total: number
  occupied: number
  occupancyRate: number
  lettableSqft: number
  zone: Zone
}

export function occupancyByProperty(units: PropertyUnit[]): PropertyOccupancyRow[] {
  const map = new Map<string, PropertyOccupancyRow>()
  for (const u of units) {
    const row =
      map.get(u.propertyName) ??
      ({ propertyName: u.propertyName, total: 0, occupied: 0, occupancyRate: 0, lettableSqft: 0, zone: u.zone } satisfies PropertyOccupancyRow)
    row.total += 1
    if (u.status === 'Occupied') row.occupied += 1
    row.lettableSqft += u.lettableAreaSqft
    map.set(u.propertyName, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, lettableSqft: round(r.lettableSqft), occupancyRate: pct(r.occupied, r.total) }))
    .sort((a, b) => b.total - a.total)
}

export interface RentRoll {
  monthlyContracted: number
  annualisedContracted: number
  avgRatePsf: number
  /** Live leases counted into the roll. */
  leaseCount: number
  monthlyServiceCharge: number
}

export function rentRoll(leases: Lease[]): RentRoll {
  const live = leases.filter(isLiveLease)
  const monthly = sum(live.map((l) => l.monthlyRent))
  return {
    monthlyContracted: round(monthly),
    annualisedContracted: round(monthly * 12),
    avgRatePsf: mean(live.map((l) => l.ratePsf), 2),
    leaseCount: live.length,
    monthlyServiceCharge: round(sum(live.map((l) => l.serviceCharge))),
  }
}

export interface ArrearsSummary {
  totalOutstanding: number
  ageing: ArrearsAgeing
  accountsInArrears: number
  worstOffenders: Lease[]
  /** Arrears as a share of annualised contracted rent, percent. */
  arrearsRatePct: number
}

export function arrearsSummary(leases: Lease[], topN = 5): ArrearsSummary {
  const inArrears = leases.filter((l) => l.outstandingAmount > 0)
  const ageing: ArrearsAgeing = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 }
  for (const l of inArrears) {
    ageing.current += l.ageing.current
    ageing.d30 += l.ageing.d30
    ageing.d60 += l.ageing.d60
    ageing.d90 += l.ageing.d90
    ageing.d90plus += l.ageing.d90plus
  }
  ageing.current = round(ageing.current)
  ageing.d30 = round(ageing.d30)
  ageing.d60 = round(ageing.d60)
  ageing.d90 = round(ageing.d90)
  ageing.d90plus = round(ageing.d90plus)

  const totalOutstanding = round(sum(inArrears.map((l) => l.outstandingAmount)))
  const annualised = sum(leases.filter(isLiveLease).map((l) => l.monthlyRent)) * 12

  return {
    totalOutstanding,
    ageing,
    accountsInArrears: inArrears.length,
    worstOffenders: inArrears
      .slice()
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
      .slice(0, Math.max(0, topN)),
    arrearsRatePct: pct(totalOutstanding, annualised),
  }
}

/** Collections as a percentage of billed rent over the trailing `months`. */
export function collectionRate(payments: Payment[], months = 12, now: Date = new Date()): number {
  const keys = new Set(recentPeriods(months, now).map((p) => p.period))
  const rows = payments.filter((p) => keys.has(p.period))
  const scope = rows.length > 0 ? rows : payments
  return pct(sum(scope.map((p) => p.amountPaid)), sum(scope.map((p) => p.amountDue)))
}

export interface CollectionTrendPoint {
  period: string
  label: string
  billed: number
  collected: number
  ratePct: number
}

export function collectionTrend(payments: Payment[], months = 12, now: Date = new Date()): CollectionTrendPoint[] {
  return recentPeriods(months, now).map(({ period, label }) => {
    const rows = payments.filter((p) => p.period === period)
    const billed = sum(rows.map((p) => p.amountDue))
    const collected = sum(rows.map((p) => p.amountPaid))
    return { period, label, billed: round(billed), collected: round(collected), ratePct: pct(collected, billed) }
  })
}

/** Live leases ending within `withinDays`, soonest first. */
export function expiringLeases(leases: Lease[], withinDays = 90, now: Date = new Date()): Lease[] {
  return leases
    .filter((l) => l.status !== 'Terminated' && l.status !== 'Draft')
    .filter((l) => {
      const d = daysUntil(l.endDate, now)
      return Number.isFinite(d) && d >= 0 && d <= withinDays
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
}

export interface ExpiryBucket {
  bucket: string
  count: number
  monthlyValue: number
}

const EXPIRY_BUCKETS: readonly { bucket: string; max: number }[] = [
  { bucket: '0-30 days', max: 30 },
  { bucket: '31-60 days', max: 60 },
  { bucket: '61-90 days', max: 90 },
  { bucket: '91-180 days', max: 180 },
  { bucket: '180+ days', max: Number.POSITIVE_INFINITY },
]

export function leaseExpiryPipeline(leases: Lease[], now: Date = new Date()): ExpiryBucket[] {
  const rows = EXPIRY_BUCKETS.map((b) => ({ bucket: b.bucket, count: 0, monthlyValue: 0 }))
  for (const l of leases) {
    if (l.status === 'Terminated' || l.status === 'Draft') continue
    const d = daysUntil(l.endDate, now)
    if (!Number.isFinite(d) || d < 0) continue
    const idx = EXPIRY_BUCKETS.findIndex((b) => d <= b.max)
    const target = rows[idx < 0 ? rows.length - 1 : idx]
    target.count += 1
    target.monthlyValue += l.monthlyRent
  }
  return rows.map((r) => ({ ...r, monthlyValue: round(r.monthlyValue) }))
}

/* ================================================================== */
/* 3. Work orders & maintenance                                        */
/* ================================================================== */

export interface WorkOrderSummary {
  total: number
  open: number
  inProgress: number
  overdue: number
  closedThisMonth: number
  avgResolutionHours: number
  slaCompliancePct: number
}

export function workOrderSummary(workOrders: WorkOrder[], now: Date = new Date()): WorkOrderSummary {
  const open = workOrders.filter(isOpenWorkOrder)
  const thisPeriod = periodKey(now)
  const closed = workOrders.filter((w) => w.status === 'Closed' && w.completedAt)

  const resolutionHours = closed
    .map((w) => (new Date(w.completedAt as string).getTime() - new Date(w.raisedAt).getTime()) / MS_HOUR)
    .filter((h) => Number.isFinite(h) && h >= 0)

  /**
   * Only tickets that reached a final outcome can be graded. Cancelled work was
   * never attempted, and a job still running has not yet failed — including
   * either one understates compliance and turns the headline KPI red for no
   * real reason.
   */
  const resolved = workOrders.filter(
    (w) => w.status === 'Closed' && (w.slaStatus === 'Met' || w.slaStatus === 'Breached'),
  )

  return {
    total: workOrders.length,
    open: open.length,
    inProgress: workOrders.filter((w) => w.status === 'In Progress').length,
    overdue: open.filter((w) => w.slaStatus === 'Breached').length,
    closedThisMonth: closed.filter((w) => periodKey(new Date(w.completedAt as string)) === thisPeriod).length,
    avgResolutionHours: mean(resolutionHours),
    slaCompliancePct: pct(resolved.filter((w) => w.slaStatus === 'Met').length, resolved.length),
  }
}

export interface CountSlice<T extends string> {
  key: T
  count: number
  pct: number
}

export function woByStatus(workOrders: WorkOrder[]): CountSlice<WorkOrderStatus>[] {
  return WO_STATUSES.map((key) => {
    const count = workOrders.filter((w) => w.status === key).length
    return { key, count, pct: pct(count, workOrders.length) }
  })
}

export function woByType(workOrders: WorkOrder[]): CountSlice<WorkOrderType>[] {
  return WO_TYPES.map((key) => {
    const count = workOrders.filter((w) => w.type === key).length
    return { key, count, pct: pct(count, workOrders.length) }
  })
}

export function woByPriority(workOrders: WorkOrder[]): CountSlice<Priority>[] {
  return PRIORITIES.map((key) => {
    const count = workOrders.filter((w) => w.priority === key).length
    return { key, count, pct: pct(count, workOrders.length) }
  })
}

export interface SlaTrendPoint {
  period: string
  label: string
  compliancePct: number
  total: number
  breached: number
}

/** SLA compliance by month of ticket raise date, oldest month first. */
export function slaTrend(workOrders: WorkOrder[], months = 6, now: Date = new Date()): SlaTrendPoint[] {
  return recentPeriods(months, now).map(({ period, label }) => {
    // Grade the same population the headline KPI grades — closed tickets only —
    // otherwise the trend line and the KPI tile above it disagree on screen.
    const rows = workOrders.filter(
      (w) => w.status === 'Closed' && periodKey(new Date(w.raisedAt)) === period,
    )
    const breached = rows.filter((w) => w.slaStatus === 'Breached').length
    return {
      period,
      label,
      total: rows.length,
      breached,
      compliancePct: rows.length === 0 ? 0 : pct(rows.length - breached, rows.length),
    }
  })
}

export interface MttrRow {
  category: AssetCategory
  hours: number
  count: number
}

/** Mean time to repair, grouped by the category of the asset the ticket sits on. */
export function mttrByCategory(workOrders: WorkOrder[], assets: Asset[]): MttrRow[] {
  const categoryOf = new Map(assets.map((a) => [a.id, a.category]))
  const buckets = new Map<AssetCategory, number[]>()

  for (const w of workOrders) {
    if (w.status !== 'Closed' || !w.completedAt) continue
    const category = categoryOf.get(w.assetId)
    if (!category) continue
    const hours = (new Date(w.completedAt).getTime() - new Date(w.raisedAt).getTime()) / MS_HOUR
    if (!Number.isFinite(hours) || hours < 0) continue
    const list = buckets.get(category) ?? []
    list.push(hours)
    buckets.set(category, list)
  }

  return [...buckets.entries()]
    .map(([category, hours]) => ({ category, hours: mean(hours), count: hours.length }))
    .sort((a, b) => b.hours - a.hours)
}

export interface TechnicianWorkloadRow {
  technician: Technician
  open: number
  overdue: number
  utilisation: number
  closedThisMonth: number
}

export function technicianWorkload(
  workOrders: WorkOrder[],
  technicians: Technician[],
  now: Date = new Date(),
): TechnicianWorkloadRow[] {
  const thisPeriod = periodKey(now)
  return technicians
    .map((technician) => {
      const mine = workOrders.filter((w) => w.assignedTo === technician.name)
      const open = mine.filter(isOpenWorkOrder)
      return {
        technician,
        open: open.length,
        overdue: open.filter((w) => w.slaStatus === 'Breached').length,
        utilisation: technician.utilisation,
        closedThisMonth: mine.filter(
          (w) => w.status === 'Closed' && w.completedAt && periodKey(new Date(w.completedAt)) === thisPeriod,
        ).length,
      }
    })
    .sort((a, b) => b.open - a.open || b.overdue - a.overdue)
}

export interface VendorPerformanceRow {
  vendor: Vendor
  jobs: number
  closed: number
  open: number
  onTimePct: number
  avgCost: number
  totalCost: number
  rating: number
  slaCompliance: number
}

export function vendorPerformance(workOrders: WorkOrder[], vendors: Vendor[]): VendorPerformanceRow[] {
  return vendors
    .map((vendor) => {
      const mine = workOrders.filter((w) => w.vendorId === vendor.id)
      const closed = mine.filter((w) => w.status === 'Closed')
      const resolved = closed.filter((w) => w.slaStatus === 'Met' || w.slaStatus === 'Breached')
      const costs = closed.map((w) => w.actualCost ?? w.estimatedCost)
      return {
        vendor,
        jobs: mine.length,
        closed: closed.length,
        open: mine.filter(isOpenWorkOrder).length,
        onTimePct:
          resolved.length === 0
            ? vendor.slaCompliance
            : pct(resolved.filter((w) => w.slaStatus === 'Met').length, resolved.length),
        avgCost: round(mean(costs, 0)),
        totalCost: round(sum(costs)),
        rating: vendor.rating,
        slaCompliance: vendor.slaCompliance,
      }
    })
    .sort((a, b) => b.jobs - a.jobs)
}

/* ================================================================== */
/* 4. Financial trends                                                 */
/* ================================================================== */

export interface SpendVsBudgetPoint {
  period: string
  label: string
  spend: number
  budget: number
  variance: number
  variancePct: number
  overBudget: boolean
}

export function maintenanceSpendVsBudget(monthlyFinancials: MonthlyFinancial[]): SpendVsBudgetPoint[] {
  return monthlyFinancials.map((m) => {
    const variance = m.maintenanceBudget - m.maintenanceSpend
    return {
      period: m.period,
      label: m.label,
      spend: m.maintenanceSpend,
      budget: m.maintenanceBudget,
      variance: round(variance),
      variancePct: pct(variance, m.maintenanceBudget),
      overBudget: m.maintenanceSpend > m.maintenanceBudget,
    }
  })
}

export interface RevenueVsTargetPoint {
  period: string
  label: string
  revenue: number
  target: number
  collections: number
  opex: number
  netOperatingIncome: number
  achievementPct: number
}

export function revenueVsTarget(monthlyFinancials: MonthlyFinancial[]): RevenueVsTargetPoint[] {
  return monthlyFinancials.map((m) => ({
    period: m.period,
    label: m.label,
    revenue: m.revenue,
    target: m.target,
    collections: m.collections,
    opex: m.opex,
    netOperatingIncome: round(m.revenue - m.opex),
    achievementPct: pct(m.revenue, m.target),
  }))
}

/* ================================================================== */
/* 5. Compliance & risk                                                */
/* ================================================================== */

export interface InspectionDue {
  asset: Asset
  /** ISO date. */
  dueDate: string
  daysRemaining: number
  overdue: boolean
}

/** Inspections due within `withinDays` — overdue ones are included and sort first. */
export function upcomingInspections(assets: Asset[], withinDays = 60, now: Date = new Date()): InspectionDue[] {
  return assets
    .filter((a) => Boolean(a.nextInspection) && a.status !== 'Disposed')
    .map((a) => {
      const daysRemaining = daysUntil(a.nextInspection, now)
      return { asset: a, dueDate: a.nextInspection as string, daysRemaining, overdue: daysRemaining < 0 }
    })
    .filter((r) => Number.isFinite(r.daysRemaining) && r.daysRemaining <= withinDays)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export interface InsuranceExpiry {
  asset: Asset
  policyNo: string
  insurer: string
  /** ISO date. */
  expiry: string
  sumInsured: number
  daysRemaining: number
  expired: boolean
}

export function expiringInsurance(assets: Asset[], withinDays = 90, now: Date = new Date()): InsuranceExpiry[] {
  return assets
    .filter((a) => Boolean(a.insurance) && a.status !== 'Disposed')
    .map((a) => {
      const ins = a.insurance as NonNullable<Asset['insurance']>
      const daysRemaining = daysUntil(ins.expiry, now)
      return {
        asset: a,
        policyNo: ins.policyNo,
        insurer: ins.insurer,
        expiry: ins.expiry,
        sumInsured: ins.sumInsured,
        daysRemaining,
        expired: daysRemaining < 0,
      }
    })
    .filter((r) => Number.isFinite(r.daysRemaining) && r.daysRemaining <= withinDays)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export interface RiskRow {
  asset: Asset
  /** 0–100, higher = more urgent. */
  score: number
  /** Individual contributing factors, ready to render as chips. */
  reasons: string[]
  /** One human-readable sentence for tables and the AI copilot. */
  reason: string
  openWorkOrders: number
  breachedWorkOrders: number
}

/**
 * Ranked risk register. Blends the asset's own risk score with live operational
 * signals — condition, criticality, SLA breaches, overdue inspection, lapsed cover.
 */
export function riskRegister(assets: Asset[], workOrders: WorkOrder[], topN = 12, now: Date = new Date()): RiskRow[] {
  const openByAsset = new Map<string, WorkOrder[]>()
  for (const w of workOrders) {
    if (!isOpenWorkOrder(w)) continue
    const list = openByAsset.get(w.assetId) ?? []
    list.push(w)
    openByAsset.set(w.assetId, list)
  }

  const rows: RiskRow[] = assets
    .filter((a) => a.status !== 'Disposed')
    .map((asset) => {
      const open = openByAsset.get(asset.id) ?? []
      const breached = open.filter((w) => w.slaStatus === 'Breached')
      const p1 = open.filter((w) => w.priority === 'P1 - Critical')
      const reasons: string[] = []
      let score = asset.riskScore * 0.4

      if (asset.condition === 'Critical') {
        score += 22
        reasons.push('Keadaan kritikal')
      } else if (asset.condition === 'Poor') {
        score += 13
        reasons.push('Keadaan lemah')
      }

      if (asset.criticality === 'Critical') {
        score += 12
        reasons.push('Aset kritikal operasi')
      } else if (asset.criticality === 'High') {
        score += 6
      }

      if (breached.length > 0) {
        score += Math.min(18, breached.length * 7)
        reasons.push(`${breached.length} SLA dilanggar`)
      }
      if (p1.length > 0) {
        score += Math.min(12, p1.length * 6)
        reasons.push(`${p1.length} tiket P1 terbuka`)
      } else if (open.length > 2) {
        score += 5
        reasons.push(`${open.length} arahan kerja terbuka`)
      }

      const inspDays = daysUntil(asset.nextInspection, now)
      if (!asset.nextInspection) {
        score += 5
        reasons.push('Tiada jadual pemeriksaan')
      } else if (Number.isFinite(inspDays) && inspDays < 0) {
        score += 9
        reasons.push(`Pemeriksaan lewat ${Math.abs(inspDays)} hari`)
      }

      if (!asset.insurance) {
        score += 7
        reasons.push('Tiada perlindungan insurans')
      } else {
        const insDays = daysUntil(asset.insurance.expiry, now)
        if (Number.isFinite(insDays) && insDays < 0) {
          score += 11
          reasons.push('Polisi insurans tamat tempoh')
        } else if (Number.isFinite(insDays) && insDays <= 30) {
          score += 4
          reasons.push(`Insurans tamat dalam ${insDays} hari`)
        }
      }

      if (asset.dataQualityScore < 60) {
        score += 4
        reasons.push('Rekod data tidak lengkap')
      }

      if (reasons.length === 0) reasons.push('Pemantauan rutin')

      return {
        asset,
        score: round(Math.max(0, Math.min(100, score)), 1),
        reasons,
        reason: `${asset.name} (${asset.code}), ${asset.location.zone} — ${reasons.join('; ')}.`,
        openWorkOrders: open.length,
        breachedWorkOrders: breached.length,
      }
    })

  return rows.sort((a, b) => b.score - a.score).slice(0, Math.max(0, topN))
}

/* ================================================================== */
/* 6. ESG                                                              */
/* ================================================================== */

export interface EsgSummary {
  totalEnergyKwh: number
  totalWaterM3: number
  totalCarbonTonnes: number
  avgGreenScore: number
  solarReadyCount: number
  /** Assets that actually carry ESG telemetry. */
  reportedAssets: number
  /** Share of the register with ESG data, percent. */
  coveragePct: number
}

export function esgSummary(assets: Asset[]): EsgSummary {
  const withEsg = assets.filter((a) => Boolean(a.esg))
  return {
    totalEnergyKwh: round(sum(withEsg.map((a) => a.esg?.energyKwhPerYear ?? 0))),
    totalWaterM3: round(sum(withEsg.map((a) => a.esg?.waterM3PerYear ?? 0))),
    totalCarbonTonnes: round(sum(withEsg.map((a) => a.esg?.carbonTonnesPerYear ?? 0)), 1),
    avgGreenScore: mean(withEsg.map((a) => a.esg?.greenScore ?? 0)),
    solarReadyCount: withEsg.filter((a) => a.esg?.solarReady).length,
    reportedAssets: withEsg.length,
    coveragePct: pct(withEsg.length, assets.length),
  }
}

/* ================================================================== */
/* 7. Zone roll-up                                                     */
/* ================================================================== */

export interface ZonePerformanceRow {
  zone: Zone
  assetCount: number
  portfolioValue: number
  units: number
  occupiedUnits: number
  occupancyRate: number
  monthlyRevenue: number
  annualisedRevenue: number
  outstandingArrears: number
  openWorkOrders: number
  breachedWorkOrders: number
  avgConditionScore: number
  avgUtilisation: number
}

/** One executive row per KEJORA zone — the spine of the zone comparison table. */
export function zonePerformance(
  assets: Asset[],
  leases: Lease[],
  units: PropertyUnit[],
  workOrders: WorkOrder[],
): ZonePerformanceRow[] {
  return ZONES.map((zone) => {
    const zoneAssets = assets.filter((a) => a.location.zone === zone)
    const zoneUnits = units.filter((u) => u.zone === zone)
    const zoneLeases = leases.filter((l) => l.zone === zone)
    const liveLeases = zoneLeases.filter(isLiveLease)
    const zoneWos = workOrders.filter((w) => w.zone === zone)
    const openWos = zoneWos.filter(isOpenWorkOrder)
    const occupied = zoneUnits.filter((u) => u.status === 'Occupied').length
    const monthlyRevenue = sum(liveLeases.map((l) => l.monthlyRent))

    return {
      zone,
      assetCount: zoneAssets.length,
      portfolioValue: round(sum(zoneAssets.map((a) => a.currentValue))),
      units: zoneUnits.length,
      occupiedUnits: occupied,
      occupancyRate: pct(occupied, zoneUnits.length),
      monthlyRevenue: round(monthlyRevenue),
      annualisedRevenue: round(monthlyRevenue * 12),
      outstandingArrears: round(sum(zoneLeases.map((l) => l.outstandingAmount))),
      openWorkOrders: openWos.length,
      breachedWorkOrders: openWos.filter((w) => w.slaStatus === 'Breached').length,
      avgConditionScore: mean(zoneAssets.map((a) => a.conditionScore)),
      avgUtilisation: mean(zoneAssets.map((a) => a.utilisationRate)),
    }
  }).sort((a, b) => b.portfolioValue - a.portfolioValue)
}
