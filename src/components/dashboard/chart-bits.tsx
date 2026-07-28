/**
 * Small presentational pieces shared by the dashboard's charts and tables, so every
 * legend key and inline bar looks identical across the page.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Legend key — a coloured mark beside ink text. Identity comes from the swatch, never
 * from colouring the label itself.
 */
export function LegendKey({
  color,
  label,
  variant = 'block',
  className,
}: {
  color: string
  label: ReactNode
  variant?: 'block' | 'line' | 'dashed'
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {variant === 'block' ? (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn('h-0 w-4 shrink-0 border-t-2', variant === 'dashed' && 'border-dashed')}
          style={{ borderColor: color }}
        />
      )}
      {label}
    </span>
  )
}

/**
 * Inline proportional bar for table cells. Purely supplementary — the number always
 * sits beside it, so nothing is encoded in colour alone.
 */
export function MiniBar({
  value,
  max,
  className,
  tone = 'primary',
  label,
}: {
  value: number
  max: number
  className?: string
  tone?: 'primary' | 'critical' | 'muted'
  label?: string
}) {
  const pctWidth = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const fill =
    tone === 'critical' ? 'bg-destructive' : tone === 'muted' ? 'bg-muted-foreground/50' : 'bg-primary'
  return (
    <span
      className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={label ?? `${pctWidth.toFixed(0)} peratus`}
    >
      <span className={cn('block h-full rounded-full', fill)} style={{ width: `${pctWidth}%` }} />
    </span>
  )
}
