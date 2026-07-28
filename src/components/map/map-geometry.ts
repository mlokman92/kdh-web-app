/**
 * Pre-projected basemap geometry plus the pure helpers the canvas needs:
 * grid clustering, graticule stepping, scale-bar rounding and heat binning.
 *
 * Everything here is computed once at module scope or is a pure function, so
 * the render path never re-projects the basemap.
 */

import {
  ISLANDS,
  LANDMASS,
  MAP_BOUNDS,
  MAP_VIEWBOX,
  TOWNS,
  ZONE_GEOMETRY,
  haversineKm,
  project,
  ringToPath,
  unproject,
  type TownMarker,
  type ZoneGeometry,
} from '@/lib/geo'
import type { Asset } from '@/lib/types'

export interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

function bboxOfRing(ring: readonly (readonly [number, number])[]): Bbox {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [lng, lat] of ring) {
    const p = project(lat, lng)
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/* ------------------------------------------------------------------ */
/* Basemap, projected once                                             */
/* ------------------------------------------------------------------ */

export const LAND_PATH = ringToPath(LANDMASS)

export const ISLAND_PATHS: readonly { name: string; d: string; at: Point }[] = ISLANDS.map((i) => {
  const b = bboxOfRing(i.ring)
  return { name: i.name, d: ringToPath(i.ring), at: { x: b.x + b.w / 2, y: b.y + b.h / 2 } }
})

export interface ProjectedZone extends ZoneGeometry {
  d: string
  label: Point
  bbox: Bbox
}

export const PROJECTED_ZONES: readonly ProjectedZone[] = ZONE_GEOMETRY.map((z) => ({
  ...z,
  d: ringToPath(z.ring),
  label: project(z.labelAt[1], z.labelAt[0]),
  bbox: bboxOfRing(z.ring),
}))

export const ZONE_BBOX: Record<string, Bbox> = Object.fromEntries(
  PROJECTED_ZONES.map((z) => [z.zone, z.bbox]),
)

export interface ProjectedTown extends TownMarker {
  at: Point
}

export const PROJECTED_TOWNS: readonly ProjectedTown[] = TOWNS.map((t) => ({
  ...t,
  at: project(t.lat, t.lng),
}))

/* ------------------------------------------------------------------ */
/* Projection scale constants                                          */
/* ------------------------------------------------------------------ */

/** SVG user units per degree of longitude / latitude. */
export const UNITS_PER_DEG_LNG = MAP_VIEWBOX.width / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)
export const UNITS_PER_DEG_LAT = MAP_VIEWBOX.height / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)

const KM_PER_DEG_LAT = 110.574

/** Radii (in SVG user units) of a true `km` circle centred on `lat`. */
export function kmRadiusToUnits(km: number, lat: number): { rx: number; ry: number } {
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180)
  return {
    rx: (km / Math.max(kmPerDegLng, 1e-6)) * UNITS_PER_DEG_LNG,
    ry: (km / KM_PER_DEG_LAT) * UNITS_PER_DEG_LAT,
  }
}

/** Kilometres represented by one SVG user unit at a given screen centre. */
export function kmPerUnitAt(cx: number, cy: number): number {
  const a = unproject(cx, cy)
  const b = unproject(cx + 100, cy)
  return haversineKm(a, b) / 100
}

/* ------------------------------------------------------------------ */
/* Placed assets + clustering                                          */
/* ------------------------------------------------------------------ */

export interface PlacedAsset {
  asset: Asset
  x: number
  y: number
}

export function placeAssets(assets: Asset[]): PlacedAsset[] {
  return assets.map((asset) => {
    const p = project(asset.location.lat, asset.location.lng)
    return { asset, x: p.x, y: p.y }
  })
}

export interface AssetCluster {
  key: string
  x: number
  y: number
  items: PlacedAsset[]
  bbox: Bbox
  totalValue: number
}

/**
 * Uniform-grid clustering in projected space. `cell` is expressed in SVG user
 * units, so it shrinks as the viewport zooms in and clusters split apart
 * naturally. Pass `cell <= 0` to disable clustering entirely.
 */
export function buildClusters(placed: PlacedAsset[], cell: number): AssetCluster[] {
  if (cell <= 0) {
    return placed.map((p) => ({
      key: p.asset.id,
      x: p.x,
      y: p.y,
      items: [p],
      bbox: { x: p.x, y: p.y, w: 0, h: 0 },
      totalValue: p.asset.currentValue,
    }))
  }

  const buckets = new Map<string, PlacedAsset[]>()
  for (const p of placed) {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`
    const existing = buckets.get(key)
    if (existing) existing.push(p)
    else buckets.set(key, [p])
  }

  const out: AssetCluster[] = []
  buckets.forEach((items, key) => {
    let sx = 0
    let sy = 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let totalValue = 0
    for (const p of items) {
      sx += p.x
      sy += p.y
      totalValue += p.asset.currentValue
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    out.push({
      key,
      x: sx / items.length,
      y: sy / items.length,
      items,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      totalValue,
    })
  })
  return out
}

/* ------------------------------------------------------------------ */
/* Heat binning                                                        */
/* ------------------------------------------------------------------ */

export interface HeatCell {
  key: string
  x: number
  y: number
  weight: number
}

const HEAT_CELL = 38

/**
 * Bins assets onto a fixed geographic grid and normalises the weight to 0..1.
 * Fixed grid = stable surface that does not shimmer while panning or zooming.
 */
export function buildHeat(placed: PlacedAsset[], metric: 'value' | 'risk'): HeatCell[] {
  const buckets = new Map<string, { x: number; y: number; w: number; n: number }>()
  for (const p of placed) {
    const gx = Math.floor(p.x / HEAT_CELL)
    const gy = Math.floor(p.y / HEAT_CELL)
    const key = `${gx}:${gy}`
    const w = metric === 'value' ? p.asset.currentValue : p.asset.riskScore * 40_000
    const b = buckets.get(key)
    if (b) {
      b.x += p.x
      b.y += p.y
      b.w += w
      b.n += 1
    } else {
      buckets.set(key, { x: p.x, y: p.y, w, n: 1 })
    }
  }

  const raw: HeatCell[] = []
  buckets.forEach((b, key) => {
    raw.push({ key, x: b.x / b.n, y: b.y / b.n, weight: Math.sqrt(b.w) })
  })
  const max = raw.reduce((m, c) => Math.max(m, c.weight), 0)
  if (max <= 0) return []
  return raw.map((c) => ({ ...c, weight: c.weight / max }))
}

/* ------------------------------------------------------------------ */
/* Graticule + scale bar                                               */
/* ------------------------------------------------------------------ */

const GRAT_STEPS = [1, 0.5, 0.25, 0.2, 0.1, 0.05, 0.025, 0.01]

/** Largest graticule interval that still yields at least four lines. */
export function graticuleStep(spanDeg: number): number {
  for (const s of GRAT_STEPS) {
    if (spanDeg / s >= 4) return s
  }
  return GRAT_STEPS[GRAT_STEPS.length - 1]
}

export function graticuleLines(rect: Bbox): { lats: number[]; lngs: number[]; step: number } {
  const topLeft = unproject(rect.x, rect.y)
  const bottomRight = unproject(rect.x + rect.w, rect.y + rect.h)
  const step = graticuleStep(Math.max(bottomRight.lng - topLeft.lng, topLeft.lat - bottomRight.lat))

  const lats: number[] = []
  const lngs: number[] = []
  const latStart = Math.ceil(bottomRight.lat / step) * step
  for (let v = latStart; v <= topLeft.lat + 1e-9; v += step) lats.push(Number(v.toFixed(4)))
  const lngStart = Math.ceil(topLeft.lng / step) * step
  for (let v = lngStart; v <= bottomRight.lng + 1e-9; v += step) lngs.push(Number(v.toFixed(4)))

  return { lats, lngs, step }
}

const NICE_KM = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200]

/** Rounded scale-bar length: the nicest km value under the target width. */
export function niceScaleKm(targetKm: number): number {
  let best = NICE_KM[0]
  for (const v of NICE_KM) {
    if (v <= targetKm) best = v
  }
  return best
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function pointInRect(x: number, y: number, r: Bbox, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad
}

export const ZONE_SHORT: Record<string, string> = Object.fromEntries(
  ZONE_GEOMETRY.map((z) => [z.zone, z.short]),
)
