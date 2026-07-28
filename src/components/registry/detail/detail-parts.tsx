import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

/** Label-over-value pair used throughout the asset record. */
export function Field({
  label,
  value,
  mono,
  className,
  children,
}: {
  label: string
  value?: ReactNode
  mono?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <p className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className={cn('text-sm break-words text-foreground', mono && 'font-mono text-xs')}>
        {children ?? (value === undefined || value === null || value === '' ? '—' : value)}
      </div>
    </div>
  )
}

/** Responsive grid the fields sit in. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3', className)}>{children}</div>
}

/** Titled block inside a tab panel. */
export function DetailBlock({
  title,
  icon: Icon,
  description,
  actions,
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card', className)}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Compact figure tile used inside the financial and commercial tabs. */
export function Metric({
  label,
  value,
  sublabel,
  tone = 'neutral',
  className,
}: {
  label: string
  value: string
  sublabel?: string
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 p-3', className)}>
      <p className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 font-mono text-base leading-none font-semibold tabular-nums', TONE_TEXT_CLASSES[tone])}>
        {value}
      </p>
      {sublabel && <p className="mt-1.5 truncate text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  )
}

/** Simple horizontal meter driven by a 0–100 score. */
export function ScoreMeter({
  value,
  tone = 'neutral',
  className,
}: {
  value: number
  tone?: Tone
  className?: string
}) {
  const width = Math.max(2, Math.min(100, value))
  const fill: Record<Tone, string> = {
    positive: 'bg-primary',
    info: 'bg-muted-foreground',
    warning: 'bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
    critical: 'bg-destructive',
    neutral: 'bg-muted-foreground/60',
  }
  return (
    <span className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} aria-hidden="true">
      <span className={cn('block h-full rounded-full', fill[tone])} style={{ width: `${width}%` }} />
    </span>
  )
}
