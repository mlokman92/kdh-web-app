import { DropletsIcon, FactoryIcon, LeafIcon, SunIcon, ZapIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import type { EsgSummary } from '@/lib/analytics'
import { formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

interface EsgStat {
  key: string
  icon: LucideIcon
  label: string
  value: string
  unit: string
}

export interface EsgTileProps {
  esg: EsgSummary
}

/**
 * Sustainability roll-up. KEJORA reports to state on carbon and energy, so this is a
 * live differentiator rather than a nice-to-have — the coverage figure is stated
 * openly so nobody mistakes it for a full-portfolio number.
 */
export function EsgTile({ esg }: EsgTileProps) {
  const stats: EsgStat[] = [
    {
      key: 'energy',
      icon: ZapIcon,
      label: 'Tenaga',
      value: formatNumber(Math.round(esg.totalEnergyKwh / 1000)),
      unit: 'MWh / tahun',
    },
    {
      key: 'water',
      icon: DropletsIcon,
      label: 'Air',
      value: formatNumber(Math.round(esg.totalWaterM3)),
      unit: 'm³ / tahun',
    },
    {
      key: 'carbon',
      icon: FactoryIcon,
      label: 'Karbon',
      value: formatNumber(esg.totalCarbonTonnes, 0),
      unit: 'tCO₂e / tahun',
    },
    {
      key: 'solar',
      icon: SunIcon,
      label: 'Sedia Solar',
      value: formatNumber(esg.solarReadyCount),
      unit: `daripada ${formatNumber(esg.reportedAssets)} aset`,
    },
  ]

  const scoreTone =
    esg.avgGreenScore >= 70 ? 'text-primary' : esg.avgGreenScore >= 50 ? 'text-foreground' : 'text-destructive'

  return (
    <SectionCard
      title="ESG & Kelestarian"
      description={`${formatNumber(esg.reportedAssets)} aset melapor telemetri · liputan ${formatPct(esg.coveragePct, 0)}`}
      icon={LeafIcon}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Purata skor hijau</p>
          <p className={cn('mt-1 text-3xl leading-none font-semibold tracking-tight', scoreTone)}>
            {esg.avgGreenScore.toFixed(1)}
            <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
          </p>
        </div>
        <div className="w-32 shrink-0">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', esg.avgGreenScore >= 50 ? 'bg-primary' : 'bg-destructive')}
              style={{ width: `${Math.min(100, Math.max(0, esg.avgGreenScore))}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-[11px] text-muted-foreground">
            {formatPct((esg.solarReadyCount / Math.max(1, esg.reportedAssets)) * 100, 0)} sedia solar
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-muted/40 p-3">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <s.icon className="size-3.5 text-primary" aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="mt-1.5">
              <span className="text-lg leading-none font-semibold text-foreground">{s.value}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{s.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  )
}
