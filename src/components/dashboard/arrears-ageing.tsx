import { Link } from 'react-router-dom'
import { ReceiptTextIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ArrearsBucketRow } from '@/components/dashboard/use-dashboard-data'
import type { ArrearsSummary } from '@/lib/analytics'
import { formatMYR, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Severity ramp: three validated steps of the theme's emerald ramp for the bands that
 * are still collectable, then the destructive token — opacity-stepped — for the two
 * that are heading to legal action. Ordered left to right, so position carries the
 * ageing and colour only reinforces it.
 */
const BUCKET_FILL: Record<string, { background: string; opacity?: number }> = {
  current: { background: 'var(--chart-1)' },
  d30: { background: 'var(--chart-3)' },
  d60: { background: 'var(--chart-5)' },
  d90: { background: 'var(--destructive)', opacity: 0.55 },
  d90plus: { background: 'var(--destructive)' },
}

export interface ArrearsAgeingPanelProps {
  buckets: ArrearsBucketRow[]
  summary: ArrearsSummary
}

export function ArrearsAgeingPanel({ buckets, summary }: ArrearsAgeingPanelProps) {
  const total = buckets.reduce((s, b) => s + b.amount, 0)
  const worst = summary.worstOffenders.slice(0, 3)

  return (
    <SectionCard
      title="Penuaan Tunggakan"
      description={`${formatNumber(summary.accountsInArrears)} akaun · ${formatPct(summary.arrearsRatePct)} daripada hasil tahunan kontrak`}
      icon={ReceiptTextIcon}
      actions={
        <Button variant="outline" size="xs" asChild>
          <Link to="/property">Buku sewaan</Link>
        </Button>
      }
    >
      <p className="text-2xl leading-none font-semibold tracking-tight text-foreground">
        {formatMYR(total)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Jumlah tertunggak merentas semua sewaan aktif</p>

      {/* Stacked share strip — 2px surface gaps do the separating, no borders. */}
      <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {buckets
          .filter((b) => b.amount > 0)
          .map((b) => (
            <Tooltip key={b.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${b.label}: ${formatMYR(b.amount)}, ${formatPct(b.share)}`}
                  className="h-full min-w-[3px] rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  style={{
                    width: `${b.share}%`,
                    backgroundColor: BUCKET_FILL[b.key]?.background,
                    opacity: BUCKET_FILL[b.key]?.opacity ?? 1,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {b.label} · {formatMYR(b.amount)} ({formatPct(b.share)})
              </TooltipContent>
            </Tooltip>
          ))}
      </div>

      <ul className="mt-4 space-y-2">
        {buckets.map((b) => (
          <li key={b.key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{
                backgroundColor: BUCKET_FILL[b.key]?.background,
                opacity: BUCKET_FILL[b.key]?.opacity ?? 1,
              }}
            />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                b.critical ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {b.label}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
              {formatMYR(b.amount)}
            </span>
            <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatPct(b.share, 0)}
            </span>
          </li>
        ))}
      </ul>

      {worst.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Akaun tertinggi</p>
          <ul className="mt-2 space-y-1.5">
            {worst.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-xs">
                <Link
                  to={`/property?lease=${l.id}`}
                  className="min-w-0 flex-1 truncate text-foreground hover:text-primary hover:underline"
                >
                  {l.tenantName}
                  <span className="ml-1.5 font-mono text-muted-foreground">{l.code}</span>
                </Link>
                <span className="shrink-0 font-mono tabular-nums text-destructive">
                  {formatMYR(l.outstandingAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
