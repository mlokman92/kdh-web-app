import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { AlertTriangleIcon, BanknoteIcon, GavelIcon, LayersIcon, TrendingUpIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PropertyActions, PropertyScope } from '@/components/property/scope'
import { arrearsSummary, collectionTrend, isLiveLease } from '@/lib/analytics'
import { formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const BUCKETS = [
  { key: 'current', label: 'Semasa', color: 'var(--chart-1)' },
  { key: 'd30', label: '1–30 hari', color: 'var(--chart-2)' },
  { key: 'd60', label: '31–60 hari', color: 'var(--chart-3)' },
  { key: 'd90', label: '61–90 hari', color: 'var(--chart-4)' },
  { key: 'd90plus', label: '90+ hari', color: 'var(--chart-5)' },
] as const

const ageingConfig = {
  current: { label: 'Semasa', color: 'var(--chart-1)' },
  d30: { label: '1–30 hari', color: 'var(--chart-2)' },
  d60: { label: '31–60 hari', color: 'var(--chart-3)' },
  d90: { label: '61–90 hari', color: 'var(--chart-4)' },
  d90plus: { label: '90+ hari', color: 'var(--chart-5)' },
} satisfies ChartConfig

const collectionConfig = {
  billed: { label: 'Dibilkan', color: 'var(--chart-2)' },
  collected: { label: 'Dikutip', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function ArrearsTab({ scope, actions }: { scope: PropertyScope; actions: PropertyActions }) {
  const [showAll, setShowAll] = useState(false)

  const summary = useMemo(() => arrearsSummary(scope.leases, 1000), [scope.leases])

  const byZone = useMemo(() => {
    const map = new Map<string, { zone: string; current: number; d30: number; d60: number; d90: number; d90plus: number; total: number }>()
    for (const l of scope.leases) {
      if (l.outstandingAmount <= 0) continue
      const row = map.get(l.zone) ?? {
        zone: l.zone,
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90plus: 0,
        total: 0,
      }
      row.current += l.ageing.current
      row.d30 += l.ageing.d30
      row.d60 += l.ageing.d60
      row.d90 += l.ageing.d90
      row.d90plus += l.ageing.d90plus
      row.total += l.outstandingAmount
      map.set(l.zone, row)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [scope.leases])

  const trend = useMemo(
    () => collectionTrend(scope.payments, scope.months, scope.now),
    [scope.payments, scope.months, scope.now],
  )

  const offenders = useMemo(
    () => summary.worstOffenders.slice(0, showAll ? summary.worstOffenders.length : 12),
    [summary.worstOffenders, showAll],
  )

  const monthlyBilling = useMemo(
    () => scope.leases.filter(isLiveLease).reduce((s, l) => s + l.monthlyRent + l.serviceCharge, 0),
    [scope.leases],
  )

  const totalBilled = trend.reduce((s, t) => s + t.billed, 0)
  const totalCollected = trend.reduce((s, t) => s + t.collected, 0)
  const bucketMax = Math.max(1, ...BUCKETS.map((b) => summary.ageing[b.key]))

  return (
    <div className="space-y-4">
      {/* --- ageing summary strip --- */}
      <SectionCard
        title="Penuaan Tunggakan"
        description={`${summary.accountsInArrears} akaun · ${formatMYR(summary.totalOutstanding)} tertunggak · ${formatPct(summary.arrearsRatePct, 2)} daripada sewa tahunan`}
        icon={LayersIcon}
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {BUCKETS.map((b) => {
            const value = summary.ageing[b.key]
            const share = summary.totalOutstanding > 0 ? (value / summary.totalOutstanding) * 100 : 0
            return (
              <div key={b.key} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  <p className="truncate text-xs text-muted-foreground">{b.label}</p>
                </div>
                <p className="mt-1.5 text-lg font-semibold tabular-nums">{formatMYR(value)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(value / bucketMax) * 100}%`, backgroundColor: b.color }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatPct(share, 1)} daripada baki
                </p>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Tunggakan Mengikut Zon"
          description="Baki tertunggak dipecahkan mengikut umur hutang"
          icon={AlertTriangleIcon}
        >
          {byZone.length === 0 ? (
            <EmptyState
              icon={AlertTriangleIcon}
              title="Tiada tunggakan"
              description="Setiap akaun dalam saringan ini adalah semasa."
            />
          ) : (
            <ChartContainer config={ageingConfig} className="aspect-auto h-72 w-full">
              <BarChart data={byZone} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatMYRCompact(v)}
                />
                <YAxis
                  type="category"
                  dataKey="zone"
                  width={130}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.replace('Zon ', '')}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={<ChartTooltipContent formatter={(value, name) => (
                    <span className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">
                        {ageingConfig[name as keyof typeof ageingConfig]?.label ?? String(name)}
                      </span>
                      <span className="font-mono font-medium tabular-nums">{formatMYR(Number(value))}</span>
                    </span>
                  )} />}
                />
                {BUCKETS.map((b, i) => (
                  <Bar
                    key={b.key}
                    dataKey={b.key}
                    stackId="ageing"
                    fill={`var(--color-${b.key})`}
                    stroke="var(--card)"
                    strokeWidth={2}
                    radius={i === BUCKETS.length - 1 ? [0, 4, 4, 0] : 0}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
            {BUCKETS.map((b) => (
              <span key={b.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-[3px]"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </span>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Trend Kutipan"
          description={`Dibilkan lwn dikutip, ${scope.months} bulan · kadar purata ${formatPct(totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0, 1)}`}
          icon={TrendingUpIcon}
        >
          <ChartContainer config={collectionConfig} className="aspect-auto h-72 w-full">
            <BarChart data={trend} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatMYRCompact(v)}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const row = item.payload as (typeof trend)[number]
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">
                            {name === 'billed' ? 'Dibilkan' : `Dikutip (${formatPct(row.ratePct, 1)})`}
                          </span>
                          <span className="font-mono font-medium tabular-nums">{formatMYR(Number(value))}</span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ChartContainer>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden="true" className="size-2 rounded-[3px] bg-[var(--chart-2)]" />
                Dibilkan {formatMYR(totalBilled)}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden="true" className="size-2 rounded-[3px] bg-[var(--chart-1)]" />
                Dikutip {formatMYR(totalCollected)}
              </span>
            </div>
            <span className="text-muted-foreground">
              Bil bulanan kontrak semasa{' '}
              <span className="font-medium text-foreground tabular-nums">{formatMYR(monthlyBilling)}</span>
            </span>
          </div>
        </SectionCard>
      </div>

      {/* --- worst offenders --- */}
      <SectionCard
        title="Akaun Tunggakan Tertinggi"
        description={`${summary.accountsInArrears} akaun dalam tunggakan · disusun mengikut baki`}
        icon={GavelIcon}
        contentClassName="p-0"
        actions={
          summary.worstOffenders.length > 12 && (
            <Button size="sm" variant="outline" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Tunjuk 12 teratas' : `Tunjuk semua (${summary.worstOffenders.length})`}
            </Button>
          )
        }
      >
        {offenders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BanknoteIcon}
              title="Tiada akaun tertunggak"
              description="Semua sewa dalam saringan ini telah dijelaskan."
            />
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Penyewa</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Sewa/bulan</TableHead>
                  <TableHead className="text-right">Tunggakan</TableHead>
                  <TableHead className="text-right">Hari lewat</TableHead>
                  <TableHead>Peringkat notis</TableHead>
                  <TableHead className="text-right">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offenders.map((l, i) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => actions.openLease(l.id)}
                        className="block max-w-52 truncate text-left font-medium hover:text-primary"
                      >
                        {l.tenantName}
                      </button>
                      <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-48 truncate text-xs">{l.propertyName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{l.unitNo}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatMYR(l.monthlyRent)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold text-destructive tabular-nums">
                      {formatMYR(l.outstandingAmount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        l.daysOverdue > 90 && 'font-medium text-destructive',
                      )}
                    >
                      {formatNumber(l.daysOverdue)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={l.noticeStage} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="xs" onClick={() => actions.openRecordPayment(l.id)}>
                          <BanknoteIcon aria-hidden="true" />
                          Bayaran
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={() => actions.escalateNotice(l.id)}
                          disabled={l.noticeStage === 'Legal Action'}
                        >
                          <GavelIcon aria-hidden="true" />
                          Naik taraf
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
