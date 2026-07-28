/**
 * Cartographic colour system for the GIS canvas.
 *
 * Every colour below resolves to a theme token (or a `color-mix()` of theme
 * tokens) so the map stays correct in both light and dark mode. These strings
 * are fed to SVG `fill`/`stroke` attributes, never to Tailwind class names.
 */

import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  type Asset,
  type AssetCategory,
  type AssetStatus,
  type Condition,
  type Criticality,
} from '@/lib/types'
import { formatMYRCompact } from '@/lib/format'

/* ------------------------------------------------------------------ */
/* Derived token colours                                               */
/* ------------------------------------------------------------------ */

/** Amber is absent from ocean-breeze — derive it the same way the UI kit does. */
const AMBER = 'color-mix(in oklch, var(--destructive) 58%, var(--chart-1))'
/** Cool steel-blue: pulls chart-2 towards the text colour. */
const STEEL = 'color-mix(in oklch, var(--chart-2) 55%, var(--foreground))'
/** Muted plum: pulls destructive towards the text colour. */
const PLUM = 'color-mix(in oklch, var(--destructive) 42%, var(--foreground))'
/** Faded grey for retired / inactive records. */
const FADED = 'color-mix(in oklch, var(--muted-foreground) 58%, var(--background))'

/* ------------------------------------------------------------------ */
/* Colour modes                                                        */
/* ------------------------------------------------------------------ */

export const COLOR_MODES = ['category', 'status', 'condition', 'criticality', 'value'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  category: 'Asset category',
  status: 'Operational status',
  condition: 'Physical condition',
  criticality: 'Criticality',
  value: 'Current value',
}

export const CATEGORY_COLOR: Record<AssetCategory, string> = {
  'Commercial Property': 'var(--chart-1)',
  Industrial: STEEL,
  Land: AMBER,
  'Tourism & Hospitality': 'var(--chart-2)',
  Infrastructure: PLUM,
  'Building & Facility': 'var(--chart-5)',
  'Plant & Equipment': 'var(--destructive)',
  'ICT & Digital': 'var(--muted-foreground)',
}

export const STATUS_COLOR: Record<AssetStatus, string> = {
  Active: 'var(--chart-1)',
  Leased: 'var(--chart-2)',
  Vacant: AMBER,
  'Under Maintenance': PLUM,
  'Under Construction': STEEL,
  Idle: 'var(--muted-foreground)',
  Disposed: FADED,
}

export const CONDITION_COLOR: Record<Condition, string> = {
  Excellent: 'var(--chart-1)',
  Good: 'var(--chart-2)',
  Fair: AMBER,
  Poor: 'color-mix(in oklch, var(--destructive) 80%, var(--chart-1))',
  Critical: 'var(--destructive)',
}

export const CRITICALITY_COLOR: Record<Criticality, string> = {
  Critical: 'var(--destructive)',
  High: AMBER,
  Medium: 'var(--chart-2)',
  Low: 'var(--muted-foreground)',
}

/** Sequential ramp, low value → high value. */
export const VALUE_RAMP: readonly string[] = [
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-1)',
]

/* ------------------------------------------------------------------ */
/* Value banding (quintiles of the live asset set)                     */
/* ------------------------------------------------------------------ */

export interface ValueBand {
  key: string
  label: string
  min: number
  max: number
  color: string
}

/** Five quintile bands so the ramp always spans the real portfolio. */
export function computeValueBands(assets: Asset[]): ValueBand[] {
  const values = assets.map((a) => a.currentValue).sort((a, b) => a - b)
  const fallback: ValueBand[] = VALUE_RAMP.map((color, i) => ({
    key: `v${i}`,
    label: '—',
    min: i,
    max: i + 1,
    color,
  }))
  if (values.length < 5) return fallback

  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))]
  const cuts = [values[0], q(0.2), q(0.4), q(0.6), q(0.8), values[values.length - 1] + 1]

  return VALUE_RAMP.map((color, i) => {
    const min = cuts[i]
    const max = cuts[i + 1]
    return {
      key: `v${i}`,
      label:
        i === VALUE_RAMP.length - 1
          ? `≥ ${formatMYRCompact(min)}`
          : `${formatMYRCompact(min)} – ${formatMYRCompact(max)}`,
      min,
      max,
      color,
    }
  })
}

export function valueBandIndex(value: number, bands: ValueBand[]): number {
  for (let i = 0; i < bands.length; i += 1) {
    if (value < bands[i].max) return i
  }
  return bands.length - 1
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

/** The legend key an asset falls under for the active colour mode. */
export function assetDimension(asset: Asset, mode: ColorMode, bands: ValueBand[]): string {
  switch (mode) {
    case 'category':
      return asset.category
    case 'status':
      return asset.status
    case 'condition':
      return asset.condition
    case 'criticality':
      return asset.criticality
    case 'value':
      return bands[valueBandIndex(asset.currentValue, bands)].label
  }
}

export function assetColor(asset: Asset, mode: ColorMode, bands: ValueBand[]): string {
  switch (mode) {
    case 'category':
      return CATEGORY_COLOR[asset.category]
    case 'status':
      return STATUS_COLOR[asset.status]
    case 'condition':
      return CONDITION_COLOR[asset.condition]
    case 'criticality':
      return CRITICALITY_COLOR[asset.criticality]
    case 'value':
      return bands[valueBandIndex(asset.currentValue, bands)].color
  }
}

export interface LegendItem {
  key: string
  label: string
  color: string
}

export function legendItems(mode: ColorMode, bands: ValueBand[]): LegendItem[] {
  switch (mode) {
    case 'category':
      return ASSET_CATEGORIES.map((c) => ({ key: c, label: c, color: CATEGORY_COLOR[c] }))
    case 'status':
      return ASSET_STATUSES.map((s) => ({ key: s, label: s, color: STATUS_COLOR[s] }))
    case 'condition':
      return CONDITIONS.map((c) => ({ key: c, label: c, color: CONDITION_COLOR[c] }))
    case 'criticality':
      return CRITICALITIES.map((c) => ({ key: c, label: c, color: CRITICALITY_COLOR[c] }))
    case 'value':
      return bands.map((b) => ({ key: b.label, label: b.label, color: b.color }))
  }
}

/* ------------------------------------------------------------------ */
/* Pin geometry                                                        */
/* ------------------------------------------------------------------ */

const PIN_MIN_VALUE = 60_000
const PIN_MAX_VALUE = 120_000_000
const LOG_MIN = Math.log(PIN_MIN_VALUE)
const LOG_SPAN = Math.log(PIN_MAX_VALUE) - LOG_MIN

/** Pin radius in CSS pixels, scaled logarithmically by current value. */
export function pinRadiusPx(value: number): number {
  const t = Math.min(1, Math.max(0, (Math.log(Math.max(value, PIN_MIN_VALUE)) - LOG_MIN) / LOG_SPAN))
  return 3.1 + 5.4 * t
}
