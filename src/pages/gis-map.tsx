import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ActivityIcon,
  BanknoteIcon,
  DownloadIcon,
  LandmarkIcon,
  MapIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  WrenchIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ZONES, type Asset, type Zone } from '@/lib/types'
import { downloadCsv, formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { haversineKm } from '@/lib/geo'
import { isOpenWorkOrder } from '@/lib/analytics'
import { useAppStore } from '@/store/app-store'
import { useAuthStore, visibleZones } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/common/page-header'
import { KpiCard } from '@/components/common/kpi-card'
import { cn } from '@/lib/utils'
import { MapCanvas } from '@/components/map/map-canvas'
import { MapControlRail } from '@/components/map/map-control-rail'
import type { LayerKey, LayerState, MapFiltersState } from '@/components/map/map-layers'
import { AssetInspector, RadiusResults } from '@/components/map/map-inspector'
import { MapStats, type StatRow, type ZoneRow } from '@/components/map/map-stats'
import {
  ZONE_BBOX,
  ZONE_SHORT,
  placeAssets,
  pointInRect,
  type PlacedAsset,
} from '@/components/map/map-geometry'
import {
  COLOR_MODE_LABELS,
  assetColor,
  assetDimension,
  computeValueBands,
  legendItems,
  type ColorMode,
} from '@/components/map/map-theme'
import { useMapViewport } from '@/components/map/use-map-viewport'

const DEFAULT_LAYERS: LayerState = {
  zones: true,
  towns: true,
  pins: true,
  clusters: true,
  heatmap: false,
  graticule: true,
  labels: true,
}

const DEFAULT_FILTERS: MapFiltersState = {
  query: '',
  categories: [],
  statuses: [],
  zones: [],
  conditions: [],
  valuePct: [0, 100],
}

/** Which filter a colour mode maps onto, so the legend can exclude itself. */
type FilterDim = 'categories' | 'statuses' | 'conditions' | null

function filterDimFor(mode: ColorMode): FilterDim {
  if (mode === 'category') return 'categories'
  if (mode === 'status') return 'statuses'
  if (mode === 'condition') return 'conditions'
  return null
}

export default function GisMap() {
  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)
  const user = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()

  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_FILTERS)
  const [colorMode, setColorMode] = useState<ColorMode>('category')
  const [heatMetric, setHeatMetric] = useState<'value' | 'risk'>('value')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [radiusMode, setRadiusMode] = useState(false)
  const [radiusCentre, setRadiusCentre] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusKm, setRadiusKm] = useState(12)
  const [zoomTarget, setZoomTarget] = useState<string>('all')

  const viewport = useMapViewport()
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  /* ------------------------- scoping & placement ------------------------- */

  /** RBAC: a zone-scoped user only ever sees their own zones on the map. */
  const allowedZones = useMemo(() => new Set(visibleZones(user)), [user])
  const scoped = useMemo(
    () => assets.filter((a) => a.status !== 'Disposed' && allowedZones.has(a.location.zone)),
    [assets, allowedZones],
  )

  const placed = useMemo(() => placeAssets(scoped), [scoped])
  const bands = useMemo(() => computeValueBands(scoped), [scoped])

  const valueBounds = useMemo(() => {
    if (scoped.length === 0) return { min: 0, max: 1 }
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const a of scoped) {
      if (a.currentValue < min) min = a.currentValue
      if (a.currentValue > max) max = a.currentValue
    }
    return { min: Math.max(1, min), max: Math.max(max, min + 1) }
  }, [scoped])

  /** Log-scaled slider so the long tail of high-value assets stays usable. */
  const pctToValue = useCallback(
    (pct: number) => valueBounds.min * (valueBounds.max / valueBounds.min) ** (pct / 100),
    [valueBounds],
  )
  const valueThresholds = useMemo(
    () =>
      [pctToValue(filters.valuePct[0]) * 0.999, pctToValue(filters.valuePct[1]) * 1.001] as [
        number,
        number,
      ],
    [filters.valuePct, pctToValue],
  )

  /* ------------------------------- filtering ----------------------------- */

  const applyFilters = useCallback(
    (list: PlacedAsset[], exclude: FilterDim = null) => {
      const q = filters.query.trim().toLowerCase()
      const cats = new Set(filters.categories)
      const stats = new Set(filters.statuses)
      const zons = new Set(filters.zones)
      const conds = new Set(filters.conditions)
      return list.filter(({ asset }) => {
        if (exclude !== 'categories' && cats.size > 0 && !cats.has(asset.category)) return false
        if (exclude !== 'statuses' && stats.size > 0 && !stats.has(asset.status)) return false
        if (exclude !== 'conditions' && conds.size > 0 && !conds.has(asset.condition)) return false
        if (zons.size > 0 && !zons.has(asset.location.zone)) return false
        if (asset.currentValue < valueThresholds[0] || asset.currentValue > valueThresholds[1])
          return false
        if (q) {
          const hay = `${asset.name} ${asset.code} ${asset.location.town} ${asset.subCategory} ${asset.custodianName}`
          if (!hay.toLowerCase().includes(q)) return false
        }
        return true
      })
    },
    [filters, valueThresholds],
  )

  const filtered = useMemo(() => applyFilters(placed), [applyFilters, placed])

  /* ------------------------------- proximity ----------------------------- */

  const radiusItems = useMemo(() => {
    if (!radiusCentre) return []
    return filtered.filter(
      (p) =>
        haversineKm(radiusCentre, { lat: p.asset.location.lat, lng: p.asset.location.lng }) <=
        radiusKm,
    )
  }, [filtered, radiusCentre, radiusKm])

  const radiusIds = useMemo(() => new Set(radiusItems.map((p) => p.asset.id)), [radiusItems])
  const radiusValue = radiusItems.reduce((s, p) => s + p.asset.currentValue, 0)

  /* ------------------------------ viewport stats ------------------------- */

  const { rect } = viewport
  const inView = useMemo(
    () => filtered.filter((p) => pointInRect(p.x, p.y, rect)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, rect.x, rect.y, rect.w, rect.h],
  )
  const inViewValue = useMemo(
    () => inView.reduce((s, p) => s + p.asset.currentValue, 0),
    [inView],
  )

  const legend = useMemo(() => legendItems(colorMode, bands), [colorMode, bands])

  /** Legend counts exclude their own dimension so the list stays explorable. */
  const legendCounts = useMemo(() => {
    const base = applyFilters(placed, filterDimFor(colorMode))
    const out: Record<string, number> = {}
    for (const p of base) {
      const key = assetDimension(p.asset, colorMode, bands)
      out[key] = (out[key] ?? 0) + 1
    }
    return out
  }, [applyFilters, placed, colorMode, bands])

  const statRows: StatRow[] = useMemo(() => {
    const counts = new Map<string, { count: number; value: number }>()
    for (const p of inView) {
      const key = assetDimension(p.asset, colorMode, bands)
      const cur = counts.get(key) ?? { count: 0, value: 0 }
      cur.count += 1
      cur.value += p.asset.currentValue
      counts.set(key, cur)
    }
    return legend
      .map((l) => ({
        key: l.key,
        label: l.label,
        color: l.color,
        count: counts.get(l.key)?.count ?? 0,
        value: counts.get(l.key)?.value ?? 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [inView, legend, colorMode, bands])

  const zoneRows: ZoneRow[] = useMemo(() => {
    const counts = new Map<string, { count: number; value: number }>()
    for (const p of inView) {
      const z = p.asset.location.zone
      const cur = counts.get(z) ?? { count: 0, value: 0 }
      cur.count += 1
      cur.value += p.asset.currentValue
      counts.set(z, cur)
    }
    return ZONES.filter((z) => allowedZones.has(z)).map((z) => ({
      zone: z,
      short: ZONE_SHORT[z] ?? z,
      count: counts.get(z)?.count ?? 0,
      value: counts.get(z)?.value ?? 0,
    }))
  }, [inView, allowedZones])

  /* --------------------------------- KPIs -------------------------------- */

  const kpis = useMemo(() => {
    const value = filtered.reduce((s, p) => s + p.asset.currentValue, 0)
    const avgCondition =
      filtered.length === 0
        ? 0
        : filtered.reduce((s, p) => s + p.asset.conditionScore, 0) / filtered.length
    const atRisk = filtered.filter(
      (p) => p.asset.condition === 'Critical' || p.asset.condition === 'Poor',
    ).length
    const ids = new Set(filtered.map((p) => p.asset.id))
    const openWos = workOrders.filter((w) => ids.has(w.assetId) && isOpenWorkOrder(w)).length
    const zonesCovered = new Set(filtered.map((p) => p.asset.location.zone)).size
    return { value, avgCondition, atRisk, openWos, zonesCovered }
  }, [filtered, workOrders])

  /* ------------------------------- selection ----------------------------- */

  const selectedAsset: Asset | null = useMemo(
    () => (selectedId ? (scoped.find((a) => a.id === selectedId) ?? null) : null),
    [scoped, selectedId],
  )

  // Drop the selection when the asset falls outside the active filters.
  useEffect(() => {
    if (!selectedId) return
    if (!filtered.some((p) => p.asset.id === selectedId)) setSelectedId(null)
  }, [filtered, selectedId])

  const zoomToAsset = useCallback((asset: Asset) => {
    const p = placeAssets([asset])[0]
    viewportRef.current.fitBbox({ x: p.x - 40, y: p.y - 40, w: 80, h: 80 }, 0.1)
  }, [])

  // Deep links from the shell / command palette: ?asset=… and ?zone=…
  const consumedParams = useRef(false)
  useEffect(() => {
    if (consumedParams.current) return
    const assetId = searchParams.get('asset')
    const zone = searchParams.get('zone')
    if (!assetId && !zone) return
    consumedParams.current = true

    if (zone && (ZONES as readonly string[]).includes(zone)) {
      setFilters((f) => ({ ...f, zones: [zone as Zone] }))
      const bbox = ZONE_BBOX[zone]
      if (bbox) viewportRef.current.fitBbox(bbox)
    }
    if (assetId) {
      const found = assets.find((a) => a.id === assetId)
      if (found) {
        setSelectedId(found.id)
        zoomToAsset(found)
      }
    }
    const next = new URLSearchParams(searchParams)
    next.delete('asset')
    next.delete('zone')
    setSearchParams(next, { replace: true })
  }, [assets, searchParams, setSearchParams, zoomToAsset])

  /* -------------------------------- actions ------------------------------ */

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }))
  }, [])

  const patchFilters = useCallback((patch: Partial<MapFiltersState>) => {
    setFilters((f) => ({ ...f, ...patch }))
  }, [])

  /** Zone click doubles as a filter toggle and a "zoom to zone" gesture. */
  const toggleZone = useCallback(
    (zone: Zone) => {
      const on = filters.zones.includes(zone)
      const zones = on ? filters.zones.filter((z) => z !== zone) : [...filters.zones, zone]
      setFilters((f) => ({ ...f, zones }))
      if (!on && zones.length === 1) {
        const bbox = ZONE_BBOX[zone]
        if (bbox) viewportRef.current.fitBbox(bbox)
      } else if (zones.length === 0) {
        viewportRef.current.reset()
        setZoomTarget('all')
      }
    },
    [filters.zones],
  )

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    toast.success('Map filters cleared')
  }, [])

  const handleZoomTarget = useCallback((value: string) => {
    setZoomTarget(value)
    if (value === 'all') {
      viewportRef.current.reset()
      return
    }
    const bbox = ZONE_BBOX[value]
    if (bbox) viewportRef.current.fitBbox(bbox)
  }, [])

  const handlePickCentre = useCallback((p: { lat: number; lng: number }) => {
    setRadiusCentre(p)
    setRadiusMode(false)
    setSelectedId(null)
  }, [])

  const clearRadius = useCallback(() => {
    setRadiusCentre(null)
    setRadiusMode(false)
  }, [])

  const exportView = useCallback(() => {
    if (inView.length === 0) {
      toast.error('Nothing in view to export')
      return
    }
    downloadCsv(
      `kdh-map-view-${new Date().toISOString().slice(0, 10)}.csv`,
      inView.map(({ asset }) => ({
        Code: asset.code,
        Name: asset.name,
        Category: asset.category,
        Status: asset.status,
        Condition: asset.condition,
        Criticality: asset.criticality,
        Zone: asset.location.zone,
        Town: asset.location.town,
        District: asset.location.district,
        Latitude: asset.location.lat,
        Longitude: asset.location.lng,
        CurrentValueRM: asset.currentValue,
        NetBookValueRM: asset.netBookValue,
        UtilisationPct: asset.utilisationRate,
        ConditionScore: asset.conditionScore,
        RiskScore: asset.riskScore,
      })),
    )
    toast.success(`Exported ${inView.length} assets in view`)
  }, [inView])

  const showInspector = Boolean(selectedAsset) || Boolean(radiusCentre)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GIS Asset Map"
        description="Geospatial intelligence across the six KEJORA operational zones — 240 assets located, clustered and analysed without a single external tile request."
        icon={MapIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'GIS Asset Map' }]}
        actions={
          <>
            <Select value={zoomTarget} onValueChange={handleZoomTarget}>
              <SelectTrigger size="sm" className="w-[13.5rem]" aria-label="Zoom to zone">
                <SelectValue placeholder="Zoom to…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole KEJORA region</SelectItem>
                {ZONES.filter((z) => allowedZones.has(z)).map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                viewport.reset()
                setZoomTarget('all')
              }}
            >
              <RotateCcwIcon className="size-3.5" aria-hidden="true" />
              Reset view
            </Button>
            <Button size="sm" className="gap-2" onClick={exportView}>
              <DownloadIcon className="size-3.5" aria-hidden="true" />
              Export view
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Assets mapped"
          value={formatNumber(filtered.length)}
          sublabel={`of ${formatNumber(scoped.length)} in scope`}
          icon={LandmarkIcon}
        />
        <KpiCard
          label="Mapped value"
          value={formatMYRCompact(kpis.value)}
          sublabel="current book valuation"
          icon={BanknoteIcon}
          intent="positive"
        />
        <KpiCard
          label="Avg condition"
          value={`${kpis.avgCondition.toFixed(1)}`}
          sublabel="score out of 100"
          icon={ActivityIcon}
          intent={kpis.avgCondition >= 75 ? 'positive' : 'warning'}
        />
        <KpiCard
          label="Poor / critical"
          value={formatNumber(kpis.atRisk)}
          sublabel={`${formatPct(filtered.length ? (kpis.atRisk / filtered.length) * 100 : 0, 1)} of mapped assets`}
          icon={ShieldAlertIcon}
          intent="critical"
        />
        <KpiCard
          label="Open work orders"
          value={formatNumber(kpis.openWos)}
          sublabel={`across ${kpis.zonesCovered} of ${allowedZones.size} zones`}
          icon={WrenchIcon}
          intent="warning"
        />
      </div>

      <div
        className={cn(
          'grid grid-cols-1 gap-4 lg:h-[calc(100dvh_-_21rem)] lg:min-h-[34rem]',
          showInspector
            ? 'lg:grid-cols-[15rem_minmax(0,1fr)_18rem] xl:grid-cols-[16.5rem_minmax(0,1fr)_21rem]'
            : 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)]',
        )}
      >
        <div className="h-[28rem] min-h-0 lg:h-full">
          <MapControlRail
            filters={filters}
            onFilters={patchFilters}
            onResetFilters={resetFilters}
            layers={layers}
            onToggleLayer={toggleLayer}
            colorMode={colorMode}
            onColorMode={setColorMode}
            heatMetric={heatMetric}
            onHeatMetric={setHeatMetric}
            bands={bands}
            legendCounts={legendCounts}
            valueBounds={valueBounds}
            valueThresholds={valueThresholds}
            radiusMode={radiusMode}
            onToggleRadiusMode={() => setRadiusMode((m) => !m)}
            radiusCentre={radiusCentre}
            radiusKm={radiusKm}
            onRadiusKm={setRadiusKm}
            onClearRadius={clearRadius}
            radiusCount={radiusItems.length}
            radiusValue={radiusValue}
            matchCount={filtered.length}
            totalCount={scoped.length}
          />
        </div>

        <div className="h-[62vh] min-h-[24rem] lg:h-full">
          <MapCanvas
            placed={filtered}
            viewport={viewport}
            layers={layers}
            colorMode={colorMode}
            bands={bands}
            heatMetric={heatMetric}
            selectedId={selectedId}
            onSelect={setSelectedId}
            activeZones={filters.zones}
            onToggleZone={toggleZone}
            radiusMode={radiusMode}
            radiusCentre={radiusCentre}
            radiusKm={radiusKm}
            radiusIds={radiusIds}
            onPickCentre={handlePickCentre}
            statsSlot={
              <MapStats
                title="In current view"
                count={inView.length}
                value={inViewValue}
                totalCount={filtered.length}
                dimensionLabel={COLOR_MODE_LABELS[colorMode]}
                rows={statRows}
                zones={zoneRows}
                activeZones={filters.zones}
                onZoneClick={(z) => toggleZone(z as Zone)}
              />
            }
          />
        </div>

        {showInspector && (
          <div className="h-[32rem] min-h-0 lg:h-full">
            {selectedAsset ? (
              <AssetInspector
                asset={selectedAsset}
                color={assetColor(selectedAsset, colorMode, bands)}
                onClose={() => setSelectedId(null)}
                onZoomTo={() => zoomToAsset(selectedAsset)}
                onRadiusFromHere={() => {
                  setRadiusCentre({
                    lat: selectedAsset.location.lat,
                    lng: selectedAsset.location.lng,
                  })
                  setRadiusMode(false)
                  setSelectedId(null)
                  toast.success(`Searching ${radiusKm} km around ${selectedAsset.code}`)
                }}
              />
            ) : (
              radiusCentre && (
                <RadiusResults
                  centre={radiusCentre}
                  radiusKm={radiusKm}
                  items={radiusItems}
                  colorMode={colorMode}
                  bands={bands}
                  onSelect={(id) => setSelectedId(id)}
                  onClose={clearRadius}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
