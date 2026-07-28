import { useEffect, useMemo, useState } from 'react'
import { LayoutGridIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { StatusBadge, TONE_CLASSES, TONE_DOT_CLASSES, statusTone } from '@/components/common/status-badge'
import { EmptyState } from '@/components/common/empty-state'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isLiveLease } from '@/lib/analytics'
import { formatArea, formatDate, formatMYR, formatPct } from '@/lib/format'
import { UNIT_STATUSES, type Lease, type PropertyUnit } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface StackingPlanProps {
  units: PropertyUnit[]
  leases: Lease[]
  onOpenLease: (leaseId: string) => void
}

/**
 * Visual stacking plan — one tile per lettable unit, coloured by status and
 * hoverable for the tenant, the rent and the lease expiry.
 */
export function StackingPlan({ units, leases, onOpenLease }: StackingPlanProps) {
  const properties = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of units) map.set(u.propertyName, (map.get(u.propertyName) ?? 0) + 1)
    return [...map.entries()]
      .filter(([, n]) => n >= 4)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [units])

  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (properties.length === 0) {
      setSelected('')
      return
    }
    if (!properties.some((p) => p.name === selected)) setSelected(properties[0].name)
  }, [properties, selected])

  const planUnits = useMemo(
    () =>
      units
        .filter((u) => u.propertyName === selected)
        .slice()
        .sort((a, b) => a.floor.localeCompare(b.floor) || a.unitNo.localeCompare(b.unitNo)),
    [units, selected],
  )

  const leaseByUnit = useMemo(() => {
    const map = new Map<string, Lease>()
    for (const l of leases) {
      if (!isLiveLease(l)) continue
      const existing = map.get(l.unitId)
      if (!existing || l.startDate > existing.startDate) map.set(l.unitId, l)
    }
    return map
  }, [leases])

  const floors = useMemo(() => {
    const map = new Map<string, PropertyUnit[]>()
    for (const u of planUnits) {
      const list = map.get(u.floor)
      if (list) list.push(u)
      else map.set(u.floor, [u])
    }
    // Highest floor first, so the plan reads like a building elevation.
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [planUnits])

  const occupied = planUnits.filter((u) => u.status === 'Occupied').length
  const letArea = planUnits.reduce((s, u) => s + (u.status === 'Occupied' ? u.lettableAreaSqft : 0), 0)
  const totalArea = planUnits.reduce((s, u) => s + u.lettableAreaSqft, 0)
  const monthlyRent = planUnits.reduce((s, u) => s + (leaseByUnit.get(u.id)?.monthlyRent ?? 0), 0)

  const legend = UNIT_STATUSES.filter((s) => planUnits.some((u) => u.status === s))

  return (
    <SectionCard
      title="Pelan Susunan Unit"
      description="Setiap petak ialah satu unit boleh sewa. Tuding untuk melihat penyewa, sewa dan tarikh tamat."
      icon={LayoutGridIcon}
      actions={
        properties.length > 0 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger size="sm" className="w-[min(20rem,70vw)]" aria-label="Pilih hartanah">
              <SelectValue placeholder="Pilih hartanah" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name} ({p.count} unit)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      {planUnits.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title="Tiada hartanah berbilang unit dalam saringan ini"
          description="Longgarkan penapis zon untuk melihat pelan susunan unit."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="text-muted-foreground">
              Penghunian{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatPct((occupied / planUnits.length) * 100, 1)}
              </span>{' '}
              ({occupied}/{planUnits.length} unit)
            </span>
            <span className="text-muted-foreground">
              Keluasan disewa{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatArea(letArea)} / {formatArea(totalArea)}
              </span>
            </span>
            <span className="text-muted-foreground">
              Sewa kontrak{' '}
              <span className="font-medium text-foreground tabular-nums">{formatMYR(monthlyRent)}</span>
              /bulan
            </span>
          </div>

          <div className="space-y-3">
            {floors.map(([floor, list]) => (
              <div key={floor} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <span className="w-24 shrink-0 pt-1.5 text-xs font-medium text-muted-foreground">
                  {floor}
                </span>
                <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                  {list.map((u) => {
                    const lease = leaseByUnit.get(u.id)
                    const tone = statusTone(u.status)
                    return (
                      <HoverCard key={u.id} openDelay={80} closeDelay={40}>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            onClick={() => lease && onOpenLease(lease.id)}
                            aria-label={`Unit ${u.unitNo}, ${u.status}`}
                            className={cn(
                              'flex h-16 flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors',
                              TONE_CLASSES[tone],
                              lease
                                ? 'cursor-pointer hover:brightness-105'
                                : 'cursor-default',
                              'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                            )}
                          >
                            <span className="w-full truncate font-mono text-xs font-semibold">
                              {u.unitNo}
                            </span>
                            <span className="w-full truncate text-[10px] opacity-80 tabular-nums">
                              {formatArea(u.lettableAreaSqft)}
                            </span>
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72" align="start">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-sm font-semibold">{u.unitNo}</p>
                              <StatusBadge status={u.status} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {u.type} · {formatArea(u.lettableAreaSqft)} · kadar pasaran RM{' '}
                              {u.marketRatePsf.toFixed(2)} psf
                            </p>
                            {lease ? (
                              <dl className="space-y-1 border-t border-border pt-2 text-xs">
                                <div className="flex justify-between gap-3">
                                  <dt className="text-muted-foreground">Penyewa</dt>
                                  <dd className="min-w-0 truncate font-medium">{lease.tenantName}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt className="text-muted-foreground">Sewa</dt>
                                  <dd className="font-mono tabular-nums">
                                    {formatMYR(lease.monthlyRent)} · RM {lease.ratePsf.toFixed(2)} psf
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <dt className="text-muted-foreground">Tamat</dt>
                                  <dd className="font-mono tabular-nums">{formatDate(lease.endDate)}</dd>
                                </div>
                                {lease.outstandingAmount > 0 && (
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Tunggakan</dt>
                                    <dd className="font-mono text-destructive tabular-nums">
                                      {formatMYR(lease.outstandingAmount)}
                                    </dd>
                                  </div>
                                )}
                                <p className="pt-1 text-[11px] text-muted-foreground">
                                  Klik untuk membuka rekod pajakan {lease.code}.
                                </p>
                              </dl>
                            ) : (
                              <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                                Tiada pajakan aktif. Hasil pasaran{' '}
                                <span className="font-mono text-foreground">
                                  {formatMYR(u.lettableAreaSqft * u.marketRatePsf * 12)}
                                </span>{' '}
                                setahun jika disewakan.
                              </p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
            {legend.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-[3px]', TONE_DOT_CLASSES[statusTone(s)])}
                />
                {s}
                <span className="tabular-nums">({planUnits.filter((u) => u.status === s).length})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
