import { useMemo, useState } from 'react'
import { DownloadIcon, StarIcon, TruckIcon } from 'lucide-react'
import { toast } from 'sonner'

import { SectionCard } from '@/components/common/section-card'
import { TONE_DOT_CLASSES, TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { vendorPerformance } from '@/lib/analytics'
import { daysUntil, downloadCsv, formatDate, formatMYR } from '@/lib/format'
import type { WorkOrder } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

type SortMode = 'jobs' | 'rating' | 'sla' | 'spend' | 'expiry'

function complianceTone(value: number): Tone {
  if (value >= 90) return 'positive'
  if (value >= 75) return 'warning'
  return 'critical'
}

function expiryTone(days: number): Tone {
  if (days < 0) return 'critical'
  if (days <= 60) return 'warning'
  return 'neutral'
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          aria-hidden="true"
          className={cn(
            'size-3',
            i <= full ? cn(TONE_TEXT_CLASSES.warning, 'fill-current') : 'text-muted-foreground/30',
          )}
        />
      ))}
      <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">{rating.toFixed(1)}</span>
    </span>
  )
}

export interface VendorsPanelProps {
  workOrders: WorkOrder[]
}

/**
 * Panel contractor scorecard. Blends the contracted SLA rating with what the
 * contractor has actually delivered against KDH work orders, and flags contracts
 * approaching renewal.
 */
export function VendorsPanel({ workOrders }: VendorsPanelProps) {
  const vendors = useAppStore((s) => s.vendors)
  const [sort, setSort] = useState<SortMode>('jobs')

  const now = useMemo(() => new Date(), [])

  const rows = useMemo(() => {
    const base = vendorPerformance(workOrders, vendors)
    return base.slice().sort((a, b) => {
      switch (sort) {
        case 'rating':
          return b.rating - a.rating
        case 'sla':
          return b.onTimePct - a.onTimePct
        case 'spend':
          return b.totalCost - a.totalCost
        case 'expiry':
          return daysUntil(a.vendor.contractExpiry, now) - daysUntil(b.vendor.contractExpiry, now)
        case 'jobs':
        default:
          return b.jobs - a.jobs
      }
    })
  }, [workOrders, vendors, sort, now])

  const totals = useMemo(
    () => ({
      spend: rows.reduce((s, r) => s + r.totalCost, 0),
      open: rows.reduce((s, r) => s + r.open, 0),
      expiring: rows.filter((r) => {
        const d = daysUntil(r.vendor.contractExpiry, now)
        return d <= 60
      }).length,
    }),
    [rows, now],
  )

  function exportCsv() {
    downloadCsv(
      `kdh-vendor-performance-${new Date().toISOString().slice(0, 10)}`,
      rows.map((r) => ({
        Vendor: r.vendor.name,
        Specialisation: r.vendor.specialisation,
        Phone: r.vendor.phone,
        Rating: r.rating,
        'Contracted SLA %': r.slaCompliance,
        'Delivered On-Time %': r.onTimePct,
        'Total Jobs': r.jobs,
        'Open Jobs': r.open,
        'Closed Jobs': r.closed,
        'Average Cost (RM)': r.avgCost,
        'Total Cost (RM)': r.totalCost,
        'Contract Expiry': formatDate(r.vendor.contractExpiry),
        'Days To Expiry': daysUntil(r.vendor.contractExpiry, now),
      })),
    )
    toast.success(`${rows.length} vendors exported`, { description: 'CSV saved to your downloads folder.' })
  }

  return (
    <SectionCard
      title="Panel contractor performance"
      description={`${rows.length} vendors · ${totals.open} open jobs · ${formatMYR(totals.spend)} booked${
        totals.expiring > 0 ? ` · ${totals.expiring} contract${totals.expiring === 1 ? '' : 's'} expiring within 60 days` : ''
      }`}
      icon={TruckIcon}
      contentClassName="p-0"
      actions={
        <>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger size="sm" className="w-[190px]" aria-label="Sort vendors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jobs">Sort: job volume</SelectItem>
              <SelectItem value="rating">Sort: rating</SelectItem>
              <SelectItem value="sla">Sort: on-time delivery</SelectItem>
              <SelectItem value="spend">Sort: spend</SelectItem>
              <SelectItem value="expiry">Sort: contract expiry</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <DownloadIcon aria-hidden="true" />
            Export CSV
          </Button>
        </>
      }
    >
      <div className="max-h-[62vh] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="min-w-[220px]">Contractor</TableHead>
              <TableHead className="w-[140px]">Rating</TableHead>
              <TableHead className="w-[190px]">On-time delivery</TableHead>
              <TableHead className="w-[90px] text-right">Jobs</TableHead>
              <TableHead className="w-[90px] text-right">Open</TableHead>
              <TableHead className="w-[120px] text-right">Avg cost</TableHead>
              <TableHead className="w-[130px] text-right">Total booked</TableHead>
              <TableHead className="w-[160px]">Contract expiry</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((r) => {
              const days = daysUntil(r.vendor.contractExpiry, now)
              const tone = complianceTone(r.onTimePct)
              const eTone = expiryTone(days)
              return (
                <TableRow key={r.vendor.id}>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{r.vendor.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.vendor.specialisation}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.vendor.phone}</p>
                  </TableCell>

                  <TableCell>
                    <Stars rating={r.rating} />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 min-w-[70px] flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', TONE_DOT_CLASSES[tone])}
                          style={{ width: `${Math.min(100, r.onTimePct)}%` }}
                        />
                      </div>
                      <span className={cn('font-mono text-xs font-semibold tabular-nums', TONE_TEXT_CLASSES[tone])}>
                        {r.onTimePct.toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {r.slaCompliance}% contracted · {r.closed} closed
                    </p>
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm tabular-nums">{r.jobs}</TableCell>

                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.open > 0 ? (
                      <span className="font-semibold text-foreground">{r.open}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right font-mono text-xs tabular-nums">{formatMYR(r.avgCost)}</TableCell>

                  <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                    {formatMYR(r.totalCost)}
                  </TableCell>

                  <TableCell>
                    <p className="text-xs font-medium text-foreground">{formatDate(r.vendor.contractExpiry)}</p>
                    <p className={cn('text-[11px]', TONE_TEXT_CLASSES[eTone])}>
                      {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days remaining`}
                    </p>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
