import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BuildingIcon, DoorOpenIcon, PieChartIcon, TrendingUpIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge, TONE_DOT_CLASSES, statusTone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StackingPlan } from '@/components/property/stacking-plan'
import { occupancyTrend } from '@/components/property/helpers'
import type { PropertyActions, PropertyScope } from '@/components/property/scope'
import { occupancyByProperty } from '@/lib/analytics'
import { formatArea, formatMYR, formatNumber, formatPct } from '@/lib/format'
import { UNIT_STATUSES } from '@/lib/types'
import { cn } from '@/lib/utils'

const trendConfig = {
  ratePct: { label: 'Kadar penghunian', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function OccupancyTab({ scope, actions }: { scope: PropertyScope; actions: PropertyActions }) {
  const [propertySort, setPropertySort] = useState<'rate' | 'units'>('units')

  const propertyRows = useMemo(() => {
    const rows = occupancyByProperty(scope.units)
    return propertySort === 'rate'
      ? rows.slice().sort((a, b) => a.occupancyRate - b.occupancyRate)
      : rows
  }, [scope.units, propertySort])

  const trend = useMemo(
    () => occupancyTrend(scope.units, scope.leases, scope.months, scope.now),
    [scope.units, scope.leases, scope.months, scope.now],
  )

  const statusRows = useMemo(() => {
    const total = scope.units.length
    return UNIT_STATUSES.map((status) => {
      const list = scope.units.filter((u) => u.status === status)
      return {
        status,
        count: list.length,
        pct: total > 0 ? (list.length / total) * 100 : 0,
        area: list.reduce((s, u) => s + u.lettableAreaSqft, 0),
      }
    })
  }, [scope.units])

  const vacancies = useMemo(
    () =>
      scope.units
        .filter((u) => u.status === 'Vacant' || u.status === 'Under Renovation')
        .map((u) => ({
          unit: u,
          askingRent: u.lettableAreaSqft * u.marketRatePsf,
          annualValue: u.lettableAreaSqft * u.marketRatePsf * 12,
        }))
        .sort((a, b) => b.annualValue - a.annualValue),
    [scope.units],
  )

  const vacantAnnual = vacancies.reduce((s, v) => s + v.annualValue, 0)
  const trendDomainMin = Math.max(0, Math.floor(Math.min(...trend.map((t) => t.ratePct)) - 6))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Trend Penghunian"
          description={`Direkonstruksi daripada buku pajakan, ${scope.months} bulan terakhir`}
          icon={TrendingUpIcon}
          className="xl:col-span-2"
        >
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <AreaChart data={trend} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="kdh-occ-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-ratePct)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-ratePct)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={44}
                domain={[trendDomainMin, 100]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ChartTooltip
                cursor={{ stroke: 'var(--border)' }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item.payload as (typeof trend)[number]
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">Penghunian</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatPct(Number(value), 1)} ({row.occupied}/{row.total})
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <Area
                dataKey="ratePct"
                type="monotone"
                stroke="var(--color-ratePct)"
                strokeWidth={2}
                fill="url(#kdh-occ-fill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard title="Pecahan Status Unit" description={`${scope.units.length} unit boleh sewa`} icon={PieChartIcon}>
          <div className="space-y-3">
            {statusRows.map((r) => (
              <div key={r.status}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 shrink-0 rounded-full', TONE_DOT_CLASSES[statusTone(r.status)])}
                    />
                    <span className="truncate">{r.status}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {r.count} · {formatPct(r.pct, 1)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', TONE_DOT_CLASSES[statusTone(r.status)])}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatArea(r.area)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <StackingPlan units={scope.units} leases={scope.leases} onOpenLease={actions.openLease} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Penghunian Mengikut Hartanah"
          description={`${propertyRows.length} hartanah berbilang unit`}
          icon={BuildingIcon}
          contentClassName="p-0"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPropertySort((s) => (s === 'units' ? 'rate' : 'units'))}
            >
              Susun: {propertySort === 'units' ? 'bilangan unit' : 'kadar terendah'}
            </Button>
          }
        >
          {propertyRows.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={BuildingIcon} title="Tiada hartanah dalam saringan ini" />
            </div>
          ) : (
            <div className="max-h-[26rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Hartanah</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="w-40">Penghunian</TableHead>
                    <TableHead className="text-right">Keluasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propertyRows.map((r) => (
                    <TableRow key={r.propertyName}>
                      <TableCell>
                        <span className="block max-w-64 truncate font-medium">{r.propertyName}</span>
                        <span className="text-xs text-muted-foreground">{r.zone}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {r.occupied}/{r.total}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.occupancyRate} className="h-1.5 flex-1" />
                          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums">
                            {formatPct(r.occupancyRate, 0)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatNumber(r.lettableSqft)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Senarai Kekosongan"
          description={`${vacancies.length} unit · potensi ${formatMYR(vacantAnnual)} setahun pada kadar pasaran`}
          icon={DoorOpenIcon}
          contentClassName="p-0"
          actions={
            <Button size="sm" onClick={actions.openNewLease}>
              Pajakan baharu
            </Button>
          }
        >
          {vacancies.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={DoorOpenIcon}
                title="Tiada unit kosong"
                description="Setiap unit boleh sewa dalam saringan ini sedang dihuni."
              />
            </div>
          ) : (
            <div className="max-h-[26rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Keluasan</TableHead>
                    <TableHead className="text-right">Kadar tawaran</TableHead>
                    <TableHead className="text-right">Sewa/bulan</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vacancies.map(({ unit, askingRent }) => (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <span className="block max-w-56 truncate font-medium">{unit.propertyName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {unit.unitNo} · {unit.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatNumber(unit.lettableAreaSqft)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        RM {unit.marketRatePsf.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatMYR(askingRent)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={unit.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
