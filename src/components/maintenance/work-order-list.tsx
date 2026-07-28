import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, DownloadIcon, ListIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge, TONE_CLASSES, TONE_DOT_CLASSES } from '@/components/common/status-badge'
import { SOURCE_ICON, TYPE_ICON, slaClock, useTicker } from '@/components/maintenance/shared'
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
import { downloadCsv, formatDateTime, formatMYR, formatRelative } from '@/lib/format'
import { PRIORITIES, SLA_STATUSES, WO_SOURCES, WO_STATUSES, WO_TYPES, ZONES } from '@/lib/types'
import type {
  Priority,
  SlaStatus,
  WorkOrder,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
  Zone,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const ALL = '__all__'

type SortKey = 'code' | 'title' | 'priority' | 'status' | 'slaDueAt' | 'raisedAt' | 'assignedTo' | 'cost'
type SortDir = 'asc' | 'desc'

const PRIORITY_RANK = new Map<Priority, number>(PRIORITIES.map((p, i) => [p, i]))
const STATUS_RANK = new Map<WorkOrderStatus, number>(WO_STATUSES.map((s, i) => [s, i]))

export interface WorkOrderListProps {
  workOrders: WorkOrder[]
  onOpen: (id: string) => void
  /** Seeded from a notification deep-link, e.g. /maintenance?sla=Breached. */
  initialSlaFilter?: SlaStatus
}

function SortButton({
  label,
  column,
  sortKey,
  dir,
  onSort,
  align = 'left',
}: {
  label: string
  column: SortKey
  sortKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === column
  const Icon = !active ? ChevronsUpDownIcon : dir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        active && 'text-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {label}
      <Icon className={cn('size-3', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
    </button>
  )
}

/**
 * The full work order register — every filter a facilities manager asks for, plus a
 * one-click CSV extract for the monthly management pack.
 */
export function WorkOrderList({ workOrders, onOpen, initialSlaFilter }: WorkOrderListProps) {
  const now = useTicker(30_000)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<WorkOrderStatus | typeof ALL>(ALL)
  const [priority, setPriority] = useState<Priority | typeof ALL>(ALL)
  const [type, setType] = useState<WorkOrderType | typeof ALL>(ALL)
  const [zone, setZone] = useState<Zone | typeof ALL>(ALL)
  const [sla, setSla] = useState<SlaStatus | typeof ALL>(initialSlaFilter ?? ALL)
  const [assignee, setAssignee] = useState<string>(ALL)
  const [source, setSource] = useState<WorkOrderSource | typeof ALL>(ALL)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('raisedAt')
  const [dir, setDir] = useState<SortDir>('desc')

  const assignees = useMemo(
    () => [...new Set(workOrders.map((w) => w.assignedTo))].sort((a, b) => a.localeCompare(b)),
    [workOrders],
  )

  const activeFilters =
    Number(Boolean(query)) +
    Number(status !== ALL) +
    Number(priority !== ALL) +
    Number(type !== ALL) +
    Number(zone !== ALL) +
    Number(sla !== ALL) +
    Number(assignee !== ALL) +
    Number(source !== ALL) +
    Number(overdueOnly)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = workOrders.filter((w) => {
      if (status !== ALL && w.status !== status) return false
      if (priority !== ALL && w.priority !== priority) return false
      if (type !== ALL && w.type !== type) return false
      if (zone !== ALL && w.zone !== zone) return false
      if (sla !== ALL && w.slaStatus !== sla) return false
      if (assignee !== ALL && w.assignedTo !== assignee) return false
      if (source !== ALL && w.source !== source) return false
      if (overdueOnly && !(w.slaStatus === 'Breached' && w.status !== 'Closed' && w.status !== 'Cancelled'))
        return false
      if (!q) return true
      return (
        w.code.toLowerCase().includes(q) ||
        w.title.toLowerCase().includes(q) ||
        w.assetName.toLowerCase().includes(q) ||
        w.assetCode.toLowerCase().includes(q) ||
        w.assignedTo.toLowerCase().includes(q) ||
        w.team.toLowerCase().includes(q)
      )
    })

    const factor = dir === 'asc' ? 1 : -1
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case 'code':
          return factor * a.code.localeCompare(b.code)
        case 'title':
          return factor * a.title.localeCompare(b.title)
        case 'priority':
          return factor * ((PRIORITY_RANK.get(a.priority) ?? 9) - (PRIORITY_RANK.get(b.priority) ?? 9))
        case 'status':
          return factor * ((STATUS_RANK.get(a.status) ?? 9) - (STATUS_RANK.get(b.status) ?? 9))
        case 'slaDueAt':
          return factor * (new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime())
        case 'assignedTo':
          return factor * a.assignedTo.localeCompare(b.assignedTo)
        case 'cost':
          return factor * ((a.actualCost ?? a.estimatedCost) - (b.actualCost ?? b.estimatedCost))
        case 'raisedAt':
        default:
          return factor * (new Date(a.raisedAt).getTime() - new Date(b.raisedAt).getTime())
      }
    })
  }, [workOrders, query, status, priority, type, zone, sla, assignee, source, overdueOnly, sortKey, dir])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setDir(key === 'raisedAt' || key === 'slaDueAt' || key === 'cost' ? 'desc' : 'asc')
  }

  function resetFilters() {
    setQuery('')
    setStatus(ALL)
    setPriority(ALL)
    setType(ALL)
    setZone(ALL)
    setSla(ALL)
    setAssignee(ALL)
    setSource(ALL)
    setOverdueOnly(false)
  }

  function exportCsv() {
    if (rows.length === 0) return
    downloadCsv(
      `kdh-work-orders-${new Date().toISOString().slice(0, 10)}`,
      rows.map((w) => ({
        Code: w.code,
        Title: w.title,
        Asset: w.assetName,
        'Asset Code': w.assetCode,
        Zone: w.zone,
        Type: w.type,
        Priority: w.priority,
        Status: w.status,
        Source: w.source,
        'Raised By': w.raisedBy,
        'Raised At': formatDateTime(w.raisedAt),
        'SLA Hours': w.slaHours,
        'SLA Due': formatDateTime(w.slaDueAt),
        'SLA Status': w.slaStatus,
        'Assigned To': w.assignedTo,
        Team: w.team,
        'Estimated Cost (RM)': w.estimatedCost,
        'Actual Cost (RM)': w.actualCost ?? '',
        'Downtime Hours': w.downtimeHours,
        'Root Cause': w.rootCause ?? '',
        'Failure Code': w.failureCode ?? '',
      })),
    )
    toast.success(`${rows.length} work orders exported`, { description: 'CSV saved to your downloads folder.' })
  }

  const breached = rows.filter((w) => w.slaStatus === 'Breached').length

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, title, asset, technician or team…"
            aria-label="Search work orders"
            className="pl-8"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus | typeof ALL)}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {WO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setPriority(v as Priority | typeof ALL)}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(v) => setType(v as WorkOrderType | typeof ALL)}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {WO_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={zone} onValueChange={(v) => setZone(v as Zone | typeof ALL)}>
          <SelectTrigger className="w-[200px]" aria-label="Filter by zone">
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

        <Select value={sla} onValueChange={(v) => setSla(v as SlaStatus | typeof ALL)}>
          <SelectTrigger className="w-[145px]" aria-label="Filter by SLA status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All SLA states</SelectItem>
            {SLA_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-[190px]" aria-label="Filter by assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All assignees</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={source} onValueChange={(v) => setSource(v as WorkOrderSource | typeof ALL)}>
          <SelectTrigger className="w-[165px]" aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            {WO_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={overdueOnly ? 'destructive' : 'outline'}
          size="default"
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
        >
          <TriangleAlertIcon aria-hidden="true" />
          Overdue only
        </Button>

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      <SectionCard
        title="Work order register"
        description={`${rows.length} of ${workOrders.length} records${breached > 0 ? ` · ${breached} SLA breached` : ''}`}
        icon={ListIcon}
        contentClassName="p-0"
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <DownloadIcon aria-hidden="true" />
            Export CSV
          </Button>
        }
      >
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={SearchIcon}
              title="No work orders match these filters"
              description="Try clearing a filter or widening the search."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-[118px]">
                    <SortButton label="Code" column="code" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="min-w-[260px]">
                    <SortButton label="Work order" column="title" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[110px]">
                    <SortButton label="Priority" column="priority" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[150px]">
                    <SortButton label="Status" column="status" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[150px]">
                    <SortButton label="SLA" column="slaDueAt" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[170px]">
                    <SortButton label="Assignee" column="assignedTo" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[130px]">
                    <SortButton label="Raised" column="raisedAt" sortKey={sortKey} dir={dir} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="w-[120px] text-right">
                    <SortButton
                      label="Cost"
                      column="cost"
                      sortKey={sortKey}
                      dir={dir}
                      onSort={handleSort}
                      align="right"
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((w) => {
                  const clock = slaClock(w, now)
                  const TypeIcon = TYPE_ICON[w.type]
                  const SourceIcon = SOURCE_ICON[w.source]
                  return (
                    <TableRow
                      key={w.id}
                      tabIndex={0}
                      aria-label={`Open ${w.code}: ${w.title}`}
                      onClick={() => onOpen(w.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpen(w.id)
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-mono text-xs">{w.code}</TableCell>

                      <TableCell>
                        <p className="line-clamp-1 text-sm font-medium text-foreground">{w.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <TypeIcon className="size-3 shrink-0" aria-hidden="true" />
                          <span className="font-mono">{w.assetCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="line-clamp-1">{w.assetName}</span>
                          <SourceIcon className="size-3 shrink-0" aria-hidden="true" />
                        </p>
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={w.priority} className="text-[10px]" />
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={w.status} className="text-[10px]" />
                      </TableCell>

                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                            TONE_CLASSES[clock.tone],
                          )}
                          title={`${clock.headline} · due ${formatDateTime(w.slaDueAt)}`}
                        >
                          <span
                            aria-hidden="true"
                            className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES[clock.tone])}
                          />
                          {clock.pill}
                        </span>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{w.slaHours}h target</p>
                      </TableCell>

                      <TableCell>
                        <p className="line-clamp-1 text-xs font-medium text-foreground">{w.assignedTo}</p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">{w.team}</p>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground" title={formatDateTime(w.raisedAt)}>
                        {formatRelative(w.raisedAt, new Date(now))}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatMYR(w.actualCost ?? w.estimatedCost)}
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {w.actualCost === undefined ? 'estimate' : 'actual'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
