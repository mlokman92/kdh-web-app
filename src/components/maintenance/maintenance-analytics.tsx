import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ActivityIcon, ChartColumnIcon, GaugeIcon, ShieldCheckIcon, TimerIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { maintenanceMonthlySeries } from '@/components/maintenance/shared'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { mttrByCategory, slaTrend, woByPriority, woByType } from '@/lib/analytics'
import { formatNumber } from '@/lib/format'
import type { Asset, Priority, WorkOrder } from '@/lib/types'

/** KDH corporate service target — the line every zone is measured against. */
const SLA_TARGET_PCT = 90

/**
 * Priority keeps the app-wide status tones so a P1 bar reads the same as a P1 badge.
 * Every value is a theme token (or a mix of two), never a fixed palette colour.
 */
const PRIORITY_FILL: Record<Priority, string> = {
  'P1 - Critical': 'var(--destructive)',
  'P2 - High': 'color-mix(in oklch, var(--destructive) 58%, var(--chart-1))',
  'P3 - Medium': 'var(--chart-3)',
  'P4 - Low': 'var(--muted-foreground)',
}

const slaConfig: ChartConfig = {
  compliancePct: { label: 'SLA compliance', color: 'var(--chart-1)' },
}

const splitConfig: ChartConfig = {
  planned: { label: 'Planned', color: 'var(--chart-1)' },
  reactive: { label: 'Reactive', color: 'var(--chart-5)' },
}

const typeConfig: ChartConfig = {
  count: { label: 'Work orders', color: 'var(--chart-2)' },
}

const priorityConfig: ChartConfig = {
  count: { label: 'Work orders', color: 'var(--chart-1)' },
}

const mttrConfig: ChartConfig = {
  hours: { label: 'Mean time to repair', color: 'var(--chart-4)' },
}

export interface MaintenanceAnalyticsProps {
  workOrders: WorkOrder[]
  assets: Asset[]
}

/**
 * The maintenance performance pack: are we hitting SLA, are we shifting from
 * firefighting to planned work, where does the volume sit, and what takes longest
 * to put right.
 */
export function MaintenanceAnalytics({ workOrders, assets }: MaintenanceAnalyticsProps) {
  const now = useMemo(() => new Date(), [])

  const sla = useMemo(() => slaTrend(workOrders, 12, now), [workOrders, now])
  const monthly = useMemo(() => maintenanceMonthlySeries(workOrders, 12, now), [workOrders, now])

  const byType = useMemo(
    () =>
      woByType(workOrders)
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count),
    [workOrders],
  )

  const byPriority = useMemo(() => woByPriority(workOrders), [workOrders])
  const mttr = useMemo(() => mttrByCategory(workOrders, assets), [workOrders, assets])

  /* Headline figures quoted beneath each chart title. */
  const latestSla = sla[sla.length - 1]
  const plannedTotal = monthly.reduce((s, m) => s + m.planned, 0)
  const reactiveTotal = monthly.reduce((s, m) => s + m.reactive, 0)
  const plannedShare =
    plannedTotal + reactiveTotal === 0 ? 0 : Math.round((plannedTotal / (plannedTotal + reactiveTotal)) * 100)

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* ---------- SLA compliance trend ---------- */}
      <SectionCard
        title="SLA compliance trend"
        description={`Last 12 months by raise date · ${SLA_TARGET_PCT}% corporate target · ${
          latestSla ? `${latestSla.compliancePct.toFixed(1)}% this month` : 'no data'
        }`}
        icon={ShieldCheckIcon}
      >
        <ChartContainer config={slaConfig} className="aspect-auto h-[260px] w-full">
          <LineChart data={sla} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as (typeof sla)[number] | undefined
                    if (!row) return String(label)
                    return `${label} — ${row.total} raised, ${row.breached} breached`
                  }}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, ' SLA compliance']}
                />
              }
            />
            <ReferenceLine
              y={SLA_TARGET_PCT}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeWidth={1}
              ifOverflow="extendDomain"
            />
            <Line
              dataKey="compliancePct"
              type="monotone"
              stroke="var(--color-compliancePct)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-compliancePct)' }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            />
          </LineChart>
        </ChartContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          Dashed line marks the {SLA_TARGET_PCT}% target agreed with KDH management.
        </p>
      </SectionCard>

      {/* ---------- Planned vs reactive ---------- */}
      <SectionCard
        title="Planned vs reactive workload"
        description={`${plannedShare}% of the last 12 months was planned work · ${formatNumber(
          plannedTotal + reactiveTotal,
        )} jobs raised`}
        icon={ActivityIcon}
      >
        <ChartContainer config={splitConfig} className="aspect-auto h-[260px] w-full">
          <BarChart data={monthly} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={30} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="planned"
              stackId="wo"
              fill="var(--color-planned)"
              stroke="var(--card)"
              strokeWidth={2}
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="reactive"
              stackId="wo"
              fill="var(--color-reactive)"
              stroke="var(--card)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <p className="mt-2 text-xs text-muted-foreground">
          Planned covers preventive, predictive, inspection, statutory and improvement work. Reactive is corrective
          and emergency response.
        </p>
      </SectionCard>

      {/* ---------- By type ---------- */}
      <SectionCard
        title="Work orders by type"
        description={`${formatNumber(workOrders.length)} records across the whole register`}
        icon={ChartColumnIcon}
      >
        <ChartContainer config={typeConfig} className="aspect-auto h-[280px] w-full">
          <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 34, left: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="key"
              tickLine={false}
              axisLine={false}
              width={148}
              tickMargin={6}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const row = item?.payload as (typeof byType)[number] | undefined
                    return [`${value} jobs`, row ? ` · ${row.pct.toFixed(1)}% of register` : '']
                  }}
                />
              }
            />
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList
                dataKey="count"
                position="right"
                offset={8}
                className="fill-muted-foreground"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </SectionCard>

      {/* ---------- By priority ---------- */}
      <SectionCard
        title="Work orders by priority"
        description="Severity mix — P1 volume drives the emergency response cost"
        icon={GaugeIcon}
      >
        <ChartContainer config={priorityConfig} className="aspect-auto h-[280px] w-full">
          <BarChart data={byPriority} layout="vertical" margin={{ top: 4, right: 34, left: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="key"
              tickLine={false}
              axisLine={false}
              width={148}
              tickMargin={6}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const row = item?.payload as (typeof byPriority)[number] | undefined
                    return [`${value} jobs`, row ? ` · ${row.pct.toFixed(1)}% of register` : '']
                  }}
                />
              }
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
              {byPriority.map((row) => (
                <Cell key={row.key} fill={PRIORITY_FILL[row.key]} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                offset={8}
                className="fill-muted-foreground"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </SectionCard>

      {/* ---------- MTTR ---------- */}
      <SectionCard
        title="Mean time to repair by asset category"
        description="Average hours from raise to closure on completed jobs"
        icon={TimerIcon}
        className="xl:col-span-2"
      >
        {mttr.length === 0 ? (
          <EmptyState
            icon={TimerIcon}
            title="No completed jobs to measure yet"
            description="MTTR appears once work orders have been closed against the register."
          />
        ) : (
          <ChartContainer config={mttrConfig} className="aspect-auto h-[300px] w-full">
            <BarChart data={mttr} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="category"
                tickLine={false}
                axisLine={false}
                width={170}
                tickMargin={6}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item?.payload as (typeof mttr)[number] | undefined
                      return [`${Number(value).toFixed(1)} h`, row ? ` · ${row.count} jobs closed` : '']
                    }}
                  />
                }
              />
              <Bar dataKey="hours" fill="var(--color-hours)" radius={[0, 4, 4, 0]} barSize={16}>
                <LabelList
                  dataKey="hours"
                  position="right"
                  offset={8}
                  className="fill-muted-foreground"
                  fontSize={11}
                  formatter={(v) => `${Number(v).toFixed(1)}h`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </SectionCard>
    </div>
  )
}
