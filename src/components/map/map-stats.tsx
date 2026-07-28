import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, LayoutDashboardIcon } from 'lucide-react'
import { formatMYR, formatMYRCompact, formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface StatRow {
  key: string
  label: string
  color: string
  count: number
  value: number
}

export interface ZoneRow {
  zone: string
  short: string
  count: number
  value: number
}

export interface MapStatsProps {
  title: string
  count: number
  value: number
  totalCount: number
  dimensionLabel: string
  rows: StatRow[]
  zones: ZoneRow[]
  onZoneClick: (zone: string) => void
  activeZones: string[]
}

/** Floating read-out of what is inside the current viewport. */
export function MapStats({
  title,
  count,
  value,
  totalCount,
  dimensionLabel,
  rows,
  zones,
  onZoneClick,
  activeZones,
}: MapStatsProps) {
  const [open, setOpen] = useState(true)
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1
  const zoneMax = zones.reduce((m, z) => Math.max(m, z.count), 0) || 1

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/92 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <LayoutDashboardIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse viewport statistics' : 'Expand viewport statistics'}
          aria-expanded={open}
        >
          {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border px-2.5 py-2">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Assets</p>
          <p className="font-mono text-base leading-tight font-semibold text-foreground tabular-nums">
            {formatNumber(count)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              / {formatNumber(totalCount)}
            </span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Value</p>
          <p
            className="truncate font-mono text-base leading-tight font-semibold text-foreground tabular-nums"
            title={formatMYR(value)}
          >
            {formatMYRCompact(value)}
          </p>
        </div>
      </div>

      {open && (
        <>
          <div className="border-t border-border px-2.5 py-2">
            <p className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
              By {dimensionLabel.toLowerCase()}
            </p>
            {rows.length === 0 ? (
              <p className="py-1 text-[11px] text-muted-foreground">Nothing in view.</p>
            ) : (
              <ul className="space-y-1">
                {rows.slice(0, 5).map((r) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="w-24 shrink-0 truncate text-[11px] text-foreground" title={r.label}>
                      {r.label}
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {r.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-2.5 py-2">
            <p className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
              By zone
            </p>
            <ul className="space-y-0.5">
              {zones.map((z) => {
                const active = activeZones.includes(z.zone)
                return (
                  <li key={z.zone}>
                    <button
                      type="button"
                      onClick={() => onZoneClick(z.zone)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-1 py-0.5 transition-colors',
                        active ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50',
                      )}
                      title={`${z.zone} — ${formatMYR(z.value)}`}
                    >
                      <span className="w-24 shrink-0 truncate text-left text-[11px] text-foreground">
                        {z.short}
                      </span>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(z.count / zoneMax) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground tabular-nums">
                        {z.count}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
