import type { ComponentProps } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AnswerChart } from '@/components/copilot/engine'

type TooltipFormatter = NonNullable<ComponentProps<typeof ChartTooltipContent>['formatter']>

function valueFormatter(format: AnswerChart['format']): (v: number) => string {
  if (format === 'myr') return (v) => formatMYRCompact(v)
  if (format === 'pct') return (v) => formatPct(v, 1)
  if (format === 'hours') return (v) => (v >= 48 ? `${(v / 24).toFixed(1)} d` : `${v.toFixed(1)} h`)
  return (v) => formatNumber(v, Number.isInteger(v) ? 0 : 1)
}

/** Long category labels get truncated on the axis; the tooltip keeps the full text. */
function shortLabel(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function AnswerChartView({ chart, className }: { chart: AnswerChart; className?: string }) {
  const fmt = valueFormatter(chart.format)

  const config: ChartConfig = {}
  for (const s of chart.series) config[s.key] = { label: s.label, color: s.color }
  if (chart.type === 'pie') {
    for (const row of chart.data) {
      const name = String(row[chart.xKey])
      config[name] = { label: name }
    }
  }

  const formatter: TooltipFormatter = (value, name, item) => {
    const numeric = typeof value === 'number' ? value : Number(value)
    const key = String(name)
    const label = config[key]?.label ?? key
    return (
      <div className="flex w-full min-w-40 items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: item?.color ?? 'var(--chart-1)' }}
          />
          {label}
        </span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {Number.isFinite(numeric) ? fmt(numeric) : String(value)}
        </span>
      </div>
    )
  }

  const height = chart.height ?? 'h-[240px]'
  const showLegend = chart.series.length > 1

  let body: ComponentProps<typeof ChartContainer>['children']

  if (chart.type === 'pie') {
    const palette = chart.sliceColors ?? ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
    const valueKey = chart.series[0]?.key ?? 'value'
    body = (
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} nameKey={chart.xKey} />} />
        <Pie data={chart.data} dataKey={valueKey} nameKey={chart.xKey} innerRadius={48} outerRadius={84} strokeWidth={2}>
          {chart.data.map((row, i) => (
            <Cell key={String(row[chart.xKey])} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey={chart.xKey} className="flex-wrap" />} />
      </PieChart>
    )
  } else if (chart.type === 'line') {
    body = (
      <LineChart data={chart.data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={62} tickFormatter={(v) => fmt(Number(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        {chart.series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </LineChart>
    )
  } else if (chart.type === 'area') {
    body = (
      <AreaChart data={chart.data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <defs>
          {chart.series.map((s) => (
            <linearGradient key={s.key} id={`copilot-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={54} tickFormatter={(v) => fmt(Number(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        {chart.series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#copilot-fill-${s.key})`}
          />
        ))}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    )
  } else if (chart.horizontal) {
    body = (
      <BarChart data={chart.data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={6} fontSize={11} tickFormatter={(v) => fmt(Number(v))} />
        <YAxis
          type="category"
          dataKey={chart.xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          width={132}
          tickFormatter={(v) => shortLabel(String(v))}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        {chart.series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[0, 4, 4, 0]} stackId={chart.stacked ? 'a' : undefined} />
        ))}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </BarChart>
    )
  } else {
    body = (
      <BarChart data={chart.data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey={chart.xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={11}
          tickFormatter={(v) => shortLabel(String(v), 14)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={58} tickFormatter={(v) => fmt(Number(v))} />
        <ChartTooltip content={<ChartTooltipContent formatter={formatter} />} />
        {chart.series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} stackId={chart.stacked ? 'a' : undefined} />
        ))}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </BarChart>
    )
  }

  return (
    <ChartContainer config={config} className={cn('w-full', height, className)}>
      {body}
    </ChartContainer>
  )
}
