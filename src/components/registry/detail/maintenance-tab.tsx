import { CalendarCheckIcon, ClipboardListIcon, WrenchIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { StatusBadge, TONE_TEXT_CLASSES } from '@/components/common/status-badge'
import { DetailBlock, Field, FieldGrid, Metric } from '@/components/registry/detail/detail-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isOpenWorkOrder } from '@/lib/analytics'
import { daysUntil, formatDate, formatMYR, formatNumber, formatRelative } from '@/lib/format'
import type { Asset, MaintenanceSchedule, WorkOrder } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface MaintenanceTabProps {
  asset: Asset
  workOrders: WorkOrder[]
  schedules: MaintenanceSchedule[]
}

export function MaintenanceTab({ asset, workOrders, schedules }: MaintenanceTabProps) {
  const open = workOrders.filter(isOpenWorkOrder)
  const breached = open.filter((w) => w.slaStatus === 'Breached')
  const spend = workOrders.reduce((s, w) => s + (w.actualCost ?? w.estimatedCost), 0)
  const downtime = workOrders.reduce((s, w) => s + w.downtimeHours, 0)

  const nextDays = daysUntil(asset.nextInspection)
  const inspectionOverdue = Number.isFinite(nextDays) && nextDays < 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Open work orders"
          value={formatNumber(open.length)}
          sublabel={`${formatNumber(workOrders.length)} raised in total`}
          tone={open.length === 0 ? 'positive' : 'info'}
        />
        <Metric
          label="SLA breached"
          value={formatNumber(breached.length)}
          sublabel="currently past the deadline"
          tone={breached.length > 0 ? 'critical' : 'positive'}
        />
        <Metric label="Maintenance spend" value={formatMYR(spend)} sublabel="actual, or estimate where open" />
        <Metric
          label="Downtime logged"
          value={`${formatNumber(downtime, 1)} h`}
          sublabel="across all tickets"
          tone={downtime > 48 ? 'warning' : 'neutral'}
        />
      </div>

      <DetailBlock
        title="Inspection position"
        icon={CalendarCheckIcon}
        description={inspectionOverdue ? 'Statutory cycle has slipped' : 'Within the planned cycle'}
      >
        <FieldGrid className="sm:grid-cols-3">
          <Field label="Last inspection" value={asset.lastInspection ? formatDate(asset.lastInspection) : undefined} />
          <Field label="Next inspection">
            {asset.nextInspection ? (
              <span className={cn('text-sm', inspectionOverdue && TONE_TEXT_CLASSES.critical)}>
                {formatDate(asset.nextInspection)}
                <span className="ml-1.5 text-xs text-muted-foreground">({formatRelative(asset.nextInspection)})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Not scheduled</span>
            )}
          </Field>
          <Field label="Criticality">
            <StatusBadge status={asset.criticality} />
          </Field>
        </FieldGrid>
      </DetailBlock>

      <DetailBlock
        title={`Work orders (${workOrders.length})`}
        icon={WrenchIcon}
        actions={
          <Button variant="outline" size="xs" asChild>
            <Link to={`/maintenance?asset=${asset.id}`}>Open in Maintenance</Link>
          </Button>
        }
      >
        {workOrders.length === 0 ? (
          <EmptyState
            icon={WrenchIcon}
            title="No work orders raised"
            description="Nothing has been logged against this asset. Tickets raised by QR scan, the tenant portal or a scheduled PM will appear here."
          />
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/60">Code</TableHead>
                  <TableHead className="bg-muted/60">Title</TableHead>
                  <TableHead className="bg-muted/60">Type</TableHead>
                  <TableHead className="bg-muted/60">Priority</TableHead>
                  <TableHead className="bg-muted/60">Status</TableHead>
                  <TableHead className="bg-muted/60">SLA</TableHead>
                  <TableHead className="bg-muted/60">Raised</TableHead>
                  <TableHead className="bg-muted/60 text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-mono text-xs">{wo.code}</TableCell>
                    <TableCell className="max-w-[16rem]">
                      <p className="truncate text-sm text-foreground">{wo.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{wo.assignedTo}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{wo.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={wo.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={wo.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={wo.slaStatus} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(wo.raisedAt)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatMYR(wo.actualCost ?? wo.estimatedCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DetailBlock>

      <DetailBlock title={`Preventive schedule (${schedules.length})`} icon={ClipboardListIcon}>
        {schedules.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title="No preventive tasks"
            description="No recurring maintenance task is attached to this asset yet."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {schedules.map((s) => {
              const due = daysUntil(s.nextDue)
              const overdue = Number.isFinite(due) && due < 0
              return (
                <li key={s.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{s.task}</p>
                    {s.isStatutory && (
                      <Badge variant="outline" className="shrink-0 font-normal">
                        Statutory
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.frequency} · {s.assignedTeam}
                  </p>
                  <p className={cn('mt-1.5 text-xs', overdue ? TONE_TEXT_CLASSES.critical : 'text-muted-foreground')}>
                    Next due {formatDate(s.nextDue)} ({formatRelative(s.nextDue)})
                  </p>
                  {s.lastDone && <p className="text-xs text-muted-foreground">Last done {formatDate(s.lastDone)}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </DetailBlock>
    </div>
  )
}
