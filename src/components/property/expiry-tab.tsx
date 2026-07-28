import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { CalendarClockIcon, CheckCircle2Icon, HourglassIcon, XCircleIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { forwardExpiry, renewalWorklist } from '@/components/property/helpers'
import type { PropertyActions, PropertyScope } from '@/components/property/scope'
import { leaseExpiryPipeline } from '@/lib/analytics'
import { formatDate, formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const WINDOWS = [
  { value: '90', label: 'Tamat dalam 90 hari' },
  { value: '180', label: 'Tamat dalam 180 hari' },
  { value: '365', label: 'Tamat dalam 12 bulan' },
] as const

const pipelineConfig = {
  monthlyValue: { label: 'Sewa bulanan', color: 'var(--chart-1)' },
} satisfies ChartConfig

const forwardConfig = {
  monthlyValue: { label: 'Sewa tamat', color: 'var(--chart-3)' },
} satisfies ChartConfig

export function ExpiryTab({ scope, actions }: { scope: PropertyScope; actions: PropertyActions }) {
  const [windowDays, setWindowDays] = useState('180')

  const pipeline = useMemo(() => leaseExpiryPipeline(scope.leases, scope.now), [scope.leases, scope.now])
  const forward = useMemo(() => forwardExpiry(scope.leases, 12, scope.now), [scope.leases, scope.now])
  const worklist = useMemo(
    () => renewalWorklist(scope.leases, scope.units, Number(windowDays), scope.now),
    [scope.leases, scope.units, windowDays, scope.now],
  )

  const atRiskMonthly = worklist.reduce((s, r) => s + r.currentRent, 0)
  const upliftMonthly = worklist.reduce((s, r) => s + Math.max(0, r.upliftMonthly), 0)
  const forwardTotal = forward.reduce((s, f) => s + f.monthlyValue, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Saluran Tamat Tempoh"
          description="Bilangan pajakan dan sewa bulanan yang tamat mengikut tempoh"
          icon={HourglassIcon}
        >
          <ChartContainer config={pipelineConfig} className="aspect-auto h-64 w-full">
            <BarChart data={pipeline} margin={{ left: 4, right: 8, top: 20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatMYRCompact(v)}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item.payload as (typeof pipeline)[number]
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">{row.count} pajakan</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatMYR(Number(value))}/bln
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <Bar dataKey="monthlyValue" fill="var(--color-monthlyValue)" radius={[4, 4, 0, 0]} maxBarSize={54}>
                <LabelList
                  dataKey="count"
                  position="top"
                  className="fill-muted-foreground"
                  fontSize={11}
                  formatter={(v) => `${v ?? ''}`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard
          title="Pandangan Hadapan 12 Bulan"
          description={`${formatMYR(forwardTotal)} sewa bulanan tamat kontrak dalam tempoh setahun`}
          icon={CalendarClockIcon}
        >
          <ChartContainer config={forwardConfig} className="aspect-auto h-64 w-full">
            <BarChart data={forward} margin={{ left: 4, right: 8, top: 20, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatMYRCompact(v)}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => {
                      const row = item.payload as (typeof forward)[number]
                      return (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">{row.leases} pajakan tamat</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatMYR(Number(value))}/bln
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <Bar dataKey="monthlyValue" fill="var(--color-monthlyValue)" radius={[4, 4, 0, 0]} maxBarSize={34}>
                <LabelList
                  dataKey="leases"
                  position="top"
                  className="fill-muted-foreground"
                  fontSize={11}
                  formatter={(v) => (Number(v) > 0 ? `${v}` : '')}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </SectionCard>
      </div>

      <SectionCard
        title="Senarai Kerja Pembaharuan"
        description={`${worklist.length} pajakan · ${formatMYR(atRiskMonthly)}/bulan berisiko · potensi kenaikan ${formatMYR(upliftMonthly)}/bulan pada kadar pasaran`}
        icon={CheckCircle2Icon}
        contentClassName="p-0"
        actions={
          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger size="sm" className="w-52" aria-label="Tetingkap tamat tempoh">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {worklist.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={HourglassIcon}
              title="Tiada pajakan tamat dalam tetingkap ini"
              description="Panjangkan tetingkap tamat tempoh untuk melihat pembaharuan akan datang."
            />
          </div>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Penyewa</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Tamat</TableHead>
                  <TableHead className="text-right">Hari</TableHead>
                  <TableHead className="text-right">Sewa semasa</TableHead>
                  <TableHead className="text-right">Penanda aras pasaran</TableHead>
                  <TableHead className="text-right">Kenaikan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {worklist.map(({ lease, unit, daysToExpiry, benchmarkRent, upliftMonthly: uplift, upliftPct }) => (
                  <TableRow key={lease.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => actions.openLease(lease.id)}
                        className="block max-w-48 truncate text-left font-medium hover:text-primary"
                      >
                        {lease.tenantName}
                      </button>
                      <span className="font-mono text-xs text-muted-foreground">{lease.code}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-44 truncate text-xs">{lease.propertyName}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {lease.unitNo}
                        {unit ? ` · ${formatNumber(unit.lettableAreaSqft)} sqft` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(lease.endDate)}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs tabular-nums',
                        daysToExpiry <= 30 && 'font-semibold text-destructive',
                        daysToExpiry > 30 &&
                          daysToExpiry <= 90 &&
                          'text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
                      )}
                    >
                      {formatNumber(daysToExpiry)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatMYR(lease.monthlyRent)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatMYR(benchmarkRent)}
                      {unit && (
                        <span className="block text-[10px] text-muted-foreground">
                          RM {unit.marketRatePsf.toFixed(2)} psf
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-xs font-medium tabular-nums',
                        uplift > 0 ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {uplift > 0 ? `+${formatMYR(uplift)}` : formatMYR(uplift)}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {uplift >= 0 ? '+' : ''}
                        {formatPct(upliftPct, 1)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lease.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="xs" onClick={() => actions.renewLease(lease.id)}>
                          <CheckCircle2Icon aria-hidden="true" />
                          Baharui
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => actions.declineRenewal(lease.id)}
                        >
                          <XCircleIcon aria-hidden="true" />
                          Tamatkan
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
