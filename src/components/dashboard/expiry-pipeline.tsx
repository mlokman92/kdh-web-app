import { Link } from 'react-router-dom'
import { CalendarClockIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { Button } from '@/components/ui/button'
import type { ExpiryBucket } from '@/lib/analytics'
import { formatMYR, formatMYRCompact, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Buckets inside this many days are the ones the leasing team must chase now. */
const URGENT_BUCKETS = new Set(['0-30 days', '31-60 days'])

const BUCKET_LABEL: Record<string, string> = {
  '0-30 days': '0–30 hari',
  '31-60 days': '31–60 hari',
  '61-90 days': '61–90 hari',
  '91-180 days': '91–180 hari',
  '180+ days': 'Melebihi 180 hari',
}

export interface ExpiryPipelineProps {
  buckets: ExpiryBucket[]
}

/**
 * Lease expiry runway. Bars are supplementary — the count and the monthly value at
 * risk are both printed on every row, and the two urgent bands are tinted.
 */
export function ExpiryPipeline({ buckets }: ExpiryPipelineProps) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count))
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)
  const urgentValue = buckets
    .filter((b) => URGENT_BUCKETS.has(b.bucket))
    .reduce((s, b) => s + b.monthlyValue, 0)

  return (
    <SectionCard
      title="Tamat Tempoh Sewaan"
      description={`${totalCount} sewaan aktif mengikut tarikh tamat`}
      icon={CalendarClockIcon}
      actions={
        <Button variant="outline" size="xs" asChild>
          <Link to="/property?status=Expiring+Soon">Buka pembaharuan</Link>
        </Button>
      }
    >
      <ul className="space-y-3">
        {buckets.map((b) => {
          const urgent = URGENT_BUCKETS.has(b.bucket)
          const width = (b.count / maxCount) * 100
          return (
            <li key={b.bucket}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-foreground">
                  {BUCKET_LABEL[b.bucket] ?? b.bucket}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  <span className={cn('font-semibold', urgent ? 'text-destructive' : 'text-foreground')}>
                    {formatNumber(b.count)}
                  </span>{' '}
                  sewaan · {formatMYRCompact(b.monthlyValue)}/bulan
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', urgent ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${Math.max(width, b.count > 0 ? 3 : 0)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Nilai berisiko dalam 60 hari akan datang:{' '}
        <span className="font-mono font-semibold text-destructive">{formatMYR(urgentValue)}</span> sebulan
        dalam sewa kontrak.
      </p>
    </SectionCard>
  )
}
