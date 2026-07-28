/** Layer catalogue and filter shape shared by the canvas, rail and page. */

import {
  CircleDotIcon,
  FlameIcon,
  Grid2x2Icon,
  LayersIcon,
  MapPinIcon,
  SquareStackIcon,
  TypeIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AssetCategory, AssetStatus, Condition, Zone } from '@/lib/types'

export const LAYER_KEYS = [
  'zones',
  'towns',
  'pins',
  'clusters',
  'heatmap',
  'graticule',
  'labels',
] as const
export type LayerKey = (typeof LAYER_KEYS)[number]
export type LayerState = Record<LayerKey, boolean>

export const LAYER_META: Record<LayerKey, { label: string; icon: LucideIcon; hint: string }> = {
  zones: { label: 'Zone boundaries', icon: LayersIcon, hint: 'Six KEJORA operational zones' },
  towns: { label: 'Towns & centres', icon: MapPinIcon, hint: 'Settlements and growth centres' },
  pins: { label: 'Asset pins', icon: CircleDotIcon, hint: 'Individual asset locations' },
  clusters: {
    label: 'Cluster pins',
    icon: SquareStackIcon,
    hint: 'Group nearby assets while zoomed out',
  },
  heatmap: { label: 'Density heatmap', icon: FlameIcon, hint: 'Weighted concentration surface' },
  graticule: { label: 'Graticule', icon: Grid2x2Icon, hint: 'Latitude / longitude grid' },
  labels: { label: 'Map labels', icon: TypeIcon, hint: 'Zone, town and grid labels' },
}

export interface MapFiltersState {
  query: string
  categories: AssetCategory[]
  statuses: AssetStatus[]
  zones: Zone[]
  conditions: Condition[]
  /** Slider positions 0–100, mapped logarithmically onto the value range. */
  valuePct: [number, number]
}
