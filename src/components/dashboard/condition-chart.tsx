import { useMemo } from 'react'
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { ActivitySquareIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { LegendKey } from '@/components/dashboard/chart-bits'
import { countTooltipFormatter } from '@/components/dashboard/chart-format'
import { CRITICAL_INK, RAMP_1, RAMP_2, RAMP_3 } from '@/components/dashboard/chart-theme'
import type { ConditionSlice } from '@/lib/analytics'
import { formatNumber, formatPct } from '@/lib/format'
import type { Condition } from '@/lib/types'

/**
 * Condition is an ordered state, so the healthy bands walk the theme's own ramp and
 * the two bands that demand capex flip to the destructive token. Every bar carries its
 * condition name on the axis and its count at the tip, so colour only reinforces.
 */
const CONFIG = {
  count: { label: 'Bilangan aset' },
  excellent: { label: 'Excellent', theme: RAMP_1 },
  good: { label: 'Good', theme: RAMP_2 },
  fair: { label: 'Fair', theme: RAMP_3 },
  poor: { label: 'Poor', theme: CRITICAL_INK },
} satisfies ChartConfig

const FILL_BY_CONDITION: Record<Condition, { fill: string; opacity: number }> = {
  Excellent: { fill: 'var(--color-excellent)', opacity: 1 },
  Good: { fill: 'var(--color-good)', opacity: 1 },
  Fair: { fill: 'var(--color-fair)', opacity: 1 },
  Poor: { fill: 'var(--color-poor)', opacity: 0.6 },
  Critical: { fill: 'var(--color-poor)', opacity: 1 },
}

export interface ConditionChartProps {
  data: ConditionSlice[]
  avgConditionScore: number
}

export function ConditionChart({ data, avgConditionScore }: ConditionChartProps) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        tip: `${formatNumber(d.count)} · ${formatPct(d.pct, 0)}`,
      })),
    [data],
  )

  const healthy = data
    .filter((d) => d.condition === 'Excellent' || d.condition === 'Good')
    .reduce((s, d) => s + d.pct, 0)
  const atRisk = data
    .filter((d) => d.condition === 'Poor' || d.condition === 'Critical')
    .reduce((s, d) => s + d.count, 0)

  return (
    <SectionCard
      title="Taburan Keadaan Aset"
      description={`Purata skor keadaan ${avgConditionScore.toFixed(1)} / 100`}
      icon={ActivitySquareIcon}
    >
      <ChartContainer config={CONFIG} className="aspect-auto h-[192px] w-full">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 68, bottom: 0, left: 0 }}
          barCategoryGap={6}
        >
          <XAxis type="number" dataKey="count" hide />
          <YAxis
            type="category"
            dataKey="condition"
            tickLine={false}
            axisLine={false}
            width={72}
            fontSize={11}
            tickMargin={6}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', fillOpacity: 0.55 }}
            content={<ChartTooltipContent indicator="dot" formatter={countTooltipFormatter} />}
          />
          <Bar
            dataKey="count"
            name="Bilangan aset"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            isAnimationActive={false}
          >
            {rows.map((r) => (
              <Cell
                key={r.condition}
                fill={FILL_BY_CONDITION[r.condition].fill}
                fillOpacity={FILL_BY_CONDITION[r.condition].opacity}
              />
            ))}
            <LabelList
              dataKey="tip"
              position="right"
              offset={8}
              fontSize={11}
              className="fill-foreground font-medium"
            />
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
        <LegendKey color="var(--chart-1)" label="Sihat" />
        <LegendKey color="var(--destructive)" label="Perlu capex" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{formatPct(healthy)}</span> daripada daftar
          bertaraf Good atau lebih baik ·{' '}
          <span className="font-medium text-destructive">{formatNumber(atRisk)} aset</span> bertaraf
          Poor atau Critical
        </p>
      </div>
    </SectionCard>
  )
}
