import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangleIcon,
  DownloadIcon,
  PieChartIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Badge } from '@/components/ui/badge'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TenantRow } from '@/components/property/helpers'
import type { PropertyActions } from '@/components/property/scope'
import { downloadCsv, formatMYR, formatNumber, formatPct, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

const RATINGS = ['A', 'B', 'C', 'D'] as const

export interface TenantsTabProps {
  rows: TenantRow[]
  actions: PropertyActions
}

export function TenantsTab({ rows, actions }: TenantsTabProps) {
  const [query, setQuery] = useState('')
  const [rating, setRating] = useState('all')
  const [onlyArrears, setOnlyArrears] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (rating !== 'all' && r.tenant.creditRating !== rating) return false
      if (onlyArrears && r.arrears <= 0) return false
      if (!q) return true
      return (
        r.tenant.name.toLowerCase().includes(q) ||
        r.tenant.businessCategory.toLowerCase().includes(q) ||
        r.tenant.contactPerson.toLowerCase().includes(q) ||
        r.properties.some((p) => p.toLowerCase().includes(q))
      )
    })
  }, [rows, query, rating, onlyArrears])

  const totalRent = rows.reduce((s, r) => s + r.monthlyRent, 0)
  const top10 = rows.slice(0, 10).reduce((s, r) => s + r.monthlyRent, 0)
  const concentration = totalRent > 0 ? (top10 / totalRent) * 100 : 0
  const inArrears = rows.filter((r) => r.arrears > 0)
  const weakCredit = rows.filter((r) => r.tenant.creditRating === 'C' || r.tenant.creditRating === 'D')

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error('Tiada penyewa untuk dieksport.')
      return
    }
    downloadCsv(
      `kdh-tenant-directory-${new Date().toISOString().slice(0, 10)}`,
      filtered.map((r) => ({
        Penyewa: r.tenant.name,
        SSM: r.tenant.ssmNo,
        Kategori: r.tenant.businessCategory,
        'Orang Hubungan': r.tenant.contactPerson,
        Telefon: r.tenant.phone,
        Emel: r.tenant.email,
        'Rating Kredit': r.tenant.creditRating,
        'Penyewa Sejak': r.tenant.tenantSinceYear,
        'Unit Aktif': r.unitCount,
        'Keluasan (sqft)': r.totalAreaSqft,
        'Sewa Bulanan (RM)': r.monthlyRent,
        'Sewa Tahunan (RM)': r.annualRent,
        'Tunggakan (RM)': r.arrears,
        'Peringkat Notis': r.worstNoticeStage,
      })),
    )
    toast.success(`Direktori penyewa dieksport — ${filtered.length} rekod`)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Penyewa aktif"
          value={formatNumber(rows.filter((r) => r.unitCount > 0).length)}
          sub={`${formatNumber(rows.length)} termasuk rekod sejarah`}
          icon={UsersIcon}
        />
        <Stat
          label="Kepekatan 10 teratas"
          value={formatPct(concentration, 1)}
          sub={`${formatMYR(top10)} daripada ${formatMYR(totalRent)} sebulan`}
          icon={PieChartIcon}
        />
        <Stat
          label="Penyewa bertunggak"
          value={formatNumber(inArrears.length)}
          sub={formatMYR(inArrears.reduce((s, r) => s + r.arrears, 0))}
          icon={AlertTriangleIcon}
          tone="critical"
        />
        <Stat
          label="Kredit C / D"
          value={formatNumber(weakCredit.length)}
          sub={`${formatMYR(weakCredit.reduce((s, r) => s + r.monthlyRent, 0))} sewa bulanan terdedah`}
          icon={ShieldCheckIcon}
          tone="warning"
        />
      </div>

      <SectionCard
        title="Direktori Penyewa"
        description={`${filtered.length} daripada ${rows.length} penyewa`}
        icon={UsersIcon}
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
                placeholder="Cari penyewa…"
                aria-label="Cari penyewa"
                className="h-7 w-52 pl-8 text-xs"
              />
            </div>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger size="sm" className="w-40" aria-label="Tapis rating kredit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kredit</SelectItem>
                {RATINGS.map((r) => (
                  <SelectItem key={r} value={r}>
                    Kredit {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={onlyArrears ? 'default' : 'outline'}
              onClick={() => setOnlyArrears((v) => !v)}
            >
              Bertunggak sahaja
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <DownloadIcon aria-hidden="true" />
              CSV
            </Button>
          </>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={UsersIcon}
              title="Tiada penyewa sepadan"
              description="Laraskan carian atau penapis rating kredit."
            />
          </div>
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Penyewa</TableHead>
                  <TableHead>Hubungan</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                  <TableHead className="text-right">Sejak</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Sewa/bulan</TableHead>
                  <TableHead className="text-right">Tunggakan</TableHead>
                  <TableHead>Notis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.tenant.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => actions.openTenant(r.tenant.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        actions.openTenant(r.tenant.id)
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground"
                        >
                          {initials(r.tenant.name)}
                        </span>
                        <div className="min-w-0">
                          <span className="block max-w-56 truncate font-medium">{r.tenant.name}</span>
                          <span className="block max-w-56 truncate text-xs text-muted-foreground">
                            {r.tenant.businessCategory}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-44 truncate text-xs">{r.tenant.contactPerson}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{r.tenant.phone}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-mono text-xs',
                          r.tenant.creditRating === 'A' || r.tenant.creditRating === 'B'
                            ? 'border-primary/25 bg-primary/10 text-primary'
                            : 'border-destructive/25 bg-destructive/10 text-destructive',
                        )}
                      >
                        {r.tenant.creditRating}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.tenant.tenantSinceYear}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.unitCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                      {formatMYR(r.monthlyRent)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        r.arrears > 0 && 'font-semibold text-destructive',
                      )}
                    >
                      {r.arrears > 0 ? formatMYR(r.arrears) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.worstNoticeStage} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  tone?: 'default' | 'critical' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl leading-none font-semibold tabular-nums',
          tone === 'critical' && 'text-destructive',
          tone === 'warning' && 'text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
