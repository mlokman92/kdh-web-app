import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { CalculatorIcon, ChartSplineIcon, CoinsIcon, LandmarkIcon } from 'lucide-react'

import { DetailBlock, Field, FieldGrid, Metric } from '@/components/registry/detail/detail-parts'
import { depreciationSchedule, isNonDepreciable } from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

const chartConfig = {
  closing: { label: 'Net book value', color: 'var(--chart-1)' },
  accumulated: { label: 'Accumulated depreciation', color: 'var(--chart-4)' },
} satisfies ChartConfig

export function FinancialsTab({ asset }: { asset: Asset }) {
  const schedule = useMemo(() => depreciationSchedule(asset), [asset])
  const nonDepreciable = isNonDepreciable(asset)

  const ageYears = useMemo(() => {
    const acq = new Date(asset.acquisitionDate).getTime()
    if (!Number.isFinite(acq)) return 0
    return Math.max(0, (Date.now() - acq) / (1000 * 60 * 60 * 24 * 365.25))
  }, [asset.acquisitionDate])

  const netYtd = asset.revenueYtd - asset.opexYtd
  const marginPct = asset.revenueYtd > 0 ? (netYtd / asset.revenueYtd) * 100 : 0
  const valueMovement = asset.acquisitionCost > 0
    ? ((asset.currentValue - asset.acquisitionCost) / asset.acquisitionCost) * 100
    : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Acquisition cost"
          value={formatMYR(asset.acquisitionCost)}
          sublabel={formatDate(asset.acquisitionDate)}
        />
        <Metric
          label="Current value"
          value={formatMYR(asset.currentValue)}
          sublabel={`${valueMovement >= 0 ? '+' : ''}${formatPct(valueMovement, 1)} vs cost`}
          tone={valueMovement >= 0 ? 'positive' : 'critical'}
        />
        <Metric
          label="Accumulated depreciation"
          value={formatMYR(asset.accumulatedDepreciation)}
          sublabel={`${formatPct((asset.accumulatedDepreciation / (asset.acquisitionCost || 1)) * 100, 1)} of cost`}
          tone="warning"
        />
        <Metric label="Net book value" value={formatMYR(asset.netBookValue)} sublabel="carrying amount" tone="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailBlock title="Capitalisation basis" icon={CalculatorIcon}>
          <FieldGrid className="sm:grid-cols-2">
            <Field label="Depreciation method" value={asset.depreciationMethod} />
            <Field label="Useful life" value={`${formatNumber(asset.usefulLifeYears)} years`} />
            <Field label="Age at today" value={`${formatNumber(ageYears, 1)} years`} />
            <Field
              label="Remaining life"
              value={`${formatNumber(Math.max(0, asset.usefulLifeYears - ageYears), 1)} years`}
            />
            <Field label="Annual charge">
              {nonDepreciable ? (
                <span className="text-muted-foreground">Not depreciated</span>
              ) : (
                <span className="font-mono text-xs">
                  {formatMYR(
                    asset.depreciationMethod === 'Reducing Balance'
                      ? asset.netBookValue * 0.2
                      : asset.acquisitionCost / Math.max(1, asset.usefulLifeYears),
                  )}
                </span>
              )}
            </Field>
            <Field
              label="Insured for"
              value={asset.insurance ? formatMYR(asset.insurance.sumInsured) : undefined}
            />
          </FieldGrid>
          {asset.insurance && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">Insurance</p>
              <p className="mt-1 text-sm text-foreground">{asset.insurance.insurer}</p>
              <p className="font-mono text-xs text-muted-foreground">{asset.insurance.policyNo}</p>
              <p className="mt-1 text-xs text-muted-foreground">Expires {formatDate(asset.insurance.expiry)}</p>
            </div>
          )}
        </DetailBlock>

        <DetailBlock title="Year-to-date performance" icon={CoinsIcon}>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Revenue YTD" value={formatMYR(asset.revenueYtd)} tone="positive" />
            <Metric label="Opex YTD" value={formatMYR(asset.opexYtd)} tone="warning" />
            <Metric
              label="Net contribution"
              value={formatMYR(netYtd)}
              tone={netYtd >= 0 ? 'positive' : 'critical'}
              sublabel={`margin ${formatPct(marginPct, 1)}`}
            />
            <Metric
              label="Yield on value"
              value={formatPct(asset.currentValue > 0 ? (netYtd / asset.currentValue) * 100 : 0, 2)}
              sublabel="net contribution / current value"
            />
          </div>
        </DetailBlock>
      </div>

      {nonDepreciable ? (
        <DetailBlock title="Depreciation schedule" icon={LandmarkIcon}>
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <LandmarkIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Freehold land is not depreciated</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The parcel is carried at cost and revalued periodically by JPPH. Accumulated depreciation stays at nil
                and the net book value tracks the acquisition cost.
              </p>
            </div>
          </div>
        </DetailBlock>
      ) : (
        <>
          <DetailBlock
            title="Net book value over time"
            icon={ChartSplineIcon}
            description={`${asset.depreciationMethod} · ${formatNumber(asset.usefulLifeYears)} year life`}
          >
            <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
              <AreaChart data={schedule} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="nbv-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="acc-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickFormatter={(v: number) => formatMYRCompact(v)}
                />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => formatMYR(Number(value))} indicator="line" />}
                />
                <Area
                  dataKey="accumulated"
                  type="monotone"
                  stroke="var(--chart-4)"
                  fill="url(#acc-fill)"
                  strokeWidth={1.5}
                />
                <Area
                  dataKey="closing"
                  type="monotone"
                  stroke="var(--chart-1)"
                  fill="url(#nbv-fill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </DetailBlock>

          <DetailBlock
            title="Depreciation schedule"
            icon={CalculatorIcon}
            description={`Generated from acquisition on ${formatDate(asset.acquisitionDate)}`}
            actions={<Badge variant="outline">{schedule.length} periods</Badge>}
          >
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border [&_[data-slot=table-container]]:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="bg-muted/60">Year</TableHead>
                    <TableHead className="bg-muted/60 text-right">Opening NBV</TableHead>
                    <TableHead className="bg-muted/60 text-right">Charge</TableHead>
                    <TableHead className="bg-muted/60 text-right">Accumulated</TableHead>
                    <TableHead className="bg-muted/60 text-right">Closing NBV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.year} className={cn(row.current && 'bg-primary/5')}>
                      <TableCell className="font-mono text-xs">
                        {row.year}
                        {row.current && (
                          <Badge variant="secondary" className="ml-2 h-4 px-1 text-[0.6rem]">
                            current
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatMYR(row.opening)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatMYR(row.charge)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatMYR(row.accumulated)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                        {formatMYR(row.closing)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DetailBlock>
        </>
      )}
    </div>
  )
}
