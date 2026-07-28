import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ActivityIcon,
  BanknoteIcon,
  CalendarClockIcon,
  ChartColumnIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  LayoutGridIcon,
  ListIcon,
  PlayIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  TagIcon,
  TimerIcon,
  TriangleAlertIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react'

import { KpiCard } from '@/components/common/kpi-card'
import { PageHeader } from '@/components/common/page-header'
import { MaintenanceAnalytics } from '@/components/maintenance/maintenance-analytics'
import { PlannedMaintenance } from '@/components/maintenance/planned-maintenance'
import { QrLabelsDialog } from '@/components/maintenance/qr-labels-dialog'
import { QrScanDialog } from '@/components/maintenance/qr-scan-dialog'
import { RaiseWorkOrderDialog } from '@/components/maintenance/raise-work-order-dialog'
import { TechniciansPanel } from '@/components/maintenance/technicians-panel'
import { VendorsPanel } from '@/components/maintenance/vendors-panel'
import { WorkOrderBoard } from '@/components/maintenance/work-order-board'
import { WorkOrderList } from '@/components/maintenance/work-order-list'
import { WorkOrderSheet } from '@/components/maintenance/work-order-sheet'
import { maintenanceMonthlySeries } from '@/components/maintenance/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { slaTrend, workOrderSummary } from '@/lib/analytics'
import { formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { SLA_STATUSES } from '@/lib/types'
import type { SlaStatus, WorkOrderSource } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useAuthStore, visibleZones } from '@/store/auth-store'

const TAB_KEYS = ['board', 'list', 'planned', 'technicians', 'vendors', 'analytics'] as const
type TabKey = (typeof TAB_KEYS)[number]

/** Percentage change between two periods, guarded against a zero base. */
function delta(current: number, previous: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return undefined
  return ((current - previous) / previous) * 100
}

/** Resolution times read better in days once they run past a day. */
function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—'
  if (hours < 24) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} days`
}

export default function Maintenance() {
  const [params, setParams] = useSearchParams()

  const workOrders = useAppStore((s) => s.workOrders)
  const assets = useAppStore((s) => s.assets)
  const monthlyFinancials = useAppStore((s) => s.monthlyFinancials)
  const user = useAuthStore((s) => s.user)

  const [tab, setTab] = useState<TabKey>('board')
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null)
  const [slaSeed, setSlaSeed] = useState<SlaStatus | undefined>(undefined)

  const [scanOpen, setScanOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAssetId, setRaiseAssetId] = useState<string | undefined>(undefined)
  const [raiseSource, setRaiseSource] = useState<WorkOrderSource>('Call Centre')

  const now = useMemo(() => new Date(), [])

  /* ---------------- RBAC scoping ---------------- */

  const zones = useMemo(() => visibleZones(user), [user])
  const scoped = useMemo(() => {
    if (zones.length >= 6) return workOrders
    const allowed = new Set(zones)
    return workOrders.filter((w) => allowed.has(w.zone))
  }, [workOrders, zones])

  /* ---------------- Deep links from the shell ---------------- */

  useEffect(() => {
    const woParam = params.get('wo')
    const newParam = params.get('new')
    const slaParam = params.get('sla')
    const tabParam = params.get('tab')
    if (!woParam && !newParam && !slaParam && !tabParam) return

    if (woParam) setSelectedWoId(woParam)
    if (newParam === '1') {
      setRaiseAssetId(undefined)
      setRaiseSource('Call Centre')
      setRaiseOpen(true)
    }
    /* `sla` wins over `tab` — it has to land on the filterable list. */
    if (tabParam && (TAB_KEYS as readonly string[]).includes(tabParam)) {
      setTab(tabParam as TabKey)
    }
    if (slaParam && (SLA_STATUSES as readonly string[]).includes(slaParam)) {
      setSlaSeed(slaParam as SlaStatus)
      setTab('list')
    }

    const next = new URLSearchParams(params)
    next.delete('wo')
    next.delete('new')
    next.delete('sla')
    next.delete('tab')
    setParams(next, { replace: true })
  }, [params, setParams])

  /* ---------------- KPI arithmetic ---------------- */

  const summary = useMemo(() => workOrderSummary(scoped, now), [scoped, now])
  const monthly = useMemo(() => maintenanceMonthlySeries(scoped, 12, now), [scoped, now])
  const sla = useMemo(() => slaTrend(scoped, 12, now), [scoped, now])

  const last = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const slaLast = sla[sla.length - 1]
  const slaPrev = sla[sla.length - 2]

  const finLast = monthlyFinancials[monthlyFinancials.length - 1]
  const finPrev = monthlyFinancials[monthlyFinancials.length - 2]

  const plannedTotal = monthly.reduce((s, m) => s + m.planned, 0)
  const reactiveTotal = monthly.reduce((s, m) => s + m.reactive, 0)
  const plannedShare = plannedTotal + reactiveTotal === 0 ? 0 : (plannedTotal / (plannedTotal + reactiveTotal)) * 100

  const budgetUse =
    finLast && finLast.maintenanceBudget > 0
      ? (finLast.maintenanceSpend / finLast.maintenanceBudget) * 100
      : 0

  /* ---------------- Handlers ---------------- */

  function openWorkOrder(id: string) {
    setSelectedWoId(id)
  }

  function handleScanRaise(assetId: string) {
    setScanOpen(false)
    setRaiseAssetId(assetId)
    setRaiseSource('QR Scan')
    setRaiseOpen(true)
  }

  function openRaiseBlank() {
    setRaiseAssetId(undefined)
    setRaiseSource('Call Centre')
    setRaiseOpen(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Maintenance & Work Orders"
        description="Field-to-finance work order control for the KDH estate — QR-raised jobs, live SLA countdowns, crew workload and panel contractor performance across all six KEJORA zones."
        icon={WrenchIcon}
        breadcrumb={[{ label: 'Dashboard', href: '/' }, { label: 'Maintenance & Work Orders' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setLabelsOpen(true)}>
              <TagIcon aria-hidden="true" />
              QR Labels
            </Button>
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLineIcon aria-hidden="true" />
              Scan QR
            </Button>
            <Button onClick={openRaiseBlank}>
              <ClipboardListIcon aria-hidden="true" />
              Raise Work Order
            </Button>
          </>
        }
      />

      {/* ---------------- KPI strip ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Open Work Orders"
          value={formatNumber(summary.open)}
          sublabel={`${formatNumber(summary.total)} raised in total`}
          icon={ClipboardListIcon}
          onClick={() => setTab('board')}
        />
        <KpiCard
          label="In Progress"
          value={formatNumber(summary.inProgress)}
          sublabel="Crews actively on site"
          icon={PlayIcon}
          onClick={() => setTab('board')}
        />
        <KpiCard
          label="Overdue / SLA Breached"
          value={formatNumber(summary.overdue)}
          sublabel="Open jobs past their deadline"
          icon={TriangleAlertIcon}
          intent={summary.overdue > 0 ? 'critical' : 'positive'}
          spark={monthly.slice(-6).map((m) => m.breached)}
          onClick={() => {
            setSlaSeed('Breached')
            setTab('list')
          }}
        />
        <KpiCard
          label="Closed This Month"
          value={formatNumber(summary.closedThisMonth)}
          sublabel="Completed and verified"
          icon={CircleCheckIcon}
          intent="positive"
          delta={last && prev ? delta(last.closed, prev.closed) : undefined}
          deltaLabel="vs last month"
          spark={monthly.slice(-6).map((m) => m.closed)}
        />

        <KpiCard
          label="Avg Resolution Time"
          value={formatHours(summary.avgResolutionHours)}
          sublabel="Raise to closure, all closed jobs"
          icon={TimerIcon}
          delta={last && prev ? delta(last.mttrHours, prev.mttrHours) : undefined}
          deltaLabel="vs last month"
          spark={monthly.slice(-6).map((m) => m.mttrHours)}
        />
        <KpiCard
          label="SLA Compliance"
          value={formatPct(summary.slaCompliancePct)}
          sublabel="Resolved jobs that met their target"
          icon={ShieldCheckIcon}
          intent={summary.slaCompliancePct >= 90 ? 'positive' : summary.slaCompliancePct >= 75 ? 'warning' : 'critical'}
          delta={slaLast && slaPrev ? delta(slaLast.compliancePct, slaPrev.compliancePct) : undefined}
          deltaLabel="vs last month"
          spark={sla.slice(-6).map((p) => p.compliancePct)}
          onClick={() => setTab('analytics')}
        />
        <KpiCard
          label="Planned vs Reactive"
          value={`${Math.round(plannedShare)} / ${100 - Math.round(plannedShare)}`}
          sublabel={`${formatNumber(plannedTotal)} planned · ${formatNumber(reactiveTotal)} reactive, 12 months`}
          icon={ActivityIcon}
          intent={plannedShare >= 55 ? 'positive' : 'warning'}
          onClick={() => setTab('analytics')}
        />
        <KpiCard
          label="Maintenance Spend MTD"
          value={finLast ? formatMYRCompact(finLast.maintenanceSpend) : '—'}
          sublabel={
            finLast
              ? `${formatPct(budgetUse, 0)} of the ${formatMYRCompact(finLast.maintenanceBudget)} budget`
              : 'No financial data'
          }
          icon={BanknoteIcon}
          intent={budgetUse > 100 ? 'critical' : budgetUse > 85 ? 'warning' : 'positive'}
          delta={finLast && finPrev ? delta(finLast.maintenanceSpend, finPrev.maintenanceSpend) : undefined}
          deltaLabel="vs last month"
          spark={monthlyFinancials.slice(-6).map((m) => m.maintenanceSpend)}
        />
      </div>

      {/* ---------------- Tabs ---------------- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="board">
              <LayoutGridIcon aria-hidden="true" />
              Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListIcon aria-hidden="true" />
              List
            </TabsTrigger>
            <TabsTrigger value="planned">
              <CalendarClockIcon aria-hidden="true" />
              Planned Maintenance
            </TabsTrigger>
            <TabsTrigger value="technicians">
              <UsersIcon aria-hidden="true" />
              Technicians
            </TabsTrigger>
            <TabsTrigger value="vendors">
              <TruckIcon aria-hidden="true" />
              Vendors
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <ChartColumnIcon aria-hidden="true" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="board">
          <WorkOrderBoard workOrders={scoped} onOpen={openWorkOrder} />
        </TabsContent>

        <TabsContent value="list">
          <WorkOrderList
            key={slaSeed ?? 'all'}
            workOrders={scoped}
            onOpen={openWorkOrder}
            initialSlaFilter={slaSeed}
          />
        </TabsContent>

        <TabsContent value="planned">
          <PlannedMaintenance onOpen={openWorkOrder} />
        </TabsContent>

        <TabsContent value="technicians">
          <TechniciansPanel workOrders={scoped} onOpen={openWorkOrder} />
        </TabsContent>

        <TabsContent value="vendors">
          <VendorsPanel workOrders={scoped} />
        </TabsContent>

        <TabsContent value="analytics">
          <MaintenanceAnalytics workOrders={scoped} assets={assets} />
        </TabsContent>
      </Tabs>

      {/* ---------------- Overlays ---------------- */}
      <WorkOrderSheet workOrderId={selectedWoId} onOpenChange={(open) => !open && setSelectedWoId(null)} />

      <QrScanDialog open={scanOpen} onOpenChange={setScanOpen} onRaiseForAsset={handleScanRaise} />

      <QrLabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} />

      <RaiseWorkOrderDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        presetAssetId={raiseAssetId}
        presetSource={raiseSource}
        onCreated={(wo) => setSelectedWoId(wo.id)}
      />
    </div>
  )
}
