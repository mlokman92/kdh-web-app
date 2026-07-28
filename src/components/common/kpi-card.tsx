import type { LucideIcon } from 'lucide-react'
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react'
import { TONE_CLASSES, TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

export type KpiIntent = 'default' | 'positive' | 'warning' | 'critical'

export interface KpiCardProps {
  label: string
  value: string
  sublabel?: string
  delta?: number
  deltaLabel?: string
  icon?: LucideIcon
  intent?: KpiIntent
  spark?: number[]
  onClick?: () => void
  className?: string
}

const INTENT_TONE: Record<KpiIntent, Tone> = {
  default: 'info',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
}

/** Sparklines stay on-brand for neutral tiles and take the tone otherwise. */
const SPARK_CLASSES: Record<KpiIntent, string> = {
  default: 'text-primary',
  positive: TONE_TEXT_CLASSES.positive,
  warning: TONE_TEXT_CLASSES.warning,
  critical: TONE_TEXT_CLASSES.critical,
}

const ICON_CLASSES: Record<KpiIntent, string> = {
  default: 'border-border bg-muted text-muted-foreground',
  positive: 'border-primary/20 bg-primary/10 text-primary',
  warning:
    'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/25 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
  critical: 'border-destructive/20 bg-destructive/10 text-destructive',
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const w = 76
  const h = 24
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pt = (v: number, i: number) => {
    const x = (i / (values.length - 1)) * w
    const y = h - 2 - ((v - min) / span) * (h - 5)
    return [x, y] as const
  }
  const points = values.map(pt)
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const last = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn('h-6 w-[76px] shrink-0 overflow-visible', className)}
    >
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Compact executive KPI tile: label, large value, delta chip and an optional
 * hand-drawn sparkline. Becomes a real button when `onClick` is supplied.
 */
export function KpiCard({
  label,
  value,
  sublabel,
  delta,
  deltaLabel,
  icon: Icon,
  intent = 'default',
  spark,
  onClick,
  className,
}: KpiCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const up = hasDelta && (delta as number) > 0
  const flat = hasDelta && (delta as number) === 0
  const deltaTone: Tone =
    intent !== 'default'
      ? INTENT_TONE[intent]
      : flat
        ? 'neutral'
        : up
          ? 'positive'
          : 'critical'
  const DeltaIcon = flat ? ArrowRightIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon

  /**
   * The value owns a full-width row of its own. It used to share a line with the
   * sparkline, which left roughly 80px for figures like "RM 2.94b" and clipped
   * them to "RM 2…". Nothing in this tile truncates now — the sublabel and delta
   * caption wrap instead.
   */
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg border',
              ICON_CLASSES[intent],
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>

      {/* Sized against the card, not the viewport, so the same tile works in a
          three-across hero row and in the Copilot's narrow chat column without
          either clipping or overflowing. */}
      <p className="mt-4 text-[clamp(1.375rem,7cqi,1.875rem)] leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>

      {sublabel && (
        <p className="mt-2 text-xs leading-relaxed text-balance text-muted-foreground">{sublabel}</p>
      )}

      {(hasDelta || (spark && spark.length > 1)) && (
        <div className="mt-4 flex items-end justify-between gap-3">
          {hasDelta ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums',
                  TONE_CLASSES[deltaTone],
                )}
              >
                <DeltaIcon className="size-3" aria-hidden="true" />
                {`${up ? '+' : ''}${(delta as number).toFixed(1)}%`}
              </span>
              {deltaLabel && <span className="text-xs text-muted-foreground">{deltaLabel}</span>}
            </div>
          ) : (
            <span />
          )}
          {spark && spark.length > 1 && (
            <Sparkline values={spark} className={SPARK_CLASSES[intent]} />
          )}
        </div>
      )}
    </>
  )

  const base =
    '@container flex flex-col rounded-xl border border-border bg-card p-5 text-left transition-colors'

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          'w-full cursor-pointer hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
      >
        {body}
      </button>
    )
  }

  return <div className={cn(base, className)}>{body}</div>
}
