import { useMemo } from 'react'
import { CompassIcon, MapPinIcon, ScrollTextIcon } from 'lucide-react'

import { DetailBlock, Field, FieldGrid } from '@/components/registry/detail/detail-parts'
import { Badge } from '@/components/ui/badge'
import { formatArea, formatDate, formatHectares, formatNumber } from '@/lib/format'
import {
  ISLANDS,
  LANDMASS,
  MAP_VIEWBOX,
  TOWNS,
  ZONE_GEOMETRY,
  formatLatLng,
  haversineKm,
  project,
  ringToPath,
} from '@/lib/geo'
import type { Asset } from '@/lib/types'

/** Half-width / half-height of the locator window in SVG user units. */
const WINDOW_W = 300
const WINDOW_H = 240

export function LocationTab({ asset }: { asset: Asset }) {
  const { lat, lng } = asset.location

  const nearbyTowns = useMemo(
    () =>
      TOWNS.map((t) => ({ town: t, km: haversineKm({ lat, lng }, { lat: t.lat, lng: t.lng }) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 5),
    [lat, lng],
  )

  const zoneGeometry = ZONE_GEOMETRY.find((z) => z.zone === asset.location.zone)

  const viewBox = useMemo(() => {
    const p = project(lat, lng)
    const x = Math.min(Math.max(p.x - WINDOW_W / 2, 0), Math.max(0, MAP_VIEWBOX.width - WINDOW_W))
    const y = Math.min(Math.max(p.y - WINDOW_H / 2, 0), Math.max(0, MAP_VIEWBOX.height - WINDOW_H))
    return { x, y, marker: p }
  }, [lat, lng])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <DetailBlock title="Site" icon={MapPinIcon} className="lg:col-span-3">
          <FieldGrid className="sm:grid-cols-2">
            <Field label="Zone" value={asset.location.zone} />
            <Field label="Town / Bandar" value={asset.location.town} />
            <Field label="District / Daerah" value={asset.location.district} />
            <Field label="State" value="Johor Darul Ta'zim" />
            <Field label="Address" value={asset.location.address} className="col-span-2" />
            <Field label="Coordinates" value={formatLatLng(lat, lng)} mono />
            <Field label="Decimal degrees" value={`${lat.toFixed(6)}, ${lng.toFixed(6)}`} mono />
          </FieldGrid>

          <div className="mt-4">
            <p className="mb-2 text-[0.68rem] font-medium tracking-wide text-muted-foreground uppercase">
              Nearest settlements
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {nearbyTowns.map(({ town, km }) => (
                <li key={town.name}>
                  <Badge variant="outline" className="gap-1.5 font-normal">
                    {town.name}
                    <span className="font-mono text-[0.65rem] text-muted-foreground">{formatNumber(km, 1)} km</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </DetailBlock>

        <DetailBlock
          title="Locator"
          icon={CompassIcon}
          description={zoneGeometry ? `${zoneGeometry.short} · ${zoneGeometry.district}` : asset.location.zone}
          className="lg:col-span-2"
        >
          <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <svg
              viewBox={`${viewBox.x} ${viewBox.y} ${WINDOW_W} ${WINDOW_H}`}
              className="h-48 w-full"
              role="img"
              aria-label={`Locator map showing ${asset.name} near ${asset.location.town}`}
            >
              <path d={ringToPath(LANDMASS)} className="fill-muted stroke-border" strokeWidth={1.5} />
              {ISLANDS.map((island) => (
                <path
                  key={island.name}
                  d={ringToPath(island.ring)}
                  className="fill-muted stroke-border"
                  strokeWidth={1}
                />
              ))}

              {ZONE_GEOMETRY.map((zone) => (
                <path
                  key={zone.zone}
                  d={ringToPath(zone.ring)}
                  className={
                    zone.zone === asset.location.zone
                      ? 'fill-primary/15 stroke-primary'
                      : 'fill-transparent stroke-border'
                  }
                  strokeWidth={zone.zone === asset.location.zone ? 2 : 1}
                  strokeDasharray={zone.zone === asset.location.zone ? undefined : '4 4'}
                />
              ))}

              {nearbyTowns.map(({ town }) => {
                const p = project(town.lat, town.lng)
                return (
                  <g key={town.name}>
                    <circle cx={p.x} cy={p.y} r={2.5} className="fill-muted-foreground" />
                    <text
                      x={p.x + 6}
                      y={p.y + 4}
                      className="fill-muted-foreground"
                      style={{ fontSize: 12 }}
                    >
                      {town.name}
                    </text>
                  </g>
                )
              })}

              <circle cx={viewBox.marker.x} cy={viewBox.marker.y} r={11} className="fill-primary/25" />
              <circle
                cx={viewBox.marker.x}
                cy={viewBox.marker.y}
                r={5}
                className="fill-primary stroke-background"
                strokeWidth={2}
              />
            </svg>
          </div>
          <p className="mt-2 font-mono text-[0.68rem] text-muted-foreground">{formatLatLng(lat, lng)}</p>
        </DetailBlock>
      </div>

      <DetailBlock
        title="Land title"
        icon={ScrollTextIcon}
        description="Hakmilik tanah as recorded with the Pejabat Tanah"
      >
        {asset.landTitle ? (
          <FieldGrid>
            <Field label="Title no." value={asset.landTitle.titleNo} mono />
            <Field label="Lot no." value={asset.landTitle.lotNo} mono />
            <Field label="Mukim" value={asset.landTitle.mukim} />
            <Field label="Tenure" value={asset.landTitle.tenure} />
            <Field
              label="Lease expiry"
              value={asset.landTitle.leaseExpiry ? formatDate(asset.landTitle.leaseExpiry) : 'Perpetual (freehold)'}
            />
            <Field label="Area" value={formatHectares(asset.landTitle.areaHectares)} />
            <Field
              label="Area (acres)"
              value={`${formatNumber(asset.landTitle.areaHectares * 2.47105, 2)} ac`}
            />
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground">
            No land title is attached to this record. Assets held on another party's land, plant and ICT items
            typically have none — otherwise the geran should be uploaded to close the data gap.
          </p>
        )}
      </DetailBlock>

      {asset.building && (
        <DetailBlock title="Building schedule" icon={MapPinIcon}>
          <FieldGrid>
            <Field label="Gross floor area" value={formatArea(asset.building.grossFloorAreaSqft)} />
            <Field label="Lettable area" value={formatArea(asset.building.lettableAreaSqft)} />
            <Field
              label="Efficiency"
              value={`${formatNumber(
                (asset.building.lettableAreaSqft / (asset.building.grossFloorAreaSqft || 1)) * 100,
                1,
              )}%`}
            />
            <Field label="Floors" value={formatNumber(asset.building.floors)} />
            <Field label="Year built" value={formatNumber(asset.building.yearBuilt)} />
            <Field
              label="Building age"
              value={`${formatNumber(new Date().getFullYear() - asset.building.yearBuilt)} years`}
            />
          </FieldGrid>
        </DetailBlock>
      )}
    </div>
  )
}
