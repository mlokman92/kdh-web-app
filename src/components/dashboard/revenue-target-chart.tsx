import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { BarChart3Icon, TableIcon, TrendingUpIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LegendKey } from '@/components/dashboard/chart-bits'
import { moneyTooltipFormatter, shortMoneyTick } from '@/components/dashboard/chart-format'
import { RAMP_1, RAMP_3, REFERENCE_INK } from '@/components/dashboard/chart-theme'
import type { RevenueVsTargetPoint } from '@/lib/analytics'
import { formatMYR, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const CONFIG = {
  revenue: { label: 'Hasil', theme: RAMP_1 },
  collections: { label: 'Kutipan', theme: RAMP_3 },
  target: { label: 'Sasaran', theme: REFERENCE_INK },
} satisfies ChartConfig

export interface RevenueTargetChartProps {
  data: RevenueVsTargetPoint[]
  /** Months covered by the page's period selector — highlighted inside the 12-month shape. */
  windowMonths: number
  /** Shown in the card description when a single zone is selected. */
  apportionNote?: string
}

/**
 * Revenue against board target across twelve months, with collections on the same
 * money axis. Target is a benchmark, not a series, so it is drawn as a neutral dashed
 * rule — never a second y-scale.
 */
export function RevenueTargetChart({ data, windowMonths, apportionNote }: RevenueTargetChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const firstInWindow = Math.max(0, data.length - windowMonths)
  const latest = data[data.length - 1]

  const totals = useMemo(() => {
    const win = data.slice(firstInWindow)
    const revenue = win.reduce((s, m) => s + m.revenue, 0)
    const target = win.reduce((s, m) => s + m.target, 0)
    const collections = win.reduce((s, m) => s + m.collections, 0)
    const noi = win.reduce((s, m) => s + m.netOperatingIncome, 0)
    return {
      revenue,
      target,
      collections,
      noi,
      achievement: target > 0 ? (revenue / target) * 100 : 0,
    }
  }, [data, firstInWindow])

  return (
    <SectionCard
      title="Hasil Berbanding Sasaran"
      description={
        apportionNote ??
        'Hasil sewaan bulanan, kutipan tunai dan sasaran lembaga — 12 bulan terakhir'
      }
      icon={TrendingUpIcon}
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <Button
            variant={view === 'chart' ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setView('chart')}
            aria-pressed={view === 'chart'}
          >
            <BarChart3Icon className="size-3.5" aria-hidden="true" />
            Carta
          </Button>
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
          >
            <TableIcon className="size-3.5" aria-hidden="true" />
            Jadual
          </Button>
        </div>
      }
    >
      {/* Direct label for the endpoint — the one value the board reads first. */}
      {latest && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            Bulan terkini{' '}
            <span className="font-medium text-foreground">{latest.label}</span>
          </p>
          <p className="text-lg leading-none font-semibold text-foreground">
            {formatMYR(latest.revenue)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPct(latest.achievementPct)} daripada sasaran {formatMYR(latest.target)}
          </p>
        </div>
      )}

      {view === 'chart' ? (
        <>
          <ChartContainer config={CONFIG} className="aspect-auto h-[248px] w-full">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                interval={0}
              />
              <YAxis
                tickFormatter={shortMoneyTick}
                tickLine={false}
                axisLine={false}
                width={38}
                fontSize={11}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', fillOpacity: 0.55 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={moneyTooltipFormatter}
                    labelFormatter={(label) => `Bulan ${String(label)}`}
                  />
                }
              />
              <Bar
                dataKey="revenue"
                name="Hasil"
                fill="var(--color-revenue)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              >
                {data.map((m, i) => (
                  <Cell key={m.period} fillOpacity={i >= firstInWindow ? 1 : 0.32} />
                ))}
              </Bar>
              <Line
                dataKey="collections"
                name="Kutipan"
                type="monotone"
                stroke="var(--color-collections)"
                strokeWidth={2}
                strokeLinecap="round"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
              />
              <Line
                dataKey="target"
                name="Sasaran"
                type="monotone"
                stroke="var(--color-target)"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ChartContainer>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <LegendKey color="var(--chart-1)" label="Hasil" />
            <LegendKey color="var(--chart-5)" label="Kutipan tunai" variant="line" />
            <LegendKey color="var(--muted-foreground)" label="Sasaran lembaga" variant="dashed" />
            <span className="text-xs text-muted-foreground">
              Bar penuh warna menunjukkan tempoh yang dipilih
            </span>
          </div>
        </>
      ) : (
        <div className="max-h-[300px] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-20">Bulan</TableHead>
                <TableHead className="text-right">Hasil</TableHead>
                <TableHead className="text-right">Sasaran</TableHead>
                <TableHead className="text-right">Kutipan</TableHead>
                <TableHead className="text-right">Pencapaian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m, i) => (
                <TableRow key={m.period} className={cn(i < firstInWindow && 'text-muted-foreground')}>
                  <TableCell className="font-mono text-xs">{m.period}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMYR(m.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMYR(m.target)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMYR(m.collections)}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      m.achievementPct >= 100 ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {formatPct(m.achievementPct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Hasil tempoh</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{formatMYR(totals.revenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sasaran tempoh</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{formatMYR(totals.target)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pencapaian</dt>
          <dd
            className={cn(
              'mt-0.5 text-sm font-semibold',
              totals.achievement >= 100 ? 'text-primary' : 'text-foreground',
            )}
          >
            {formatPct(totals.achievement)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pendapatan operasi bersih</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{formatMYR(totals.noi)}</dd>
        </div>
      </dl>
    </SectionCard>
  )
}
