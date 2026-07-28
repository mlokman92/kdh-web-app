import { useMemo } from 'react'
import { Pie, PieChart } from 'recharts'
import { PieChartIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { MiniBar } from '@/components/dashboard/chart-bits'
import { moneyTooltipFormatter } from '@/components/dashboard/chart-format'
import { MUTED_INK, RAMP_1, RAMP_2, RAMP_3 } from '@/components/dashboard/chart-theme'
import type { CategoryValue } from '@/lib/analytics'
import { formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'

/**
 * The theme ramp yields three cleanly separated steps, so the wheel carries the three
 * largest categories and folds the tail into one neutral "Lain-lain" wedge — never a
 * generated or recycled hue. The list beside it is the full table view: every
 * category, its count, its value and its share.
 */
const CONFIG = {
  value: { label: 'Nilai' },
  c0: { theme: RAMP_1 },
  c1: { theme: RAMP_2 },
  c2: { theme: RAMP_3 },
  other: { theme: MUTED_INK },
} satisfies ChartConfig

const WEDGE_SWATCH = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)'] as const

export interface CategoryDonutProps {
  data: CategoryValue[]
  totalValue: number
  totalAssets: number
}

export function CategoryDonut({ data, totalValue, totalAssets }: CategoryDonutProps) {
  const { wedges, foldedFrom } = useMemo(() => {
    const top = data.slice(0, 3)
    const rest = data.slice(3)
    const restValue = rest.reduce((s, c) => s + c.value, 0)
    const restCount = rest.reduce((s, c) => s + c.count, 0)

    const rows: { key: string; name: string; value: number; fill: string }[] = top.map((c, i) => ({
      key: `c${i}`,
      name: c.category as string,
      value: c.value,
      fill: `var(--color-c${i})`,
    }))

    if (rest.length > 0) {
      rows.push({
        key: 'other',
        name: `Lain-lain (${rest.length} kategori, ${restCount} aset)`,
        value: restValue,
        fill: 'var(--color-other)',
      })
    }

    return { wedges: rows, foldedFrom: top.length }
  }, [data])

  const maxValue = data.length > 0 ? data[0].value : 0

  return (
    <SectionCard
      title="Nilai Portfolio Mengikut Kategori"
      description={`${data.length} kategori aset · nilai semasa penilaian`}
      icon={PieChartIcon}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)] lg:items-center">
        <div className="relative mx-auto w-full max-w-[200px]">
          <ChartContainer config={CONFIG} className="aspect-auto h-[180px] w-full">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="name"
                    formatter={moneyTooltipFormatter}
                  />
                }
              />
              <Pie
                data={wedges}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={82}
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </PieChart>
          </ChartContainer>

          {/* Centre total sits above the wheel as plain ink — never coloured by a series. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="text-lg leading-none font-semibold tracking-tight text-foreground">
              {formatMYRCompact(totalValue)}
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">{totalAssets} aset</span>
          </div>
        </div>

        <ul className="min-w-0 space-y-2">
          {data.map((c, i) => {
            const inWheel = i < foldedFrom
            return (
              <li key={c.category} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: inWheel ? WEDGE_SWATCH[i] : 'var(--muted-foreground)',
                    opacity: inWheel ? 1 : 0.45,
                  }}
                />
                <span className="truncate text-xs font-medium text-foreground">{c.category}</span>
                <span className="text-right font-mono text-xs tabular-nums text-foreground">
                  {formatMYRCompact(c.value)}
                </span>
                <span />
                <MiniBar
                  value={c.value}
                  max={maxValue}
                  tone={inWheel ? 'primary' : 'muted'}
                  label={`${c.category}: ${formatPct(c.share)} daripada nilai portfolio`}
                />
                <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatPct(c.share)} · {formatNumber(c.count)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Roda menunjukkan tiga kategori terbesar; selebihnya dikumpulkan sebagai{' '}
        <span className="font-medium text-foreground">Lain-lain</span>. Jumlah nilai portfolio{' '}
        <span className="font-mono font-medium text-foreground">{formatMYR(totalValue)}</span>.
      </p>
    </SectionCard>
  )
}
