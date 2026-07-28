import { useMemo, useState } from 'react'
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckIcon,
  ScaleIcon,
  SearchIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { KpiCard } from '@/components/common/kpi-card'
import { TONE_CLASSES, TONE_TEXT_CLASSES } from '@/components/common/status-badge'
import { SLA_HOURS_BY_PRIORITY, buildChecklist } from '@/components/maintenance/shared'
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
import { daysUntil, formatDate, formatMYR } from '@/lib/format'
import type { MaintenanceSchedule, Priority, WorkOrder } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const ALL = '__all__'

/**
 * KDH planned-maintenance rate card — the standard budget provision per visit,
 * uplifted for statutory work which needs a competent person and a certificate.
 */
const PM_RATE_CARD: Record<MaintenanceSchedule['frequency'], number> = {
  Weekly: 450,
  Monthly: 850,
  Quarterly: 1_800,
  'Half-Yearly': 3_200,
  Annually: 5_600,
}

function estimateFor(schedule: MaintenanceSchedule): number {
  return Math.round(PM_RATE_CARD[schedule.frequency] * (schedule.isStatutory ? 1.4 : 1))
}

export interface PlannedMaintenanceProps {
  onOpen: (id: string) => void
}

interface Group {
  key: string
  label: string
  overdue: boolean
  rows: MaintenanceSchedule[]
}

/**
 * The forward maintenance plan, grouped into an upcoming calendar. Statutory
 * obligations are flagged because those are the ones with a regulator attached,
 * and any line can be turned into a live work order in one click.
 */
export function PlannedMaintenance({ onOpen }: PlannedMaintenanceProps) {
  const schedules = useAppStore((s) => s.schedules)
  const workOrders = useAppStore((s) => s.workOrders)
  const assets = useAppStore((s) => s.assets)
  const technicians = useAppStore((s) => s.technicians)
  const vendors = useAppStore((s) => s.vendors)
  const addWorkOrder = useAppStore((s) => s.addWorkOrder)

  const [query, setQuery] = useState('')
  const [team, setTeam] = useState<string>(ALL)
  const [scope, setScope] = useState<'all' | 'statutory' | 'overdue'>('all')

  const now = useMemo(() => new Date(), [])

  /**
   * A schedule counts as "raised" when an open work order already carries its task
   * name against the same asset — so the state survives a page reload.
   */
  const raisedTasks = useMemo(() => {
    const set = new Set<string>()
    for (const w of workOrders) {
      if (w.status === 'Closed' || w.status === 'Cancelled') continue
      set.add(`${w.assetId}::${w.title}`)
    }
    return set
  }, [workOrders])

  const teams = useMemo(
    () => [...new Set(schedules.map((s) => s.assignedTeam))].sort((a, b) => a.localeCompare(b)),
    [schedules],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schedules
      .filter((s) => {
        if (team !== ALL && s.assignedTeam !== team) return false
        if (scope === 'statutory' && !s.isStatutory) return false
        if (scope === 'overdue' && daysUntil(s.nextDue, now) >= 0) return false
        if (!q) return true
        return s.task.toLowerCase().includes(q) || s.assetName.toLowerCase().includes(q)
      })
      .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
  }, [schedules, query, team, scope, now])

  const groups = useMemo<Group[]>(() => {
    const overdue: MaintenanceSchedule[] = []
    const byMonth = new Map<string, MaintenanceSchedule[]>()

    for (const s of filtered) {
      if (daysUntil(s.nextDue, now) < 0) {
        overdue.push(s)
        continue
      }
      const key = s.nextDue.slice(0, 7)
      const list = byMonth.get(key) ?? []
      list.push(s)
      byMonth.set(key, list)
    }

    const monthGroups: Group[] = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => ({
        key,
        label: new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric' }).format(
          new Date(`${key}-01T00:00:00`),
        ),
        overdue: false,
        rows,
      }))

    return overdue.length > 0
      ? [{ key: 'overdue', label: 'Overdue', overdue: true, rows: overdue }, ...monthGroups]
      : monthGroups
  }, [filtered, now])

  /* ---------------- Summary ---------------- */

  const stats = useMemo(() => {
    const overdue = schedules.filter((s) => daysUntil(s.nextDue, now) < 0)
    const next30 = schedules.filter((s) => {
      const d = daysUntil(s.nextDue, now)
      return d >= 0 && d <= 30
    })
    const statutory = schedules.filter((s) => s.isStatutory)
    const statutoryOverdue = statutory.filter((s) => daysUntil(s.nextDue, now) < 0)
    return {
      total: schedules.length,
      overdue: overdue.length,
      next30: next30.length,
      next30Value: next30.reduce((sum, s) => sum + estimateFor(s), 0),
      statutory: statutory.length,
      statutoryOverdue: statutoryOverdue.length,
    }
  }, [schedules, now])

  /* ---------------- Generate ---------------- */

  function generate(schedule: MaintenanceSchedule) {
    const asset = assets.find((a) => a.id === schedule.assetId)
    if (!asset) {
      toast.error('That asset is no longer in the register.')
      return
    }

    const priority: Priority = schedule.isStatutory ? 'P2 - High' : 'P3 - Medium'

    /* Prefer an in-house technician on that team; otherwise the panel contractor. */
    const teamTechs = technicians
      .filter((t) => t.team === schedule.assignedTeam)
      .sort((a, b) => a.openJobs - b.openJobs)
    const vendor = vendors.find((v) => v.name === schedule.assignedTeam)

    let created: WorkOrder
    if (teamTechs.length > 0) {
      created = addWorkOrder({
        assetId: schedule.assetId,
        title: schedule.task,
        description: `${schedule.frequency} planned maintenance — ${schedule.task} di ${asset.name} (${asset.code}), ${asset.location.town}. Kerja terakhir ${formatDate(schedule.lastDone)}, jadual berikutnya ${formatDate(schedule.nextDue)}.${schedule.isStatutory ? ' Tugasan berkanun — sijil pematuhan diperlukan.' : ''}`,
        type: schedule.isStatutory ? 'Statutory Compliance' : 'Preventive',
        priority,
        status: 'Assigned',
        source: 'Scheduled PM',
        assignedTo: teamTechs[0].name,
        team: schedule.assignedTeam,
        slaHours: SLA_HOURS_BY_PRIORITY[priority],
        estimatedCost: estimateFor(schedule),
        checklist: buildChecklist(schedule.isStatutory ? 'Statutory Compliance' : 'Preventive', schedule.id),
      })
    } else {
      created = addWorkOrder({
        assetId: schedule.assetId,
        title: schedule.task,
        description: `${schedule.frequency} planned maintenance — ${schedule.task} di ${asset.name} (${asset.code}), ${asset.location.town}. Dilaksanakan oleh kontraktor panel ${schedule.assignedTeam}.${schedule.isStatutory ? ' Tugasan berkanun — sijil pematuhan diperlukan.' : ''}`,
        type: schedule.isStatutory ? 'Statutory Compliance' : 'Preventive',
        priority,
        status: 'Assigned',
        source: 'Scheduled PM',
        assignedTo: schedule.assignedTeam,
        team: 'Panel Contractor',
        vendorId: vendor?.id,
        slaHours: SLA_HOURS_BY_PRIORITY[priority],
        estimatedCost: estimateFor(schedule),
        checklist: buildChecklist(schedule.isStatutory ? 'Statutory Compliance' : 'Preventive', schedule.id),
      })
    }

    toast.success(`Work order ${created.code} generated`, {
      description: `${schedule.task} · ${asset.code}`,
      action: { label: 'Open', onClick: () => onOpen(created.id) },
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Scheduled tasks"
          value={String(stats.total)}
          sublabel="Recurring obligations on the plan"
          icon={CalendarDaysIcon}
        />
        <KpiCard
          label="Overdue"
          value={String(stats.overdue)}
          sublabel={`${stats.statutoryOverdue} of them statutory`}
          icon={TriangleAlertIcon}
          intent={stats.overdue > 0 ? 'critical' : 'positive'}
        />
        <KpiCard
          label="Due next 30 days"
          value={String(stats.next30)}
          sublabel={`${formatMYR(stats.next30Value)} budget provision`}
          icon={CalendarClockIcon}
          intent="warning"
        />
        <KpiCard
          label="Statutory items"
          value={String(stats.statutory)}
          sublabel="Regulator-mandated inspections"
          icon={ScaleIcon}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search task or asset…"
            aria-label="Search the maintenance plan"
            className="pl-8"
          />
        </div>

        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-[230px]" aria-label="Filter by responsible team">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams &amp; contractors</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <SelectTrigger className="w-[180px]" aria-label="Filter the plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entire plan</SelectItem>
            <SelectItem value="statutory">Statutory only</SelectItem>
            <SelectItem value="overdue">Overdue only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="Nothing scheduled in this view"
          description="Adjust the team or scope filter to see the rest of the maintenance plan."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const statutoryCount = group.rows.filter((r) => r.isStatutory).length
            const provision = group.rows.reduce((s, r) => s + estimateFor(r), 0)
            return (
              <section
                key={group.key}
                className={cn(
                  'overflow-hidden rounded-xl border bg-card',
                  group.overdue ? 'border-destructive/30' : 'border-border',
                )}
              >
                <header
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2.5',
                    group.overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {group.overdue ? (
                      <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
                    ) : (
                      <CalendarDaysIcon className="size-4 text-primary" aria-hidden="true" />
                    )}
                    <h3
                      className={cn(
                        'text-sm font-semibold',
                        group.overdue ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {group.label}
                    </h3>
                    <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {group.rows.length}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {statutoryCount} statutory · {formatMYR(provision)} provision
                  </p>
                </header>

                <ul className="divide-y divide-border">
                  {group.rows.map((s) => {
                    const days = daysUntil(s.nextDue, now)
                    const already = raisedTasks.has(`${s.assetId}::${s.task}`)
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-accent/30"
                      >
                        {/* Date column */}
                        <div className="w-[74px] shrink-0 text-center">
                          <p
                            className={cn(
                              'font-mono text-sm font-semibold tabular-nums',
                              days < 0 ? TONE_TEXT_CLASSES.critical : 'text-foreground',
                            )}
                          >
                            {new Intl.DateTimeFormat('en-MY', { day: '2-digit' }).format(
                              new Date(`${s.nextDue}T00:00:00`),
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground uppercase">
                            {new Intl.DateTimeFormat('en-MY', { month: 'short' }).format(
                              new Date(`${s.nextDue}T00:00:00`),
                            )}
                          </p>
                        </div>

                        {/* Task */}
                        <div className="min-w-[240px] flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{s.task}</p>
                            {s.isStatutory && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                                  TONE_CLASSES.warning,
                                )}
                              >
                                <ScaleIcon className="size-2.5" aria-hidden="true" />
                                Statutory
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.assetName}</p>
                        </div>

                        {/* Meta */}
                        <div className="flex w-[150px] shrink-0 flex-col">
                          <Badge variant="outline" className="w-fit text-[10px]">
                            {s.frequency}
                          </Badge>
                          <span className="mt-1 truncate text-[11px] text-muted-foreground">{s.assignedTeam}</span>
                        </div>

                        <div className="w-[132px] shrink-0">
                          <p
                            className={cn(
                              'text-xs font-medium',
                              days < 0 ? TONE_TEXT_CLASSES.critical : 'text-foreground',
                            )}
                          >
                            {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `In ${days} days`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Last: {formatDate(s.lastDone)}</p>
                        </div>

                        <div className="w-[92px] shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {formatMYR(estimateFor(s))}
                        </div>

                        <div className="shrink-0">
                          {already ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
                              Work order raised
                            </span>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => generate(s)}>
                              <WrenchIcon aria-hidden="true" />
                              Generate Work Order
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
