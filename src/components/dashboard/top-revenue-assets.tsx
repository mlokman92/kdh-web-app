import { Link } from 'react-router-dom'
import { TrophyIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
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
import type { AssetRevenueRow } from '@/lib/analytics'
import { formatMYR, formatMYRCompact, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface TopRevenueAssetsProps {
  rows: AssetRevenueRow[]
  /** Portfolio revenue YTD — used for the share column. */
  totalRevenue: number
}

/** The eight assets carrying the portfolio, with what each actually keeps. */
export function TopRevenueAssets({ rows, totalRevenue }: TopRevenueAssetsProps) {
  const max = rows.length > 0 ? rows[0].revenueYtd : 0
  const covered = rows.reduce((s, r) => s + r.revenueYtd, 0)

  return (
    <SectionCard
      title="Aset Penjana Hasil Tertinggi"
      description="Lapan aset teratas mengikut hasil tahun semasa"
      icon={TrophyIcon}
      contentClassName="p-0"
      actions={
        <Button variant="outline" size="xs" asChild>
          <Link to="/registry">Daftar penuh</Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Tiada aset dalam skop ini" description="Ubah penapis zon untuk melihat aset." />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table className="min-w-[620px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="min-w-[220px]">Aset</TableHead>
                  <TableHead className="text-right">Hasil YTD</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Penggunaan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.asset.id}>
                    <TableCell>
                      <Link
                        to={`/registry?asset=${r.asset.id}`}
                        className="block min-w-0 hover:text-primary"
                      >
                        <span className="block truncate text-sm font-medium">{r.asset.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{r.asset.code}</span> · {r.asset.location.town} ·{' '}
                          {r.asset.category}
                        </span>
                      </Link>
                      <MiniBar
                        value={r.revenueYtd}
                        max={max}
                        className="mt-1.5"
                        label={`${r.asset.name}: ${formatPct((r.revenueYtd / (totalRevenue || 1)) * 100)} daripada hasil portfolio`}
                      />
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <span className="block tabular-nums">{formatMYRCompact(r.revenueYtd)}</span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        {formatPct((r.revenueYtd / (totalRevenue || 1)) * 100)} portfolio
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <span
                        className={cn(
                          'block tabular-nums',
                          r.marginPct >= 50 ? 'text-primary' : r.marginPct >= 25 ? 'text-foreground' : 'text-destructive',
                        )}
                      >
                        {formatPct(r.marginPct, 0)}
                      </span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        bersih {formatMYRCompact(r.netYtd)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {formatPct(r.asset.utilisationRate, 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Lapan aset ini menyumbang{' '}
            <span className="font-medium text-foreground">{formatMYR(covered)}</span> —{' '}
            <span className="font-medium text-foreground">
              {formatPct((covered / (totalRevenue || 1)) * 100)}
            </span>{' '}
            daripada hasil portfolio tahun semasa.
          </p>
        </>
      )}
    </SectionCard>
  )
}
