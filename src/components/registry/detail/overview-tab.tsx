import { BadgeCheckIcon, CircleAlertIcon, IdCardIcon, StickyNoteIcon, UserCogIcon } from 'lucide-react'

import { StatusBadge, TONE_TEXT_CLASSES, statusTone } from '@/components/common/status-badge'
import { DetailBlock, Field, FieldGrid, Metric, ScoreMeter } from '@/components/registry/detail/detail-parts'
import { completeness, qualityGaps, scoreTone } from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime, formatNumber, formatPct } from '@/lib/format'
import type { Asset } from '@/lib/types'

export function OverviewTab({ asset, onFix }: { asset: Asset; onFix: () => void }) {
  const gaps = qualityGaps(asset)
  const derived = completeness(asset)

  return (
    <div className="space-y-4">
      <DetailBlock title="Identity" icon={IdCardIcon} description="How this asset is registered in the KDH book">
        <FieldGrid>
          <Field label="Asset code" value={asset.code} mono />
          <Field label="Internal ID" value={asset.id} mono />
          <Field label="Name" value={asset.name} className="col-span-2 sm:col-span-1" />
          <Field label="Category" value={asset.category} />
          <Field label="Sub-category" value={asset.subCategory} />
          <Field label="Ownership" value={asset.ownership} />
          <Field label="Status">
            <StatusBadge status={asset.status} />
          </Field>
          <Field label="Criticality">
            <StatusBadge status={asset.criticality} />
          </Field>
          <Field label="Condition">
            <div className="flex items-center gap-2">
              <StatusBadge status={asset.condition} />
              <span className={`font-mono text-xs tabular-nums ${TONE_TEXT_CLASSES[statusTone(asset.condition)]}`}>
                {asset.conditionScore}/100
              </span>
            </div>
          </Field>
        </FieldGrid>
      </DetailBlock>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailBlock title="Custody & accountability" icon={UserCogIcon}>
          <FieldGrid className="sm:grid-cols-2">
            <Field label="Custodian department" value={asset.custodianDepartment} />
            <Field label="Named custodian" value={asset.custodianName} />
            <Field label="Record created" value={formatDate(asset.createdAt)} />
            <Field label="Last updated" value={formatDateTime(asset.updatedAt)} />
          </FieldGrid>

          <div className="mt-4 space-y-1.5">
            <p className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">Tags</p>
            {asset.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classification tags applied.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {asset.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </DetailBlock>

        <DetailBlock
          title="Operating position"
          icon={BadgeCheckIcon}
          description="Live signals the asset committee reviews"
        >
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Utilisation"
              value={formatPct(asset.utilisationRate, 0)}
              sublabel="occupancy / usage of capacity"
              tone={asset.utilisationRate >= 70 ? 'positive' : asset.utilisationRate >= 40 ? 'warning' : 'critical'}
            />
            <Metric
              label="Risk score"
              value={formatNumber(asset.riskScore)}
              sublabel="0 lowest · 100 highest"
              tone={asset.riskScore >= 70 ? 'critical' : asset.riskScore >= 45 ? 'warning' : 'positive'}
            />
            <Metric
              label="Condition score"
              value={formatNumber(asset.conditionScore)}
              sublabel={asset.condition}
              tone={statusTone(asset.condition)}
            />
            <Metric
              label="Data quality"
              value={formatNumber(asset.dataQualityScore)}
              sublabel={`field completeness ${derived}%`}
              tone={scoreTone(asset.dataQualityScore)}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Record completeness</span>
              <span className="font-mono tabular-nums text-foreground">{derived}%</span>
            </div>
            <ScoreMeter value={derived} tone={scoreTone(derived)} />
          </div>
        </DetailBlock>
      </div>

      {gaps.length > 0 && (
        <DetailBlock
          title={`Data gaps (${gaps.length})`}
          icon={CircleAlertIcon}
          description="Fields the registry expects but has not received"
          actions={
            <Button variant="outline" size="xs" onClick={onFix}>
              Complete record
            </Button>
          }
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {gaps.map((gap) => (
              <li key={gap.key} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
                <CircleAlertIcon
                  className="mt-0.5 size-3.5 shrink-0 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{gap.label}</p>
                  <p className="text-xs text-muted-foreground">{gap.hint}</p>
                </div>
                <span className="ml-auto shrink-0 font-mono text-[0.65rem] text-muted-foreground">-{gap.weight}</span>
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}

      <DetailBlock title="Custodian notes" icon={StickyNoteIcon}>
        {asset.notes ? (
          <p className="text-sm leading-relaxed text-foreground">{asset.notes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No narrative note has been recorded against this asset. Adding one helps the asset committee understand
            the current position without opening the file.
          </p>
        )}
      </DetailBlock>
    </div>
  )
}
