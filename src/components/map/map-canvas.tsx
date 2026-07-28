import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CrosshairIcon,
  MaximizeIcon,
  MinusIcon,
  MoveIcon,
  PlusIcon,
  TargetIcon,
} from 'lucide-react'
import { formatLatLng, project, unproject } from '@/lib/geo'
import type { Zone } from '@/lib/types'
import { formatMYRCompact } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ISLAND_PATHS,
  LAND_PATH,
  PROJECTED_TOWNS,
  PROJECTED_ZONES,
  buildClusters,
  buildHeat,
  graticuleLines,
  kmPerUnitAt,
  kmRadiusToUnits,
  niceScaleKm,
  pointInRect,
  type AssetCluster,
  type PlacedAsset,
} from '@/components/map/map-geometry'
import {
  assetColor,
  assetDimension,
  pinRadiusPx,
  type ColorMode,
  type ValueBand,
} from '@/components/map/map-theme'
import type { MapViewport } from '@/components/map/use-map-viewport'
import type { LayerState } from '@/components/map/map-layers'

/** Nominal cluster cell edge, in CSS pixels. */
const CLUSTER_CELL_PX = 46

export interface MapCanvasProps {
  placed: PlacedAsset[]
  viewport: MapViewport
  layers: LayerState
  colorMode: ColorMode
  bands: ValueBand[]
  heatMetric: 'value' | 'risk'
  selectedId: string | null
  onSelect: (id: string | null) => void
  activeZones: Zone[]
  onToggleZone: (zone: Zone) => void
  radiusMode: boolean
  radiusCentre: { lat: number; lng: number } | null
  radiusKm: number
  radiusIds: Set<string>
  onPickCentre: (p: { lat: number; lng: number }) => void
  statsSlot?: ReactNode
}

interface HoverPin {
  placed: PlacedAsset
  color: string
}

function dominantColor(items: PlacedAsset[], mode: ColorMode, bands: ValueBand[]): string {
  const tally = new Map<string, number>()
  for (const it of items) {
    const c = assetColor(it.asset, mode, bands)
    tally.set(c, (tally.get(c) ?? 0) + 1)
  }
  let best = 'var(--chart-1)'
  let bestN = -1
  tally.forEach((n, c) => {
    if (n > bestN) {
      bestN = n
      best = c
    }
  })
  return best
}

/**
 * Scoped map palette. Sea, land and coastline need their own values in each
 * theme (land must stay lighter than water in both), and there is no token for
 * that — so they are derived from tokens here rather than hardcoded.
 */
const MAP_CSS = `
.kdh-map{
  --map-sea: color-mix(in oklch, var(--secondary) 86%, var(--foreground));
  --map-sea-deep: color-mix(in oklch, var(--secondary) 70%, var(--foreground));
  --map-land: var(--card);
  --map-coast: color-mix(in oklch, var(--foreground) 34%, var(--card));
  --map-grid: color-mix(in oklch, var(--foreground) 22%, transparent);
  --map-halo: var(--card);
}
.dark .kdh-map{
  --map-sea: color-mix(in oklch, var(--background) 88%, var(--muted));
  --map-sea-deep: color-mix(in oklch, var(--background) 97%, var(--foreground));
  --map-land: color-mix(in oklch, var(--card) 84%, var(--foreground));
  --map-coast: color-mix(in oklch, var(--foreground) 46%, var(--card));
  --map-grid: color-mix(in oklch, var(--foreground) 26%, transparent);
  --map-halo: color-mix(in oklch, var(--card) 84%, var(--foreground));
}
@keyframes kdh-pin-pulse{
  0%{ transform: scale(1); opacity:.5 }
  70%{ transform: scale(2.6); opacity:0 }
  100%{ transform: scale(2.6); opacity:0 }
}
.kdh-pin-pulse{ animation: kdh-pin-pulse 2.1s ease-out infinite; transform-box: fill-box; transform-origin: center }
@media (prefers-reduced-motion: reduce){ .kdh-pin-pulse{ animation: none; opacity:.3 } }
`

export function MapCanvas({
  placed,
  viewport,
  layers,
  colorMode,
  bands,
  heatMetric,
  selectedId,
  onSelect,
  activeZones,
  onToggleZone,
  radiusMode,
  radiusCentre,
  radiusKm,
  radiusIds,
  onPickCentre,
  statsSlot,
}: MapCanvasProps) {
  const { containerRef, rect, viewBox, px, zoom, view, ready } = viewport

  const [hoverPin, setHoverPin] = useState<HoverPin | null>(null)
  const [hoverZone, setHoverZone] = useState<Zone | null>(null)
  const [dragging, setDragging] = useState(false)
  const coordRef = useRef<HTMLSpanElement | null>(null)

  /** Latest viewport, so effects/handlers never need it as a dependency. */
  const vpRef = useRef(viewport)
  vpRef.current = viewport

  const dragRef = useRef<{
    id: number
    startX: number
    startY: number
    startCx: number
    startCy: number
    scale: number
    moved: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ cx: number; cy: number } | null>(null)

  /* ------------------------- derived geometry ------------------------- */

  const cellSize = layers.clusters ? CLUSTER_CELL_PX * px : 0
  const clusters = useMemo(() => buildClusters(placed, cellSize), [placed, cellSize])
  const heat = useMemo(
    () => (layers.heatmap ? buildHeat(placed, heatMetric) : []),
    [layers.heatmap, placed, heatMetric],
  )
  const grat = useMemo(
    () => (layers.graticule ? graticuleLines(rect) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers.graticule, rect.x, rect.y, rect.w, rect.h],
  )

  const selectedPlaced = useMemo(
    () => (selectedId ? (placed.find((p) => p.asset.id === selectedId) ?? null) : null),
    [placed, selectedId],
  )

  const kmPerUnit = useMemo(() => kmPerUnitAt(view.cx, view.cy), [view.cx, view.cy])
  const scaleKm = niceScaleKm(Math.max(0.5, 130 * px * kmPerUnit))
  const scaleWidthPx = Math.min(220, Math.max(44, scaleKm / kmPerUnit / px))

  const radiusRing = useMemo(() => {
    if (!radiusCentre) return null
    const c = project(radiusCentre.lat, radiusCentre.lng)
    const { rx, ry } = kmRadiusToUnits(radiusKm, radiusCentre.lat)
    return { cx: c.x, cy: c.y, rx, ry }
  }, [radiusCentre, radiusKm])

  /* --------------------------- interaction --------------------------- */

  const flushPan = useCallback(() => {
    rafRef.current = null
    const next = pendingRef.current
    if (!next) return
    pendingRef.current = null
    vpRef.current.setView((v) => ({ ...v, cx: next.cx, cy: next.cy }))
  }, [])

  const updateCoordReadout = useCallback((clientX: number, clientY: number) => {
    const node = coordRef.current
    if (!node) return
    const u = vpRef.current.clientToUser(clientX, clientY)
    const g = unproject(u.x, u.y)
    node.textContent = formatLatLng(g.lat, g.lng)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const vp = vpRef.current
      dragRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCx: vp.view.cx,
        startCy: vp.view.cy,
        scale: vp.px,
        moved: 0,
      }
      setDragging(true)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      updateCoordReadout(e.clientX, e.clientY)
      const d = dragRef.current
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy))
      pendingRef.current = { cx: d.startCx - dx * d.scale, cy: d.startCy - dy * d.scale }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushPan)
    },
    [flushPan, updateCoordReadout],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      if (!d || d.moved > 5) return

      if (radiusMode) {
        const u = vpRef.current.clientToUser(e.clientX, e.clientY)
        onPickCentre(unproject(u.x, u.y))
        return
      }

      const hit = (e.target as Element).closest('[data-kind]') as HTMLElement | null
      if (!hit) {
        onSelect(null)
        return
      }
      const kind = hit.dataset.kind
      if (kind === 'pin' && hit.dataset.id) {
        onSelect(hit.dataset.id)
      } else if (kind === 'cluster' && hit.dataset.key) {
        const key = hit.dataset.key
        const c = clusters.find((cl) => cl.key === key)
        if (!c) return
        if (c.items.length === 1) onSelect(c.items[0].asset.id)
        else
          vpRef.current.fitBbox({
            x: c.bbox.x,
            y: c.bbox.y,
            w: Math.max(c.bbox.w, 26),
            h: Math.max(c.bbox.h, 26),
          })
      } else if (kind === 'zone' && hit.dataset.zone) {
        onToggleZone(hit.dataset.zone as Zone)
      }
    },
    [clusters, onPickCentre, onSelect, onToggleZone, radiusMode],
  )

  const handlePointerOver = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const hit = (e.target as Element).closest('[data-kind]') as HTMLElement | null
      if (!hit) {
        setHoverPin(null)
        setHoverZone(null)
        return
      }
      if (hit.dataset.kind === 'pin' && hit.dataset.id) {
        const id = hit.dataset.id
        const p = placed.find((pl) => pl.asset.id === id)
        setHoverPin(p ? { placed: p, color: assetColor(p.asset, colorMode, bands) } : null)
        setHoverZone(null)
        return
      }
      setHoverPin(null)
      setHoverZone(hit.dataset.kind === 'zone' ? ((hit.dataset.zone ?? null) as Zone | null) : null)
    },
    [bands, colorMode, placed],
  )

  // Wheel is registered natively so it can preventDefault (React's is passive).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      vpRef.current.zoomBy(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const vp = vpRef.current
      const step = 64
      if (e.key === '+' || e.key === '=') vp.zoomBy(1.35)
      else if (e.key === '-' || e.key === '_') vp.zoomBy(1 / 1.35)
      else if (e.key === '0') vp.reset()
      else if (e.key === 'ArrowLeft') vp.panByPixels(step, 0)
      else if (e.key === 'ArrowRight') vp.panByPixels(-step, 0)
      else if (e.key === 'ArrowUp') vp.panByPixels(0, step)
      else if (e.key === 'ArrowDown') vp.panByPixels(0, -step)
      else if (e.key === 'Escape') onSelect(null)
      else return
      e.preventDefault()
    },
    [onSelect],
  )

  /* ----------------------------- render ------------------------------ */

  const pad = 90 * px
  const visibleClusters = layers.pins
    ? clusters.filter((c) => pointInRect(c.x, c.y, rect, pad))
    : []

  const activeZoneSet = useMemo(() => new Set(activeZones), [activeZones])
  const dimOthers = radiusIds.size > 0
  const hoverAt = hoverPin
    ? { left: (hoverPin.placed.x - rect.x) / px, top: (hoverPin.placed.y - rect.y) / px }
    : null

  return (
    <div
      ref={containerRef}
      className={cn(
        'kdh-map relative size-full min-h-0 overflow-hidden rounded-xl border border-border bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        radiusMode ? 'cursor-crosshair' : dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      tabIndex={0}
      role="application"
      aria-label="KEJORA regional asset map — drag to pan, scroll to zoom, arrow keys to move, plus and minus to zoom"
      onKeyDown={handleKeyDown}
    >
      <style>{MAP_CSS}</style>

      {ready && (
        <svg
          viewBox={viewBox}
          className="block size-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerOver={handlePointerOver}
          onPointerLeave={() => {
            setHoverPin(null)
            setHoverZone(null)
          }}
        >
          <defs>
            <linearGradient id="kdh-sea" x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor="var(--map-sea)" />
              <stop offset="100%" stopColor="var(--map-sea-deep)" />
            </linearGradient>
            <radialGradient id="kdh-heat-value">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.85" />
              <stop offset="45%" stopColor="var(--chart-1)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="kdh-heat-risk">
              <stop offset="0%" stopColor="var(--destructive)" stopOpacity="0.85" />
              <stop offset="45%" stopColor="var(--destructive)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--destructive)" stopOpacity="0" />
            </radialGradient>
            <pattern
              id="kdh-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="8" height="8" fill="var(--primary)" opacity="0.1" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--primary)" strokeWidth="1.6" opacity="0.3" />
            </pattern>
          </defs>

          {/* sea */}
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="url(#kdh-sea)" />

          {/* landmass with a soft coastal halo */}
          <g pointerEvents="none">
            <path
              d={LAND_PATH}
              fill="none"
              stroke="var(--map-coast)"
              strokeWidth={14}
              opacity={0.09}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={LAND_PATH}
              fill="none"
              stroke="var(--map-coast)"
              strokeWidth={7}
              opacity={0.13}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={LAND_PATH}
              fill="var(--map-land)"
              stroke="var(--map-coast)"
              strokeWidth={1.1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {ISLAND_PATHS.map((i) => (
              <path
                key={i.name}
                d={i.d}
                fill="var(--map-land)"
                stroke="var(--map-coast)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* graticule */}
          {grat && (
            <g pointerEvents="none">
              {grat.lats.map((lat) => (
                <line
                  key={`lat-${lat}`}
                  x1={rect.x}
                  y1={project(lat, 0).y}
                  x2={rect.x + rect.w}
                  y2={project(lat, 0).y}
                  stroke="var(--map-grid)"
                  strokeWidth={0.6}
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {grat.lngs.map((lng) => (
                <line
                  key={`lng-${lng}`}
                  x1={project(0, lng).x}
                  y1={rect.y}
                  x2={project(0, lng).x}
                  y2={rect.y + rect.h}
                  stroke="var(--map-grid)"
                  strokeWidth={0.6}
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {layers.labels && (
                <g fontFamily="var(--font-mono)" fill="var(--muted-foreground)">
                  {grat.lats.map((lat) => (
                    <text
                      key={`latl-${lat}`}
                      x={rect.x + 8 * px}
                      y={project(lat, 0).y - 4 * px}
                      fontSize={9.5 * px}
                    >
                      {lat.toFixed(2)}°N
                    </text>
                  ))}
                  {grat.lngs.map((lng) => (
                    <text
                      key={`lngl-${lng}`}
                      x={project(0, lng).x + 4 * px}
                      y={rect.y + rect.h - 8 * px}
                      fontSize={9.5 * px}
                    >
                      {lng.toFixed(2)}°E
                    </text>
                  ))}
                </g>
              )}
            </g>
          )}

          {/* zones */}
          {layers.zones && (
            <g>
              {PROJECTED_ZONES.map((z) => {
                const active = activeZoneSet.has(z.zone)
                const hovered = hoverZone === z.zone
                return (
                  <path
                    key={z.zone}
                    d={z.d}
                    data-kind="zone"
                    data-zone={z.zone}
                    fill={active ? 'url(#kdh-hatch)' : 'var(--primary)'}
                    fillOpacity={active ? 1 : hovered ? 0.17 : 0.07}
                    stroke="var(--primary)"
                    strokeOpacity={active ? 0.9 : hovered ? 0.75 : 0.42}
                    strokeWidth={active ? 2 : 1.2}
                    strokeDasharray={active ? undefined : '7 5'}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${z.zone} — ${z.district}`}</title>
                  </path>
                )
              })}
            </g>
          )}

          {/* heat surface */}
          {layers.heatmap && heat.length > 0 && (
            <g pointerEvents="none">
              {heat.map((c) => (
                <circle
                  key={c.key}
                  cx={c.x}
                  cy={c.y}
                  r={44 + 88 * c.weight}
                  fill={heatMetric === 'value' ? 'url(#kdh-heat-value)' : 'url(#kdh-heat-risk)'}
                  opacity={0.18 + 0.5 * c.weight}
                />
              ))}
            </g>
          )}

          {/* proximity ring */}
          {radiusRing && (
            <g pointerEvents="none">
              <ellipse
                cx={radiusRing.cx}
                cy={radiusRing.cy}
                rx={radiusRing.rx}
                ry={radiusRing.ry}
                fill="var(--chart-2)"
                fillOpacity={0.1}
                stroke="var(--chart-2)"
                strokeWidth={1.6}
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={radiusRing.cx - 10 * px}
                y1={radiusRing.cy}
                x2={radiusRing.cx + 10 * px}
                y2={radiusRing.cy}
                stroke="var(--chart-2)"
                strokeWidth={1.8}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={radiusRing.cx}
                y1={radiusRing.cy - 10 * px}
                x2={radiusRing.cx}
                y2={radiusRing.cy + 10 * px}
                stroke="var(--chart-2)"
                strokeWidth={1.8}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {/* towns */}
          {layers.towns && (
            <g pointerEvents="none">
              {PROJECTED_TOWNS.map((t) => {
                const rr = (t.kind === 'hq' ? 4.6 : t.kind === 'growth-centre' ? 3.8 : 2.9) * px
                if (t.kind === 'hq') {
                  return (
                    <rect
                      key={t.name}
                      x={t.at.x - rr}
                      y={t.at.y - rr}
                      width={rr * 2}
                      height={rr * 2}
                      transform={`rotate(45 ${t.at.x} ${t.at.y})`}
                      fill="var(--map-land)"
                      stroke="var(--foreground)"
                      strokeWidth={1.7}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                }
                if (t.kind === 'growth-centre') {
                  return (
                    <g key={t.name}>
                      <circle
                        cx={t.at.x}
                        cy={t.at.y}
                        r={rr}
                        fill="var(--map-land)"
                        stroke="var(--foreground)"
                        strokeWidth={1.4}
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle cx={t.at.x} cy={t.at.y} r={rr * 0.4} fill="var(--foreground)" />
                    </g>
                  )
                }
                if (t.kind === 'coastal') {
                  return (
                    <path
                      key={t.name}
                      d={`M${t.at.x},${t.at.y - rr}L${t.at.x + rr},${t.at.y + rr * 0.82}L${t.at.x - rr},${t.at.y + rr * 0.82}Z`}
                      fill="var(--map-land)"
                      stroke="var(--foreground)"
                      strokeWidth={1.3}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                }
                return (
                  <circle
                    key={t.name}
                    cx={t.at.x}
                    cy={t.at.y}
                    r={rr * 0.74}
                    fill="var(--muted-foreground)"
                  />
                )
              })}
            </g>
          )}

          {/* asset pins & clusters */}
          {layers.pins && (
            <g>
              {visibleClusters.map((c) =>
                c.items.length > 1 ? (
                  <ClusterBubble
                    key={c.key}
                    cluster={c}
                    px={px}
                    color={dominantColor(c.items, colorMode, bands)}
                  />
                ) : (
                  <AssetPin
                    key={c.items[0].asset.id}
                    item={c.items[0]}
                    px={px}
                    color={assetColor(c.items[0].asset, colorMode, bands)}
                    inRadius={radiusIds.has(c.items[0].asset.id)}
                    dimmed={dimOthers && !radiusIds.has(c.items[0].asset.id)}
                  />
                ),
              )}
            </g>
          )}

          {/* selected emphasis */}
          {selectedPlaced && (
            <g pointerEvents="none">
              <circle
                className="kdh-pin-pulse"
                cx={selectedPlaced.x}
                cy={selectedPlaced.y}
                r={9 * px}
                fill="var(--primary)"
              />
              <circle
                cx={selectedPlaced.x}
                cy={selectedPlaced.y}
                r={11 * px}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={selectedPlaced.x}
                cy={selectedPlaced.y}
                r={4.6 * px}
                fill="var(--primary)"
                stroke="var(--map-halo)"
                strokeWidth={1.7}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {/* labels */}
          {layers.labels && (
            <g pointerEvents="none">
              {layers.zones &&
                PROJECTED_ZONES.map((z) => (
                  <text
                    key={`zl-${z.zone}`}
                    x={z.label.x}
                    y={z.label.y}
                    textAnchor="middle"
                    fontSize={Math.min(15, 11.5 * Math.max(1, Math.sqrt(zoom))) * px}
                    fontWeight={600}
                    letterSpacing={0.7 * px}
                    fill="var(--primary)"
                    stroke="var(--map-halo)"
                    strokeWidth={3.4 * px}
                    style={{ paintOrder: 'stroke' }}
                  >
                    {z.short.toUpperCase()}
                  </text>
                ))}
              {layers.towns &&
                PROJECTED_TOWNS.filter((t) =>
                  t.kind === 'hq'
                    ? true
                    : t.kind === 'growth-centre'
                      ? zoom >= 1.05
                      : t.kind === 'coastal'
                        ? zoom >= 2.1
                        : zoom >= 1.7,
                ).map((t) => (
                  <text
                    key={`tl-${t.name}`}
                    x={t.at.x + 8 * px}
                    y={t.at.y + 3.6 * px}
                    fontSize={(t.kind === 'hq' ? 11.5 : 10.2) * px}
                    fontWeight={t.kind === 'hq' || t.kind === 'growth-centre' ? 600 : 500}
                    fill="var(--foreground)"
                    stroke="var(--map-halo)"
                    strokeWidth={3 * px}
                    style={{ paintOrder: 'stroke' }}
                  >
                    {t.name}
                  </text>
                ))}
              {zoom >= 2.4 &&
                ISLAND_PATHS.map((i) => (
                  <text
                    key={`il-${i.name}`}
                    x={i.at.x}
                    y={i.at.y - 9 * px}
                    textAnchor="middle"
                    fontSize={9.5 * px}
                    fontStyle="italic"
                    fill="var(--muted-foreground)"
                    stroke="var(--map-sea)"
                    strokeWidth={2.6 * px}
                    style={{ paintOrder: 'stroke' }}
                  >
                    {i.name}
                  </text>
                ))}
            </g>
          )}
        </svg>
      )}

      {/* ============================ overlays ============================ */}

      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
        <div className="rounded-lg border border-border bg-card/85 px-2.5 py-1.5 backdrop-blur-sm">
          <p className="text-[11px] font-semibold tracking-tight text-foreground">
            KEJORA Operational Region
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            WGS 84 · EPSG:4326 · stylised basemap
          </p>
        </div>
        {radiusMode && (
          <div className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary">
            <TargetIcon className="size-3.5" aria-hidden="true" />
            Click the map to drop a search centre
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => viewport.zoomBy(1.4)}
            aria-label="Zoom in"
          >
            <PlusIcon className="size-4" />
          </Button>
          <div className="h-px bg-border" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => viewport.zoomBy(1 / 1.4)}
            aria-label="Zoom out"
          >
            <MinusIcon className="size-4" />
          </Button>
          <div className="h-px bg-border" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none"
            onClick={() => viewport.reset()}
            aria-label="Reset view to full region"
          >
            <MaximizeIcon className="size-4" />
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-card/90 px-1.5 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
          {zoom.toFixed(1)}×
        </div>
      </div>

      {statsSlot && (
        <div className="absolute bottom-3 left-3 hidden max-h-[calc(100%_-_5.5rem)] w-[17rem] overflow-y-auto md:block">
          {statsSlot}
        </div>
      )}

      <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/85 px-2 py-1.5 backdrop-blur-sm">
          <CrosshairIcon className="size-3 text-muted-foreground" aria-hidden="true" />
          <span ref={coordRef} className="font-mono text-[10.5px] text-muted-foreground">
            Hover the map
          </span>
        </div>
        <div className="flex items-end gap-3 rounded-lg border border-border bg-card/85 px-2.5 py-2 backdrop-blur-sm">
          <NorthArrow />
          <div>
            <div className="flex items-end" style={{ width: scaleWidthPx }}>
              <div className="h-2 w-px bg-foreground/70" />
              <div className="h-px flex-1 bg-foreground/70" />
              <div className="h-2 w-px bg-foreground/70" />
            </div>
            <p className="mt-1 text-center font-mono text-[10px] text-muted-foreground">
              {scaleKm < 1 ? `${Math.round(scaleKm * 1000)} m` : `${scaleKm} km`}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/85 px-2.5 py-1 text-[10.5px] text-muted-foreground backdrop-blur-sm 2xl:flex">
        <MoveIcon className="size-3" aria-hidden="true" />
        Drag to pan · scroll to zoom · click a zone to filter
      </div>

      {hoverPin && hoverAt && (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover p-2.5 shadow-md"
          style={{ left: hoverAt.left, top: hoverAt.top - 14 }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: hoverPin.color }}
            />
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {hoverPin.placed.asset.code}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-snug font-medium text-popover-foreground">
            {hoverPin.placed.asset.name}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-muted-foreground">
              {assetDimension(hoverPin.placed.asset, colorMode, bands)}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-medium text-foreground">
              {formatMYRCompact(hoverPin.placed.asset.currentValue)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Marks                                                               */
/* ------------------------------------------------------------------ */

function AssetPin({
  item,
  px,
  color,
  inRadius,
  dimmed,
}: {
  item: PlacedAsset
  px: number
  color: string
  inRadius: boolean
  dimmed: boolean
}) {
  const r = pinRadiusPx(item.asset.currentValue) * px
  return (
    <g data-kind="pin" data-id={item.asset.id} style={{ cursor: 'pointer' }}>
      {inRadius && (
        <circle
          cx={item.x}
          cy={item.y}
          r={r + 3.6 * px}
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle
        cx={item.x}
        cy={item.y}
        r={r}
        fill={color}
        fillOpacity={dimmed ? 0.25 : 0.92}
        stroke="var(--map-halo)"
        strokeOpacity={dimmed ? 0.35 : 1}
        strokeWidth={1.3}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

function ClusterBubble({ cluster, px, color }: { cluster: AssetCluster; px: number; color: string }) {
  const n = cluster.items.length
  const r = (12.5 + 4.6 * Math.log2(n)) * px
  return (
    <g data-kind="cluster" data-key={cluster.key} style={{ cursor: 'zoom-in' }}>
      <circle cx={cluster.x} cy={cluster.y} r={r * 1.34} fill={color} fillOpacity={0.16} />
      <circle
        cx={cluster.x}
        cy={cluster.y}
        r={r}
        fill={color}
        fillOpacity={0.9}
        stroke="var(--map-halo)"
        strokeWidth={1.7}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={cluster.x}
        y={cluster.y + 3.6 * px}
        textAnchor="middle"
        fontSize={10.5 * px}
        fontWeight={700}
        fill="var(--map-halo)"
        pointerEvents="none"
      >
        {n}
      </text>
      <title>{`${n} assets · ${formatMYRCompact(cluster.totalValue)}`}</title>
    </g>
  )
}

function NorthArrow() {
  return (
    <svg viewBox="0 0 24 32" className="h-7 w-5 text-foreground" aria-hidden="true">
      <path d="M12 1 L19 26 L12 20 L5 26 Z" fill="currentColor" opacity={0.16} />
      <path d="M12 1 L19 26 L12 20 Z" fill="currentColor" opacity={0.75} />
      <path
        d="M12 1 L19 26 L12 20 L5 26 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        opacity={0.7}
      />
      <text x="12" y="32" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
        N
      </text>
    </svg>
  )
}
