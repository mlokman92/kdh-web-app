import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Tone = 'positive' | 'warning' | 'critical' | 'neutral' | 'info'

/**
 * Amber is not part of the ocean-breeze token set, so the "warning" tone is
 * derived from the theme's own tokens with color-mix (destructive + chart-1).
 * It therefore still adapts correctly to light and dark mode.
 * NOTE: these must stay written out in full — Tailwind scans literal strings.
 */

/** Token-based tint classes for each tone — reuse these anywhere in the app. */
export const TONE_CLASSES: Record<Tone, string> = {
  positive: 'border-primary/25 bg-primary/10 text-primary',
  info: 'border-border bg-secondary text-secondary-foreground',
  warning:
    'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/30 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
  critical: 'border-destructive/25 bg-destructive/10 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
}

/** Dot colours matching the tones above. */
export const TONE_DOT_CLASSES: Record<Tone, string> = {
  positive: 'bg-primary',
  info: 'bg-muted-foreground',
  warning: 'bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
  critical: 'bg-destructive',
  neutral: 'bg-muted-foreground/60',
}

/** Plain text colour per tone (no background) — handy for figures and icons. */
export const TONE_TEXT_CLASSES: Record<Tone, string> = {
  positive: 'text-primary',
  info: 'text-secondary-foreground',
  warning: 'text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
  critical: 'text-destructive',
  neutral: 'text-muted-foreground',
}

const TONE_MAP: Record<string, Tone> = {
  /* Asset status */
  Active: 'positive',
  Leased: 'positive',
  Vacant: 'warning',
  'Under Maintenance': 'warning',
  'Under Construction': 'info',
  Idle: 'neutral',
  Disposed: 'neutral',

  /* Work order status */
  Open: 'info',
  Assigned: 'info',
  'In Progress': 'info',
  'On Hold': 'warning',
  'Pending Parts': 'warning',
  'Pending Verification': 'warning',
  Closed: 'positive',
  Cancelled: 'neutral',

  /* Lease status */
  'Expiring Soon': 'warning',
  Expired: 'critical',
  'Renewal In Progress': 'info',
  Terminated: 'neutral',
  Draft: 'neutral',

  /* Unit status */
  Occupied: 'positive',
  'Under Renovation': 'info',
  Reserved: 'info',
  'Legal Action': 'critical',

  /* SLA status */
  Met: 'positive',
  'On Track': 'positive',
  'At Risk': 'warning',
  Breached: 'critical',

  /* Condition */
  Excellent: 'positive',
  Good: 'positive',
  Fair: 'warning',
  Poor: 'critical',

  /* Criticality (also Condition "Critical") */
  Critical: 'critical',
  High: 'warning',
  Medium: 'info',
  Low: 'neutral',

  /* Priority */
  'P1 - Critical': 'critical',
  'P2 - High': 'warning',
  'P3 - Medium': 'info',
  'P4 - Low': 'neutral',

  /* Notice stage */
  None: 'neutral',
  'Reminder Sent': 'info',
  '1st Notice': 'warning',
  'Final Notice': 'critical',

  /* Payment status */
  Paid: 'positive',
  Partial: 'warning',
  Outstanding: 'warning',
  Overdue: 'critical',
}

/**
 * Maps any domain status string to a semantic tone so charts, tables and
 * tiles across the app stay visually consistent.
 */
export function statusTone(status: string): Tone {
  return TONE_MAP[status] ?? 'neutral'
}

const VARIANT_BY_TONE: Record<Tone, ComponentProps<typeof Badge>['variant']> = {
  positive: 'outline',
  info: 'outline',
  warning: 'outline',
  critical: 'destructive',
  neutral: 'outline',
}

export interface StatusBadgeProps {
  status: string
  className?: string
}

/** Small pill with a leading tone dot, used for every domain status. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = statusTone(status)
  return (
    <Badge
      variant={VARIANT_BY_TONE[tone]}
      className={cn(
        'gap-1.5 border px-2 py-0.5 font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT_CLASSES[tone])}
      />
      {status}
    </Badge>
  )
}
