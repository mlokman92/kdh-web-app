import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { BadgeCheckIcon, ChartColumnIcon, ListChecksIcon, ShieldAlertIcon, WandSparklesIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { KpiCard } from '@/components/common/kpi-card'
import { SectionCard } from '@/components/common/section-card'
import { TONE_DOT_CLASSES } from '@/components/common/status-badge'
import { ScoreMeter } from '@/components/registry/detail/detail-parts'
import {
  CATEGORY_ICON,
  QUALITY_BANDS,
  QUALITY_THRESHOLD,
  gapFrequency,
  needsAttention,
  qualityGaps,
  scoreTone,
} from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataQualitySummary } from '@/lib/analytics'
import { formatNumber, formatPct } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

const bandConfig = { count: { label: 'Assets', color: 'var(--chart-1)' } } satisfies ChartConfig
const gapConfig = { count: { label: 'Records affected', color: 'var(--chart-2)' } } satisfies ChartConfig

const BAND_FILL: Record<string, string> = {
  '90–100': 'var(--chart-1)',
  '70–89': 'var(--chart-2)',
  '50–69': 'var(--chart-3)',
  'Below 50': 'var(--chart-5)',
}

export interface DataQualityPanelProps {
  assets: Asset[]
  onOpen: (asset: Asset) => void
  onFix: (asset: Asset) => void
}

/**
 * The differentiator screen: which records are incomplete, exactly which fields are
 * missing, and a one-click route into fixing them.
 */
export function DataQualityPanel({ assets, onOpen, onFix }: DataQualityPanelProps) {
  const summary = useMemo(() => dataQualitySummary(assets), [assets])

  const bands = useMemo(
    () =>
      QUALITY_BANDS.map((band) => ({
        band: band.label,
        count: assets.filter((a) => a.dataQualityScore >= band.min && a.dataQualityScore < band.max).length,
      })),
    [assets],
  )

  const offenders = useMemo(
    () =>
      assets
        .filter(needsAttention)
        .map((asset) => ({ asset, gaps: qualityGaps(asset) }))
        .sort((a, b) => a.asset.dataQualityScore - b.asset.dataQualityScore),
    [assets],
  )

  const gaps = useMemo(() => gapFrequency(offenders.map((o) => o.asset)).slice(0, 8), [offenders])

  const valueAtRisk = useMemo(
    () => offenders.reduce((s, o) => s + o.asset.currentValue, 0),
    [offenders],
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Average score"
          value={formatPct(summary.avgScore, 0)}
          sublabel={`across ${formatNumber(assets.length)} records in view`}
          icon={BadgeCheckIcon}
          intent={summary.avgScore >= 85 ? 'positive' : summary.avgScore >= 70 ? 'default' : 'warning'}
        />
        <KpiCard
          label="Audit ready"
          value={formatNumber(summary.complete)}
          sublabel="scoring 90 and above"
          icon={ListChecksIcon}
          intent="positive"
        />
        <KpiCard
          label="Below threshold"
          value={formatNumber(offenders.length)}
          sublabel={`under ${QUALITY_THRESHOLD} — remediation queue`}
          icon={ShieldAlertIcon}
          intent={offenders.length === 0 ? 'positive' : 'critical'}
        />
        <KpiCard
          label="Value on incomplete records"
          value={formatPct(assets.length > 0 ? (offenders.length / assets.length) * 100 : 0, 1)}
          sublabel={`${formatNumber(valueAtRisk / 1_000_000, 1)} juta ringgit of book value`}
          icon={ChartColumnIcon}
          intent={offenders.length === 0 ? 'positive' : 'warning'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Score distribution"
          description="Where the register sits against the KDH completeness standard"
          icon={ChartColumnIcon}
        >
          <ChartContainer config={bandConfig} className="aspect-auto h-52 w-full">
            <BarChart data={bands} margin={{ left: 4, right: 8, top: 16, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="band" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                {bands.map((b) => (
                  <Cell key={b.band} fill={BAND_FILL[b.band] ?? 'var(--chart-1)'} />
                ))}
                <LabelList dataKey="count" position="top" className="fill-muted-foreground" fontSize={11} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard
          title="Most common gaps"
          description="Fields missing across the remediation queue"
          icon={WandSparklesIcon}
        >
          {gaps.length === 0 ? (
            <EmptyState
              icon={BadgeCheckIcon}
              title="No gaps detected"
              description="Every record in this view meets the completeness standard."
            />
          ) : (
            <ChartContainer config={gapConfig} className="aspect-auto h-52 w-full">
              <BarChart data={gaps} layout="vertical" margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  width={132}
                  tickMargin={4}
                  fontSize={11}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[0, 5, 5, 0]} maxBarSize={18}>
                  <LabelList dataKey="count" position="right" className="fill-muted-foreground" fontSize={11} />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={`Remediation queue (${formatNumber(offenders.length)})`}
        description={`Records scoring below ${QUALITY_THRESHOLD}, weakest first`}
        icon={ShieldAlertIcon}
        contentClassName="p-0"
      >
        {offenders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BadgeCheckIcon}
              title="Nothing to remediate"
              description="Every record in the current view scores at or above the KDH completeness threshold."
            />
          </div>
        ) : (
          <div className="[&_[data-slot=table-container]]:max-h-[32rem] [&_[data-slot=table-container]]:overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky top-0 z-20 border-b border-border bg-card pl-4">Code</TableHead>
                  <TableHead className="sticky top-0 z-20 border-b border-border bg-card">Asset</TableHead>
                  <TableHead className="sticky top-0 z-20 border-b border-border bg-card">Zone</TableHead>
                  <TableHead className="sticky top-0 z-20 w-40 border-b border-border bg-card">Score</TableHead>
                  <TableHead className="sticky top-0 z-20 border-b border-border bg-card">Missing fields</TableHead>
                  <TableHead className="sticky top-0 z-20 border-b border-border bg-card pr-4 text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offenders.map(({ asset, gaps: rowGaps }) => {
                  const tone = scoreTone(asset.dataQualityScore)
                  const Icon = CATEGORY_ICON[asset.category]
                  return (
                    <TableRow key={asset.id} className="cursor-pointer" onClick={() => onOpen(asset)}>
                      <TableCell className="pl-4 font-mono text-xs">{asset.code}</TableCell>
                      <TableCell className="max-w-[18rem]">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{asset.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{asset.subCategory}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{asset.location.zone}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn('size-2 shrink-0 rounded-full', TONE_DOT_CLASSES[tone])}
                            aria-hidden="true"
                          />
                          <span className="w-6 font-mono text-xs tabular-nums text-foreground">
                            {asset.dataQualityScore}
                          </span>
                          <ScoreMeter value={asset.dataQualityScore} tone={tone} className="w-20" />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[22rem] whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {rowGaps.slice(0, 4).map((gap) => (
                            <Badge key={gap.key} variant="outline" className="font-normal">
                              {gap.label}
                            </Badge>
                          ))}
                          {rowGaps.length > 4 && (
                            <Badge variant="ghost" className="font-normal text-muted-foreground">
                              +{rowGaps.length - 4} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="xs" variant="outline" onClick={() => onFix(asset)}>
                          <WandSparklesIcon aria-hidden="true" />
                          Fix now
                        </Button>
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
