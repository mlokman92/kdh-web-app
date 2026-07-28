import { useMemo, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRightIcon,
  BanknoteIcon,
  BellRingIcon,
  BuildingIcon,
  GavelIcon,
  MailIcon,
  PhoneIcon,
  RefreshCwIcon,
} from 'lucide-react'

import { StatusBadge, TONE_DOT_CLASSES } from '@/components/common/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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
import { paymentsForLease } from '@/components/property/helpers'
import type { PropertyActions } from '@/components/property/scope'
import {
  daysUntil,
  formatArea,
  formatDate,
  formatMYR,
  formatNumber,
  formatPct,
  initials,
} from '@/lib/format'
import type { Lease, Payment, PropertyUnit, Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface LeaseSheetProps {
  lease: Lease | null
  unit?: PropertyUnit
  tenant?: Tenant
  payments: Payment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PropertyActions
}

const AGEING_LABELS: { key: 'current' | 'd30' | 'd60' | 'd90' | 'd90plus'; label: string }[] = [
  { key: 'current', label: 'Semasa' },
  { key: 'd30', label: '1–30 hari' },
  { key: 'd60', label: '31–60 hari' },
  { key: 'd90', label: '61–90 hari' },
  { key: 'd90plus', label: '90+ hari' },
]

/** Full commercial record for one tenancy, with the actions a leasing manager needs. */
export function LeaseSheet({
  lease,
  unit,
  tenant,
  payments,
  open,
  onOpenChange,
  actions,
}: LeaseSheetProps) {
  const ledger = useMemo(
    () => (lease ? paymentsForLease(payments, lease.id) : []),
    [payments, lease],
  )

  if (!lease) return null

  const days = daysUntil(lease.endDate)
  const marketRent = unit ? unit.lettableAreaSqft * unit.marketRatePsf : lease.monthlyRent
  const gap = marketRent - lease.monthlyRent
  const billed = ledger.reduce((s, p) => s + p.amountDue, 0)
  const collected = ledger.reduce((s, p) => s + p.amountPaid, 0)
  const collectionPct = billed > 0 ? (collected / billed) * 100 : 0
  const maxBucket = Math.max(
    1,
    ...AGEING_LABELS.map(({ key }) => lease.ageing[key]),
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl!">
        <SheetHeader className="gap-1.5 border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {lease.code}
            </Badge>
            <StatusBadge status={lease.status} />
            {lease.isUserAdded && (
              <Badge variant="secondary" className="text-xs">
                Baharu
              </Badge>
            )}
          </div>
          <SheetTitle className="pr-8 text-base leading-snug">{lease.tenantName}</SheetTitle>
          <SheetDescription>
            {lease.propertyName} · Unit {lease.unitNo} · {lease.zone}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-5">
            {/* --- headline figures --- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Sewa bulanan" value={formatMYR(lease.monthlyRent)} />
              <Metric label="Kadar" value={`${formatMYR(lease.ratePsf, true)} psf`} />
              <Metric
                label="Tunggakan"
                value={formatMYR(lease.outstandingAmount)}
                tone={lease.outstandingAmount > 0 ? 'critical' : 'positive'}
              />
              <Metric
                label="Tamat"
                value={Number.isFinite(days) ? `${formatNumber(days)} hari` : '—'}
                tone={days <= 90 ? 'warning' : 'default'}
              />
            </div>

            {/* --- commercial terms --- */}
            <Block title="Terma Komersial" icon={BuildingIcon}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <Field label="Tempoh kontrak" value={`${lease.tenureMonths} bulan`} />
                <Field label="Mula → Tamat" value={`${formatDate(lease.startDate)} → ${formatDate(lease.endDate)}`} />
                <Field label="Sewa bulanan" value={formatMYR(lease.monthlyRent)} mono />
                <Field label="Caj perkhidmatan" value={formatMYR(lease.serviceCharge)} mono />
                <Field label="Deposit dipegang" value={formatMYR(lease.deposit)} mono />
                <Field
                  label="Nilai kontrak"
                  value={formatMYR(lease.monthlyRent * lease.tenureMonths)}
                  mono
                />
                <Field label="Eskalasi tahunan" value={formatPct(lease.escalationPct, 1)} mono />
                <Field label="Opsyen pembaharuan" value={lease.hasRenewalOption ? 'Ada' : 'Tiada'} />
                <Field
                  label="Keluasan boleh sewa"
                  value={unit ? formatArea(unit.lettableAreaSqft) : '—'}
                  mono
                />
                <Field label="Jenis unit" value={unit?.type ?? '—'} />
                <Field label="Kadar pasaran" value={unit ? `${formatMYR(unit.marketRatePsf, true)} psf` : '—'} mono />
                <Field
                  label="Jurang kepada pasaran"
                  value={`${gap >= 0 ? '+' : ''}${formatMYR(gap)}/bln`}
                  mono
                  tone={gap > 0 ? 'warning' : 'positive'}
                />
              </dl>
            </Block>

            {/* --- tenant --- */}
            <Block title="Penyewa" icon={BuildingIcon}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-sm font-semibold text-primary"
                >
                  {initials(lease.tenantName)}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => actions.openTenant(lease.tenantId)}
                    className="group flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
                  >
                    <span className="truncate">{lease.tenantName}</span>
                    <ArrowUpRightIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  </button>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {lease.businessType}
                    {tenant ? ` · Penyewa sejak ${tenant.tenantSinceYear}` : ''}
                  </p>
                  {tenant && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p className="font-mono">SSM {tenant.ssmNo}</p>
                      <p className="flex items-center gap-1.5">
                        <PhoneIcon className="size-3" aria-hidden="true" />
                        <span className="font-mono">{tenant.phone}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <MailIcon className="size-3" aria-hidden="true" />
                        <span className="truncate">{tenant.email}</span>
                      </p>
                    </div>
                  )}
                </div>
                {tenant && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Rating kredit</p>
                    <p
                      className={cn(
                        'mt-0.5 text-lg font-semibold',
                        tenant.creditRating === 'A' || tenant.creditRating === 'B'
                          ? 'text-primary'
                          : 'text-destructive',
                      )}
                    >
                      {tenant.creditRating}
                    </p>
                  </div>
                )}
              </div>
            </Block>

            {/* --- arrears ageing --- */}
            <Block title="Penuaan Tunggakan" icon={GavelIcon}>
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">
                  Baki: <span className="font-medium text-foreground tabular-nums">{formatMYR(lease.outstandingAmount)}</span>
                </span>
                <span className="text-muted-foreground">
                  Lewat: <span className="font-medium text-foreground tabular-nums">{formatNumber(lease.daysOverdue)} hari</span>
                </span>
                <span className="text-muted-foreground">
                  Bayaran akhir:{' '}
                  <span className="font-medium text-foreground">{formatDate(lease.lastPaymentDate)}</span>
                </span>
                <StatusBadge status={lease.noticeStage} />
              </div>
              <div className="space-y-1.5">
                {AGEING_LABELS.map(({ key, label }) => {
                  const value = lease.ageing[key]
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            key === 'current'
                              ? TONE_DOT_CLASSES.info
                              : key === 'd30' || key === 'd60'
                                ? TONE_DOT_CLASSES.warning
                                : TONE_DOT_CLASSES.critical,
                          )}
                          style={{ width: `${Math.max(value > 0 ? 3 : 0, (value / maxBucket) * 100)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">
                        {formatMYR(value)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Block>

            {/* --- payment ledger --- */}
            <Block
              title="Sejarah Bayaran"
              icon={BanknoteIcon}
              meta={`${ledger.length} invois · kutipan ${formatPct(collectionPct, 1)}`}
            >
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tiada invois direkodkan bagi pajakan ini lagi.
                </p>
              ) : (
                <div className="max-h-72 overflow-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-24">Tempoh</TableHead>
                        <TableHead className="text-right">Bil</TableHead>
                        <TableHead className="text-right">Dibayar</TableHead>
                        <TableHead>Tarikh bayar</TableHead>
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
                          <TableCell className="text-xs text-muted-foreground">
                            {p.paidDate ? formatDate(p.paidDate) : '—'}
                            {p.method ? ` · ${p.method}` : ''}
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
            </Block>
          </div>
        </ScrollArea>

        <Separator />
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <Button size="sm" onClick={() => actions.openRecordPayment(lease.id)}>
            <BanknoteIcon aria-hidden="true" />
            Rekod bayaran
          </Button>
          <Button size="sm" variant="outline" onClick={() => actions.sendReminder(lease.id)}>
            <BellRingIcon aria-hidden="true" />
            Hantar peringatan
          </Button>
          <Button size="sm" variant="destructive" onClick={() => actions.escalateNotice(lease.id)}>
            <GavelIcon aria-hidden="true" />
            Naik taraf notis
          </Button>
          <Button size="sm" variant="secondary" onClick={() => actions.renewLease(lease.id)}>
            <RefreshCwIcon aria-hidden="true" />
            Baharui
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'warning' | 'critical'
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-semibold tabular-nums',
          tone === 'positive' && 'text-primary',
          tone === 'critical' && 'text-destructive',
          tone === 'warning' && 'text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Block({
  title,
  icon: Icon,
  meta,
  children,
}: {
  title: string
  icon: LucideIcon
  meta?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon className="size-3.5 text-primary" aria-hidden="true" />
          {title}
        </h3>
        {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  mono,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: 'positive' | 'warning'
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-sm font-medium',
          mono && 'font-mono tabular-nums',
          tone === 'positive' && 'text-primary',
          tone === 'warning' && 'text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
