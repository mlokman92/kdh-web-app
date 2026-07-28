import { BuildingIcon, FileSignatureIcon, StoreIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { StatusBadge, TONE_TEXT_CLASSES } from '@/components/common/status-badge'
import { DetailBlock, Metric } from '@/components/registry/detail/detail-parts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isLiveLease } from '@/lib/analytics'
import { formatArea, formatDate, formatMYR, formatNumber, formatPct } from '@/lib/format'
import type { Asset, Lease, PropertyUnit } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface CommercialTabProps {
  asset: Asset
  units: PropertyUnit[]
  leases: Lease[]
}

export function CommercialTab({ asset, units, leases }: CommercialTabProps) {
  const occupied = units.filter((u) => u.status === 'Occupied').length
  const occupancyRate = units.length > 0 ? (occupied / units.length) * 100 : 0
  const live = leases.filter(isLiveLease)
  const monthlyRent = live.reduce((s, l) => s + l.monthlyRent, 0)
  const arrears = leases.reduce((s, l) => s + l.outstandingAmount, 0)
  const lettable = units.reduce((s, u) => s + u.lettableAreaSqft, 0)

  if (units.length === 0 && leases.length === 0) {
    return (
      <EmptyState
        icon={StoreIcon}
        title="Not a lettable asset"
        description={`${asset.name} carries no tenanted units or leases. Land parcels, infrastructure, plant and ICT assets sit outside the leasing book.`}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Occupancy"
          value={formatPct(occupancyRate, 1)}
          sublabel={`${formatNumber(occupied)} of ${formatNumber(units.length)} units let`}
          tone={occupancyRate >= 85 ? 'positive' : occupancyRate >= 60 ? 'warning' : 'critical'}
        />
        <Metric
          label="Contracted rent"
          value={formatMYR(monthlyRent)}
          sublabel={`${formatMYR(monthlyRent * 12)} annualised`}
          tone="positive"
        />
        <Metric
          label="Outstanding arrears"
          value={formatMYR(arrears)}
          sublabel={`${formatNumber(leases.filter((l) => l.outstandingAmount > 0).length)} account(s) in arrears`}
          tone={arrears > 0 ? 'critical' : 'positive'}
        />
        <Metric label="Lettable area" value={formatArea(lettable)} sublabel={`${formatNumber(units.length)} units`} />
      </div>

      <DetailBlock
        title={`Units (${units.length})`}
        icon={BuildingIcon}
        actions={
          <Button variant="outline" size="xs" asChild>
            <Link to={`/property?asset=${asset.id}`}>Open in Property</Link>
          </Button>
        }
      >
        {units.length === 0 ? (
          <EmptyState icon={BuildingIcon} title="No units registered" description="This asset has no sub-divided units." />
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/60">Unit</TableHead>
                  <TableHead className="bg-muted/60">Type</TableHead>
                  <TableHead className="bg-muted/60">Floor</TableHead>
                  <TableHead className="bg-muted/60 text-right">Area</TableHead>
                  <TableHead className="bg-muted/60 text-right">Market psf</TableHead>
                  <TableHead className="bg-muted/60">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.unitNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.floor}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatNumber(u.lettableAreaSqft)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {u.marketRatePsf.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DetailBlock>

      <DetailBlock title={`Leases (${leases.length})`} icon={FileSignatureIcon}>
        {leases.length === 0 ? (
          <EmptyState
            icon={FileSignatureIcon}
            title="No leases on file"
            description="Units at this asset are currently untenanted or held back from the market."
          />
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/60">Lease</TableHead>
                  <TableHead className="bg-muted/60">Tenant</TableHead>
                  <TableHead className="bg-muted/60">Unit</TableHead>
                  <TableHead className="bg-muted/60">Term</TableHead>
                  <TableHead className="bg-muted/60 text-right">Monthly rent</TableHead>
                  <TableHead className="bg-muted/60 text-right">Arrears</TableHead>
                  <TableHead className="bg-muted/60">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell className="max-w-[14rem]">
                      <p className="truncate text-sm text-foreground">{l.tenantName}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.businessType}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.unitNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(l.startDate)} – {formatDate(l.endDate)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatMYR(l.monthlyRent)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        l.outstandingAmount > 0 ? TONE_TEXT_CLASSES.critical : 'text-muted-foreground',
                      )}
                    >
                      {formatMYR(l.outstandingAmount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DetailBlock>
    </div>
  )
}
