import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, MapIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MiniBar } from '@/components/dashboard/chart-bits'
import type { ZonePerformanceRow } from '@/lib/analytics'
import { formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import type { Zone } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortKey = 'portfolioValue' | 'occupancyRate' | 'monthlyRevenue' | 'openWorkOrders' | 'avgConditionScore'

const COLUMNS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'portfolioValue', label: 'Nilai Portfolio', hint: 'Nilai semasa aset dalam zon' },
  { key: 'occupancyRate', label: 'Penghunian', hint: 'Unit disewa berbanding jumlah unit' },
  { key: 'monthlyRevenue', label: 'Hasil / Bulan', hint: 'Sewa kontrak sewaan aktif' },
  { key: 'openWorkOrders', label: 'AK Terbuka', hint: 'Arahan kerja belum ditutup' },
  { key: 'avgConditionScore', label: 'Keadaan', hint: 'Purata skor keadaan aset' },
]

export interface ZonePerformanceTableProps {
  rows: ZonePerformanceRow[]
  activeZone: 'all' | Zone
  onSelectZone: (zone: 'all' | Zone) => void
}

/**
 * The six KEJORA zones side by side. A table rather than a radar: five measures on
 * five different units cannot share one polar scale honestly, and the board reads
 * these as numbers anyway. The mini bars are supplementary — every value is printed.
 */
export function ZonePerformanceTable({ rows, activeZone, onSelectZone }: ZonePerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('portfolioValue')
  const [descending, setDescending] = useState(true)

  const sorted = useMemo(() => {
    const copy = rows.slice()
    copy.sort((a, b) => (descending ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]))
    return copy
  }, [rows, sortKey, descending])

  const max = useMemo(
    () => ({
      portfolioValue: Math.max(1, ...rows.map((r) => r.portfolioValue)),
      monthlyRevenue: Math.max(1, ...rows.map((r) => r.monthlyRevenue)),
      openWorkOrders: Math.max(1, ...rows.map((r) => r.openWorkOrders)),
      outstandingArrears: Math.max(1, ...rows.map((r) => r.outstandingArrears)),
    }),
    [rows],
  )

  const totals = useMemo(
    () => ({
      assets: rows.reduce((s, r) => s + r.assetCount, 0),
      value: rows.reduce((s, r) => s + r.portfolioValue, 0),
      revenue: rows.reduce((s, r) => s + r.monthlyRevenue, 0),
      arrears: rows.reduce((s, r) => s + r.outstandingArrears, 0),
      openWo: rows.reduce((s, r) => s + r.openWorkOrders, 0),
      units: rows.reduce((s, r) => s + r.units, 0),
      occupied: rows.reduce((s, r) => s + r.occupiedUnits, 0),
    }),
    [rows],
  )

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDescending((d) => !d)
    else {
      setSortKey(key)
      setDescending(true)
    }
  }

  return (
    <SectionCard
      title="Prestasi Mengikut Zon"
      description="Enam zon operasi KEJORA · klik zon untuk menapis keseluruhan papan pemuka"
      icon={MapIcon}
      contentClassName="p-0"
      actions={
        activeZone !== 'all' ? (
          <Button variant="outline" size="xs" onClick={() => onSelectZone('all')}>
            Tunjuk semua zon
          </Button>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[880px]">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="min-w-[190px]">Zon</TableHead>
              <TableHead className="text-right">Aset</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="p-0 text-right">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    title={c.hint}
                    aria-label={`Susun mengikut ${c.label}`}
                    className="inline-flex w-full items-center justify-end gap-1 px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {c.label}
                    {sortKey === c.key &&
                      (descending ? (
                        <ArrowDownIcon className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowUpIcon className="size-3" aria-hidden="true" />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead className="text-right">Tunggakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const active = activeZone === r.zone
              return (
                <TableRow
                  key={r.zone}
                  onClick={() => onSelectZone(active ? 'all' : r.zone)}
                  className={cn('cursor-pointer', active && 'bg-accent/50')}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          active ? 'bg-primary' : 'bg-muted-foreground/40',
                        )}
                      />
                      <span className="truncate">{r.zone}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.assetCount)}</TableCell>

                  <TableCell className="text-right">
                    <span className="block tabular-nums">{formatMYRCompact(r.portfolioValue)}</span>
                    <MiniBar
                      value={r.portfolioValue}
                      max={max.portfolioValue}
                      className="mt-1"
                      label={`${r.zone}: nilai portfolio`}
                    />
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="block tabular-nums">{formatPct(r.occupancyRate, 0)}</span>
                    <MiniBar
                      value={r.occupancyRate}
                      max={100}
                      className="mt-1"
                      tone={r.occupancyRate >= 70 ? 'primary' : 'critical'}
                      label={`${r.zone}: kadar penghunian`}
                    />
                    <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                      {r.occupiedUnits}/{r.units} unit
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="block tabular-nums">{formatMYRCompact(r.monthlyRevenue)}</span>
                    <MiniBar
                      value={r.monthlyRevenue}
                      max={max.monthlyRevenue}
                      className="mt-1"
                      label={`${r.zone}: hasil bulanan`}
                    />
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="block tabular-nums">{formatNumber(r.openWorkOrders)}</span>
                    {r.breachedWorkOrders > 0 && (
                      <span className="mt-0.5 block text-[11px] font-medium text-destructive tabular-nums">
                        {r.breachedWorkOrders} SLA dilanggar
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="block tabular-nums">{r.avgConditionScore.toFixed(1)}</span>
                    <MiniBar
                      value={r.avgConditionScore}
                      max={100}
                      className="mt-1"
                      tone={r.avgConditionScore >= 70 ? 'primary' : 'critical'}
                      label={`${r.zone}: purata skor keadaan`}
                    />
                  </TableCell>

                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      r.outstandingArrears > 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {formatMYRCompact(r.outstandingArrears)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border px-4 py-3 sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Jumlah aset</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(totals.assets)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Nilai kumpulan</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">{formatMYRCompact(totals.value)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Penghunian kumpulan</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {formatPct(totals.units > 0 ? (totals.occupied / totals.units) * 100 : 0, 1)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Hasil bulanan</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">{formatMYRCompact(totals.revenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tunggakan</dt>
          <dd className="text-sm font-semibold tabular-nums text-destructive">
            {formatMYRCompact(totals.arrears)}
          </dd>
        </div>
      </dl>
    </SectionCard>
  )
}
