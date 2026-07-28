/**
 * Maintenance module — shared vocabulary.
 *
 * Everything here is pure or a tiny hook. Domain arithmetic that already exists in
 * `@/lib/analytics` is reused rather than duplicated; this file only adds what the
 * maintenance screen needs and analytics does not provide (board grouping, the live
 * SLA clock, status transition rules and a month-by-month maintenance series).
 */

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ActivityIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  GlobeIcon,
  HammerIcon,
  MessageCircleIcon,
  PhoneIcon,
  QrCodeIcon,
  RadioIcon,
  ScaleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SirenIcon,
  WrenchIcon,
} from 'lucide-react'

import type { Tone } from '@/components/common/status-badge'
import type {
  ChecklistItem,
  Priority,
  SlaStatus,
  WorkOrder,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from '@/lib/types'

/* ================================================================== */
/* Time                                                                */
/* ================================================================== */

const MS_HOUR = 3_600_000
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * Re-renders the caller on an interval so countdowns tick. Only mount this in the
 * component that actually shows a clock — never at page level with a 1s interval.
 */
export function useTicker(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, active])

  return now
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Precise, ticking form for the detail panel: "1d 04h 22m 08s". */
export function formatDurationLong(ms: number): string {
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(s)}s`
  if (m > 0) return `${m}m ${pad2(s)}s`
  return `${s}s`
}

/** Compact form for board pills and table cells: "3d 4h", "2h 14m", "48m". */
export function formatDurationShort(ms: number): string {
  const total = Math.max(0, Math.floor(Math.abs(ms) / 1000))
  const d = Math.floor(total / 86_400)
  const h = Math.floor((total % 86_400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return '<1m'
}

/** "YYYY-MM" key. */
function periodKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/* ================================================================== */
/* The live SLA clock                                                  */
/* ================================================================== */

export interface SlaClock {
  /** True once the ticket has a completion stamp — the clock has stopped. */
  settled: boolean
  breached: boolean
  /** Milliseconds left before the deadline; negative once breached. */
  remainingMs: number
  /** 0–100 share of the SLA window consumed (clamped for the bar). */
  elapsedPct: number
  /** Raw consumption, may exceed 100. */
  rawPct: number
  status: SlaStatus
  /** Short pill text, e.g. "4h 12m left" or "12h 30m over". */
  pill: string
  /** Sentence for the detail panel. */
  headline: string
  tone: Tone
}

const SLA_TONE: Record<SlaStatus, Tone> = {
  Met: 'positive',
  'On Track': 'positive',
  'At Risk': 'warning',
  Breached: 'critical',
}

/**
 * Derives SLA state at an arbitrary instant. Mirrors the store's `recomputeSlaStatus`
 * rule exactly (breach on overrun, "At Risk" inside the final quarter of the window)
 * so the visible countdown and the persisted `slaStatus` can never disagree.
 */
export function slaClock(
  wo: Pick<WorkOrder, 'raisedAt' | 'slaDueAt' | 'completedAt'>,
  nowMs: number,
): SlaClock {
  const due = new Date(wo.slaDueAt).getTime()
  const raised = new Date(wo.raisedAt).getTime()

  if (!Number.isFinite(due) || !Number.isFinite(raised)) {
    return {
      settled: false,
      breached: false,
      remainingMs: 0,
      elapsedPct: 0,
      rawPct: 0,
      status: 'On Track',
      pill: '—',
      headline: 'SLA window unavailable',
      tone: 'neutral',
    }
  }

  const windowMs = Math.max(1, due - raised)
  const done = wo.completedAt ? new Date(wo.completedAt).getTime() : Number.NaN
  const settled = Number.isFinite(done)
  const mark = settled ? done : nowMs
  const remainingMs = due - mark
  const rawPct = ((mark - raised) / windowMs) * 100
  const breached = remainingMs < 0

  let status: SlaStatus
  if (settled) status = breached ? 'Breached' : 'Met'
  else if (breached) status = 'Breached'
  else status = remainingMs < windowMs * 0.25 ? 'At Risk' : 'On Track'

  const magnitude = formatDurationShort(remainingMs)
  const precise = formatDurationLong(remainingMs)

  const pill = settled
    ? breached
      ? `${magnitude} late`
      : `${magnitude} spare`
    : breached
      ? `${magnitude} over`
      : `${magnitude} left`

  const headline = settled
    ? breached
      ? `Closed ${precise} past the deadline`
      : `Closed with ${precise} to spare`
    : breached
      ? `Overdue by ${precise}`
      : `${precise} remaining`

  return {
    settled,
    breached,
    remainingMs,
    elapsedPct: Math.max(0, Math.min(100, rawPct)),
    rawPct,
    status,
    pill,
    headline,
    tone: SLA_TONE[status],
  }
}

/* ================================================================== */
/* Board                                                               */
/* ================================================================== */

export interface BoardColumn {
  id: string
  label: string
  /** Statuses that land in this column. */
  statuses: WorkOrderStatus[]
  /** Status applied when a card is dropped here. */
  dropStatus: WorkOrderStatus
  hint: string
}

/** The six lanes a KDH supervisor actually works through. */
export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'open', label: 'Open', statuses: ['Open'], dropStatus: 'Open', hint: 'Awaiting triage' },
  { id: 'assigned', label: 'Assigned', statuses: ['Assigned'], dropStatus: 'Assigned', hint: 'Technician allocated' },
  { id: 'in-progress', label: 'In Progress', statuses: ['In Progress'], dropStatus: 'In Progress', hint: 'Work under way' },
  {
    id: 'held',
    label: 'On Hold / Pending Parts',
    statuses: ['On Hold', 'Pending Parts'],
    dropStatus: 'On Hold',
    hint: 'Blocked — parts or approval',
  },
  {
    id: 'verify',
    label: 'Pending Verification',
    statuses: ['Pending Verification'],
    dropStatus: 'Pending Verification',
    hint: 'Supervisor sign-off due',
  },
  { id: 'closed', label: 'Closed', statuses: ['Closed'], dropStatus: 'Closed', hint: 'Completed and verified' },
]

/** MIME type used by the kanban drag payload. */
export const DRAG_MIME = 'application/x-kdh-work-order'

/* ================================================================== */
/* Iconography                                                         */
/* ================================================================== */

export const TYPE_ICON: Record<WorkOrderType, LucideIcon> = {
  Corrective: WrenchIcon,
  Preventive: ShieldCheckIcon,
  Predictive: ActivityIcon,
  Inspection: ClipboardCheckIcon,
  'Statutory Compliance': ScaleIcon,
  Emergency: SirenIcon,
  'Upgrade / Improvement': HammerIcon,
}

export const SOURCE_ICON: Record<WorkOrderSource, LucideIcon> = {
  'QR Scan': QrCodeIcon,
  'Tenant Portal': GlobeIcon,
  'Call Centre': PhoneIcon,
  'IoT Sensor': RadioIcon,
  'Scheduled PM': CalendarClockIcon,
  'WhatsApp Bot': MessageCircleIcon,
  'Inspection Finding': SearchIcon,
}

/* ================================================================== */
/* Priority / SLA policy                                               */
/* ================================================================== */

/** KDH service catalogue response targets — drives the auto-suggest on the raise form. */
export const SLA_HOURS_BY_PRIORITY: Record<Priority, number> = {
  'P1 - Critical': 4,
  'P2 - High': 8,
  'P3 - Medium': 48,
  'P4 - Low': 120,
}

/** Short form used on dense cards: "P1", "P2"… */
export function priorityShort(priority: Priority): string {
  return priority.slice(0, 2)
}

/**
 * Standard job steps issued with a new ticket, mirroring the templates the seeded
 * work orders carry so a user-raised job looks identical to a system one.
 */
export const CHECKLIST_TEMPLATE: Record<WorkOrderType, readonly string[]> = {
  Corrective: [
    'Isolate and make safe',
    'Diagnose fault',
    'Replace faulty component',
    'Function test',
    'Housekeeping and handover',
  ],
  Preventive: [
    'Visual inspection',
    'Clean and lubricate',
    'Tighten terminations',
    'Record readings',
    'Update service tag',
  ],
  Predictive: [
    'Attach measurement device',
    'Capture baseline readings',
    'Compare against trend',
    'Issue findings report',
  ],
  Inspection: ['Site walkthrough', 'Photograph defects', 'Update condition score', 'Log findings in register'],
  'Statutory Compliance': [
    'Notify appointed competent person',
    'Witness statutory test',
    'Collect certificate',
    'File to compliance register',
  ],
  Emergency: [
    'Secure area and isolate',
    'Restore temporary service',
    'Notify zone manager',
    'Complete permanent repair',
  ],
  'Upgrade / Improvement': [
    'Confirm scope with custodian',
    'Procure materials',
    'Execute installation',
    'Commission and test',
    'Handover and training',
  ],
}

/** Builds a fresh checklist for a work order about to be created. */
export function buildChecklist(type: WorkOrderType, seed: string): ChecklistItem[] {
  return CHECKLIST_TEMPLATE[type].map((label, i) => ({
    id: `chk-${seed}-${pad2(i + 1)}`,
    label,
    done: false,
  }))
}

/* ================================================================== */
/* Planned vs reactive                                                 */
/* ================================================================== */

const REACTIVE_TYPES: readonly WorkOrderType[] = ['Corrective', 'Emergency']

export function isReactive(wo: Pick<WorkOrder, 'type'>): boolean {
  return REACTIVE_TYPES.includes(wo.type)
}

/* ================================================================== */
/* Status transitions                                                  */
/* ================================================================== */

export type ActionVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'

export interface WoAction {
  status: WorkOrderStatus
  label: string
  variant: ActionVariant
}

/**
 * The moves a supervisor may legally make from the current state. Keeping this in one
 * place means the detail sheet's buttons and the board's drop targets never drift apart.
 */
export function nextActions(status: WorkOrderStatus): WoAction[] {
  switch (status) {
    case 'Open':
      return [
        { status: 'Assigned', label: 'Assign', variant: 'default' },
        { status: 'In Progress', label: 'Start Work', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'Assigned':
      return [
        { status: 'In Progress', label: 'Start Work', variant: 'default' },
        { status: 'On Hold', label: 'Hold', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'In Progress':
      return [
        { status: 'Pending Verification', label: 'Complete', variant: 'default' },
        { status: 'Pending Parts', label: 'Await Parts', variant: 'outline' },
        { status: 'On Hold', label: 'Hold', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'On Hold':
      return [
        { status: 'In Progress', label: 'Resume', variant: 'default' },
        { status: 'Pending Parts', label: 'Await Parts', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'Pending Parts':
      return [
        { status: 'In Progress', label: 'Parts Received — Resume', variant: 'default' },
        { status: 'On Hold', label: 'Hold', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'Pending Verification':
      return [
        { status: 'Closed', label: 'Verify & Close', variant: 'default' },
        { status: 'In Progress', label: 'Reject — Rework', variant: 'outline' },
        { status: 'Cancelled', label: 'Cancel', variant: 'destructive' },
      ]
    case 'Closed':
      return [{ status: 'Open', label: 'Re-open', variant: 'outline' }]
    case 'Cancelled':
      return [{ status: 'Open', label: 'Re-open', variant: 'outline' }]
    default:
      return []
  }
}

/* ================================================================== */
/* Monthly maintenance series                                          */
/* ================================================================== */

export interface MaintenanceMonthPoint {
  period: string
  label: string
  raised: number
  closed: number
  breached: number
  /** Mean hours from raise to completion for tickets closed that month. */
  mttrHours: number
  planned: number
  reactive: number
  /** Share of the month's raised volume that was planned, percent. */
  plannedPct: number
}

/**
 * Month-by-month view of the work order book. Analytics already covers SLA compliance
 * and MTTR by category; this adds the closure, MTTR-over-time and planned/reactive
 * dimensions that the maintenance analytics tab needs.
 */
export function maintenanceMonthlySeries(
  workOrders: WorkOrder[],
  months = 12,
  now: Date = new Date(),
): MaintenanceMonthPoint[] {
  const out: MaintenanceMonthPoint[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const period = periodKey(d)
    const label = MONTH_SHORT[d.getMonth()]

    const raisedRows = workOrders.filter((w) => periodKey(new Date(w.raisedAt)) === period)
    const closedRows = workOrders.filter(
      (w) => w.status === 'Closed' && w.completedAt && periodKey(new Date(w.completedAt)) === period,
    )

    const durations = closedRows
      .map((w) => (new Date(w.completedAt as string).getTime() - new Date(w.raisedAt).getTime()) / MS_HOUR)
      .filter((h) => Number.isFinite(h) && h >= 0)

    const reactive = raisedRows.filter(isReactive).length
    const planned = raisedRows.length - reactive

    out.push({
      period,
      label,
      raised: raisedRows.length,
      closed: closedRows.length,
      breached: raisedRows.filter((w) => w.slaStatus === 'Breached').length,
      mttrHours:
        durations.length === 0
          ? 0
          : Math.round((durations.reduce((s, v) => s + v, 0) / durations.length) * 10) / 10,
      planned,
      reactive,
      plannedPct: raisedRows.length === 0 ? 0 : Math.round((planned / raisedRows.length) * 1000) / 10,
    })
  }

  return out
}

/** Spend attributable to work orders completed in the current calendar month. */
export function workOrderSpendThisMonth(workOrders: WorkOrder[], now: Date = new Date()): number {
  const key = periodKey(now)
  return workOrders
    .filter((w) => w.completedAt && periodKey(new Date(w.completedAt)) === key)
    .reduce((s, w) => s + (w.actualCost ?? w.estimatedCost), 0)
}

/** Total invoice value of the parts booked to a ticket. */
export function partsTotal(wo: Pick<WorkOrder, 'parts'>): number {
  return wo.parts.reduce((s, p) => s + p.qty * p.unitCost, 0)
}

/** Completed / total checklist steps. */
export function checklistProgress(wo: Pick<WorkOrder, 'checklist'>): { done: number; total: number; pct: number } {
  const total = wo.checklist.length
  const done = wo.checklist.filter((c) => c.done).length
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}
