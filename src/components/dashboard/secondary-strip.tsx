import { Link } from 'react-router-dom'

import { TONE_DOT_CLASSES, TONE_TEXT_CLASSES } from '@/components/common/status-badge'
import type { SecondaryMetric } from '@/components/dashboard/use-dashboard-data'
import { cn } from '@/lib/utils'

export interface SecondaryStripProps {
  metrics: SecondaryMetric[]
}

/**
 * The dense second row: eight operating numbers that do not warrant a hero tile but
 * that the board always asks about. Each one is a link into the screen that owns it.
 */
export function SecondaryStrip({ metrics }: SecondaryStripProps) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-4">
      {metrics.map((m) => (
        <Link
          key={m.key}
          to={m.href}
          className="group flex min-w-0 flex-col justify-between gap-3 bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
        >
          <span className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE_DOT_CLASSES[m.tone])}
            />
            <span className="min-w-0 text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
              {m.label}
            </span>
          </span>
          <span className="block">
            <span
              className={cn(
                'block text-xl leading-none font-semibold tracking-tight tabular-nums',
                m.tone === 'critical' ? TONE_TEXT_CLASSES.critical : 'text-foreground',
              )}
            >
              {m.display}
            </span>
            {/* Wraps rather than truncates — "RM 232k sebulan berisiko" was
                clipping to "RM 232k sebulan berisi…". */}
            <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">
              {m.detail}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
