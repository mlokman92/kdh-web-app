import { useMemo } from 'react'
import {
  EraserIcon,
  LayersIcon,
  PaletteIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TagIcon,
  TargetIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CONDITIONS,
  ZONES,
  type AssetCategory,
  type AssetStatus,
  type Condition,
} from '@/lib/types'
import { formatMYR, formatMYRCompact, formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ZONE_SHORT } from '@/components/map/map-geometry'
import {
  LAYER_KEYS,
  LAYER_META,
  type LayerKey,
  type LayerState,
  type MapFiltersState,
} from '@/components/map/map-layers'
import {
  COLOR_MODES,
  COLOR_MODE_LABELS,
  legendItems,
  type ColorMode,
  type ValueBand,
} from '@/components/map/map-theme'

export interface ControlRailProps {
  filters: MapFiltersState
  onFilters: (patch: Partial<MapFiltersState>) => void
  onResetFilters: () => void
  layers: LayerState
  onToggleLayer: (key: LayerKey) => void
  colorMode: ColorMode
  onColorMode: (mode: ColorMode) => void
  heatMetric: 'value' | 'risk'
  onHeatMetric: (metric: 'value' | 'risk') => void
  bands: ValueBand[]
  legendCounts: Record<string, number>
  valueBounds: { min: number; max: number }
  valueThresholds: [number, number]
  radiusMode: boolean
  onToggleRadiusMode: () => void
  radiusCentre: { lat: number; lng: number } | null
  radiusKm: number
  onRadiusKm: (km: number) => void
  onClearRadius: () => void
  radiusCount: number
  radiusValue: number
  matchCount: number
  totalCount: number
}

function RailSection({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="px-3 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Compact multi-select rendered as a popover checklist. */
function MultiPicker<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: readonly T[]
  selected: T[]
  onChange: (next: T[]) => void
}) {
  const set = useMemo(() => new Set(selected), [selected])
  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2 font-normal"
          aria-label={`Filter by ${label}`}
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {summary}
          </span>
          <SlidersHorizontalIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-xs"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            Clear
          </Button>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((opt) => {
            const checked = set.has(opt)
            return (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-accent/50"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    onChange(checked ? selected.filter((s) => s !== opt) : [...selected, opt])
                  }
                />
                <span className="truncate">{opt}</span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ChipToggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'truncate rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function MapControlRail({
  filters,
  onFilters,
  onResetFilters,
  layers,
  onToggleLayer,
  colorMode,
  onColorMode,
  heatMetric,
  onHeatMetric,
  bands,
  legendCounts,
  valueBounds,
  valueThresholds,
  radiusMode,
  onToggleRadiusMode,
  radiusCentre,
  radiusKm,
  onRadiusKm,
  onClearRadius,
  radiusCount,
  radiusValue,
  matchCount,
  totalCount,
}: ControlRailProps) {
  const legend = useMemo(() => legendItems(colorMode, bands), [colorMode, bands])
  const legendFilterable =
    colorMode === 'category' || colorMode === 'status' || colorMode === 'condition'

  const toggleLegendKey = (key: string) => {
    if (colorMode === 'category') {
      const k = key as AssetCategory
      onFilters({
        categories: filters.categories.includes(k)
          ? filters.categories.filter((c) => c !== k)
          : [...filters.categories, k],
      })
    } else if (colorMode === 'status') {
      const k = key as AssetStatus
      onFilters({
        statuses: filters.statuses.includes(k)
          ? filters.statuses.filter((c) => c !== k)
          : [...filters.statuses, k],
      })
    } else if (colorMode === 'condition') {
      const k = key as Condition
      onFilters({
        conditions: filters.conditions.includes(k)
          ? filters.conditions.filter((c) => c !== k)
          : [...filters.conditions, k],
      })
    }
  }

  const legendActive = (key: string) =>
    colorMode === 'category'
      ? filters.categories.includes(key as AssetCategory)
      : colorMode === 'status'
        ? filters.statuses.includes(key as AssetStatus)
        : colorMode === 'condition'
          ? filters.conditions.includes(key as Condition)
          : false

  const filtersDirty =
    filters.query !== '' ||
    filters.categories.length > 0 ||
    filters.statuses.length > 0 ||
    filters.zones.length > 0 ||
    filters.conditions.length > 0 ||
    filters.valuePct[0] !== 0 ||
    filters.valuePct[1] !== 100

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground">Map controls</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatNumber(matchCount)} of {formatNumber(totalCount)} assets shown
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onResetFilters}
          disabled={!filtersDirty}
          aria-label="Reset all map filters"
          title="Reset filters"
        >
          <EraserIcon className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border">
          {/* ------------------------- layers ------------------------- */}
          <RailSection title="Layers" icon={LayersIcon}>
            <div className="space-y-1">
              {LAYER_KEYS.map((key) => {
                const meta = LAYER_META[key]
                const Icon = meta.icon
                const disabled = key === 'clusters' && !layers.pins
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-1.5 py-1',
                      disabled && 'opacity-50',
                    )}
                  >
                    <Label
                      htmlFor={`layer-${key}`}
                      className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-normal"
                      title={meta.hint}
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{meta.label}</span>
                    </Label>
                    <Switch
                      id={`layer-${key}`}
                      checked={layers[key]}
                      disabled={disabled}
                      onCheckedChange={() => onToggleLayer(key)}
                    />
                  </div>
                )
              })}
            </div>

            {layers.heatmap && (
              <div className="mt-2.5 rounded-lg border border-border bg-muted/40 p-2">
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  Heatmap weighting
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <ChipToggle active={heatMetric === 'value'} onClick={() => onHeatMetric('value')}>
                    Asset value
                  </ChipToggle>
                  <ChipToggle active={heatMetric === 'risk'} onClick={() => onHeatMetric('risk')}>
                    Risk score
                  </ChipToggle>
                </div>
              </div>
            )}
          </RailSection>

          {/* ------------------------ colour by ----------------------- */}
          <RailSection title="Colour by" icon={PaletteIcon}>
            <Select value={colorMode} onValueChange={(v) => onColorMode(v as ColorMode)}>
              <SelectTrigger size="sm" className="w-full" aria-label="Colour pins by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {COLOR_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ul className="mt-2.5 space-y-0.5">
              {legend.map((item) => {
                const count = legendCounts[item.key] ?? 0
                const active = legendActive(item.key)
                const row = (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-left text-[11.5px]">
                      {item.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </>
                )
                return (
                  <li key={item.key}>
                    {legendFilterable ? (
                      <button
                        type="button"
                        onClick={() => toggleLegendKey(item.key)}
                        aria-pressed={active}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-accent/50',
                          count === 0 && !active && 'opacity-45',
                        )}
                      >
                        {row}
                      </button>
                    ) : (
                      <div
                        className={cn(
                          'flex w-full items-center gap-2 px-1.5 py-1 text-foreground',
                          count === 0 && 'opacity-45',
                        )}
                      >
                        {row}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {legendFilterable && (
              <p className="mt-1.5 px-1.5 text-[10.5px] text-muted-foreground">
                Click a legend entry to filter the map.
              </p>
            )}
          </RailSection>

          {/* ------------------------- filters ------------------------ */}
          <RailSection title="Filters" icon={TagIcon}>
            <div className="space-y-3">
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={filters.query}
                  onChange={(e) => onFilters({ query: e.target.value })}
                  placeholder="Search name, code, town…"
                  aria-label="Search assets"
                  className="h-8 pl-8 text-xs"
                />
                {filters.query && (
                  <button
                    type="button"
                    onClick={() => onFilters({ query: '' })}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Category</p>
                <MultiPicker
                  label="Categories"
                  options={ASSET_CATEGORIES}
                  selected={filters.categories}
                  onChange={(categories) => onFilters({ categories })}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Operational status</p>
                <MultiPicker
                  label="Statuses"
                  options={ASSET_STATUSES}
                  selected={filters.statuses}
                  onChange={(statuses) => onFilters({ statuses })}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Zone</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ZONES.map((z) => (
                    <ChipToggle
                      key={z}
                      title={z}
                      active={filters.zones.includes(z)}
                      onClick={() =>
                        onFilters({
                          zones: filters.zones.includes(z)
                            ? filters.zones.filter((x) => x !== z)
                            : [...filters.zones, z],
                        })
                      }
                    >
                      {ZONE_SHORT[z] ?? z}
                    </ChipToggle>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Condition</p>
                <div className="flex flex-wrap gap-1.5">
                  {CONDITIONS.map((c) => (
                    <ChipToggle
                      key={c}
                      active={filters.conditions.includes(c)}
                      onClick={() =>
                        onFilters({
                          conditions: filters.conditions.includes(c)
                            ? filters.conditions.filter((x) => x !== c)
                            : [...filters.conditions, c],
                        })
                      }
                    >
                      {c}
                    </ChipToggle>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Current value</p>
                  <p className="font-mono text-[10.5px] text-foreground">
                    {formatMYRCompact(valueThresholds[0])} – {formatMYRCompact(valueThresholds[1])}
                  </p>
                </div>
                <Slider
                  value={filters.valuePct}
                  min={0}
                  max={100}
                  step={1}
                  minStepsBetweenThumbs={1}
                  onValueChange={(v) => onFilters({ valuePct: [v[0], v[1]] as [number, number] })}
                  aria-label="Current value range"
                  className="py-1"
                />
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{formatMYRCompact(valueBounds.min)}</span>
                  <span>{formatMYRCompact(valueBounds.max)}</span>
                </div>
              </div>
            </div>
          </RailSection>

          {/* ---------------------- proximity tool -------------------- */}
          <RailSection title="Proximity search" icon={TargetIcon}>
            <Button
              variant={radiusMode ? 'default' : 'outline'}
              size="sm"
              className="w-full gap-2"
              onClick={onToggleRadiusMode}
            >
              <TargetIcon className="size-3.5" aria-hidden="true" />
              {radiusMode ? 'Picking centre — click map' : 'Radius search'}
            </Button>

            {radiusCentre && (
              <div className="mt-2.5 space-y-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground">Search centre</p>
                    <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {radiusCentre.lat.toFixed(4)}°N, {radiusCentre.lng.toFixed(4)}°E
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClearRadius}
                    aria-label="Clear proximity search"
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-muted-foreground">Radius</span>
                    <span className="font-mono text-[11px] font-medium text-foreground">
                      {radiusKm} km
                    </span>
                  </div>
                  <Slider
                    value={[radiusKm]}
                    min={1}
                    max={60}
                    step={1}
                    onValueChange={(v) => onRadiusKm(v[0])}
                    aria-label="Search radius in kilometres"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                  <div>
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      Assets
                    </p>
                    <p className="font-mono text-sm font-semibold text-foreground tabular-nums">
                      {formatNumber(radiusCount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      Total value
                    </p>
                    <p
                      className="font-mono text-sm font-semibold text-foreground tabular-nums"
                      title={formatMYR(radiusValue)}
                    >
                      {formatMYRCompact(radiusValue)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!radiusCentre && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                Drop a centre on the map, then tune the radius to list every asset within great-circle
                distance.
              </p>
            )}
          </RailSection>

        </div>
      </ScrollArea>
    </div>
  )
}
