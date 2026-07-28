import { useMemo, useState } from 'react'
import { HardHatIcon, TriangleAlertIcon, UserPlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { TONE_DOT_CLASSES, TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { technicianWorkload } from '@/lib/analytics'
import { formatRelative } from '@/lib/format'
import { ZONES } from '@/lib/types'
import type { WorkOrder, Zone } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const ALL = '__all__'
const UNASSIGNED = 'Unassigned'

type SortMode = 'workload' | 'utilisation' | 'overdue' | 'name'

function utilisationTone(value: number): Tone {
  if (value >= 88) return 'critical'
  if (value >= 72) return 'warning'
  return 'positive'
}

export interface TechniciansPanelProps {
  workOrders: WorkOrder[]
  onOpen: (id: string) => void
}

/**
 * Crew workload board. Shows who is carrying the queue, who is breaching, and lets a
 * supervisor push an untriaged job straight onto a technician.
 */
export function TechniciansPanel({ workOrders, onOpen }: TechniciansPanelProps) {
  const technicians = useAppStore((s) => s.technicians)
  const setWorkOrderStatus = useAppStore((s) => s.setWorkOrderStatus)
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder)

  const [zone, setZone] = useState<Zone | typeof ALL>(ALL)
  const [sort, setSort] = useState<SortMode>('workload')

  const now = useMemo(() => new Date(), [])

  const rows = useMemo(() => {
    const all = technicianWorkload(workOrders, technicians, now)
    const scoped = zone === ALL ? all : all.filter((r) => r.technician.zone === zone)
    return scoped.slice().sort((a, b) => {
      switch (sort) {
        case 'utilisation':
          return b.utilisation - a.utilisation
        case 'overdue':
          return b.overdue - a.overdue || b.open - a.open
        case 'name':
          return a.technician.name.localeCompare(b.technician.name)
        case 'workload':
        default:
          return b.open - a.open || b.overdue - a.overdue
      }
    })
  }, [workOrders, technicians, zone, sort, now])

  /** Untriaged jobs a supervisor can hand out right now. */
  const assignable = useMemo(
    () =>
      workOrders
        .filter((w) => w.status === 'Open' || w.assignedTo === UNASSIGNED)
        .filter((w) => w.status !== 'Closed' && w.status !== 'Cancelled')
        .sort((a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime()),
    [workOrders],
  )

  function assign(wo: WorkOrder, technicianName: string, team: string) {
    setWorkOrderStatus(wo.id, 'Assigned')
    updateWorkOrder(wo.id, { assignedTo: technicianName, team })
    toast.success(`${wo.code} assigned to ${technicianName}`, {
      description: `${wo.title} · ${wo.assetCode}`,
      action: { label: 'Open', onClick: () => onOpen(wo.id) },
    })
  }

  const totalOpen = rows.reduce((s, r) => s + r.open, 0)
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{rows.length}</span> technicians carrying{' '}
          <span className="font-medium text-foreground">{totalOpen}</span> open jobs
          {totalOverdue > 0 && (
            <>
              {' · '}
              <span className={cn('font-medium', TONE_TEXT_CLASSES.critical)}>{totalOverdue} breaching SLA</span>
            </>
          )}
          {assignable.length > 0 && ` · ${assignable.length} awaiting triage`}
        </p>

        <Select value={zone} onValueChange={(v) => setZone(v as Zone | typeof ALL)}>
          <SelectTrigger className="w-[210px]" aria-label="Filter technicians by zone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All zones</SelectItem>
            {ZONES.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="w-[180px]" aria-label="Sort technicians">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workload">Sort: open jobs</SelectItem>
            <SelectItem value="utilisation">Sort: utilisation</SelectItem>
            <SelectItem value="overdue">Sort: overdue</SelectItem>
            <SelectItem value="name">Sort: name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HardHatIcon}
          title="No technicians in this zone"
          description="Select another zone to see its crew."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ technician, open, overdue, utilisation, closedThisMonth }) => {
            const tone = utilisationTone(utilisation)
            const zoneJobs = assignable.filter((w) => w.zone === technician.zone)
            const menuJobs = (zoneJobs.length > 0 ? zoneJobs : assignable).slice(0, 8)

            return (
              <article key={technician.id} className="rounded-xl border border-border bg-card p-4">
                <header className="flex items-start gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{technician.avatarInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">{technician.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{technician.team}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{technician.zone}</p>
                  </div>
                  {overdue > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive tabular-nums"
                      title={`${overdue} jobs past SLA`}
                    >
                      <TriangleAlertIcon className="size-2.5" aria-hidden="true" />
                      {overdue}
                    </span>
                  )}
                </header>

                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Open</dt>
                    <dd className="font-mono text-base font-semibold text-foreground tabular-nums">{open}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Overdue</dt>
                    <dd
                      className={cn(
                        'font-mono text-base font-semibold tabular-nums',
                        overdue > 0 ? TONE_TEXT_CLASSES.critical : 'text-foreground',
                      )}
                    >
                      {overdue}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Closed MTD</dt>
                    <dd className="font-mono text-base font-semibold text-foreground tabular-nums">
                      {closedThisMonth}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Utilisation</span>
                    <span className={cn('font-mono text-xs font-semibold tabular-nums', TONE_TEXT_CLASSES[tone])}>
                      {utilisation}%
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={utilisation}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${technician.name} utilisation`}
                  >
                    <div
                      className={cn('h-full rounded-full transition-all', TONE_DOT_CLASSES[tone])}
                      style={{ width: `${Math.min(100, utilisation)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {technician.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-[10px] font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" disabled={menuJobs.length === 0}>
                        <UserPlusIcon aria-hidden="true" />
                        {menuJobs.length === 0 ? 'No jobs awaiting triage' : 'Assign a job'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[320px]">
                      <DropdownMenuLabel>
                        {zoneJobs.length > 0
                          ? `Untriaged in ${technician.zone}`
                          : 'Untriaged across all zones'}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {menuJobs.map((w) => (
                        <DropdownMenuItem
                          key={w.id}
                          className="flex-col items-start gap-0.5"
                          onSelect={() => assign(w, technician.name, technician.team)}
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{w.title}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{w.code}</span>
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {w.priority} · due {formatRelative(w.slaDueAt, now)}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
