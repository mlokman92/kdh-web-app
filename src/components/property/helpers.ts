/**
 * Property page — derivations that are specific to leasing, arrears and
 * monetisation and therefore do not belong in the shared analytics layer.
 *
 * Everything here is pure and takes explicit arrays, mirroring `@/lib/analytics`.
 */

import { isLiveLease } from '@/lib/analytics'
import { daysUntil, formatArea, formatMYR } from '@/lib/format'
import {
  NOTICE_STAGES,
  type Asset,
  type Lease,
  type NoticeStage,
  type Payment,
  type PropertyUnit,
  type Tenant,
  type Zone,
} from '@/lib/types'

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ogos',
  'Sep',
  'Okt',
  'Nov',
  'Dis',
] as const

function round(n: number, dp = 0): number {
  const f = 10 ** dp
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

function pct(part: number, whole: number): number {
  if (!whole) return 0
  return round((part / whole) * 100, 1)
}

function periodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ================================================================== */
/* Occupancy over time                                                 */
/* ================================================================== */

export interface OccupancyPoint {
  period: string
  label: string
  occupied: number
  total: number
  ratePct: number
}

/**
 * Reconstructs historic occupancy from the lease book: a unit counts as let in a
 * month when a non-draft lease covers any part of that month.
 */
export function occupancyTrend(
  units: PropertyUnit[],
  leases: Lease[],
  months = 12,
  now: Date = new Date(),
): OccupancyPoint[] {
  const total = units.length
  const unitIds = new Set(units.map((u) => u.id))
  const relevant = leases.filter((l) => l.status !== 'Draft' && unitIds.has(l.unitId))

  const out: OccupancyPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    const let_ = new Set<string>()
    for (const l of relevant) {
      const s = new Date(l.startDate).getTime()
      const e = new Date(l.endDate).getTime()
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue
      if (s <= end.getTime() && e >= start.getTime()) let_.add(l.unitId)
    }
    out.push({
      period: periodKey(start),
      label: MONTH_SHORT[start.getMonth()],
      occupied: let_.size,
      total,
      ratePct: pct(let_.size, total),
    })
  }
  return out
}

/* ================================================================== */
/* Forward expiry exposure                                             */
/* ================================================================== */

export interface ForwardExpiryPoint {
  period: string
  label: string
  monthlyValue: number
  leases: number
}

/** Contracted monthly rent falling out of contract, month by month, looking forward. */
export function forwardExpiry(leases: Lease[], months = 12, now: Date = new Date()): ForwardExpiryPoint[] {
  const buckets = new Map<string, ForwardExpiryPoint>()
  const order: string[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const key = periodKey(d)
    order.push(key)
    buckets.set(key, { period: key, label: MONTH_SHORT[d.getMonth()], monthlyValue: 0, leases: 0 })
  }

  for (const l of leases) {
    if (l.status === 'Terminated' || l.status === 'Draft') continue
    const end = new Date(l.endDate)
    if (Number.isNaN(end.getTime())) continue
    const row = buckets.get(periodKey(end))
    if (!row) continue
    row.monthlyValue += l.monthlyRent
    row.leases += 1
  }

  return order.map((k) => {
    const r = buckets.get(k) as ForwardExpiryPoint
    return { ...r, monthlyValue: round(r.monthlyValue) }
  })
}

/* ================================================================== */
/* Notice escalation                                                   */
/* ================================================================== */

/** Advances the dunning ladder one rung; 'Legal Action' is terminal. */
export function nextNoticeStage(stage: NoticeStage): NoticeStage {
  const i = NOTICE_STAGES.indexOf(stage)
  if (i < 0) return 'Reminder Sent'
  return NOTICE_STAGES[Math.min(i + 1, NOTICE_STAGES.length - 1)]
}

/** Adds whole months to an ISO date, returning YYYY-MM-DD. */
export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

/* ================================================================== */
/* Tenant directory                                                    */
/* ================================================================== */

export interface TenantRow {
  tenant: Tenant
  leases: Lease[]
  liveLeases: Lease[]
  unitCount: number
  monthlyRent: number
  annualRent: number
  arrears: number
  totalAreaSqft: number
  worstNoticeStage: NoticeStage
  properties: string[]
  zones: Zone[]
}

/**
 * Joins the tenant master to the lease book. Tenants created during the demo exist
 * only on their lease, so they are synthesised here rather than dropped.
 */
export function tenantDirectory(tenants: Tenant[], leases: Lease[], units: PropertyUnit[]): TenantRow[] {
  const byId = new Map<string, Tenant>(tenants.map((t) => [t.id, t]))
  const areaById = new Map<string, number>(units.map((u) => [u.id, u.lettableAreaSqft]))
  const grouped = new Map<string, Lease[]>()
  for (const l of leases) {
    const list = grouped.get(l.tenantId)
    if (list) list.push(l)
    else grouped.set(l.tenantId, [l])
  }

  const rows: TenantRow[] = []
  for (const [tenantId, group] of grouped) {
    const known = byId.get(tenantId)
    const first = group[0]
    const tenant: Tenant = known ?? {
      id: tenantId,
      name: first.tenantName,
      ssmNo: '—',
      contactPerson: first.tenantName,
      phone: '—',
      email: '—',
      businessCategory: first.businessType,
      creditRating: 'B',
      tenantSinceYear: new Date(first.startDate).getFullYear(),
    }
    const live = group.filter(isLiveLease)
    const worst = group.reduce<NoticeStage>((acc, l) => {
      return NOTICE_STAGES.indexOf(l.noticeStage) > NOTICE_STAGES.indexOf(acc) ? l.noticeStage : acc
    }, 'None')

    const monthlyRent = round(sum(live.map((l) => l.monthlyRent)))
    rows.push({
      tenant,
      leases: group.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
      liveLeases: live,
      unitCount: new Set(live.map((l) => l.unitId)).size,
      monthlyRent,
      annualRent: round(monthlyRent * 12),
      arrears: round(sum(group.map((l) => l.outstandingAmount))),
      totalAreaSqft: round(sum(live.map((l) => areaById.get(l.unitId) ?? 0))),
      worstNoticeStage: worst,
      properties: [...new Set(live.map((l) => l.propertyName))],
      zones: [...new Set(live.map((l) => l.zone))],
    })
  }

  return rows.sort((a, b) => b.monthlyRent - a.monthlyRent)
}

/** Payment history for one lease, newest invoice first. */
export function paymentsForLease(payments: Payment[], leaseId: string): Payment[] {
  return payments
    .filter((p) => p.leaseId === leaseId)
    .slice()
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
}

/* ================================================================== */
/* Monetisation — revenue opportunities derived from the store          */
/* ================================================================== */

export const OPPORTUNITY_KINDS = [
  'Vacant Unit',
  'Under-Market Lease',
  'Idle Land',
  'Low Utilisation',
] as const
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number]

export interface OpportunityRow {
  id: string
  kind: OpportunityKind
  subject: string
  reference: string
  zone: Zone
  /** Plain-language derivation shown in the table so the number is auditable. */
  basis: string
  currentAnnual: number
  potentialAnnual: number
  upliftAnnual: number
  /** Recommended next step. */
  action: string
  /** Days until the uplift can actually be captured (0 = immediately). */
  captureInDays: number
}

export interface OpportunityKindTotal {
  kind: OpportunityKind
  count: number
  upliftAnnual: number
  sharePct: number
}

export interface MonetisationResult {
  rows: OpportunityRow[]
  byKind: OpportunityKindTotal[]
  totalUpliftAnnual: number
  /** Yield the performing land bank actually returns — the basis for idle land. */
  landYieldPct: number
  /** Upper-quartile utilisation across revenue-generating assets. */
  utilisationTarget: number
  currentAnnualisedRevenue: number
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base])
}

/**
 * The selling engine. Four independent, fully-derived revenue streams:
 *
 *  1. Vacant lettable stock priced at its own market rate.
 *  2. Live leases contracted below the unit's market rate — capturable at renewal.
 *  3. Idle / vacant land priced at the yield KDH's *own* performing land bank returns.
 *  4. Revenue-generating assets sitting below the upper-quartile utilisation.
 */
export function buildOpportunities(
  units: PropertyUnit[],
  leases: Lease[],
  assets: Asset[],
  now: Date = new Date(),
): MonetisationResult {
  const rows: OpportunityRow[] = []
  const unitById = new Map(units.map((u) => [u.id, u]))
  const ytdMonths = Math.max(1, now.getMonth() + 1)

  /* --- 1. Vacant lettable units ------------------------------------- */
  for (const u of units) {
    if (u.status !== 'Vacant') continue
    const potential = round(u.lettableAreaSqft * u.marketRatePsf * 12)
    if (potential <= 0) continue
    rows.push({
      id: `opp-vac-${u.id}`,
      kind: 'Vacant Unit',
      subject: `${u.propertyName} — ${u.unitNo}`,
      reference: u.code,
      zone: u.zone,
      basis: `${formatArea(u.lettableAreaSqft)} × ${formatMYR(u.marketRatePsf, true)} psf × 12 bulan`,
      currentAnnual: 0,
      potentialAnnual: potential,
      upliftAnnual: potential,
      action: 'Pasarkan unit',
      captureInDays: 0,
    })
  }

  /* --- 2. Under-market live leases ---------------------------------- */
  for (const l of leases) {
    if (!isLiveLease(l)) continue
    const u = unitById.get(l.unitId)
    if (!u || u.marketRatePsf <= 0) continue
    // Only flag a genuine gap, not rounding noise.
    if (l.ratePsf >= u.marketRatePsf * 0.98) continue
    const current = round(l.monthlyRent * 12)
    const potential = round(u.lettableAreaSqft * u.marketRatePsf * 12)
    const uplift = round(potential - current)
    if (uplift <= 0) continue
    const days = daysUntil(l.endDate, now)
    rows.push({
      id: `opp-umk-${l.id}`,
      kind: 'Under-Market Lease',
      subject: `${l.tenantName} — ${l.propertyName} ${l.unitNo}`,
      reference: l.code,
      zone: l.zone,
      basis: `${formatMYR(l.ratePsf, true)} psf kontrak lwn ${formatMYR(u.marketRatePsf, true)} psf pasaran`,
      currentAnnual: current,
      potentialAnnual: potential,
      upliftAnnual: uplift,
      action: Number.isFinite(days) && days <= 180 ? 'Rundingkan semasa pembaharuan' : 'Semak semula pada tarikh tamat',
      captureInDays: Number.isFinite(days) ? Math.max(0, days) : 0,
    })
  }

  /* --- 3. Idle land, priced at the performing land bank's own yield --- */
  const landAssets = assets.filter((a) => a.category === 'Land' && a.status !== 'Disposed')
  const performingLand = landAssets.filter(
    (a) => a.status !== 'Idle' && a.status !== 'Vacant' && a.currentValue > 0 && a.revenueYtd > 0,
  )
  const performingValue = sum(performingLand.map((a) => a.currentValue))
  const performingRevenue = sum(performingLand.map((a) => (a.revenueYtd / ytdMonths) * 12))
  const landYieldPct = performingValue > 0 ? round((performingRevenue / performingValue) * 100, 2) : 3.5

  for (const a of landAssets) {
    if (a.status !== 'Idle' && a.status !== 'Vacant') continue
    const potential = round((a.currentValue * landYieldPct) / 100)
    const current = round((a.revenueYtd / ytdMonths) * 12)
    const uplift = round(potential - current)
    if (uplift <= 0) continue
    const ha = a.landTitle?.areaHectares ?? 0
    rows.push({
      id: `opp-lnd-${a.id}`,
      kind: 'Idle Land',
      subject: a.name,
      reference: a.code,
      zone: a.location.zone,
      basis: `${ha.toFixed(2)} ha ${a.landTitle?.tenure ?? ''} · nilai semasa × ${landYieldPct.toFixed(2)}% hasil ladang aktif`.trim(),
      currentAnnual: current,
      potentialAnnual: potential,
      upliftAnnual: uplift,
      action: 'Pajakan tanah / usaha sama',
      captureInDays: 180,
    })
  }

  /* --- 4. Under-utilised revenue-generating assets -------------------- */
  const earning = assets.filter(
    (a) =>
      a.status !== 'Disposed' &&
      a.status !== 'Under Construction' &&
      a.revenueYtd > 0 &&
      a.utilisationRate > 0,
  )
  const utilisationTarget = round(quantile(earning.map((a) => a.utilisationRate), 0.75), 1)

  for (const a of earning) {
    if (a.utilisationRate >= utilisationTarget) continue
    if (a.category === 'Land') continue // already counted above
    const current = round((a.revenueYtd / ytdMonths) * 12)
    if (current < 12_000) continue // ignore immaterial lines
    const raw = current * (utilisationTarget / a.utilisationRate - 1)
    // Cap the claim at half of today's run rate so the headline stays credible.
    const uplift = round(Math.min(raw, current * 0.5))
    if (uplift < 1_000) continue
    rows.push({
      id: `opp-utl-${a.id}`,
      kind: 'Low Utilisation',
      subject: a.name,
      reference: a.code,
      zone: a.location.zone,
      basis: `Penggunaan ${a.utilisationRate.toFixed(0)}% lwn sasaran kuartil atas ${utilisationTarget.toFixed(0)}%`,
      currentAnnual: current,
      potentialAnnual: round(current + uplift),
      upliftAnnual: uplift,
      action: 'Program peningkatan penggunaan',
      captureInDays: 90,
    })
  }

  rows.sort((a, b) => b.upliftAnnual - a.upliftAnnual)
  const totalUpliftAnnual = round(sum(rows.map((r) => r.upliftAnnual)))

  const byKind: OpportunityKindTotal[] = OPPORTUNITY_KINDS.map((kind) => {
    const group = rows.filter((r) => r.kind === kind)
    const uplift = round(sum(group.map((r) => r.upliftAnnual)))
    return { kind, count: group.length, upliftAnnual: uplift, sharePct: pct(uplift, totalUpliftAnnual) }
  })

  return {
    rows,
    byKind,
    totalUpliftAnnual,
    landYieldPct,
    utilisationTarget,
    currentAnnualisedRevenue: round(sum(assets.map((a) => (a.revenueYtd / ytdMonths) * 12))),
  }
}

/* ================================================================== */
/* Small shared shapes                                                 */
/* ================================================================== */

export interface RenewalRow {
  lease: Lease
  unit?: PropertyUnit
  daysToExpiry: number
  currentRent: number
  benchmarkRent: number
  upliftMonthly: number
  upliftPct: number
}

/** Renewal worklist: soonest expiry first, benchmarked against the unit market rate. */
export function renewalWorklist(
  leases: Lease[],
  units: PropertyUnit[],
  withinDays = 180,
  now: Date = new Date(),
): RenewalRow[] {
  const unitById = new Map(units.map((u) => [u.id, u]))
  return leases
    .filter((l) => l.status !== 'Terminated' && l.status !== 'Draft' && l.status !== 'Expired')
    .map((l) => {
      const unit = unitById.get(l.unitId)
      const benchmarkRent = unit ? round(unit.lettableAreaSqft * unit.marketRatePsf) : l.monthlyRent
      const uplift = round(benchmarkRent - l.monthlyRent)
      return {
        lease: l,
        unit,
        daysToExpiry: daysUntil(l.endDate, now),
        currentRent: l.monthlyRent,
        benchmarkRent,
        upliftMonthly: uplift,
        upliftPct: pct(uplift, l.monthlyRent),
      }
    })
    .filter((r) => Number.isFinite(r.daysToExpiry) && r.daysToExpiry >= 0 && r.daysToExpiry <= withinDays)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
}
