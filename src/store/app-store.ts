/**
 * KDH One Asset — application data store.
 *
 * Seeded from `@/data/mock` and persisted to localStorage so the demo survives a
 * refresh. Every mutating action writes an AuditEntry (the Audit Trail screen is a
 * selling point) and, where a human would want to know, raises a Notification.
 *
 * No network calls. `resetDemoData()` puts the whole portfolio back to seed state.
 */

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import {
  ASSETS,
  AUDIT_LOG,
  LEASES,
  MONTHLY_FINANCIALS,
  NOTIFICATIONS,
  PAYMENTS,
  SCHEDULES,
  TECHNICIANS,
  TENANTS,
  UNITS,
  VENDORS,
  WORK_ORDERS,
} from '@/data/mock'
import { formatDateTime, formatMYR } from '@/lib/format'
import { NOTICE_STAGES, type ArrearsAgeing, type Asset, type AssetCategory, type AuditEntry, type Lease, type MaintenanceSchedule, type MonthlyFinancial, type Notification, type NoticeStage, type Payment, type PropertyUnit, type SlaStatus, type Technician, type Tenant, type Vendor, type WorkOrder, type WorkOrderStatus } from '@/lib/types'
import { useAuthStore } from '@/store/auth-store'

/* ================================================================== */
/* Constants                                                           */
/* ================================================================== */

const PERSIST_KEY = 'kdh-one-asset-v1'
const PERSIST_VERSION = 1

/**
 * How long a persisted snapshot stays usable. The seed is generated relative to load
 * time, so an older snapshot replays dates that have quietly drifted into the past.
 * Two days comfortably covers a multi-day demo without ever letting the data look off.
 */
const MAX_SNAPSHOT_AGE_MS = 2 * 24 * 3_600_000

/** Mirrors the code prefixes used by the seed generator, e.g. KDH-CP-0042. */
const CATEGORY_CODE: Record<AssetCategory, string> = {
  'Commercial Property': 'CP',
  Industrial: 'IN',
  Land: 'LD',
  'Tourism & Hospitality': 'TH',
  Infrastructure: 'IF',
  'Building & Facility': 'BF',
  'Plant & Equipment': 'PE',
  'ICT & Digital': 'IT',
}

/** Statuses that mean the ticket is still consuming SLA. */
const TERMINAL_WO_STATUSES: readonly WorkOrderStatus[] = ['Closed', 'Cancelled']

/** Arrears buckets in draining order — oldest debt is settled first. */
const AGEING_ORDER: readonly (keyof ArrearsAgeing)[] = ['d90plus', 'd90', 'd60', 'd30', 'current']

const MS_HOUR = 3_600_000

/* ================================================================== */
/* Module-level helpers                                                */
/* ================================================================== */

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function nowIso(): string {
  return new Date().toISOString()
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

let uidCounter = 0
function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}-${Date.now().toString(36)}${pad(uidCounter % 1000, 3)}`
}

/** Next `<prefix>-NNNN` id that does not collide with anything already in the array. */
function nextSequentialId(prefix: string, rows: readonly { id: string }[], width = 4): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const row of rows) {
    const m = re.exec(row.id)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `${prefix}-${pad(max + 1, width)}`
}

/** Next asset code within its category, e.g. KDH-CP-0043. */
export function nextAssetCode(assets: readonly Asset[], category: AssetCategory): string {
  const cc = CATEGORY_CODE[category] ?? 'GN'
  const re = new RegExp(`^KDH-${cc}-(\\d+)$`)
  let max = 0
  for (const a of assets) {
    const m = re.exec(a.code)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `KDH-${cc}-${pad(max + 1, 4)}`
}

/** Next work order code for a calendar year, e.g. WO-2026-0191. */
export function nextWorkOrderCode(workOrders: readonly WorkOrder[], year: number): string {
  const re = new RegExp(`^WO-${year}-(\\d+)$`)
  let max = 0
  for (const w of workOrders) {
    const m = re.exec(w.code)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `WO-${year}-${pad(max + 1, 4)}`
}

/** Next lease code for a calendar year, e.g. LSE-2026-204. */
export function nextLeaseCode(leases: readonly Lease[], year: number): string {
  const re = new RegExp(`^LSE-${year}-(\\d+)$`)
  let max = 0
  for (const l of leases) {
    const m = re.exec(l.code)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `LSE-${year}-${pad(max + 1, 3)}`
}

/**
 * Single source of truth for SLA state — reused by `addWorkOrder`,
 * `updateWorkOrder` and `setWorkOrderStatus` so the rule is never duplicated.
 */
export function recomputeSlaStatus(
  wo: Pick<WorkOrder, 'raisedAt' | 'slaDueAt'> & { completedAt?: string },
  now: Date = new Date(),
): SlaStatus {
  const due = new Date(wo.slaDueAt).getTime()
  const raised = new Date(wo.raisedAt).getTime()
  if (!Number.isFinite(due) || !Number.isFinite(raised)) return 'On Track'

  if (wo.completedAt) {
    const done = new Date(wo.completedAt).getTime()
    if (!Number.isFinite(done)) return 'On Track'
    return done <= due ? 'Met' : 'Breached'
  }

  const t = now.getTime()
  if (t > due) return 'Breached'
  const window = Math.max(1, due - raised)
  return due - t < window * 0.25 ? 'At Risk' : 'On Track'
}

/** Arrears never escalate on payment — the stage can only stay put or improve. */
function derivedNoticeStage(ageing: ArrearsAgeing, outstanding: number, current: NoticeStage): NoticeStage {
  let derived: NoticeStage = 'None'
  if (outstanding > 0.5) {
    if (ageing.d90plus > 0) derived = 'Legal Action'
    else if (ageing.d90 > 0) derived = 'Final Notice'
    else if (ageing.d60 > 0) derived = '1st Notice'
    else if (ageing.d30 > 0) derived = 'Reminder Sent'
  }
  const currentIdx = NOTICE_STAGES.indexOf(current)
  const derivedIdx = NOTICE_STAGES.indexOf(derived)
  return NOTICE_STAGES[Math.min(currentIdx < 0 ? derivedIdx : currentIdx, derivedIdx)]
}

/** Signed-in persona, used as the audit actor. */
function currentActor(): string {
  return useAuthStore.getState().user?.name ?? 'Sistem KDH One Asset'
}

function makeAudit(action: string, entity: string, entityId: string, detail: string, actor?: string): AuditEntry {
  return {
    id: uid('aud'),
    at: nowIso(),
    actor: actor ?? currentActor(),
    action,
    entity,
    entityId,
    detail,
  }
}

function makeNotification(
  title: string,
  body: string,
  severity: Notification['severity'],
  link?: string,
): Notification {
  return { id: uid('ntf'), title, body, at: nowIso(), severity, read: false, link }
}

/** localStorage that degrades quietly if the demo machine has storage disabled or full. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      /* quota exceeded / private mode — the in-memory store still works */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      /* no-op */
    }
  },
}

/* ================================================================== */
/* Action input shapes                                                 */
/* ================================================================== */

export type NewAssetInput = Omit<Asset, 'id' | 'code' | 'createdAt' | 'updatedAt'> & Partial<Asset>

/**
 * Only `assetId` and `title` are mandatory — everything else falls back to a sensible
 * default, and the asset's name / code / zone are resolved from the register.
 */
export interface NewWorkOrderInput extends Partial<WorkOrder> {
  assetId: string
  title: string
}

/** A tenant created inline from the New Lease flow. */
export interface NewTenantInput extends Partial<Tenant> {
  name: string
}

/** Unit and tenant are resolved from the store so the lease is always consistent. */
export interface NewLeaseInput extends Partial<Lease> {
  unitId: string
  tenantId: string
  monthlyRent: number
  startDate: string
  endDate: string
}

/* ================================================================== */
/* Seed                                                                */
/* ================================================================== */

function seedState(): AppData {
  return {
    assets: ASSETS.map((a) => ({ ...a })),
    workOrders: WORK_ORDERS.map((w) => ({ ...w })),
    units: UNITS.map((u) => ({ ...u })),
    tenants: TENANTS.map((t) => ({ ...t })),
    leases: LEASES.map((l) => ({ ...l, ageing: { ...l.ageing } })),
    payments: PAYMENTS.map((p) => ({ ...p })),
    vendors: VENDORS.map((v) => ({ ...v })),
    technicians: TECHNICIANS.map((t) => ({ ...t })),
    schedules: SCHEDULES.map((s) => ({ ...s })),
    notifications: NOTIFICATIONS.map((n) => ({ ...n })),
    auditLog: AUDIT_LOG.map((a) => ({ ...a })),
    monthlyFinancials: MONTHLY_FINANCIALS.map((m) => ({ ...m })),
    lastResetAt: nowIso(),
  }
}

/**
 * True when a persisted snapshot is recent enough to trust. A missing or unparseable
 * stamp counts as stale, so anything written by an older build is re-seeded rather than
 * replayed.
 */
function isSnapshotFresh(lastResetAt: string | undefined, now: Date = new Date()): boolean {
  if (!lastResetAt) return false
  const t = new Date(lastResetAt).getTime()
  if (!Number.isFinite(t)) return false
  const age = now.getTime() - t
  /* A stamp from the future means a clock change — treat it as untrustworthy. */
  return age >= 0 && age <= MAX_SNAPSHOT_AGE_MS
}

/** The data half of the store, without the actions — this is what gets persisted. */
function pickData(s: AppState): AppData {
  return {
    assets: s.assets,
    workOrders: s.workOrders,
    units: s.units,
    tenants: s.tenants,
    leases: s.leases,
    payments: s.payments,
    vendors: s.vendors,
    technicians: s.technicians,
    schedules: s.schedules,
    notifications: s.notifications,
    auditLog: s.auditLog,
    monthlyFinancials: s.monthlyFinancials,
    lastResetAt: s.lastResetAt,
  }
}

/* ================================================================== */
/* Store                                                               */
/* ================================================================== */

export interface AppData {
  assets: Asset[]
  workOrders: WorkOrder[]
  units: PropertyUnit[]
  tenants: Tenant[]
  leases: Lease[]
  payments: Payment[]
  vendors: Vendor[]
  technicians: Technician[]
  schedules: MaintenanceSchedule[]
  notifications: Notification[]
  auditLog: AuditEntry[]
  monthlyFinancials: MonthlyFinancial[]
  /** ISO datetime the demo dataset was last restored to seed. */
  lastResetAt: string
}

export interface AppActions {
  addAsset(input: NewAssetInput): Asset
  updateAsset(id: string, patch: Partial<Asset>): void
  deleteAsset(id: string): void

  addWorkOrder(input: NewWorkOrderInput): WorkOrder
  updateWorkOrder(id: string, patch: Partial<WorkOrder>): void
  setWorkOrderStatus(id: string, status: WorkOrderStatus, actor?: string): void

  /**
   * Register a tenant. The New Lease flow can create one inline, and without
   * this the lease would point at a tenant id that resolves to nothing.
   */
  addTenant(input: NewTenantInput): Tenant

  addLease(input: NewLeaseInput): Lease
  updateLease(id: string, patch: Partial<Lease>): void
  recordPayment(leaseId: string, amount: number, method?: Payment['method']): void

  markNotificationRead(id: string): void
  markAllNotificationsRead(): void
  resetDemoData(): void
}

export type AppState = AppData & AppActions

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...seedState(),

      /* ---------------------------------------------------------- */
      /* Assets                                                      */
      /* ---------------------------------------------------------- */

      addAsset: (input) => {
        const { assets } = get()
        const at = nowIso()
        const code = input.code ?? nextAssetCode(assets, input.category)
        const asset: Asset = {
          ...input,
          id: input.id ?? nextSequentialId('ast', assets),
          code,
          qrPayload: input.qrPayload ?? `https://oneasset.kdh.com.my/qr/${code}`,
          tags: input.tags ?? [],
          documents: input.documents ?? [],
          createdAt: at,
          updatedAt: at,
          isUserAdded: true,
        }

        set((s) => ({
          assets: [asset, ...s.assets],
          auditLog: [
            makeAudit(
              'Created asset',
              'Asset',
              asset.code,
              `${asset.name} — ${asset.location.town}, ${asset.location.zone}`,
            ),
            ...s.auditLog,
          ],
          notifications: [
            makeNotification(
              `New asset registered — ${asset.code}`,
              `${asset.name} telah didaftarkan dalam ${asset.location.zone} dengan nilai ${formatMYR(asset.currentValue)}. Label QR sedia untuk dicetak.`,
              'success',
              `/assets/${asset.id}`,
            ),
            ...s.notifications,
          ],
        }))

        return asset
      },

      updateAsset: (id, patch) => {
        const before = get().assets.find((a) => a.id === id)
        if (!before) return
        const changed = Object.keys(patch).filter(
          (k) => (patch as Record<string, unknown>)[k] !== (before as unknown as Record<string, unknown>)[k],
        )

        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch, id: a.id, updatedAt: nowIso() } : a)),
          auditLog: [
            makeAudit(
              'Updated asset',
              'Asset',
              before.code,
              changed.length > 0
                ? `${before.name} — medan dikemas kini: ${changed.join(', ')}`
                : `${before.name} — rekod disemak semula`,
            ),
            ...s.auditLog,
          ],
        }))
      },

      deleteAsset: (id) => {
        const { assets, workOrders } = get()
        const target = assets.find((a) => a.id === id)
        if (!target) return
        const linked = workOrders.filter((w) => w.assetId === id).length

        set((s) => ({
          assets: s.assets.filter((a) => a.id !== id),
          workOrders: s.workOrders.filter((w) => w.assetId !== id),
          auditLog: [
            makeAudit(
              'Deleted asset',
              'Asset',
              target.code,
              `${target.name} — ${target.location.town}. ${linked} arahan kerja berkaitan turut dikeluarkan.`,
            ),
            ...s.auditLog,
          ],
          notifications: [
            makeNotification(
              `Asset removed — ${target.code}`,
              `${target.name} telah dikeluarkan daripada daftar aset. Rekod kekal dalam jejak audit.`,
              'warning',
              '/assets',
            ),
            ...s.notifications,
          ],
        }))
      },

      /* ---------------------------------------------------------- */
      /* Work orders                                                 */
      /* ---------------------------------------------------------- */

      addWorkOrder: (input) => {
        const { workOrders, assets } = get()
        const asset = assets.find((a) => a.id === input.assetId)
        const raisedAt = input.raisedAt ?? nowIso()
        const raisedDate = new Date(raisedAt)
        const year = raisedDate.getFullYear()
        const slaHours = input.slaHours ?? 24
        const slaDueAt = new Date(raisedDate.getTime() + slaHours * MS_HOUR).toISOString()
        const status: WorkOrderStatus = input.status ?? 'Open'
        const raisedBy = input.raisedBy ?? currentActor()
        const code = input.code ?? nextWorkOrderCode(workOrders, year)

        const wo: WorkOrder = {
          id: input.id ?? nextSequentialId('wo', workOrders),
          code,
          assetId: input.assetId,
          assetName: input.assetName ?? asset?.name ?? 'Aset tidak diketahui',
          assetCode: input.assetCode ?? asset?.code ?? '—',
          zone: input.zone ?? asset?.location.zone ?? 'Zon Bandar Tenggara',
          title: input.title,
          description:
            input.description ??
            `${input.title} dilaporkan di ${asset?.name ?? 'aset'} (${asset?.code ?? '—'}), ${asset?.location.town ?? ''}. SLA ${slaHours} jam.`,
          type: input.type ?? 'Corrective',
          priority: input.priority ?? 'P3 - Medium',
          status,
          source: input.source ?? 'Tenant Portal',
          raisedBy,
          raisedAt,
          assignedTo: input.assignedTo ?? (status === 'Open' ? 'Unassigned' : raisedBy),
          team: input.team ?? (status === 'Open' ? 'Pending Triage' : 'Pasukan Zon'),
          vendorId: input.vendorId,
          slaHours,
          slaDueAt,
          respondedAt: input.respondedAt,
          completedAt: input.completedAt,
          slaStatus: 'On Track',
          estimatedCost: input.estimatedCost ?? 0,
          actualCost: input.actualCost,
          downtimeHours: input.downtimeHours ?? 0,
          checklist: input.checklist ?? [],
          parts: input.parts ?? [],
          rootCause: input.rootCause,
          failureCode: input.failureCode,
          history: [
            {
              at: raisedAt,
              actor: raisedBy,
              action: 'Created',
              note: `Arahan kerja dijana melalui ${input.source ?? 'Tenant Portal'}. SLA ${slaHours} jam.`,
            },
          ],
          isUserAdded: true,
        }
        wo.slaStatus = recomputeSlaStatus(wo)

        const isUrgent = wo.priority === 'P1 - Critical' || wo.type === 'Emergency'

        set((s) => ({
          workOrders: [wo, ...s.workOrders],
          auditLog: [
            makeAudit('Created work order', 'WorkOrder', wo.code, `${wo.title} — ${wo.assetCode} (${wo.zone})`),
            ...s.auditLog,
          ],
          notifications: [
            makeNotification(
              isUrgent ? `${wo.priority} raised — ${wo.code}` : `New work order ${wo.code}`,
              `${wo.title} di ${wo.assetName}. SLA ${wo.slaHours} jam, tamat tempoh ${formatDateTime(wo.slaDueAt)}.`,
              isUrgent ? 'critical' : 'info',
              `/work-orders/${wo.id}`,
            ),
            ...s.notifications,
          ],
        }))

        return wo
      },

      updateWorkOrder: (id, patch) => {
        const before = get().workOrders.find((w) => w.id === id)
        if (!before) return

        set((s) => ({
          workOrders: s.workOrders.map((w) => {
            if (w.id !== id) return w
            const merged: WorkOrder = { ...w, ...patch, id: w.id }
            // Re-derive the SLA deadline if the clock inputs moved.
            if (patch.slaHours !== undefined || patch.raisedAt !== undefined) {
              merged.slaDueAt = new Date(
                new Date(merged.raisedAt).getTime() + merged.slaHours * MS_HOUR,
              ).toISOString()
            }
            merged.slaStatus = recomputeSlaStatus(merged)
            return merged
          }),
          auditLog: [
            makeAudit(
              'Updated work order',
              'WorkOrder',
              before.code,
              `${before.title} — medan dikemas kini: ${Object.keys(patch).join(', ') || 'tiada'}`,
            ),
            ...s.auditLog,
          ],
        }))
      },

      setWorkOrderStatus: (id, status, actor) => {
        const before = get().workOrders.find((w) => w.id === id)
        if (!before) return
        const who = actor ?? currentActor()
        const at = nowIso()

        let breached = false
        let closed = false

        set((s) => ({
          workOrders: s.workOrders.map((w) => {
            if (w.id !== id) return w

            const next: WorkOrder = { ...w, status }

            // First movement off "Open" stamps the response time.
            if (status !== 'Open' && !next.respondedAt) next.respondedAt = at

            if (status === 'Closed' || status === 'Cancelled') {
              next.completedAt = at
              closed = status === 'Closed'
            } else {
              // Re-opening a closed ticket clears the completion stamp.
              next.completedAt = undefined
              next.actualCost = status === 'Open' ? undefined : next.actualCost
            }

            if (status === 'Open') {
              next.respondedAt = undefined
              next.assignedTo = 'Unassigned'
              next.team = 'Pending Triage'
            }

            next.slaStatus = recomputeSlaStatus(next)
            breached = next.slaStatus === 'Breached'

            next.history = [
              ...w.history,
              {
                at,
                actor: who,
                action: `Status changed to ${status}`,
                note: `Daripada "${w.status}" kepada "${status}".`,
              },
            ]
            return next
          }),
          auditLog: [
            makeAudit(
              'Changed work order status',
              'WorkOrder',
              before.code,
              `${before.title} — "${before.status}" → "${status}"`,
              who,
            ),
            ...s.auditLog,
          ],
        }))

        if (closed || breached) {
          set((s) => ({
            notifications: [
              closed
                ? makeNotification(
                    `Work order closed — ${before.code}`,
                    `${before.title} di ${before.assetName} telah disiapkan oleh ${who}.`,
                    'success',
                    `/work-orders/${id}`,
                  )
                : makeNotification(
                    `SLA breached — ${before.code}`,
                    `${before.title} di ${before.assetName} telah melepasi tempoh SLA ${before.slaHours} jam.`,
                    'critical',
                    `/work-orders/${id}`,
                  ),
              ...s.notifications,
            ],
          }))
        }
      },

      /* ---------------------------------------------------------- */
      /* Leasing                                                     */
      /* ---------------------------------------------------------- */

      addTenant: (input) => {
        const { tenants } = get()
        const year = new Date().getFullYear()

        const tenant: Tenant = {
          id: input.id ?? nextSequentialId('tnt', tenants),
          name: input.name,
          ssmNo: input.ssmNo ?? `${202000000 + tenants.length + 1}-${(tenants.length % 90) + 10}`,
          contactPerson: input.contactPerson ?? input.name,
          phone: input.phone ?? '+60 7-000 0000',
          email:
            input.email ??
            `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@example.com.my`,
          businessCategory: input.businessCategory ?? 'Perniagaan Am',
          creditRating: input.creditRating ?? 'B',
          tenantSinceYear: input.tenantSinceYear ?? year,
        }

        set((s) => ({
          tenants: [tenant, ...s.tenants],
          auditLog: [
            makeAudit('Registered tenant', 'Tenant', tenant.id, `${tenant.name} (${tenant.ssmNo})`),
            ...s.auditLog,
          ],
        }))

        return tenant
      },

      addLease: (input) => {
        const { leases, units, tenants } = get()
        const unit = units.find((u) => u.id === input.unitId)
        const tenant = tenants.find((t) => t.id === input.tenantId)
        const start = new Date(input.startDate)
        const year = Number.isFinite(start.getTime()) ? start.getFullYear() : new Date().getFullYear()
        const area = unit?.lettableAreaSqft ?? 0
        const months = input.tenureMonths ?? 36

        const lease: Lease = {
          id: input.id ?? nextSequentialId('lse', leases),
          code: input.code ?? nextLeaseCode(leases, year),
          unitId: input.unitId,
          unitNo: input.unitNo ?? unit?.unitNo ?? '—',
          propertyName: input.propertyName ?? unit?.propertyName ?? 'Hartanah KDH',
          assetId: input.assetId ?? unit?.assetId ?? '',
          tenantId: input.tenantId,
          tenantName: input.tenantName ?? tenant?.name ?? 'Penyewa Baharu',
          businessType: input.businessType ?? tenant?.businessCategory ?? 'Perniagaan Am',
          zone: input.zone ?? unit?.zone ?? 'Zon Bandar Tenggara',
          startDate: input.startDate,
          endDate: input.endDate,
          tenureMonths: months,
          monthlyRent: input.monthlyRent,
          ratePsf: input.ratePsf ?? (area > 0 ? Number((input.monthlyRent / area).toFixed(3)) : 0),
          deposit: input.deposit ?? Math.round(input.monthlyRent * 2),
          serviceCharge: input.serviceCharge ?? Math.round(input.monthlyRent * 0.08),
          status: input.status ?? 'Active',
          hasRenewalOption: input.hasRenewalOption ?? true,
          escalationPct: input.escalationPct ?? 3,
          outstandingAmount: input.outstandingAmount ?? 0,
          daysOverdue: input.daysOverdue ?? 0,
          ageing: input.ageing ?? { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 },
          lastPaymentDate: input.lastPaymentDate,
          noticeStage: input.noticeStage ?? 'None',
          isUserAdded: true,
        }

        set((s) => ({
          leases: [lease, ...s.leases],
          units: s.units.map((u) => (u.id === lease.unitId ? { ...u, status: 'Occupied' } : u)),
          auditLog: [
            makeAudit(
              'Created lease',
              'Lease',
              lease.code,
              `${lease.tenantName} — ${lease.propertyName} ${lease.unitNo}, ${formatMYR(lease.monthlyRent)}/bulan`,
            ),
            ...s.auditLog,
          ],
          notifications: [
            makeNotification(
              `Lease executed — ${lease.code}`,
              `${lease.tenantName} kini menyewa ${lease.propertyName} ${lease.unitNo} pada ${formatMYR(lease.monthlyRent)} sebulan sehingga ${lease.endDate}.`,
              'success',
              `/property?lease=${lease.id}`,
            ),
            ...s.notifications,
          ],
        }))

        return lease
      },

      updateLease: (id, patch) => {
        const before = get().leases.find((l) => l.id === id)
        if (!before) return
        const terminated = patch.status === 'Terminated' || patch.status === 'Expired'

        set((s) => ({
          leases: s.leases.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)),
          units: terminated
            ? s.units.map((u) => (u.id === before.unitId ? { ...u, status: 'Vacant' } : u))
            : s.units,
          auditLog: [
            makeAudit(
              'Updated lease',
              'Lease',
              before.code,
              `${before.tenantName} — ${before.propertyName} ${before.unitNo}. Medan: ${Object.keys(patch).join(', ') || 'tiada'}`,
            ),
            ...s.auditLog,
          ],
        }))
      },

      recordPayment: (leaseId, amount, method = 'FPX') => {
        const state = get()
        const lease = state.leases.find((l) => l.id === leaseId)
        if (!lease || !Number.isFinite(amount) || amount <= 0) return

        const applied = round2(Math.min(amount, Math.max(lease.outstandingAmount, 0) || amount))

        /* Drain arrears buckets oldest-first. */
        const ageing: ArrearsAgeing = { ...lease.ageing }
        let remaining = applied
        for (const bucket of AGEING_ORDER) {
          if (remaining <= 0) break
          const take = Math.min(remaining, ageing[bucket])
          ageing[bucket] = round2(ageing[bucket] - take)
          remaining = round2(remaining - take)
        }

        const outstanding = Math.max(0, round2(lease.outstandingAmount - applied))
        const settled = outstanding <= 0.5
        const paidDate = ymd(new Date())

        /* Settle open invoices oldest-first so the ledger matches the arrears. */
        let credit = applied
        const leasePayments = state.payments
          .filter((p) => p.leaseId === leaseId && p.status !== 'Paid')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        const settlements = new Map<string, Payment>()
        for (const p of leasePayments) {
          if (credit <= 0) break
          const owed = round2(p.amountDue - p.amountPaid)
          if (owed <= 0) continue
          const take = round2(Math.min(credit, owed))
          const amountPaid = round2(p.amountPaid + take)
          credit = round2(credit - take)
          settlements.set(p.id, {
            ...p,
            amountPaid,
            paidDate,
            method,
            status: amountPaid >= p.amountDue - 0.5 ? 'Paid' : 'Partial',
          })
        }

        const extraPayment: Payment[] =
          credit > 0.5
            ? [
                {
                  id: uid('pay'),
                  leaseId,
                  period: paidDate.slice(0, 7),
                  amountDue: credit,
                  amountPaid: credit,
                  dueDate: paidDate,
                  paidDate,
                  status: 'Paid',
                  method,
                },
              ]
            : []

        const noticeStage = derivedNoticeStage(ageing, outstanding, lease.noticeStage)

        set((s) => ({
          leases: s.leases.map((l) =>
            l.id === leaseId
              ? {
                  ...l,
                  outstandingAmount: outstanding,
                  ageing,
                  daysOverdue: settled ? 0 : l.daysOverdue,
                  lastPaymentDate: paidDate,
                  noticeStage,
                }
              : l,
          ),
          payments: [...s.payments.map((p) => settlements.get(p.id) ?? p), ...extraPayment],
          auditLog: [
            makeAudit(
              'Recorded payment',
              'Payment',
              lease.code,
              `${lease.tenantName} — ${formatMYR(applied)} melalui ${method}. Baki tunggakan ${formatMYR(outstanding)}.`,
            ),
            ...s.auditLog,
          ],
          notifications: [
            makeNotification(
              settled ? `Arrears cleared — ${lease.tenantName}` : `Payment received — ${lease.tenantName}`,
              settled
                ? `${formatMYR(applied)} diterima bagi ${lease.propertyName} ${lease.unitNo}. Akaun kini tiada tunggakan.`
                : `${formatMYR(applied)} diterima bagi ${lease.propertyName} ${lease.unitNo}. Baki tunggakan ${formatMYR(outstanding)}.`,
              settled ? 'success' : 'info',
              `/property?lease=${lease.id}`,
            ),
            ...s.notifications,
          ],
        }))
      },

      /* ---------------------------------------------------------- */
      /* Notifications & demo control                                */
      /* ---------------------------------------------------------- */

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })),
          auditLog: [
            makeAudit('Marked all notifications read', 'User', 'NOTIFICATIONS', 'Semua pemberitahuan ditandakan telah dibaca'),
            ...s.auditLog,
          ],
        })),

      resetDemoData: () => {
        const fresh = seedState()
        set({
          ...fresh,
          auditLog: [
            makeAudit('Reset demo data', 'System', 'DEMO', 'Set data demo dipulihkan kepada keadaan asal; rekod tambahan pengguna dibuang.'),
            ...fresh.auditLog,
          ],
        })
      },
    }),
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => safeStorage),
      /** Only the data is persisted — actions are re-created by the initializer. */
      partialize: (s) => pickData(s),
      /** Version 1 is the first shipped shape — future versions patch forward here. */
      migrate: (persisted, version) => {
        if (version === PERSIST_VERSION) return persisted as AppState
        // No earlier schema exists yet; fall back to a clean seed rather than guessing.
        return { ...seedState() } as unknown as AppState
      },
      /**
       * Reject a snapshot that has aged out.
       *
       * Every date in `@/data/mock` is generated as an offset from module-load time so
       * the demo always reads as "today" — SLA clocks, leases expiring in 30 days, the
       * trailing financial months. Persisting freezes those offsets into absolute dates,
       * so a snapshot taken at a rehearsal weeks earlier would replay stale: tickets long
       * past their SLA, leases still labelled "Expiring Soon" with an end date in the
       * past, a revenue chart that stops short of the current month.
       *
       * `current` already holds a freshly generated seed, so returning it re-seeds. In-
       * session work still persists normally; only a genuinely aged snapshot is dropped.
       */
      merge: (persisted, current) => {
        const snapshot = persisted as Partial<AppData> | undefined
        if (!snapshot || !isSnapshotFresh(snapshot.lastResetAt)) return current
        return { ...current, ...snapshot }
      },
    },
  ),
)

/* ================================================================== */
/* Selector helpers                                                    */
/* ================================================================== */

/** Unread notification count — cheap enough to use directly in the app shell. */
export function selectUnreadCount(s: AppState): number {
  return s.notifications.reduce((n, x) => (x.read ? n : n + 1), 0)
}

/** Every open (non-terminal) work order. */
export function selectOpenWorkOrders(s: AppState): WorkOrder[] {
  return s.workOrders.filter((w) => !TERMINAL_WO_STATUSES.includes(w.status))
}
