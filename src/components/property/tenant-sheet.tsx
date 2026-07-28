import { useMemo } from 'react'
import { BanknoteIcon, FileTextIcon, MailIcon, PhoneIcon } from 'lucide-react'

import { StatusBadge } from '@/components/common/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { formatDate, formatMYR, formatNumber, formatPct, initials } from '@/lib/format'
import type { Payment } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface TenantSheetProps {
  row: TenantRow | null
  payments: Payment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PropertyActions
}

/** Tenant profile: exposure, tenancy list and consolidated payment history. */
export function TenantSheet({ row, payments, open, onOpenChange, actions }: TenantSheetProps) {
  const leaseIds = useMemo(() => new Set(row?.leases.map((l) => l.id) ?? []), [row])
  const ledger = useMemo(
    () =>
      payments
        .filter((p) => leaseIds.has(p.leaseId))
        .slice()
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
        .slice(0, 40),
    [payments, leaseIds],
  )

  if (!row) return null

  const { tenant } = row
  const billed = ledger.reduce((s, p) => s + p.amountDue, 0)
  const collected = ledger.reduce((s, p) => s + p.amountPaid, 0)
  const collectionPct = billed > 0 ? (collected / billed) * 100 : 0
  const goodCredit = tenant.creditRating === 'A' || tenant.creditRating === 'B'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl!">
        <SheetHeader className="gap-1.5 border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {row.unitCount} unit aktif
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                goodCredit
                  ? 'border-primary/25 bg-primary/10 text-primary'
                  : 'border-destructive/25 bg-destructive/10 text-destructive',
              )}
            >
              Kredit {tenant.creditRating}
            </Badge>
            <StatusBadge status={row.worstNoticeStage} />
          </div>
          <SheetTitle className="pr-8 text-base leading-snug">{tenant.name}</SheetTitle>
          <SheetDescription>
            {tenant.businessCategory} · Penyewa sejak {tenant.tenantSinceYear}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Sewa bulanan" value={formatMYR(row.monthlyRent)} />
              <Metric label="Nilai tahunan" value={formatMYR(row.annualRent)} />
              <Metric
                label="Tunggakan"
                value={formatMYR(row.arrears)}
                tone={row.arrears > 0 ? 'critical' : 'positive'}
              />
              <Metric label="Keluasan disewa" value={`${formatNumber(row.totalAreaSqft)} sqft`} />
            </div>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-sm font-semibold text-primary"
                >
                  {initials(tenant.name)}
                </span>
                <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                  <p className="text-sm font-medium text-foreground">{tenant.contactPerson}</p>
                  <p className="font-mono">SSM {tenant.ssmNo}</p>
                  <p className="flex items-center gap-1.5">
                    <PhoneIcon className="size-3" aria-hidden="true" />
                    <span className="font-mono">{tenant.phone}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <MailIcon className="size-3" aria-hidden="true" />
                    <span className="truncate">{tenant.email}</span>
                  </p>
                  {row.zones.length > 0 && (
                    <p className="pt-1">Zon: {row.zones.join(', ')}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
                <FileTextIcon className="size-3.5 text-primary" aria-hidden="true" />
                Pajakan ({row.leases.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-card">
                    <TableRow>
                      <TableHead>Kod</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Sewa</TableHead>
                      <TableHead>Tamat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.leases.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.code}</TableCell>
                        <TableCell className="text-xs">
                          <span className="block max-w-40 truncate">{l.propertyName}</span>
                          <span className="text-muted-foreground">{l.unitNo}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatMYR(l.monthlyRent)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(l.endDate)}</TableCell>
                        <TableCell>
                          <StatusBadge status={l.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => actions.openLease(l.id)}
                            aria-label={`Buka pajakan ${l.code}`}
                          >
                            Buka
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <BanknoteIcon className="size-3.5 text-primary" aria-hidden="true" />
                  Sejarah Bayaran
                </h3>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Kutipan {formatPct(collectionPct, 1)}
                </span>
              </div>
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tiada invois direkodkan.</p>
              ) : (
                <div className="max-h-72 overflow-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-24">Tempoh</TableHead>
                        <TableHead className="text-right">Bil</TableHead>
                        <TableHead className="text-right">Dibayar</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.period}</TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatMYR(p.amountDue)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {formatMYR(p.amountPaid)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'critical'
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-semibold tabular-nums',
          tone === 'positive' && 'text-primary',
          tone === 'critical' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  )
}
