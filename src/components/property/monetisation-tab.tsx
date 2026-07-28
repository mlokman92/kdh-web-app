import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRightIcon,
  DoorOpenIcon,
  DownloadIcon,
  GaugeIcon,
  LandmarkIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OPPORTUNITY_KINDS, buildOpportunities, type OpportunityKind } from '@/components/property/helpers'
import type { PropertyScope } from '@/components/property/scope'
import { downloadCsv, formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const KIND_ICON: Record<OpportunityKind, LucideIcon> = {
  'Vacant Unit': DoorOpenIcon,
  'Under-Market Lease': TrendingUpIcon,
  'Idle Land': LandmarkIcon,
  'Low Utilisation': GaugeIcon,
}

const KIND_LABEL: Record<OpportunityKind, string> = {
  'Vacant Unit': 'Unit kosong',
  'Under-Market Lease': 'Sewa bawah pasaran',
  'Idle Land': 'Tanah tidak produktif',
  'Low Utilisation': 'Penggunaan rendah',
}

const KIND_COLOR: Record<OpportunityKind, string> = {
  'Vacant Unit': 'var(--chart-1)',
  'Under-Market Lease': 'var(--chart-2)',
  'Idle Land': 'var(--chart-3)',
  'Low Utilisation': 'var(--chart-4)',
}

const kindConfig = {
  upliftAnnual: { label: 'Peluang tahunan', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function MonetisationTab({ scope }: { scope: PropertyScope }) {
  const [kind, setKind] = useState<OpportunityKind | 'all'>('all')

  const result = useMemo(
    () => buildOpportunities(scope.units, scope.leases, scope.assets, scope.now),
    [scope.units, scope.leases, scope.assets, scope.now],
  )

  const rows = useMemo(
    () => (kind === 'all' ? result.rows : result.rows.filter((r) => r.kind === kind)),
    [result.rows, kind],
  )

  const chartData = useMemo(
    () =>
      result.byKind
        .filter((k) => k.upliftAnnual > 0)
        .map((k) => ({ ...k, label: KIND_LABEL[k.kind], fill: KIND_COLOR[k.kind] })),
    [result.byKind],
  )

  const upliftVsCurrent =
    result.currentAnnualisedRevenue > 0
      ? (result.totalUpliftAnnual / result.currentAnnualisedRevenue) * 100
      : 0

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error('Tiada peluang untuk dieksport.')
      return
    }
    downloadCsv(
      `kdh-revenue-opportunities-${new Date().toISOString().slice(0, 10)}`,
      rows.map((r) => ({
        Kategori: KIND_LABEL[r.kind],
        Subjek: r.subject,
        Rujukan: r.reference,
        Zon: r.zone,
        Asas: r.basis,
        'Hasil Semasa (RM/tahun)': r.currentAnnual,
        'Hasil Berpotensi (RM/tahun)': r.potentialAnnual,
        'Kenaikan (RM/tahun)': r.upliftAnnual,
        'Tempoh Realisasi (hari)': r.captureInDays,
        Tindakan: r.action,
      })),
    )
    toast.success(`${rows.length} peluang hasil dieksport`)
  }

  return (
    <div className="space-y-4">
      {/* ------------- headline ------------- */}
      <div className="overflow-hidden rounded-xl border border-primary/25 bg-primary/5">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary"
              >
                <SparklesIcon className="size-3.5" />
              </span>
              <p className="text-xs font-medium tracking-wide text-primary uppercase">
                Peluang hasil dikenal pasti
              </p>
            </div>
            <p className="mt-3 text-3xl leading-none font-semibold tracking-tight text-foreground tabular-nums sm:text-4xl">
              {formatMYR(result.totalUpliftAnnual)}
              <span className="ml-2 text-base font-normal text-muted-foreground">setahun</span>
            </p>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Diperoleh terus daripada {formatNumber(result.rows.length)} baris dalam daftar aset dan buku
              pajakan KDH — bukan anggaran. Bersamaan{' '}
              <span className="font-medium text-foreground tabular-nums">{formatPct(upliftVsCurrent, 1)}</span>{' '}
              tambahan kepada hasil tahunan semasa{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatMYR(result.currentAnnualisedRevenue)}
              </span>
              .
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 lg:w-[26rem]">
            {result.byKind.map((k) => {
              const Icon = KIND_ICON[k.kind]
              return (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => setKind((current) => (current === k.kind ? 'all' : k.kind))}
                  className={cn(
                    'rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40',
                    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                    kind === k.kind ? 'border-primary/50' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-xs text-muted-foreground">{KIND_LABEL[k.kind]}</span>
                  </div>
                  <p className="mt-1.5 text-lg leading-none font-semibold tabular-nums">
                    {formatMYRCompact(k.upliftAnnual)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {k.count} baris · {formatPct(k.sharePct, 0)}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Peluang Mengikut Kategori"
          description="Nilai tahunan yang boleh direalisasikan"
          icon={SparklesIcon}
          className="xl:col-span-2"
        >
          {chartData.length === 0 ? (
            <EmptyState icon={SparklesIcon} title="Tiada peluang dikenal pasti dalam saringan ini" />
          ) : (
            <ChartContainer config={kindConfig} className="aspect-auto h-64 w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatMYRCompact(v)}
                />
                <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const row = item.payload as (typeof chartData)[number]
                        return (
                          <span className="flex w-full justify-between gap-4">
                            <span className="text-muted-foreground">{row.count} baris</span>
                            <span className="font-mono font-medium tabular-nums">
                              {formatMYR(Number(value))}/tahun
                            </span>
                          </span>
                        )
                      }}
                    />
                  }
                />
                <Bar dataKey="upliftAnnual" radius={[0, 4, 4, 0]} maxBarSize={34}>
                  {chartData.map((d) => (
                    <Cell key={d.kind} fill={d.fill} />
                  ))}
                  <LabelList
                    dataKey="upliftAnnual"
                    position="right"
                    className="fill-muted-foreground"
                    fontSize={11}
                    formatter={(v) => formatMYRCompact(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Asas Pengiraan"
          description="Setiap angka boleh diaudit kembali kepada data"
          icon={GaugeIcon}
        >
          <dl className="space-y-3 text-sm">
            <Basis
              term="Unit kosong"
              detail="Keluasan boleh sewa unit × kadar pasaran unit itu sendiri × 12 bulan."
            />
            <Basis
              term="Sewa bawah pasaran"
              detail="Kadar kontrak semasa dibandingkan dengan kadar pasaran unit; hanya jurang melebihi 2% dikira, boleh direalisasikan pada pembaharuan."
            />
            <Basis
              term="Tanah tidak produktif"
              detail={`Nilai semasa parsel melahu × ${result.landYieldPct.toFixed(2)}% — hasil sebenar yang dijana oleh bank tanah KDH yang aktif hari ini.`}
            />
            <Basis
              term="Penggunaan rendah"
              detail={`Aset di bawah kuartil atas penggunaan (${result.utilisationTarget.toFixed(0)}%); kenaikan dihadkan pada 50% kadar hasil semasa supaya angka kekal konservatif.`}
            />
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        title="Daftar Peluang Hasil"
        description={`${rows.length} baris · ${formatMYR(rows.reduce((s, r) => s + r.upliftAnnual, 0))} setahun`}
        icon={ArrowUpRightIcon}
        contentClassName="p-0"
        actions={
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={kind === 'all' ? 'default' : 'outline'}
                onClick={() => setKind('all')}
              >
                Semua
              </Button>
              {OPPORTUNITY_KINDS.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={kind === k ? 'default' : 'outline'}
                  onClick={() => setKind(k)}
                >
                  {KIND_LABEL[k]}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <DownloadIcon aria-hidden="true" />
              CSV
            </Button>
          </>
        }
      >
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={SparklesIcon}
              title="Tiada peluang dalam kategori ini"
              description="Pilih kategori lain atau longgarkan penapis zon."
            />
          </div>
        ) : (
          <div className="max-h-[34rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Subjek</TableHead>
                  <TableHead>Asas pengiraan</TableHead>
                  <TableHead className="text-right">Hasil semasa</TableHead>
                  <TableHead className="text-right">Hasil berpotensi</TableHead>
                  <TableHead className="text-right">Kenaikan/tahun</TableHead>
                  <TableHead>Tindakan disyorkan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const Icon = KIND_ICON[r.kind]
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="outline" className="gap-1.5 text-xs whitespace-nowrap">
                          <Icon className="size-3" aria-hidden="true" />
                          {KIND_LABEL[r.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-64 truncate font-medium">{r.subject}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.reference} · {r.zone}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-72 truncate text-xs text-muted-foreground">
                          {r.basis}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {r.currentAnnual > 0 ? formatMYR(r.currentAnnual) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatMYR(r.potentialAnnual)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-primary tabular-nums">
                        +{formatMYR(r.upliftAnnual)}
                      </TableCell>
                      <TableCell>
                        <span className="block text-xs">{r.action}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {r.captureInDays === 0
                            ? 'Boleh dilaksana segera'
                            : `Realisasi dalam ~${formatNumber(r.captureInDays)} hari`}
                        </span>
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

function Basis({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <dt className="text-xs font-semibold text-foreground">{term}</dt>
      <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</dd>
    </div>
  )
}
