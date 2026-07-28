import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRightIcon,
  BuildingIcon,
  ClipboardListIcon,
  CrosshairIcon,
  ExternalLinkIcon,
  MapPinnedIcon,
  TargetIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Asset } from '@/lib/types'
import { formatArea, formatDate, formatMYR, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { formatLatLng, haversineKm } from '@/lib/geo'
import { isLiveLease, isOpenWorkOrder } from '@/lib/analytics'
import { useAppStore } from '@/store/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/common/status-badge'
import { EmptyState } from '@/components/common/empty-state'
import { cn } from '@/lib/utils'
import type { PlacedAsset } from '@/components/map/map-geometry'
import { assetColor, type ColorMode, type ValueBand } from '@/components/map/map-theme'

function Fact({
  label,
  value,
  mono,
  title,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  title?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn('mt-0.5 truncate text-xs font-medium text-foreground', mono && 'font-mono')}
        title={title}
      >
        {value}
      </dd>
    </div>
  )
}

export interface AssetInspectorProps {
  asset: Asset
  color: string
  onClose: () => void
  onZoomTo: () => void
  onRadiusFromHere: () => void
}

export function AssetInspector({
  asset,
  color,
  onClose,
  onZoomTo,
  onRadiusFromHere,
}: AssetInspectorProps) {
  const navigate = useNavigate()
  const workOrders = useAppStore((s) => s.workOrders)
  const units = useAppStore((s) => s.units)
  const leases = useAppStore((s) => s.leases)

  const openWos = useMemo(
    () => workOrders.filter((w) => w.assetId === asset.id && isOpenWorkOrder(w)),
    [workOrders, asset.id],
  )
  const assetUnits = useMemo(() => units.filter((u) => u.assetId === asset.id), [units, asset.id])
  const assetLeases = useMemo(
    () => leases.filter((l) => l.assetId === asset.id),
    [leases, asset.id],
  )
  const liveLeases = assetLeases.filter(isLiveLease)
  const occupied = assetUnits.filter((u) => u.status === 'Occupied').length
  const monthlyRent = liveLeases.reduce((s, l) => s + l.monthlyRent, 0)
  const arrears = assetLeases.reduce((s, l) => s + l.outstandingAmount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 rounded-full ring-2 ring-card"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted-foreground">{asset.code}</p>
            <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={asset.name}>
              {asset.name}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close asset inspector">
          <XIcon className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3.5 p-3">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={asset.status} />
            <StatusBadge status={asset.condition} />
            <Badge variant="outline" className="gap-1 font-normal">
              {asset.category}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
            <Fact label="Sub-category" value={asset.subCategory} />
            <Fact label="Criticality" value={asset.criticality} />
            <Fact
              label="Current value"
              value={formatMYRCompact(asset.currentValue)}
              mono
              title={formatMYR(asset.currentValue)}
            />
            <Fact
              label="Net book value"
              value={formatMYRCompact(asset.netBookValue)}
              mono
              title={formatMYR(asset.netBookValue)}
            />
            <Fact label="Condition score" value={`${asset.conditionScore}/100`} mono />
            <Fact label="Utilisation" value={formatPct(asset.utilisationRate, 0)} mono />
            <Fact label="Risk score" value={`${asset.riskScore}/100`} mono />
            <Fact label="Data quality" value={`${asset.dataQualityScore}%`} mono />
          </dl>

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <MapPinnedIcon className="size-3.5" aria-hidden="true" />
              Location
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Fact label="Zone" value={asset.location.zone} title={asset.location.zone} />
              <Fact label="Town" value={asset.location.town} />
              <Fact label="District" value={asset.location.district} />
              <Fact label="Custodian" value={asset.custodianName} title={asset.custodianName} />
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Coordinates
                </dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-foreground">
                  {formatLatLng(asset.location.lat, asset.location.lng)}
                </dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Address
                </dt>
                <dd className="mt-0.5 text-xs text-foreground">{asset.location.address}</dd>
              </div>
            </dl>
          </div>

          {(asset.landTitle || asset.building) && (
            <>
              <Separator />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                {asset.landTitle && (
                  <>
                    <Fact label="Lot no." value={asset.landTitle.lotNo} mono />
                    <Fact label="Mukim" value={asset.landTitle.mukim} />
                    <Fact label="Tenure" value={asset.landTitle.tenure} />
                    <Fact
                      label="Land area"
                      value={`${formatNumber(asset.landTitle.areaHectares, 2)} ha`}
                      mono
                    />
                  </>
                )}
                {asset.building && (
                  <>
                    <Fact label="Lettable area" value={formatArea(asset.building.lettableAreaSqft)} mono />
                    <Fact label="Year built" value={asset.building.yearBuilt} mono />
                  </>
                )}
              </dl>
            </>
          )}

          {/* ------------------- occupancy ------------------- */}
          {assetUnits.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <BuildingIcon className="size-3.5" aria-hidden="true" />
                  Occupancy & leasing
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
                  <Fact label="Units" value={`${occupied} / ${assetUnits.length} occupied`} />
                  <Fact label="Live leases" value={formatNumber(liveLeases.length)} mono />
                  <Fact
                    label="Monthly rent"
                    value={formatMYRCompact(monthlyRent)}
                    mono
                    title={formatMYR(monthlyRent)}
                  />
                  <Fact
                    label="Arrears"
                    value={arrears > 0 ? formatMYRCompact(arrears) : '—'}
                    mono
                    title={formatMYR(arrears)}
                  />
                </div>
                {liveLeases.length > 0 && (
                  <ul className="space-y-1">
                    {liveLeases.slice(0, 4).map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11.5px] font-medium text-foreground">
                            {l.tenantName}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {l.unitNo} · exp {formatDate(l.endDate)}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-foreground tabular-nums">
                          {formatMYRCompact(l.monthlyRent)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ------------------- work orders ------------------- */}
          <Separator />
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <ClipboardListIcon className="size-3.5" aria-hidden="true" />
              Open work orders ({openWos.length})
            </p>
            {openWos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-3 text-center text-[11.5px] text-muted-foreground">
                No open work orders on this asset.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {openWos.slice(0, 5).map((w) => (
                  <li key={w.id} className="rounded-md border border-border px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] text-muted-foreground">{w.code}</span>
                      <StatusBadge status={w.slaStatus} className="px-1.5 py-0 text-[10px]" />
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] font-medium text-foreground" title={w.title}>
                      {w.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                      <span className="truncate">{w.assignedTo}</span>
                      <span className="shrink-0">{w.priority}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {asset.notes && (
            <>
              <Separator />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground italic">
                {asset.notes}
              </p>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-2.5">
        <Button
          size="sm"
          className="col-span-2 gap-2"
          onClick={() => navigate(`/registry?asset=${asset.id}`)}
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          Open in Registry
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            toast.info(`Raising a work order for ${asset.code}`, {
              description: asset.name,
            })
            navigate(`/maintenance?new=1&asset=${asset.id}`)
          }}
        >
          <WrenchIcon className="size-3.5" aria-hidden="true" />
          Work order
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onZoomTo}>
          <CrosshairIcon className="size-3.5" aria-hidden="true" />
          Zoom to
        </Button>
        <Button variant="ghost" size="sm" className="col-span-2 gap-1.5" onClick={onRadiusFromHere}>
          <TargetIcon className="size-3.5" aria-hidden="true" />
          Search around this asset
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Proximity results                                                   */
/* ------------------------------------------------------------------ */

export interface RadiusResultsProps {
  centre: { lat: number; lng: number }
  radiusKm: number
  items: PlacedAsset[]
  colorMode: ColorMode
  bands: ValueBand[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function RadiusResults({
  centre,
  radiusKm,
  items,
  colorMode,
  bands,
  onSelect,
  onClose,
}: RadiusResultsProps) {
  const rows = useMemo(
    () =>
      items
        .map((p) => ({
          p,
          km: haversineKm(centre, { lat: p.asset.location.lat, lng: p.asset.location.lng }),
        }))
        .sort((a, b) => a.km - b.km),
    [items, centre],
  )
  const totalValue = rows.reduce((s, r) => s + r.p.asset.currentValue, 0)
  const totalNbv = rows.reduce((s, r) => s + r.p.asset.netBookValue, 0)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground">Proximity results</p>
          <p className="truncate font-mono text-[10.5px] text-muted-foreground">
            {radiusKm} km of {formatLatLng(centre.lat, centre.lng)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Clear proximity search">
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2.5">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Assets</p>
          <p className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {formatNumber(rows.length)}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Value</p>
          <p
            className="font-mono text-sm font-semibold text-foreground tabular-nums"
            title={formatMYR(totalValue)}
          >
            {formatMYRCompact(totalValue)}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">NBV</p>
          <p
            className="font-mono text-sm font-semibold text-foreground tabular-nums"
            title={formatMYR(totalNbv)}
          >
            {formatMYRCompact(totalNbv)}
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={TargetIcon}
              title="Nothing in range"
              description="Widen the radius or drop the centre closer to a cluster of assets."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ p, km }) => (
              <li key={p.asset.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.asset.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/50"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: assetColor(p.asset, colorMode, bands) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.asset.code}
                      </span>
                      <span className="font-mono text-[10px] text-primary tabular-nums">
                        {km.toFixed(1)} km
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] font-medium text-foreground">
                      {p.asset.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                      {p.asset.location.town} · {formatMYRCompact(p.asset.currentValue)}
                    </span>
                  </span>
                  <ArrowUpRightIcon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
