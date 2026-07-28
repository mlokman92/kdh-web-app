import { useMemo } from 'react'
import {
  BadgeCheckIcon,
  CalendarPlusIcon,
  DatabaseIcon,
  LayersIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react'

import { KpiCard } from '@/components/common/kpi-card'
import { addedThisMonth, needsAttention } from '@/components/registry/registry-utils'
import { formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { dataQualitySummary, portfolioSummary, valueByCategory } from '@/lib/analytics'
import { ASSET_CATEGORIES, type Asset } from '@/lib/types'

export interface RegistrySummaryProps {
  /** Rows currently surviving search + facets. */
  filtered: Asset[]
  /** Everything the signed-in user is allowed to see. */
  scope: Asset[]
  onShowQuality: () => void
  onShowRecent: () => void
}

/** Six-tile executive strip sitting directly under the page header. */
export function RegistrySummary({ filtered, scope, onShowQuality, onShowRecent }: RegistrySummaryProps) {
  const stats = useMemo(() => {
    const portfolio = portfolioSummary(filtered)
    const quality = dataQualitySummary(filtered)
    const byCategory = valueByCategory(filtered)
    const attention = filtered.filter(needsAttention).length
    const recent = addedThisMonth(filtered)
    const userAdded = filtered.filter((a) => a.isUserAdded).length
    const categoriesCovered = new Set(filtered.map((a) => a.category)).size

    return {
      portfolio,
      quality,
      topCategory: byCategory[0],
      attention,
      recent: recent.length,
      userAdded,
      categoriesCovered,
    }
  }, [filtered])

  const isFilteredView = filtered.length !== scope.length

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <KpiCard
        label="Total assets"
        value={formatNumber(filtered.length)}
        sublabel={isFilteredView ? `filtered from ${formatNumber(scope.length)} records` : 'complete register in scope'}
        icon={DatabaseIcon}
      />
      <KpiCard
        label="Total book value"
        value={formatMYRCompact(stats.portfolio.totalNbv)}
        sublabel={`Market value ${formatMYRCompact(stats.portfolio.totalCurrentValue)}`}
        icon={WalletIcon}
      />
      <KpiCard
        label="Categories covered"
        value={`${stats.categoriesCovered} / ${ASSET_CATEGORIES.length}`}
        sublabel={
          stats.topCategory
            ? `${stats.topCategory.category} leads at ${formatPct(stats.topCategory.share, 0)}`
            : 'No records in this view'
        }
        icon={LayersIcon}
      />
      <KpiCard
        label="Avg data quality"
        value={formatPct(stats.quality.avgScore, 0)}
        sublabel={`${formatNumber(stats.quality.complete)} records at 90 and above`}
        icon={BadgeCheckIcon}
        intent={stats.quality.avgScore >= 85 ? 'positive' : stats.quality.avgScore >= 70 ? 'default' : 'warning'}
      />
      <KpiCard
        label="Needs attention"
        value={formatNumber(stats.attention)}
        sublabel="records scoring below 70"
        icon={TriangleAlertIcon}
        intent={stats.attention === 0 ? 'positive' : stats.attention > filtered.length * 0.15 ? 'critical' : 'warning'}
        onClick={onShowQuality}
      />
      <KpiCard
        label="Added this month"
        value={formatNumber(stats.recent)}
        sublabel={stats.userAdded > 0 ? `${formatNumber(stats.userAdded)} captured in this session` : 'no session captures yet'}
        icon={CalendarPlusIcon}
        intent={stats.recent > 0 ? 'positive' : 'default'}
        onClick={onShowRecent}
      />
    </div>
  )
}
