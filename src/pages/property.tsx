import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BanknoteIcon,
  BuildingIcon,
  CalendarClockIcon,
  DoorOpenIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LayersIcon,
  PlusIcon,
  RulerIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { KpiCard } from '@/components/common/kpi-card'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrearsTab } from '@/components/property/arrears-tab'
import { ExpiryTab } from '@/components/property/expiry-tab'
import { LeaseSheet } from '@/components/property/lease-sheet'
import { MonetisationTab } from '@/components/property/monetisation-tab'
import { NewLeaseDialog } from '@/components/property/new-lease-dialog'
import { OccupancyTab } from '@/components/property/occupancy-tab'
import { RecordPaymentDialog } from '@/components/property/record-payment-dialog'
import { RentRollTab } from '@/components/property/rent-roll-tab'
import { TenantSheet } from '@/components/property/tenant-sheet'
import { TenantsTab } from '@/components/property/tenants-tab'
import {
  addMonthsIso,
  nextNoticeStage,
  occupancyTrend,
  tenantDirectory,
} from '@/components/property/helpers'
import type { PropertyActions, PropertyScope } from '@/components/property/scope'
import {
  arrearsSummary,
  collectionRate,
  collectionTrend,
  expiringLeases,
  isLiveLease,
  occupancySummary,
  rentRoll,
} from '@/lib/analytics'
import { downloadCsv, formatArea, formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { ZONES, type Zone } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useAuthStore, visibleZones } from '@/store/auth-store'

const PERIODS = [
  { value: '6', label: '6 bulan terakhir' },
  { value: '12', label: '12 bulan terakhir' },
  { value: '24', label: '24 bulan terakhir' },
] as const

const TABS = [
  { value: 'occupancy', label: 'Penghunian', icon: BuildingIcon },
  { value: 'rent-roll', label: 'Rent Roll', icon: FileSpreadsheetIcon },
  { value: 'arrears', label: 'Tunggakan & Kutipan', icon: LayersIcon },
  { value: 'expiry', label: 'Tamat & Pembaharuan', icon: CalendarClockIcon },
  { value: 'tenants', label: 'Penyewa', icon: UsersIcon },
  { value: 'monetisation', label: 'Pengewangan', icon: SparklesIcon },
] as const

export default function Property() {
  const [searchParams] = useSearchParams()

  /* ---------------- store (narrow selectors only) ---------------- */
  const units = useAppStore((s) => s.units)
  const leases = useAppStore((s) => s.leases)
  const payments = useAppStore((s) => s.payments)
  const tenants = useAppStore((s) => s.tenants)
  const assets = useAppStore((s) => s.assets)
  const updateLease = useAppStore((s) => s.updateLease)
  const user = useAuthStore((s) => s.user)

  /* ---------------- filters ---------------- */
  const allowedZones = useMemo(() => visibleZones(user), [user])
  const [zone, setZone] = useState<Zone | 'all'>('all')
  const [months, setMonths] = useState('12')
  const [tab, setTab] = useState<string>('occupancy')
  const [statusFilter, setStatusFilter] = useState('all')

  /* ---------------- panels ---------------- */
  const [leaseId, setLeaseId] = useState<string | null>(null)
  const [leaseOpen, setLeaseOpen] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantOpen, setTenantOpen] = useState(false)
  const [payLeaseId, setPayLeaseId] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [newLeaseOpen, setNewLeaseOpen] = useState(false)

  /* A persona whose scope narrows must not be left on a zone they cannot see. */
  useEffect(() => {
    if (zone !== 'all' && !allowedZones.includes(zone)) setZone('all')
  }, [allowedZones, zone])

  /* Deep links from the shell: /property?lease=…&status=…&tab=… */
  useEffect(() => {
    const status = searchParams.get('status')
    if (status) {
      setStatusFilter(status)
      setTab('rent-roll')
    }
    const requestedTab = searchParams.get('tab')
    if (requestedTab && TABS.some((t) => t.value === requestedTab)) setTab(requestedTab)
    const lease = searchParams.get('lease')
    if (lease && useAppStore.getState().leases.some((l) => l.id === lease)) {
      setLeaseId(lease)
      setLeaseOpen(true)
    }
  }, [searchParams])

  /* ---------------- scope ---------------- */
  const now = useMemo(() => new Date(), [])

  const scope: PropertyScope = useMemo(() => {
    const inScope = (z: Zone) => allowedZones.includes(z) && (zone === 'all' || z === zone)
    const scopedUnits = units.filter((u) => inScope(u.zone))
    const scopedLeases = leases.filter((l) => inScope(l.zone))
    const leaseIds = new Set(scopedLeases.map((l) => l.id))
    const scopedAssets = assets.filter((a) => inScope(a.location.zone))
    const tenantIds = new Set(scopedLeases.map((l) => l.tenantId))

    return {
      zone,
      allowedZones,
      months: Number(months),
      now,
      units: scopedUnits,
      leases: scopedLeases,
      payments: payments.filter((p) => leaseIds.has(p.leaseId)),
      tenants: tenants.filter((t) => tenantIds.has(t.id) || zone === 'all'),
      assets: scopedAssets,
      unitById: new Map(scopedUnits.map((u) => [u.id, u])),
    }
  }, [units, leases, payments, tenants, assets, zone, allowedZones, months, now])

  const tenantRows = useMemo(
    () => tenantDirectory(scope.tenants, scope.leases, scope.units),
    [scope.tenants, scope.leases, scope.units],
  )

  /* ---------------- KPIs ---------------- */
  const occ = useMemo(() => occupancySummary(scope.units), [scope.units])
  const roll = useMemo(() => rentRoll(scope.leases), [scope.leases])
  const arrears = useMemo(() => arrearsSummary(scope.leases, 5), [scope.leases])
  const expiring90 = useMemo(() => expiringLeases(scope.leases, 90, now), [scope.leases, now])
  const collection = useMemo(
    () => collectionRate(scope.payments, scope.months, now),
    [scope.payments, scope.months, now],
  )
  const collectionSeries = useMemo(
    () => collectionTrend(scope.payments, scope.months, now),
    [scope.payments, scope.months, now],
  )
  const occSeries = useMemo(
    () => occupancyTrend(scope.units, scope.leases, scope.months, now),
    [scope.units, scope.leases, scope.months, now],
  )

  const occDelta =
    occSeries.length > 1 ? occSeries[occSeries.length - 1].ratePct - occSeries[0].ratePct : undefined
  const collectionDelta = (() => {
    const valid = collectionSeries.filter((p) => p.billed > 0)
    if (valid.length < 2) return undefined
    return Number((valid[valid.length - 1].ratePct - valid[valid.length - 2].ratePct).toFixed(1))
  })()
  const expiringValue = expiring90.reduce((s, l) => s + l.monthlyRent, 0)
  const vacantUnits = scope.units.filter((u) => u.status === 'Vacant').length

  /* ---------------- resolved entities ---------------- */
  const activeLease = useMemo(
    () => scope.leases.find((l) => l.id === leaseId) ?? leases.find((l) => l.id === leaseId),
    [scope.leases, leases, leaseId],
  )
  const payLease = useMemo(() => leases.find((l) => l.id === payLeaseId) ?? null, [leases, payLeaseId])
  const activeTenantRow = useMemo(
    () => tenantRows.find((r) => r.tenant.id === tenantId) ?? null,
    [tenantRows, tenantId],
  )

  /* ---------------- actions ---------------- */
  const actions: PropertyActions = useMemo(() => {
    const findLease = (id: string) => leases.find((l) => l.id === id)

    return {
      openLease: (id) => {
        setLeaseId(id)
        setLeaseOpen(true)
      },
      openTenant: (id) => {
        setTenantId(id)
        setTenantOpen(true)
      },
      openRecordPayment: (id) => {
        setPayLeaseId(id)
        setPayOpen(true)
      },
      openNewLease: () => setNewLeaseOpen(true),

      escalateNotice: (id) => {
        const lease = findLease(id)
        if (!lease) return
        if (lease.noticeStage === 'Legal Action') {
          toast.info('Akaun sudah berada di peringkat tindakan undang-undang.', {
            description: `${lease.tenantName} — ${formatMYR(lease.outstandingAmount)} tertunggak.`,
          })
          return
        }
        const stage = nextNoticeStage(lease.noticeStage)
        updateLease(id, { noticeStage: stage })
        toast.warning(`Notis dinaikkan kepada “${stage}”`, {
          description: `${lease.tenantName} — ${lease.propertyName} ${lease.unitNo}. Baki ${formatMYR(lease.outstandingAmount)}, lewat ${formatNumber(lease.daysOverdue)} hari.`,
        })
      },

      sendReminder: (id) => {
        const lease = findLease(id)
        if (!lease) return
        if (lease.noticeStage === 'None') updateLease(id, { noticeStage: 'Reminder Sent' })
        toast.success('Peringatan bayaran dihantar', {
          description: `E-mel dan SMS dihantar kepada ${lease.tenantName} bagi ${formatMYR(lease.outstandingAmount || lease.monthlyRent)}.`,
        })
      },

      renewLease: (id) => {
        const lease = findLease(id)
        if (!lease) return
        const unit = units.find((u) => u.id === lease.unitId)
        const newRent = Math.round(lease.monthlyRent * (1 + (lease.escalationPct || 0) / 100))
        const newEnd = addMonthsIso(lease.endDate, lease.tenureMonths)
        updateLease(id, {
          status: 'Active',
          startDate: lease.endDate,
          endDate: newEnd,
          monthlyRent: newRent,
          ratePsf:
            unit && unit.lettableAreaSqft > 0
              ? Number((newRent / unit.lettableAreaSqft).toFixed(3))
              : lease.ratePsf,
          noticeStage: lease.noticeStage,
        })
        toast.success(`Pajakan ${lease.code} dibaharui`, {
          description: `${lease.tenantName} — ${lease.tenureMonths} bulan lagi pada ${formatMYR(newRent)}/bulan (eskalasi ${formatPct(lease.escalationPct, 1)}).`,
        })
      },

      declineRenewal: (id) => {
        const lease = findLease(id)
        if (!lease) return
        updateLease(id, { status: 'Terminated' })
        toast.warning(`Pembaharuan ${lease.code} ditolak`, {
          description: `${lease.propertyName} ${lease.unitNo} kembali kepada status kosong. ${formatMYR(lease.monthlyRent)}/bulan perlu digantikan.`,
        })
      },
    }
  }, [leases, units, updateLease])

  const exportRentRoll = useCallback(() => {
    const rows = scope.leases.filter(isLiveLease)
    if (rows.length === 0) {
      toast.error('Tiada pajakan aktif dalam saringan ini.')
      return
    }
    downloadCsv(
      `kdh-rent-roll-${zone === 'all' ? 'semua-zon' : zone.replace(/\s+/g, '-').toLowerCase()}`,
      rows.map((l) => ({
        Kod: l.code,
        Hartanah: l.propertyName,
        Unit: l.unitNo,
        Zon: l.zone,
        Penyewa: l.tenantName,
        'Jenis Perniagaan': l.businessType,
        'Keluasan (sqft)': scope.unitById.get(l.unitId)?.lettableAreaSqft ?? 0,
        'Sewa Bulanan (RM)': l.monthlyRent,
        'Kadar (RM psf)': l.ratePsf,
        'Caj Perkhidmatan (RM)': l.serviceCharge,
        Deposit: l.deposit,
        Mula: l.startDate,
        Tamat: l.endDate,
        Status: l.status,
        'Tunggakan (RM)': l.outstandingAmount,
        'Peringkat Notis': l.noticeStage,
      })),
    )
    toast.success(`Rent roll dieksport — ${rows.length} pajakan aktif`, {
      description: `${formatMYR(roll.monthlyContracted)} sewa kontrak sebulan.`,
    })
  }, [scope.leases, scope.unitById, zone, roll.monthlyContracted])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hartanah, Pajakan & Hasil"
        description="Penghunian, rent roll, tunggakan, pembaharuan dan peluang pengewangan merentas enam zon operasi KEJORA."
        icon={BuildingIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'Hartanah & Pajakan' }]}
        actions={
          <>
            <Select value={zone} onValueChange={(v) => setZone(v as Zone | 'all')}>
              <SelectTrigger className="w-56" aria-label="Tapis zon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua zon ({allowedZones.length})</SelectItem>
                {ZONES.filter((z) => allowedZones.includes(z)).map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-44" aria-label="Tempoh analisis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportRentRoll}>
              <DownloadIcon aria-hidden="true" />
              Eksport rent roll
            </Button>
            <Button onClick={() => setNewLeaseOpen(true)}>
              <PlusIcon aria-hidden="true" />
              Pajakan baharu
            </Button>
          </>
        }
      />

      {/* ---------------- KPI strip ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Penghunian portfolio"
          value={formatPct(occ.occupancyRate, 1)}
          sublabel={`${formatNumber(occ.occupied)} daripada ${formatNumber(occ.total)} unit dihuni`}
          icon={BuildingIcon}
          intent={occ.occupancyRate >= 80 ? 'positive' : occ.occupancyRate >= 65 ? 'warning' : 'critical'}
          delta={occDelta === undefined ? undefined : Number(occDelta.toFixed(1))}
          deltaLabel={`sejak ${scope.months} bulan lalu`}
          spark={occSeries.map((p) => p.ratePct)}
          onClick={() => setTab('occupancy')}
        />
        <KpiCard
          label="Sewa kontrak bulanan"
          value={formatMYRCompact(roll.monthlyContracted)}
          sublabel={`${formatNumber(roll.leaseCount)} pajakan aktif · caj ${formatMYRCompact(roll.monthlyServiceCharge)}`}
          icon={WalletIcon}
          onClick={() => setTab('rent-roll')}
        />
        <KpiCard
          label="Sewa tahunan"
          value={formatMYRCompact(roll.annualisedContracted)}
          sublabel="Nilai kontrak disetahunkan"
          icon={TrendingUpIcon}
          onClick={() => setTab('rent-roll')}
        />
        <KpiCard
          label="Kadar kutipan"
          value={formatPct(collection, 1)}
          sublabel={`Purata ${scope.months} bulan`}
          icon={BanknoteIcon}
          intent={collection >= 92 ? 'positive' : collection >= 85 ? 'warning' : 'critical'}
          delta={collectionDelta}
          deltaLabel="berbanding bulan lalu"
          spark={collectionSeries.filter((p) => p.billed > 0).map((p) => p.ratePct)}
          onClick={() => setTab('arrears')}
        />
        <KpiCard
          label="Jumlah tunggakan"
          value={formatMYRCompact(arrears.totalOutstanding)}
          sublabel={`${formatNumber(arrears.accountsInArrears)} akaun · ${formatPct(arrears.arrearsRatePct, 2)} daripada sewa tahunan`}
          icon={LayersIcon}
          intent={arrears.totalOutstanding > 0 ? 'critical' : 'positive'}
          onClick={() => setTab('arrears')}
        />
        <KpiCard
          label="Tamat dalam 90 hari"
          value={formatNumber(expiring90.length)}
          sublabel={`${formatMYR(expiringValue)} sebulan berisiko`}
          icon={CalendarClockIcon}
          intent={expiring90.length > 0 ? 'warning' : 'positive'}
          onClick={() => setTab('expiry')}
        />
        <KpiCard
          label="Keluasan kosong"
          value={formatArea(occ.vacantLettableSqft)}
          sublabel={`${formatNumber(vacantUnits)} unit boleh dipasarkan segera`}
          icon={DoorOpenIcon}
          intent={vacantUnits > 0 ? 'warning' : 'positive'}
          onClick={() => setTab('monetisation')}
        />
        <KpiCard
          label="Kadar purata sesqft"
          value={formatMYR(roll.avgRatePsf, true)}
          sublabel="Purata kadar kontrak pajakan aktif"
          icon={RulerIcon}
          onClick={() => setTab('rent-roll')}
        />
      </div>

      {/* ---------------- tabs ---------------- */}
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="size-3.5" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="occupancy">
          <OccupancyTab scope={scope} actions={actions} />
        </TabsContent>
        <TabsContent value="rent-roll">
          <RentRollTab
            scope={scope}
            actions={actions}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </TabsContent>
        <TabsContent value="arrears">
          <ArrearsTab scope={scope} actions={actions} />
        </TabsContent>
        <TabsContent value="expiry">
          <ExpiryTab scope={scope} actions={actions} />
        </TabsContent>
        <TabsContent value="tenants">
          <TenantsTab rows={tenantRows} actions={actions} />
        </TabsContent>
        <TabsContent value="monetisation">
          <MonetisationTab scope={scope} />
        </TabsContent>
      </Tabs>

      {/* ---------------- panels ---------------- */}
      <LeaseSheet
        lease={activeLease ?? null}
        unit={activeLease ? units.find((u) => u.id === activeLease.unitId) : undefined}
        tenant={activeLease ? tenants.find((t) => t.id === activeLease.tenantId) : undefined}
        payments={payments}
        open={leaseOpen}
        onOpenChange={setLeaseOpen}
        actions={actions}
      />

      <TenantSheet
        row={activeTenantRow}
        payments={payments}
        open={tenantOpen}
        onOpenChange={setTenantOpen}
        actions={actions}
      />

      <RecordPaymentDialog lease={payLease} open={payOpen} onOpenChange={setPayOpen} />

      <NewLeaseDialog
        open={newLeaseOpen}
        onOpenChange={setNewLeaseOpen}
        units={units.filter((u) => scope.allowedZones.includes(u.zone))}
        tenants={tenants}
        onCreated={(id) => {
          setLeaseId(id)
          setLeaseOpen(true)
          setTab('rent-roll')
        }}
      />
    </div>
  )
}
