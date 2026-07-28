import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, FileSpreadsheetIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PropertyActions, PropertyScope } from '@/components/property/scope'
import { downloadCsv, formatDate, formatMYR, formatNumber } from '@/lib/format'
import { LEASE_STATUSES, type Lease } from '@/lib/types'
import { cn } from '@/lib/utils'

type SortKey =
  | 'code'
  | 'property'
  | 'tenant'
  | 'area'
  | 'monthlyRent'
  | 'ratePsf'
  | 'startDate'
  | 'endDate'
  | 'status'
  | 'outstandingAmount'

interface Column {
  key: SortKey
  label: string
  numeric?: boolean
  className?: string
}

const COLUMNS: Column[] = [
  { key: 'code', label: 'Kod' },
  { key: 'property', label: 'Hartanah / Unit' },
  { key: 'tenant', label: 'Penyewa' },
  { key: 'area', label: 'Keluasan', numeric: true },
  { key: 'monthlyRent', label: 'Sewa/bulan', numeric: true },
  { key: 'ratePsf', label: 'RM psf', numeric: true },
  { key: 'startDate', label: 'Mula' },
  { key: 'endDate', label: 'Tamat' },
  { key: 'status', label: 'Status' },
  { key: 'outstandingAmount', label: 'Tunggakan', numeric: true },
]

export interface RentRollTabProps {
  scope: PropertyScope
  actions: PropertyActions
  statusFilter: string
  onStatusFilterChange: (value: string) => void
}

export function RentRollTab({ scope, actions, statusFilter, onStatusFilterChange }: RentRollTabProps) {
  const [query, setQuery] = useState('')
  const [property, setProperty] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('monthlyRent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const properties = useMemo(
    () => [...new Set(scope.leases.map((l) => l.propertyName))].sort((a, b) => a.localeCompare(b)),
    [scope.leases],
  )

  const areaOf = (l: Lease) => scope.unitById.get(l.unitId)?.lettableAreaSqft ?? 0

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = scope.leases.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (property !== 'all' && l.propertyName !== property) return false
      if (!q) return true
      return (
        l.code.toLowerCase().includes(q) ||
        l.tenantName.toLowerCase().includes(q) ||
        l.propertyName.toLowerCase().includes(q) ||
        l.unitNo.toLowerCase().includes(q) ||
        l.businessType.toLowerCase().includes(q) ||
        l.zone.toLowerCase().includes(q)
      )
    })

    const dir = sortDir === 'asc' ? 1 : -1
    out = out.slice().sort((a, b) => {
      switch (sortKey) {
        case 'code':
          return a.code.localeCompare(b.code) * dir
        case 'property':
          return (a.propertyName.localeCompare(b.propertyName) || a.unitNo.localeCompare(b.unitNo)) * dir
        case 'tenant':
          return a.tenantName.localeCompare(b.tenantName) * dir
        case 'area':
          return (areaOf(a) - areaOf(b)) * dir
        case 'monthlyRent':
          return (a.monthlyRent - b.monthlyRent) * dir
        case 'ratePsf':
          return (a.ratePsf - b.ratePsf) * dir
        case 'startDate':
          return a.startDate.localeCompare(b.startDate) * dir
        case 'endDate':
          return a.endDate.localeCompare(b.endDate) * dir
        case 'status':
          return a.status.localeCompare(b.status) * dir
        case 'outstandingAmount':
          return (a.outstandingAmount - b.outstandingAmount) * dir
      }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.leases, scope.unitById, query, property, statusFilter, sortKey, sortDir])

  const totals = useMemo(
    () => ({
      area: rows.reduce((s, l) => s + areaOf(l), 0),
      rent: rows.reduce((s, l) => s + l.monthlyRent, 0),
      outstanding: rows.reduce((s, l) => s + l.outstandingAmount, 0),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, scope.unitById],
  )

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'code' || key === 'property' || key === 'tenant' || key === 'status' ? 'asc' : 'desc')
    }
  }

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error('Tiada baris untuk dieksport.')
      return
    }
    downloadCsv(
      `kdh-rent-roll-${new Date().toISOString().slice(0, 10)}`,
      rows.map((l) => ({
        Kod: l.code,
        Hartanah: l.propertyName,
        Unit: l.unitNo,
        Zon: l.zone,
        Penyewa: l.tenantName,
        'Jenis Perniagaan': l.businessType,
        'Keluasan (sqft)': areaOf(l),
        'Sewa Bulanan (RM)': l.monthlyRent,
        'Kadar (RM psf)': l.ratePsf,
        'Caj Perkhidmatan (RM)': l.serviceCharge,
        Deposit: l.deposit,
        Mula: l.startDate,
        Tamat: l.endDate,
        'Tempoh (bulan)': l.tenureMonths,
        Status: l.status,
        'Tunggakan (RM)': l.outstandingAmount,
        'Hari Lewat': l.daysOverdue,
        'Peringkat Notis': l.noticeStage,
      })),
    )
    toast.success(`Rent roll dieksport — ${rows.length} pajakan`, {
      description: 'Fail CSV telah dimuat turun ke peranti anda.',
    })
  }

  return (
    <SectionCard
      title="Rent Roll"
      description={`${rows.length} daripada ${scope.leases.length} pajakan · ${formatMYR(totals.rent)} sewa kontrak sebulan`}
      icon={FileSpreadsheetIcon}
      contentClassName="p-0"
      actions={
        <>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kod, penyewa, unit…"
              aria-label="Cari rent roll"
              className="h-7 w-56 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger size="sm" className="w-44" aria-label="Tapis status pajakan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {LEASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={property} onValueChange={setProperty}>
            <SelectTrigger size="sm" className="w-52" aria-label="Tapis hartanah">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua hartanah</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <DownloadIcon aria-hidden="true" />
            CSV
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={SearchIcon}
            title="Tiada pajakan sepadan"
            description="Laraskan carian atau penapis untuk melihat baris rent roll."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery('')
                  setProperty('all')
                  onStatusFilterChange('all')
                }}
              >
                Kosongkan penapis
              </Button>
            }
          />
        </div>
      ) : (
        <div className="max-h-[34rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className={cn(c.numeric && 'text-right', c.className)}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-foreground',
                        c.numeric && 'flex-row-reverse',
                        sortKey === c.key && 'text-foreground',
                      )}
                      aria-label={`Susun mengikut ${c.label}`}
                    >
                      {c.label}
                      {sortKey === c.key &&
                        (sortDir === 'asc' ? (
                          <ArrowUpIcon className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDownIcon className="size-3" aria-hidden="true" />
                        ))}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow
                  key={l.id}
                  onClick={() => actions.openLease(l.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      actions.openLease(l.id)
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs">{l.code}</TableCell>
                  <TableCell>
                    <span className="block max-w-56 truncate font-medium">{l.propertyName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {l.unitNo} · {l.zone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-52 truncate">{l.tenantName}</span>
                    <span className="text-xs text-muted-foreground">{l.businessType}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatNumber(areaOf(l))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                    {formatMYR(l.monthlyRent)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {l.ratePsf.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(l.startDate)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(l.endDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono text-xs tabular-nums',
                      l.outstandingAmount > 0 && 'font-medium text-destructive',
                    )}
                  >
                    {l.outstandingAmount > 0 ? formatMYR(l.outstandingAmount) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="sticky bottom-0 z-10">
              <TableRow>
                <TableCell colSpan={3} className="text-xs font-medium">
                  Jumlah ({rows.length} pajakan)
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatNumber(totals.area)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                  {formatMYR(totals.rent)}
                </TableCell>
                <TableCell colSpan={4} />
                <TableCell className="text-right font-mono text-xs font-semibold tabular-nums text-destructive">
                  {formatMYR(totals.outstanding)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </SectionCard>
  )
}
