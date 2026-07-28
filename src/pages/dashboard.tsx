import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BanknoteIcon,
  Building2Icon,
  GaugeIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  ScaleIcon,
  WarehouseIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { KpiCard } from '@/components/common/kpi-card'
import { PageHeader } from '@/components/common/page-header'
import { ArrearsAgeingPanel } from '@/components/dashboard/arrears-ageing'
import { AttentionPanel } from '@/components/dashboard/attention-panel'
import { CategoryDonut } from '@/components/dashboard/category-donut'
import { ComplianceTile } from '@/components/dashboard/compliance-tile'
import { ConditionChart } from '@/components/dashboard/condition-chart'
import { DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { EsgTile } from '@/components/dashboard/esg-tile'
import { ExpiryPipeline } from '@/components/dashboard/expiry-pipeline'
import { MaintenanceBudgetChart } from '@/components/dashboard/maintenance-budget-chart'
import { RevenueTargetChart } from '@/components/dashboard/revenue-target-chart'
import { RiskRegisterPanel } from '@/components/dashboard/risk-register-panel'
import { SecondaryStrip } from '@/components/dashboard/secondary-strip'
import { TopRevenueAssets } from '@/components/dashboard/top-revenue-assets'
import { ZonePerformanceTable } from '@/components/dashboard/zone-performance-table'
import {
  buildDashboard,
  periodLabel,
  type PeriodKey,
  type ZoneFilter,
} from '@/components/dashboard/use-dashboard-data'
import { dataQualitySummary } from '@/lib/analytics'
import { downloadCsv, formatDateTime, formatPct } from '@/lib/format'
import { ZONES } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useAuthStore, visibleZones } from '@/store/auth-store'

/** Icons for the hero row, keyed to the KPI ids the builder emits. */
const HERO_ICON: Record<string, LucideIcon> = {
  'portfolio-value': Building2Icon,
  nbv: ScaleIcon,
  revenue: BanknoteIcon,
  collection: HandCoinsIcon,
  occupancy: WarehouseIcon,
  sla: GaugeIcon,
}

/** Simulated first paint so the screen resolves rather than snapping into place. */
const FIRST_PAINT_MS = 480

export default function Dashboard() {
  const navigate = useNavigate()

  /* Narrow selectors only — never a fresh object literal out of the store. */
  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)
  const units = useAppStore((s) => s.units)
  const leases = useAppStore((s) => s.leases)
  const payments = useAppStore((s) => s.payments)
  const monthlyFinancials = useAppStore((s) => s.monthlyFinancials)

  const user = useAuthStore((s) => s.user)
  const zones = useMemo(() => visibleZones(user), [user])

  const [period, setPeriod] = useState<PeriodKey>('ytd')
  const [zone, setZone] = useState<ZoneFilter>('all')
  const [booting, setBooting] = useState(true)

  /* One stable clock for the whole page, so every derived figure agrees. */
  const nowRef = useRef<Date>(new Date())

  useEffect(() => {
    const t = window.setTimeout(() => setBooting(false), FIRST_PAINT_MS)
    return () => window.clearTimeout(t)
  }, [])

  /* A role with a narrower scope must never be left holding a zone it cannot see. */
  useEffect(() => {
    if (zone !== 'all' && !zones.includes(zone)) setZone('all')
  }, [zone, zones])

  const data = useMemo(
    () =>
      buildDashboard({
        assets,
        workOrders,
        units,
        leases,
        payments,
        monthlyFinancials,
        allowedZones: zones,
        zone,
        period,
        now: nowRef.current,
      }),
    [assets, workOrders, units, leases, payments, monthlyFinancials, zones, zone, period],
  )

  const quality = useMemo(() => dataQualitySummary(data.scope.assets), [data.scope.assets])

  /* "Semua Zon" only when the role really can see all six, so the scope bar never
     overstates what the numbers below are counting. A multi-zone role is summarised by
     count rather than by name — the full names are far too long for the strip. */
  const scopeLabel =
    zone !== 'all'
      ? zone
      : zones.length >= ZONES.length
        ? 'Semua Zon'
        : zones.length === 1
          ? zones[0]
          : `${zones.length} Zon`
  const apportionNote =
    data.scope.zoneShare >= 1
      ? undefined
      : `${scopeLabel} · diagihkan mengikut ${formatPct(data.scope.zoneShare * 100)} bahagian sewa kontrak zon`

  const handleExport = useCallback(() => {
    /* Local date, not `toISOString()` — Malaysia is UTC+8, so a pack generated after
       8am would otherwise be stamped with yesterday's date. */
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const slug = zone === 'all' ? 'All-Zones' : zone.replace(/[^A-Za-z0-9]+/g, '-')
    downloadCsv(`KDH-Board-Pack_${slug}_${period}_${stamp}.csv`, data.exportRows)
    toast.success('Board pack dijana', {
      description: `${data.exportRows.length} metrik · ${scopeLabel} · ${periodLabel(period)} (${data.windowLabel})`,
    })
  }, [data.exportRows, data.windowLabel, period, scopeLabel, zone])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Asset Dashboard"
        description={`Kedudukan portfolio KDH merentas ${zones.length} zon operasi KEJORA di Johor Tenggara — nilai, hasil, penghunian, kepatuhan SLA dan risiko dalam satu paparan.`}
        icon={LayoutDashboardIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'Papan Pemuka Eksekutif' }]}
        actions={
          <DashboardFilters
            period={period}
            onPeriodChange={setPeriod}
            zone={zone}
            onZoneChange={setZone}
            zones={zones}
            onExport={handleExport}
            busy={booting}
          />
        }
      />

      {/* Scope bar — states exactly what the numbers below are counting. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>
          Skop <span className="font-medium text-foreground">{scopeLabel}</span>
        </span>
        <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
        <span>
          Tempoh <span className="font-medium text-foreground">{periodLabel(period)}</span> ·{' '}
          {data.windowLabel}
        </span>
        <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
        <span>
          <span className="font-medium text-foreground">{data.portfolio.totalAssets}</span> aset ·{' '}
          <span className="font-medium text-foreground">{data.occupancy.total}</span> unit ·{' '}
          <span className="font-medium text-foreground">{data.scope.leases.length}</span> sewaan
        </span>
        <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block" />
        <span className="font-mono">Data setakat {formatDateTime(nowRef.current.toISOString())}</span>
      </div>

      {booting ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-5">
          {/* ---- Hero KPI row --------------------------------------------
              Three across, not six. At six the tiles were ~200px wide and
              compact currency clipped to "RM 2…". Two rows of three reads
              better on a boardroom screen anyway. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {data.heroKpis.map((k) => (
              <KpiCard
                key={k.key}
                label={k.label}
                value={k.display}
                sublabel={k.sublabel}
                delta={k.delta}
                deltaLabel="vs tempoh sebelum"
                icon={HERO_ICON[k.key]}
                intent={k.intent}
                spark={k.spark}
                onClick={() => navigate(k.href)}
              />
            ))}
          </div>

          {/* ---- Dense secondary strip ----------------------------------- */}
          <SecondaryStrip metrics={data.secondary} />

          {/* ---- Trend + action queue ------------------------------------ */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <div className="xl:col-span-2">
              <RevenueTargetChart
                data={data.revenueSeries}
                windowMonths={data.windowMonths}
                apportionNote={apportionNote}
              />
            </div>
            <AttentionPanel items={data.attention} total={data.attentionTotal} />
          </div>

          {/* ---- Composition ---------------------------------------------- */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <div className="xl:col-span-2">
              <CategoryDonut
                data={data.categoryValues}
                totalValue={data.portfolio.totalCurrentValue}
                totalAssets={data.portfolio.totalAssets}
              />
            </div>
            <ConditionChart
              data={data.conditions}
              avgConditionScore={data.portfolio.avgConditionScore}
            />
          </div>

          {/* ---- Cost control + receivables ------------------------------- */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <div className="xl:col-span-2">
              <MaintenanceBudgetChart
                data={data.maintenanceSeries}
                windowMonths={data.windowMonths}
                apportionNote={apportionNote}
              />
            </div>
            <ArrearsAgeingPanel buckets={data.arrearsBuckets} summary={data.arrears} />
          </div>

          {/* ---- Zone comparison ------------------------------------------ */}
          <ZonePerformanceTable rows={data.zoneRows} activeZone={zone} onSelectZone={setZone} />

          {/* ---- Earners + risk ------------------------------------------- */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <div className="xl:col-span-2">
              <TopRevenueAssets rows={data.topRevenue} totalRevenue={data.portfolio.revenueYtd} />
            </div>
            <RiskRegisterPanel rows={data.risks} />
          </div>

          {/* ---- Forward book, compliance, sustainability ----------------- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            <ExpiryPipeline buckets={data.expiryPipeline} />
            <ComplianceTile
              dataQuality={quality}
              inspections={data.inspectionsDue}
              insurance={data.insuranceDue}
              totalAssets={data.portfolio.totalAssets}
            />
            <EsgTile esg={data.esg} />
          </div>
        </div>
      )}
    </div>
  )
}
