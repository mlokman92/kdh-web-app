import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { GripVerticalIcon, LayoutGridIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { TONE_CLASSES, TONE_DOT_CLASSES } from '@/components/common/status-badge'
import {
  BOARD_COLUMNS,
  DRAG_MIME,
  TYPE_ICON,
  priorityShort,
  slaClock,
  useTicker,
} from '@/components/maintenance/shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { initials } from '@/lib/format'
import { PRIORITIES, ZONES } from '@/lib/types'
import type { Priority, WorkOrder, WorkOrderStatus, Zone } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const ALL = '__all__'

export interface WorkOrderBoardProps {
  workOrders: WorkOrder[]
  onOpen: (id: string) => void
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

interface CardProps {
  wo: WorkOrder
  now: number
  dragging: boolean
  onOpen: (id: string) => void
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void
  onDragEnd: () => void
  onMove: (id: string, status: WorkOrderStatus) => void
}

function WorkOrderCard({ wo, now, dragging, onOpen, onDragStart, onDragEnd, onMove }: CardProps) {
  const clock = slaClock(wo, now)
  const TypeIcon = TYPE_ICON[wo.type]

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={`${wo.code}: ${wo.title}. ${wo.priority}. ${clock.pill}. Open details.`}
      onClick={() => onOpen(wo.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(wo.id)
        }
      }}
      onDragStart={(e) => onDragStart(e, wo.id)}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-grab rounded-lg border border-border bg-card p-2.5 text-left transition-colors',
        'hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">{wo.code}</span>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[10px] font-semibold',
              TONE_CLASSES[wo.priority === 'P1 - Critical' ? 'critical' : wo.priority === 'P2 - High' ? 'warning' : wo.priority === 'P3 - Medium' ? 'info' : 'neutral'],
            )}
            title={wo.priority}
          >
            {priorityShort(wo.priority)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Move ${wo.code} to another lane`}
                onClick={(e) => e.stopPropagation()}
                /* Keep Enter/Space on the trigger from also opening the card. */
                onKeyDown={(e) => e.stopPropagation()}
              >
                <GripVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {BOARD_COLUMNS.map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  disabled={col.statuses.includes(wo.status)}
                  onSelect={() => onMove(wo.id, col.dropStatus)}
                >
                  {col.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium text-foreground">{wo.title}</p>

      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <TypeIcon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{wo.assetName}</span>
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar size="sm">
              <AvatarFallback className="text-[10px]">{initials(wo.assignedTo)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            {wo.assignedTo} · {wo.team}
          </TooltipContent>
        </Tooltip>

        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            TONE_CLASSES[clock.tone],
          )}
          title={clock.headline}
        >
          <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES[clock.tone])} />
          {clock.pill}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

/**
 * Six-lane kanban. Cards carry the SLA countdown so a supervisor can triage by
 * urgency at a glance; drag between lanes (or use the per-card menu) to move the
 * job through its lifecycle — every move writes status, history and an audit entry.
 */
export function WorkOrderBoard({ workOrders, onOpen }: WorkOrderBoardProps) {
  const setWorkOrderStatus = useAppStore((s) => s.setWorkOrderStatus)

  const [query, setQuery] = useState('')
  const [zone, setZone] = useState<Zone | typeof ALL>(ALL)
  const [priority, setPriority] = useState<Priority | typeof ALL>(ALL)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  /* Board pills refresh every 30s — precise enough for a wall board, cheap enough
     to run over a couple of hundred cards. */
  const now = useTicker(30_000)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workOrders.filter((w) => {
      if (zone !== ALL && w.zone !== zone) return false
      if (priority !== ALL && w.priority !== priority) return false
      if (!q) return true
      return (
        w.code.toLowerCase().includes(q) ||
        w.title.toLowerCase().includes(q) ||
        w.assetName.toLowerCase().includes(q) ||
        w.assetCode.toLowerCase().includes(q) ||
        w.assignedTo.toLowerCase().includes(q)
      )
    })
  }, [workOrders, query, zone, priority])

  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((col) => {
        const cards = filtered
          .filter((w) => col.statuses.includes(w.status))
          .sort((a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime())
        return { col, cards, breached: cards.filter((w) => w.slaStatus === 'Breached').length }
      }),
    [filtered],
  )

  const cancelled = filtered.filter((w) => w.status === 'Cancelled').length

  function move(id: string, status: WorkOrderStatus) {
    const wo = workOrders.find((w) => w.id === id)
    if (!wo || wo.status === status) return
    setWorkOrderStatus(id, status)
    toast.success(`${wo.code} moved to ${status}`, {
      description: `${wo.title} · ${wo.assetCode}`,
      action: { label: 'Open', onClick: () => onOpen(id) },
    })
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, id)
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, dropStatus: WorkOrderStatus, statuses: WorkOrderStatus[]) {
    e.preventDefault()
    setDragOverId(null)
    setDraggingId(null)
    const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
    if (!id) return
    const wo = workOrders.find((w) => w.id === id)
    // Dropping back into the lane the card already lives in is a no-op.
    if (!wo || statuses.includes(wo.status)) return
    move(id, dropStatus)
  }

  return (
    <div className="space-y-3">
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
            placeholder="Search code, title, asset or technician…"
            aria-label="Search the board"
            className="pl-8"
          />
        </div>

        <Select value={zone} onValueChange={(v) => setZone(v as Zone | typeof ALL)}>
          <SelectTrigger className="w-[210px]" aria-label="Filter board by zone">
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

        <Select value={priority} onValueChange={(v) => setPriority(v as Priority | typeof ALL)}>
          <SelectTrigger className="w-[160px]" aria-label="Filter board by priority">
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

        {(query || zone !== ALL || priority !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('')
              setZone(ALL)
              setPriority(ALL)
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title="No work orders match these filters"
          description="Widen the zone or priority filter, or clear the search to see the full board."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                setZone(ALL)
                setPriority(ALL)
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {columns.map(({ col, cards, breached }) => (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== col.id) setDragOverId(col.id)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverId(null)
                }}
                onDrop={(e) => handleDrop(e, col.dropStatus, col.statuses)}
                className={cn(
                  'flex w-[272px] shrink-0 flex-col rounded-xl border border-border bg-muted/30 transition-colors',
                  dragOverId === col.id && draggingId && 'border-primary bg-accent/50 ring-2 ring-primary/30',
                )}
              >
                <header className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-foreground">{col.label}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{col.hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {breached > 0 && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          TONE_CLASSES.critical,
                        )}
                        title={`${breached} SLA breached in this lane`}
                      >
                        <TriangleAlertIcon className="size-2.5" aria-hidden="true" />
                        {breached}
                      </span>
                    )}
                    <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {cards.length}
                    </span>
                  </div>
                </header>

                <div className="max-h-[58vh] min-h-[140px] space-y-2 overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <p className="px-2 py-8 text-center text-[11px] text-muted-foreground">
                      Drop a card here to move it to {col.label}.
                    </p>
                  ) : (
                    cards.map((wo) => (
                      <WorkOrderCard
                        key={wo.id}
                        wo={wo}
                        now={now}
                        dragging={draggingId === wo.id}
                        onOpen={onOpen}
                        onDragStart={handleDragStart}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDragOverId(null)
                        }}
                        onMove={move}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Drag a card between lanes to change its status, or use the card menu for keyboard control.
            {cancelled > 0 && ` ${cancelled} cancelled job${cancelled === 1 ? '' : 's'} sit outside the board — find them in the List tab.`}
          </p>
        </>
      )}
    </div>
  )
}
