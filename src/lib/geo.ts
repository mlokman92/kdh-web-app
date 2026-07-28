/**
 * Stylised basemap geometry for the KEJORA operational region
 * (South East Johor, Malaysia).
 *
 * Deliberately self-contained: no external tile server is used, so the GIS
 * page renders identically offline. Coordinates are approximate and intended
 * for visual orientation, not survey-grade cartography.
 */

import type { Zone } from './types'

/** Geographic extent of the map viewport. */
export const MAP_BOUNDS = {
  minLng: 103.42,
  maxLng: 104.48,
  minLat: 1.24,
  maxLat: 2.56,
} as const

/** SVG viewBox the projection maps into. */
export const MAP_VIEWBOX = { width: 1000, height: 1240 } as const

/** Project WGS84 lat/lng into SVG user-space coordinates. */
export function project(lat: number, lng: number): { x: number; y: number } {
  const { minLng, maxLng, minLat, maxLat } = MAP_BOUNDS
  const x = ((lng - minLng) / (maxLng - minLng)) * MAP_VIEWBOX.width
  // SVG y grows downward, latitude grows upward.
  const y = ((maxLat - lat) / (maxLat - minLat)) * MAP_VIEWBOX.height
  return { x, y }
}

/** Inverse of {@link project} — used for click-to-place / hover readouts. */
export function unproject(x: number, y: number): { lat: number; lng: number } {
  const { minLng, maxLng, minLat, maxLat } = MAP_BOUNDS
  const lng = minLng + (x / MAP_VIEWBOX.width) * (maxLng - minLng)
  const lat = maxLat - (y / MAP_VIEWBOX.height) * (maxLat - minLat)
  return { lat, lng }
}

/** Build an SVG path `d` string from a ring of [lng, lat] pairs. */
export function ringToPath(ring: readonly (readonly [number, number])[], close = true): string {
  if (ring.length === 0) return ''
  const pts = ring.map(([lng, lat]) => {
    const { x, y } = project(lat, lng)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M${pts.join('L')}${close ? 'Z' : ''}`
}

/**
 * Approximate landmass of South East Johor: east coast from Pengerang up to
 * Mersing, the Johor Strait shoreline in the south, and an inland boundary
 * roughly following the western edge of the KEJORA authority area.
 */
export const LANDMASS: readonly (readonly [number, number])[] = [
  // --- East coast, south to north (South China Sea) ---
  [104.28, 1.34], // Tanjung Penyusop
  [104.31, 1.41],
  [104.3, 1.49],
  [104.29, 1.56],
  [104.29, 1.63], // Desaru
  [104.26, 1.71],
  [104.23, 1.79],
  [104.19, 1.86],
  [104.14, 1.94], // Sedili Besar
  [104.11, 2.01],
  [104.09, 2.09],
  [104.06, 2.16],
  [104.01, 2.23],
  [103.96, 2.29],
  [103.91, 2.36],
  [103.87, 2.43], // Mersing
  [103.84, 2.51],
  // --- Northern / inland boundary heading west ---
  [103.74, 2.52],
  [103.66, 2.45],
  [103.59, 2.33],
  [103.53, 2.18],
  [103.5, 2.02],
  [103.52, 1.87],
  [103.56, 1.72],
  [103.62, 1.57],
  [103.68, 1.46],
  // --- South coast (Johor Strait), west to east ---
  [103.76, 1.43],
  [103.83, 1.4],
  [103.91, 1.38],
  [103.99, 1.35],
  [104.06, 1.32],
  [104.14, 1.3],
  [104.21, 1.31],
]

/** Small islands off the Mersing coast — visual flavour only. */
export const ISLANDS: readonly {
  name: string
  ring: readonly (readonly [number, number])[]
}[] = [
  {
    name: 'Pulau Rawa',
    ring: [
      [104.14, 2.51],
      [104.17, 2.52],
      [104.18, 2.49],
      [104.15, 2.48],
    ],
  },
  {
    name: 'Pulau Besar',
    ring: [
      [104.25, 2.44],
      [104.29, 2.46],
      [104.31, 2.42],
      [104.27, 2.4],
    ],
  },
  {
    name: 'Pulau Sibu',
    ring: [
      [104.06, 2.22],
      [104.1, 2.24],
      [104.12, 2.2],
      [104.08, 2.18],
    ],
  },
  {
    name: 'Pulau Tinggi',
    ring: [
      [104.11, 2.29],
      [104.15, 2.31],
      [104.17, 2.27],
      [104.13, 2.25],
    ],
  },
]

export interface ZoneGeometry {
  zone: Zone
  /** Short label shown on the map. */
  short: string
  /** District the zone predominantly sits in. */
  district: string
  ring: readonly (readonly [number, number])[]
  /** Label anchor. */
  labelAt: readonly [number, number]
}

/** KEJORA operational zones, drawn as simplified polygons. */
export const ZONE_GEOMETRY: readonly ZoneGeometry[] = [
  {
    zone: 'Zon Desaru–Penawar',
    short: 'Desaru–Penawar',
    district: 'Kota Tinggi',
    labelAt: [104.16, 1.57],
    ring: [
      [104.02, 1.46],
      [104.29, 1.5],
      [104.29, 1.66],
      [104.2, 1.72],
      [104.04, 1.68],
      [103.98, 1.56],
    ],
  },
  {
    zone: 'Zon Pengerang–Sungai Rengit',
    short: 'Pengerang–Sg. Rengit',
    district: 'Kota Tinggi',
    labelAt: [104.14, 1.38],
    ring: [
      [103.98, 1.36],
      [104.21, 1.31],
      [104.29, 1.35],
      [104.3, 1.46],
      [104.02, 1.46],
      [103.96, 1.42],
    ],
  },
  {
    zone: 'Zon Bandar Tenggara',
    short: 'Bandar Tenggara',
    district: 'Kulai / Kota Tinggi',
    labelAt: [103.72, 1.72],
    ring: [
      [103.6, 1.6],
      [103.86, 1.56],
      [103.9, 1.76],
      [103.78, 1.88],
      [103.62, 1.84],
      [103.56, 1.72],
    ],
  },
  {
    zone: 'Zon Bandar Mas–Air Tawar',
    short: 'Bandar Mas–Air Tawar',
    district: 'Kota Tinggi',
    labelAt: [103.99, 1.66],
    ring: [
      [103.86, 1.56],
      [104.02, 1.55],
      [104.04, 1.72],
      [103.94, 1.82],
      [103.84, 1.78],
      [103.86, 1.64],
    ],
  },
  {
    zone: 'Zon Sedili–Kota Tinggi',
    short: 'Sedili–Kota Tinggi',
    district: 'Kota Tinggi',
    labelAt: [103.98, 1.94],
    ring: [
      [103.82, 1.84],
      [104.06, 1.8],
      [104.16, 1.92],
      [104.1, 2.06],
      [103.9, 2.08],
      [103.78, 1.98],
    ],
  },
  {
    zone: 'Zon Mersing',
    short: 'Mersing',
    district: 'Mersing',
    labelAt: [103.82, 2.3],
    ring: [
      [103.66, 2.14],
      [103.94, 2.12],
      [104.02, 2.26],
      [103.87, 2.44],
      [103.7, 2.4],
      [103.6, 2.28],
    ],
  },
]

export interface TownMarker {
  name: string
  lat: number
  lng: number
  zone: Zone
  district: string
  kind: 'hq' | 'town' | 'growth-centre' | 'coastal'
}

/** Named settlements used for asset placement and map labelling. */
export const TOWNS: readonly TownMarker[] = [
  { name: 'Bandar Penawar', lat: 1.5175, lng: 104.13, zone: 'Zon Desaru–Penawar', district: 'Kota Tinggi', kind: 'hq' },
  { name: 'Desaru', lat: 1.5836, lng: 104.2664, zone: 'Zon Desaru–Penawar', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Tanjung Balau', lat: 1.5497, lng: 104.2586, zone: 'Zon Desaru–Penawar', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Felda Adela', lat: 1.5372, lng: 104.0631, zone: 'Zon Desaru–Penawar', district: 'Kota Tinggi', kind: 'town' },
  { name: 'Sungai Rengit', lat: 1.363, lng: 104.227, zone: 'Zon Pengerang–Sungai Rengit', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Pengerang', lat: 1.3878, lng: 104.1428, zone: 'Zon Pengerang–Sungai Rengit', district: 'Kota Tinggi', kind: 'growth-centre' },
  { name: 'Teluk Ramunia', lat: 1.3486, lng: 104.2311, zone: 'Zon Pengerang–Sungai Rengit', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Bandar Tenggara', lat: 1.7469, lng: 103.6664, zone: 'Zon Bandar Tenggara', district: 'Kulai', kind: 'growth-centre' },
  { name: 'Bandar Baru Kangkar Pulai', lat: 1.6822, lng: 103.7431, zone: 'Zon Bandar Tenggara', district: 'Kulai', kind: 'town' },
  { name: 'Felda Taib Andak', lat: 1.6417, lng: 103.5883, zone: 'Zon Bandar Tenggara', district: 'Kulai', kind: 'town' },
  { name: 'Bandar Mas', lat: 1.6194, lng: 104.0472, zone: 'Zon Bandar Mas–Air Tawar', district: 'Kota Tinggi', kind: 'growth-centre' },
  { name: 'Air Tawar', lat: 1.6683, lng: 103.9992, zone: 'Zon Bandar Mas–Air Tawar', district: 'Kota Tinggi', kind: 'town' },
  { name: 'Felda Air Tawar 5', lat: 1.7042, lng: 103.9611, zone: 'Zon Bandar Mas–Air Tawar', district: 'Kota Tinggi', kind: 'town' },
  { name: 'Kota Tinggi', lat: 1.7381, lng: 103.8999, zone: 'Zon Sedili–Kota Tinggi', district: 'Kota Tinggi', kind: 'town' },
  { name: 'Sedili Besar', lat: 1.9331, lng: 104.1169, zone: 'Zon Sedili–Kota Tinggi', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Sedili Kecil', lat: 1.8583, lng: 104.1339, zone: 'Zon Sedili–Kota Tinggi', district: 'Kota Tinggi', kind: 'coastal' },
  { name: 'Bandar Easter', lat: 1.9944, lng: 103.9106, zone: 'Zon Sedili–Kota Tinggi', district: 'Kota Tinggi', kind: 'town' },
  { name: 'Mersing', lat: 2.4312, lng: 103.8405, zone: 'Zon Mersing', district: 'Mersing', kind: 'growth-centre' },
  { name: 'Endau', lat: 2.6486, lng: 103.6197, zone: 'Zon Mersing', district: 'Mersing', kind: 'coastal' },
  { name: 'Jemaluang', lat: 2.2506, lng: 103.8514, zone: 'Zon Mersing', district: 'Mersing', kind: 'town' },
  { name: 'Tenglu', lat: 2.2094, lng: 103.9214, zone: 'Zon Mersing', district: 'Mersing', kind: 'town' },
]

/** Great-circle distance in kilometres — powers the proximity/radius tool. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Format a coordinate pair the way a surveyor would read it out. */
export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`
}
