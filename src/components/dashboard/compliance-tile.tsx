import { Link } from 'react-router-dom'
import { ClipboardCheckIcon, FileWarningIcon, ShieldCheckIcon, StampIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { SectionCard } from '@/components/common/section-card'
import { TONE_TEXT_CLASSES, type Tone } from '@/components/common/status-badge'
import type { DataQualitySummary, InsuranceExpiry, InspectionDue } from '@/lib/analytics'
import { formatDate, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Line {
  key: string
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: Tone
  href: string
}

export interface ComplianceTileProps {
  dataQuality: DataQualitySummary
  inspections: InspectionDue[]
  insurance: InsuranceExpiry[]
  totalAssets: number
}

/**
 * Statutory readiness in one square: how complete the register is, what inspections
 * are due, and where cover is lapsing. Every figure is written out — the tone tint is
 * only a second read.
 */
export function ComplianceTile({
  dataQuality,
  inspections,
  insurance,
  totalAssets,
}: ComplianceTileProps) {
  const overdueInspections = inspections.filter((r) => r.overdue).length
  const expiredCover = insurance.filter((r) => r.expired).length
  const nextInspection = inspections[0]
  const nextPolicy = insurance[0]

  const lines: Line[] = [
    {
      key: 'quality',
      icon: ClipboardCheckIcon,
      label: 'Kelengkapan rekod',
      value: `${dataQuality.avgScore.toFixed(1)} / 100`,
      detail: `${formatNumber(dataQuality.complete)} lengkap · ${formatNumber(dataQuality.needsAttention)} perlu semakan · ${formatNumber(dataQuality.incomplete)} tidak lengkap`,
      tone: dataQuality.avgScore >= 85 ? 'positive' : dataQuality.avgScore >= 70 ? 'warning' : 'critical',
      href: '/registry',
    },
    {
      key: 'inspection',
      icon: StampIcon,
      label: 'Pemeriksaan berkanun',
      value: `${formatNumber(inspections.length)} dalam 30 hari`,
      detail: nextInspection
        ? `Seterusnya ${nextInspection.asset.code} pada ${formatDate(nextInspection.dueDate)}${overdueInspections > 0 ? ` · ${overdueInspections} sudah lewat` : ''}`
        : 'Tiada pemeriksaan tertunggak dalam skop ini',
      tone: overdueInspections > 0 ? 'critical' : inspections.length > 0 ? 'warning' : 'positive',
      href: '/maintenance',
    },
    {
      key: 'insurance',
      icon: ShieldCheckIcon,
      label: 'Perlindungan insurans',
      value: `${formatNumber(insurance.length)} dalam 60 hari`,
      detail: nextPolicy
        ? `${nextPolicy.insurer} · polisi ${nextPolicy.policyNo} tamat ${formatDate(nextPolicy.expiry)}${expiredCover > 0 ? ` · ${expiredCover} sudah tamat` : ''}`
        : 'Semua polisi sah melebihi 60 hari',
      tone: expiredCover > 0 ? 'critical' : insurance.length > 0 ? 'warning' : 'positive',
      href: '/registry',
    },
  ]

  return (
    <SectionCard
      title="Kesediaan Pematuhan"
      description={`${formatNumber(totalAssets)} aset dalam skop · ${formatPct((dataQuality.complete / Math.max(1, totalAssets)) * 100, 0)} rekod lengkap sepenuhnya`}
      icon={FileWarningIcon}
      contentClassName="p-0"
    >
      <ul className="divide-y divide-border">
        {lines.map((l) => (
          <li key={l.key}>
            <Link
              to={l.href}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
            >
              <l.icon
                className={cn('mt-0.5 size-4 shrink-0', TONE_TEXT_CLASSES[l.tone])}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{l.label}</span>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', TONE_TEXT_CLASSES[l.tone])}>
                    {l.value}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {l.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
