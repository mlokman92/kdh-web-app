import { CalendarRangeIcon, DownloadIcon, MapPinIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DASHBOARD_PERIODS,
  type PeriodKey,
  type ZoneFilter,
} from '@/components/dashboard/use-dashboard-data'
import type { Zone } from '@/lib/types'

export interface DashboardFiltersProps {
  period: PeriodKey
  onPeriodChange: (period: PeriodKey) => void
  zone: ZoneFilter
  onZoneChange: (zone: ZoneFilter) => void
  /** Zones this signed-in role may see — drives the RBAC demo. */
  zones: Zone[]
  onExport: () => void
  busy?: boolean
}

/**
 * The single filter row for the whole screen. Nothing below it carries its own data
 * filter — every tile, chart and panel re-renders against this one slice.
 */
export function DashboardFilters({
  period,
  onPeriodChange,
  zone,
  onZoneChange,
  zones,
  onExport,
  busy = false,
}: DashboardFiltersProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <CalendarRangeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
          <SelectTrigger size="sm" className="w-[168px]" aria-label="Pilih tempoh laporan">
            <SelectValue placeholder="Tempoh" />
          </SelectTrigger>
          <SelectContent>
            {DASHBOARD_PERIODS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.english}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select value={zone} onValueChange={(v) => onZoneChange(v as ZoneFilter)}>
          <SelectTrigger size="sm" className="w-[210px]" aria-label="Tapis mengikut zon operasi">
            <SelectValue placeholder="Zon" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Zon</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" onClick={onExport} disabled={busy}>
        <DownloadIcon className="size-4" aria-hidden="true" />
        Export Board Pack
      </Button>
    </>
  )
}
