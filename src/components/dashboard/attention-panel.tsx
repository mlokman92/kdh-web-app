import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertOctagonIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  InfoIcon,
  SirenIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { TONE_CLASSES, TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AttentionItem } from '@/components/dashboard/use-dashboard-data'
import { formatMYR } from '@/lib/format'
import { cn } from '@/lib/utils'

const SEVERITY_TONE: Record<AttentionItem['severity'], Tone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
}

const SEVERITY_ICON: Record<AttentionItem['severity'], LucideIcon> = {
  critical: AlertOctagonIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
}

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'critical', label: 'Kritikal' },
  { key: 'warning', label: 'Amaran' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

export interface AttentionPanelProps {
  items: AttentionItem[]
  /** Full count before truncation, so the panel can say what it is not showing. */
  total: number
}

/**
 * A single prioritised queue mixing SLA breaches, serious arrears, lapsing cover and
 * overdue statutory inspections — the one place a CEO looks before a board meeting.
 * Severity is carried by an icon and a written label, never by colour alone.
 */
export function AttentionPanel({ items, total }: AttentionPanelProps) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const counts = useMemo(
    () => ({
      all: items.length,
      critical: items.filter((i) => i.severity === 'critical').length,
      warning: items.filter((i) => i.severity === 'warning').length,
    }),
    [items],
  )

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.severity === filter)),
    [items, filter],
  )

  return (
    <SectionCard
      title="Perlu Perhatian"
      description={
        total > items.length
          ? `${counts.critical} kritikal · ${counts.warning} amaran · ${total} isu`
          : `${counts.critical} kritikal · ${counts.warning} amaran`
      }
      icon={SirenIcon}
      contentClassName="p-0"
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </Button>
          ))}
        </div>
      }
    >
      {visible.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={CheckCircle2Icon}
            title="Tiada isu tertunggak"
            description="Semua SLA dipatuhi, tiada tunggakan serius dan perlindungan insurans masih sah untuk skop ini."
          />
        </div>
      ) : (
        <ScrollArea className="h-[352px]">
          <ul className="divide-y divide-border">
            {visible.map((item) => {
              const tone = SEVERITY_TONE[item.severity]
              const Icon = SEVERITY_ICON[item.severity]
              return (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border',
                        TONE_CLASSES[tone],
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            'rounded border px-1.5 py-px text-[10px] font-medium tracking-wide uppercase',
                            TONE_CLASSES[tone],
                          )}
                        >
                          {item.category}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                        <span className={cn('font-medium tabular-nums', TONE_TEXT_CLASSES[tone])}>
                          {item.urgencyLabel}
                        </span>
                        {typeof item.amount === 'number' && item.amount > 0 && (
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {formatMYR(item.amount)}
                          </span>
                        )}
                      </span>
                    </span>

                    <ChevronRightIcon
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </SectionCard>
  )
}
