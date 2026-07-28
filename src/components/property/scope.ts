import type { Asset, Lease, Payment, PropertyUnit, Tenant, Zone } from '@/lib/types'

/**
 * The zone- and period-filtered slice of the portfolio every Property tab reads
 * from. Built once in `property.tsx` so no tab recomputes the join.
 */
export interface PropertyScope {
  /** 'all' means every zone the signed-in user may see. */
  zone: Zone | 'all'
  /** Zones the signed-in persona is allowed to see. */
  allowedZones: Zone[]
  /** Trailing window used by the trend charts, in months. */
  months: number
  now: Date

  units: PropertyUnit[]
  leases: Lease[]
  payments: Payment[]
  tenants: Tenant[]
  assets: Asset[]

  unitById: Map<string, PropertyUnit>
}

/** Callbacks the page hands down so any tab can open the shared panels. */
export interface PropertyActions {
  openLease: (leaseId: string) => void
  openTenant: (tenantId: string) => void
  openRecordPayment: (leaseId: string) => void
  openNewLease: () => void
  escalateNotice: (leaseId: string) => void
  sendReminder: (leaseId: string) => void
  renewLease: (leaseId: string) => void
  declineRenewal: (leaseId: string) => void
}
