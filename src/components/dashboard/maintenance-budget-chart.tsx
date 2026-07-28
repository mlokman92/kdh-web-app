import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { BarChart3Icon, TableIcon, WrenchIcon } from 'lucide-react'

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
import { CRITICAL_INK, RAMP_1, REFERENCE_INK } from '@/components/dashboard/chart-theme'
import type { SpendVsBudgetPoint } from '@/lib/analytics'
import { formatMYR, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const CONFIG = {
  spend: { label: 'Perbelanjaan', theme: RAMP_1 },
  over: { label: 'Melebihi bajet', theme: CRITICAL_INK },
  budget: { label: 'Bajet', theme: REFERENCE_INK },
} satisfies ChartConfig

export interface MaintenanceBudgetChartProps {
  data: SpendVsBudgetPoint[]
  windowMonths: number
  apportionNote?: string
}

/**
 * Maintenance spend against budget. One money axis; budget is the neutral benchmark
 * rule. Months that overspent are the only ones tinted destructive — emphasis, and
 * the count is spelled out underneath so the colour is never the sole encoding.
 */
export function MaintenanceBudgetChart({
  data,
  windowMonths,
  apportionNote,
}: MaintenanceBudgetChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const firstInWindow = Math.max(0, data.length - windowMonths)

  const totals = useMemo(() => {
    const win = data.slice(firstInWindow)
    const spend = win.reduce((s, m) => s + m.spend, 0)
    const budget = win.reduce((s, m) => s + m.budget, 0)
    return {
      spend,
      budget,
      variance: budget - spend,
      utilisation: budget > 0 ? (spend / budget) * 100 : 0,
      overMonths: win.filter((m) => m.overBudget).length,
      months: win.length,
    }
  }, [data, firstInWindow])

  return (
    <SectionCard
      title="Perbelanjaan Penyelenggaraan Berbanding Bajet"
      description={apportionNote ?? 'Perbelanjaan sebenar berbanding peruntukan bulanan — 12 bulan terakhir'}
      icon={WrenchIcon}
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
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-lg leading-none font-semibold text-foreground">
          {formatMYR(totals.spend)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatPct(totals.utilisation)} daripada bajet {formatMYR(totals.budget)} ·{' '}
          {totals.overMonths} daripada {totals.months} bulan melebihi peruntukan
        </p>
      </div>

      {view === 'chart' ? (
        <>
          <ChartContainer config={CONFIG} className="aspect-auto h-[218px] w-full">
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
                dataKey="spend"
                name="Perbelanjaan"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              >
                {data.map((m, i) => (
                  <Cell
                    key={m.period}
                    fill={m.overBudget ? 'var(--color-over)' : 'var(--color-spend)'}
                    fillOpacity={i >= firstInWindow ? 1 : 0.32}
                  />
                ))}
              </Bar>
              <Line
                dataKey="budget"
                name="Bajet"
                type="monotone"
                stroke="var(--color-budget)"
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
            <LegendKey color="var(--chart-1)" label="Dalam bajet" />
            <LegendKey color="var(--destructive)" label="Melebihi bajet" />
            <LegendKey color="var(--muted-foreground)" label="Peruntukan bulanan" variant="dashed" />
          </div>
        </>
      ) : (
        <div className="max-h-[260px] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-20">Bulan</TableHead>
                <TableHead className="text-right">Belanja</TableHead>
                <TableHead className="text-right">Bajet</TableHead>
                <TableHead className="text-right">Varians</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m, i) => (
                <TableRow key={m.period} className={cn(i < firstInWindow && 'text-muted-foreground')}>
                  <TableCell className="font-mono text-xs">{m.period}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMYR(m.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMYR(m.budget)}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      m.overBudget ? 'text-destructive' : 'text-primary',
                    )}
                  >
                    {m.overBudget ? '−' : '+'}
                    {formatMYR(Math.abs(m.variance))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">Varians tempoh dipilih</p>
        <p
          className={cn(
            'text-sm font-semibold tabular-nums',
            totals.variance >= 0 ? 'text-primary' : 'text-destructive',
          )}
        >
          {totals.variance >= 0 ? 'Baki ' : 'Lebihan '}
          {formatMYR(Math.abs(totals.variance))}
        </p>
      </div>
    </SectionCard>
  )
}
