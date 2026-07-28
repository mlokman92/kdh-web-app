/**
 * Chart value formatters and tooltip row renderers.
 *
 * Split out from the presentational pieces so neither file mixes component exports
 * with helper exports (that combination breaks React Fast Refresh).
 */

import type { ComponentProps } from 'react'
import type { ChartTooltipContent } from '@/components/ui/chart'
import { formatMYR, formatNumber } from '@/lib/format'

type TooltipFormatter = NonNullable<ComponentProps<typeof ChartTooltipContent>['formatter']>

/**
 * Builds a tooltip row renderer that keeps the series colour on the swatch and the
 * value in ink — text never wears the data colour.
 */
export function makeTooltipFormatter(format: (n: number) => string): TooltipFormatter {
  return (value, name, item) => (
    <>
      <span
        aria-hidden="true"
        className="mt-[3px] size-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: item?.color as string | undefined }}
      />
      <div className="flex flex-1 items-center justify-between gap-6 leading-none">
        <span className="text-muted-foreground">{String(name)}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {format(Number(value))}
        </span>
      </div>
    </>
  )
}

export const moneyTooltipFormatter = makeTooltipFormatter((n) => formatMYR(n))
export const countTooltipFormatter = makeTooltipFormatter((n) => formatNumber(n))

/** Axis tick formatter: 2.4j / 840k — short enough not to crowd the plot. */
export function shortMoneyTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}j`
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(Math.round(value))
}
