import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BanknoteIcon,
  BuildingIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  HistoryIcon,
  ListChecksIcon,
  MapPinIcon,
  PackageIcon,
  StarIcon,
  TimerIcon,
  TruckIcon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  StatusBadge,
  TONE_CLASSES,
  TONE_DOT_CLASSES,
  TONE_TEXT_CLASSES,
} from '@/components/common/status-badge'
import {
  SOURCE_ICON,
  TYPE_ICON,
  checklistProgress,
  formatDurationLong,
  partsTotal,
  nextActions,
  slaClock,
  useTicker,
} from '@/components/maintenance/shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { formatDateTime, formatMYR, formatRelative, initials } from '@/lib/format'
import type { WorkOrder, WorkOrderStatus } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const NO_VENDOR = '__none__'

export interface WorkOrderSheetProps {
  workOrderId: string | null
  onOpenChange: (open: boolean) => void
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Block({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" />
          {title}
        </h3>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm font-medium text-foreground', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

/**
 * Full work order record: a live SLA clock, the asset it sits on, who owns it, the
 * job steps, the parts and money, and the complete audit timeline. Every control
 * writes back to the store.
 */
export function WorkOrderSheet({ workOrderId, onOpenChange }: WorkOrderSheetProps) {
  const live = useAppStore((s) => s.workOrders.find((w) => w.id === workOrderId))
  const [cached, setCached] = useState<WorkOrder | undefined>(undefined)

  /* Hold the last record through the close animation so the panel never flashes
     empty on its way out. */
  useEffect(() => {
    if (live) setCached(live)
  }, [live])

  const record = live ?? cached

  return (
    <Sheet open={Boolean(live)} onOpenChange={onOpenChange}>
      {/* The width classes mirror the base component's own variant chain so
          tailwind-merge replaces them outright rather than losing on specificity. */}
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
      >
        {record ? <WorkOrderDetail wo={record} active={Boolean(live)} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function WorkOrderDetail({ wo, active }: { wo: WorkOrder; active: boolean }) {
  const assets = useAppStore((s) => s.assets)
  const technicians = useAppStore((s) => s.technicians)
  const vendors = useAppStore((s) => s.vendors)
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder)
  const setWorkOrderStatus = useAppStore((s) => s.setWorkOrderStatus)

  /* One tick a second — only while a record is actually on screen. */
  const now = useTicker(1000, active)

  const [costDraft, setCostDraft] = useState(wo.actualCost !== undefined ? String(wo.actualCost) : '')

  useEffect(() => {
    setCostDraft(wo.actualCost !== undefined ? String(wo.actualCost) : '')
  }, [wo.id, wo.actualCost])

  const asset = useMemo(() => assets.find((a) => a.id === wo.assetId), [assets, wo.assetId])
  const vendor = useMemo(() => vendors.find((v) => v.id === wo.vendorId), [vendors, wo.vendorId])

  const clock = useMemo(() => slaClock(wo, now), [wo, now])
  const progress = checklistProgress(wo)

  const timeline = useMemo(
    () => wo.history.slice().sort((a, b) => a.at.localeCompare(b.at)),
    [wo.history],
  )

  const TypeIcon = TYPE_ICON[wo.type]
  const SourceIcon = SOURCE_ICON[wo.source]
  const actions = nextActions(wo.status)
  const parts = partsTotal(wo)
  const costBasis = wo.actualCost ?? wo.estimatedCost
  const variance = wo.actualCost === undefined ? 0 : wo.actualCost - wo.estimatedCost

  function changeStatus(status: WorkOrderStatus) {
    setWorkOrderStatus(wo.id, status)
    toast.success(`${wo.code} → ${status}`, {
      description: `${wo.title} · ${wo.assetCode}`,
    })
  }

  function reassign(name: string) {
    const tech = technicians.find((t) => t.name === name)
    if (!tech) return
    if (wo.status === 'Open') setWorkOrderStatus(wo.id, 'Assigned')
    updateWorkOrder(wo.id, { assignedTo: tech.name, team: tech.team })
    toast.success(`${wo.code} reassigned`, { description: `${tech.name} · ${tech.team} · ${tech.zone}` })
  }

  function changeVendor(id: string) {
    const next = id === NO_VENDOR ? undefined : id
    updateWorkOrder(wo.id, { vendorId: next })
    const picked = vendors.find((v) => v.id === next)
    toast.success(`${wo.code} contractor updated`, {
      description: picked ? `${picked.name} · ${picked.specialisation}` : 'Handled in-house by the zone team.',
    })
  }

  function toggleChecklist(itemId: string) {
    updateWorkOrder(wo.id, {
      checklist: wo.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
    })
  }

  function commitCost() {
    const raw = costDraft.trim()
    if (raw === '') {
      if (wo.actualCost !== undefined) updateWorkOrder(wo.id, { actualCost: undefined })
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      setCostDraft(wo.actualCost !== undefined ? String(wo.actualCost) : '')
      toast.error('Enter a valid amount in Ringgit.')
      return
    }
    if (n === wo.actualCost) return
    updateWorkOrder(wo.id, { actualCost: n })
    toast.success(`Actual cost recorded for ${wo.code}`, { description: formatMYR(n) })
  }

  return (
    <>
        {/* ---------------- Header ---------------- */}
        <SheetHeader className="gap-2 border-b border-border px-4 py-4 pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium text-muted-foreground">{wo.code}</span>
            <StatusBadge status={wo.status} />
            <StatusBadge status={wo.priority} />
            <Badge variant="outline" className="gap-1.5">
              <TypeIcon className="size-3" aria-hidden="true" />
              {wo.type}
            </Badge>
            <Badge variant="ghost" className="gap-1.5 text-muted-foreground">
              <SourceIcon className="size-3" aria-hidden="true" />
              {wo.source}
            </Badge>
            {wo.isUserAdded && <Badge variant="secondary">New this session</Badge>}
          </div>
          <SheetTitle className="text-base leading-snug">{wo.title}</SheetTitle>
          <SheetDescription className="line-clamp-2">{wo.description}</SheetDescription>
        </SheetHeader>

        {/* ---------------- Body ---------------- */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* SLA */}
          <section
            className={cn(
              'rounded-xl border p-4',
              clock.breached ? TONE_CLASSES.critical : clock.status === 'At Risk' ? TONE_CLASSES.warning : TONE_CLASSES.positive,
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <TimerIcon className="size-3.5" aria-hidden="true" />
                  Service level agreement
                </p>
                <p className="mt-1.5 font-mono text-2xl leading-none font-semibold tabular-nums">
                  {formatDurationLong(clock.remainingMs)}
                </p>
                <p className="mt-1.5 text-xs opacity-90">
                  {clock.settled
                    ? clock.headline
                    : clock.breached
                      ? `Past due — target was ${formatDateTime(wo.slaDueAt)}`
                      : `Remaining against a ${wo.slaHours}-hour target`}
                </p>
              </div>
              <StatusBadge status={clock.status} className="shrink-0 bg-card/60" />
            </div>

            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card/60"
              role="progressbar"
              aria-valuenow={Math.round(clock.elapsedPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="SLA window consumed"
            >
              <div
                className={cn('h-full rounded-full transition-all', TONE_DOT_CLASSES[clock.tone])}
                style={{ width: `${clock.elapsedPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] opacity-80">
              {Math.round(clock.rawPct)}% of the SLA window consumed
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-current/15 pt-3 sm:grid-cols-4">
              <Field label="Raised" value={formatDateTime(wo.raisedAt)} />
              <Field label="SLA due" value={formatDateTime(wo.slaDueAt)} />
              <Field label="First response" value={wo.respondedAt ? formatDateTime(wo.respondedAt) : 'Not yet'} />
              <Field label="Completed" value={wo.completedAt ? formatDateTime(wo.completedAt) : 'Open'} />
            </dl>
          </section>

          {/* Asset context */}
          <Block
            title="Asset context"
            icon={BuildingIcon}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/registry?asset=${wo.assetId}`}>
                  <ExternalLinkIcon aria-hidden="true" />
                  Registry
                </Link>
              </Button>
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{wo.assetName}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-mono">{wo.assetCode}</span>
                  {asset && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{asset.category}</span>
                    </>
                  )}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {asset ? `${asset.location.address}, ${asset.location.town}` : wo.zone}
                  </span>
                </p>
              </div>
              {asset && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <StatusBadge status={asset.status} />
                  <StatusBadge status={asset.condition} />
                  <StatusBadge status={asset.criticality} />
                </div>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3 sm:grid-cols-4">
              <Field label="Zone" value={wo.zone} />
              <Field label="Custodian" value={asset?.custodianName ?? '—'} />
              <Field label="Raised by" value={wo.raisedBy} />
              <Field label="Downtime" value={`${wo.downtimeHours} h`} />
            </dl>
          </Block>

          {/* Assignment */}
          <Block title="Assignment" icon={UsersIcon}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{initials(wo.assignedTo)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{wo.assignedTo}</p>
                <p className="truncate text-xs text-muted-foreground">{wo.team}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="wo-reassign" className="text-xs text-muted-foreground">
                  Reassign technician
                </Label>
                <Select value={technicians.some((t) => t.name === wo.assignedTo) ? wo.assignedTo : ''} onValueChange={reassign}>
                  <SelectTrigger id="wo-reassign" className="w-full">
                    <SelectValue placeholder="Select a technician…" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians
                      .slice()
                      .sort(
                        (a, b) => Number(b.zone === wo.zone) - Number(a.zone === wo.zone) || a.openJobs - b.openJobs,
                      )
                      .map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name} · {t.openJobs} open
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="wo-vendor" className="text-xs text-muted-foreground">
                  Panel contractor
                </Label>
                <Select value={wo.vendorId ?? NO_VENDOR} onValueChange={changeVendor}>
                  <SelectTrigger id="wo-vendor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VENDOR}>In-house — no contractor</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} · {v.rating.toFixed(1)}★
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {vendor && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <TruckIcon className="size-3.5" aria-hidden="true" />
                  {vendor.specialisation}
                </span>
                <span className="flex items-center gap-1.5">
                  <StarIcon className={cn('size-3.5', TONE_TEXT_CLASSES.warning)} aria-hidden="true" />
                  {vendor.rating.toFixed(1)} rating
                </span>
                <span>{vendor.slaCompliance}% SLA compliance</span>
                <span className="font-mono">{vendor.phone}</span>
              </div>
            )}
          </Block>

          {/* Checklist */}
          <Block
            title="Job checklist"
            icon={ListChecksIcon}
            action={
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {progress.done}/{progress.total} · {progress.pct}%
              </span>
            }
          >
            {progress.total === 0 ? (
              <p className="text-sm text-muted-foreground">No checklist steps were issued with this job.</p>
            ) : (
              <>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {wo.checklist.map((item) => (
                    <li key={item.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40">
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={() => toggleChecklist(item.id)}
                          className="mt-0.5"
                        />
                        <span
                          className={cn(
                            'text-sm',
                            item.done ? 'text-muted-foreground line-through' : 'text-foreground',
                          )}
                        >
                          {item.label}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Block>

          {/* Parts & cost */}
          <Block title="Parts & cost" icon={PackageIcon}>
            {wo.parts.length > 0 ? (
              <div className="-mx-4 mb-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wo.parts.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{p.qty}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMYR(p.unitCost, true)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMYR(p.qty * p.unitCost, true)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={3} className="font-medium">
                        Parts subtotal
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {formatMYR(parts, true)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No parts have been booked to this job.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Estimated cost</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
                  {formatMYR(wo.estimatedCost)}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="wo-actual" className="text-xs text-muted-foreground">
                  Actual cost (RM)
                </Label>
                <Input
                  id="wo-actual"
                  inputMode="decimal"
                  value={costDraft}
                  onChange={(e) => setCostDraft(e.target.value)}
                  onBlur={commitCost}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  placeholder="Not yet recorded"
                  className="h-8 font-mono"
                />
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Variance to estimate</p>
                <p
                  className={cn(
                    'mt-0.5 font-mono text-sm font-semibold tabular-nums',
                    wo.actualCost === undefined
                      ? 'text-muted-foreground'
                      : variance > 0
                        ? TONE_TEXT_CLASSES.critical
                        : TONE_TEXT_CLASSES.positive,
                  )}
                >
                  {wo.actualCost === undefined
                    ? '—'
                    : `${variance > 0 ? '+' : ''}${formatMYR(variance)}`}
                </p>
                {wo.actualCost !== undefined && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Booked {formatMYR(costBasis)} against this ticket
                  </p>
                )}
              </div>
            </div>
          </Block>

          {/* Diagnosis */}
          <Block title="Diagnosis" icon={CircleAlertIcon}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Root cause" value={wo.rootCause ?? 'Not yet determined'} />
              <Field label="Failure code" value={wo.failureCode ?? '—'} mono />
            </dl>
          </Block>

          {/* History */}
          <Block
            title="History"
            icon={HistoryIcon}
            action={<span className="text-xs text-muted-foreground">{timeline.length} events</span>}
          >
            <ol className="relative space-y-4 pl-1">
              {timeline.map((ev, i) => {
                const last = i === timeline.length - 1
                return (
                  <li key={`${ev.at}-${i}`} className="relative flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-card',
                          last ? TONE_DOT_CLASSES.positive : 'bg-border',
                        )}
                      />
                      {!last && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium text-foreground">{ev.action}</p>
                        <p className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(ev.at)}>
                          {formatRelative(ev.at, new Date(now))}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ev.actor}</p>
                      {ev.note && <p className="mt-1 text-xs text-foreground/80">{ev.note}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Block>
        </div>

        {/* ---------------- Footer actions ---------------- */}
        <SheetFooter className="mt-0 flex-row flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <BanknoteIcon className="size-3.5" aria-hidden="true" />
            {formatMYR(costBasis)} booked
          </span>
          <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
          {actions.map((a) => (
            <Button
              key={a.status + a.label}
              variant={a.variant}
              size="sm"
              onClick={() => changeStatus(a.status)}
            >
              {a.label}
            </Button>
          ))}
        </SheetFooter>
    </>
  )
}
