/**
 * Unified Digital Asset Registry — pure helpers.
 *
 * Everything in this file is side-effect free: filtering, faceting, sorting,
 * completeness scoring, depreciation modelling and CSV shaping. Keeping it out of
 * the components means the table, the bulk bar and the data-quality panel all agree
 * on exactly the same arithmetic.
 */

import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheckIcon,
  Building2Icon,
  CpuIcon,
  FactoryIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  LandPlotIcon,
  ReceiptIcon,
  RouteIcon,
  RulerIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TreePalmIcon,
  WarehouseIcon,
  WrenchIcon,
} from 'lucide-react'

import type { Tone } from '@/components/common/status-badge'
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  OWNERSHIP_TYPES,
  ZONES,
  type Asset,
  type AssetCategory,
  type AssetDocument,
  type AssetStatus,
  type Condition,
  type Criticality,
} from '@/lib/types'

/* ================================================================== */
/* Facets                                                              */
/* ================================================================== */

export const FACET_KEYS = ['category', 'status', 'condition', 'zone', 'criticality', 'ownership'] as const
export type FacetKey = (typeof FACET_KEYS)[number]
export type FacetState = Record<FacetKey, string[]>

export interface FacetMeta {
  label: string
  options: readonly string[]
  valueOf: (a: Asset) => string
}

export const FACET_META: Record<FacetKey, FacetMeta> = {
  category: { label: 'Category', options: ASSET_CATEGORIES, valueOf: (a) => a.category },
  status: { label: 'Status', options: ASSET_STATUSES, valueOf: (a) => a.status },
  condition: { label: 'Condition', options: CONDITIONS, valueOf: (a) => a.condition },
  zone: { label: 'Zone', options: ZONES, valueOf: (a) => a.location.zone },
  criticality: { label: 'Criticality', options: CRITICALITIES, valueOf: (a) => a.criticality },
  ownership: { label: 'Ownership', options: OWNERSHIP_TYPES, valueOf: (a) => a.ownership },
}

export function emptyFacets(): FacetState {
  return { category: [], status: [], condition: [], zone: [], criticality: [], ownership: [] }
}

export function activeFacetCount(facets: FacetState): number {
  return FACET_KEYS.reduce((n, k) => n + facets[k].length, 0)
}

/* ================================================================== */
/* Search + filtering                                                  */
/* ================================================================== */

/** Global search across name, code, town, custodian and tags. */
export function matchesQuery(a: Asset, needle: string): boolean {
  if (!needle) return true
  const q = needle.trim().toLowerCase()
  if (!q) return true
  return (
    a.name.toLowerCase().includes(q) ||
    a.code.toLowerCase().includes(q) ||
    a.subCategory.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q) ||
    a.location.town.toLowerCase().includes(q) ||
    a.location.district.toLowerCase().includes(q) ||
    a.location.zone.toLowerCase().includes(q) ||
    a.location.address.toLowerCase().includes(q) ||
    a.custodianName.toLowerCase().includes(q) ||
    a.custodianDepartment.toLowerCase().includes(q) ||
    a.tags.some((t) => t.toLowerCase().includes(q)) ||
    (a.landTitle ? a.landTitle.titleNo.toLowerCase().includes(q) || a.landTitle.lotNo.toLowerCase().includes(q) : false)
  )
}

/**
 * Apply the search box and every selected facet.
 * `exclude` leaves one facet out so that facet can show honest option counts.
 */
export function filterAssets(
  assets: Asset[],
  query: string,
  facets: FacetState,
  exclude?: FacetKey,
): Asset[] {
  return assets.filter((a) => {
    if (!matchesQuery(a, query)) return false
    for (const key of FACET_KEYS) {
      if (key === exclude) continue
      const selected = facets[key]
      if (selected.length > 0 && !selected.includes(FACET_META[key].valueOf(a))) return false
    }
    return true
  })
}

/** Option -> count for a single facet, respecting every other active filter. */
export function facetCounts(
  assets: Asset[],
  query: string,
  facets: FacetState,
  key: FacetKey,
): Record<string, number> {
  const scope = filterAssets(assets, query, facets, key)
  const out: Record<string, number> = {}
  for (const option of FACET_META[key].options) out[option] = 0
  const read = FACET_META[key].valueOf
  for (const a of scope) {
    const v = read(a)
    out[v] = (out[v] ?? 0) + 1
  }
  return out
}

/* ================================================================== */
/* Sorting                                                             */
/* ================================================================== */

export const SORT_KEYS = [
  'code',
  'name',
  'category',
  'location',
  'status',
  'condition',
  'criticality',
  'nbv',
  'utilisation',
  'quality',
] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

const CONDITION_RANK: Record<Condition, number> = {
  Critical: 0,
  Poor: 1,
  Fair: 2,
  Good: 3,
  Excellent: 4,
}

const CRITICALITY_RANK: Record<Criticality, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 }

const STATUS_RANK: Record<AssetStatus, number> = ASSET_STATUSES.reduce(
  (acc, s, i) => {
    acc[s] = i
    return acc
  },
  {} as Record<AssetStatus, number>,
)

function compareBy(a: Asset, b: Asset, key: SortKey): number {
  switch (key) {
    case 'code':
      return a.code.localeCompare(b.code)
    case 'name':
      return a.name.localeCompare(b.name)
    case 'category':
      return a.category.localeCompare(b.category) || a.subCategory.localeCompare(b.subCategory)
    case 'location':
      return a.location.zone.localeCompare(b.location.zone) || a.location.town.localeCompare(b.location.town)
    case 'status':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    case 'condition':
      return CONDITION_RANK[a.condition] - CONDITION_RANK[b.condition] || a.conditionScore - b.conditionScore
    case 'criticality':
      return CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality]
    case 'nbv':
      return a.netBookValue - b.netBookValue
    case 'utilisation':
      return a.utilisationRate - b.utilisationRate
    case 'quality':
      return a.dataQualityScore - b.dataQualityScore
    default:
      return 0
  }
}

export function sortAssets(rows: Asset[], key: SortKey, dir: SortDir): Asset[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => {
    const primary = compareBy(a, b, key)
    if (primary !== 0) return primary * sign
    return a.code.localeCompare(b.code)
  })
}

/* ================================================================== */
/* Columns                                                             */
/* ================================================================== */

export const COLUMN_KEYS = [
  'category',
  'location',
  'status',
  'condition',
  'criticality',
  'nbv',
  'utilisation',
  'quality',
] as const
export type ColumnKey = (typeof COLUMN_KEYS)[number]
export type ColumnState = Record<ColumnKey, boolean>

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  category: 'Category',
  location: 'Zone / Town',
  status: 'Status',
  condition: 'Condition',
  criticality: 'Criticality',
  nbv: 'Net book value',
  utilisation: 'Utilisation',
  quality: 'Data quality',
}

export function defaultColumns(): ColumnState {
  return {
    category: true,
    location: true,
    status: true,
    condition: true,
    criticality: true,
    nbv: true,
    utilisation: true,
    quality: true,
  }
}

export const PAGE_SIZES = [10, 25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export type Density = 'comfortable' | 'compact'

/* ================================================================== */
/* Data quality                                                        */
/* ================================================================== */

export interface QualityGap {
  key: string
  label: string
  hint: string
  weight: number
}

const LAND_HOLDING: readonly AssetCategory[] = [
  'Commercial Property',
  'Industrial',
  'Land',
  'Tourism & Hospitality',
  'Infrastructure',
  'Building & Facility',
]

const BUILT_FORM: readonly AssetCategory[] = [
  'Commercial Property',
  'Industrial',
  'Tourism & Hospitality',
  'Building & Facility',
]

interface QualityCheck extends QualityGap {
  applies: (a: Asset) => boolean
  satisfied: (a: Asset) => boolean
}

const QUALITY_CHECKS: readonly QualityCheck[] = [
  {
    key: 'landTitle',
    label: 'Land title',
    hint: 'Geran, lot no., mukim and tenure are not recorded.',
    weight: 12,
    applies: (a) => LAND_HOLDING.includes(a.category),
    satisfied: (a) => Boolean(a.landTitle?.titleNo),
  },
  {
    key: 'building',
    label: 'Building schedule',
    hint: 'Gross and lettable floor area, floors and year built are missing.',
    weight: 10,
    applies: (a) => BUILT_FORM.includes(a.category),
    satisfied: (a) => Boolean(a.building),
  },
  {
    key: 'insurance',
    label: 'Insurance cover',
    hint: 'No policy number, insurer or sum insured on file.',
    weight: 14,
    applies: () => true,
    satisfied: (a) => Boolean(a.insurance?.policyNo),
  },
  {
    key: 'documents',
    label: 'Supporting documents',
    hint: 'Fewer than three documents attached to the record.',
    weight: 12,
    applies: () => true,
    satisfied: (a) => a.documents.length >= 3,
  },
  {
    key: 'nextInspection',
    label: 'Next inspection',
    hint: 'No forward inspection date — statutory cycle cannot be tracked.',
    weight: 12,
    applies: (a) => a.status !== 'Disposed',
    satisfied: (a) => Boolean(a.nextInspection),
  },
  {
    key: 'lastInspection',
    label: 'Last inspection',
    hint: 'No historic inspection recorded against the asset.',
    weight: 6,
    applies: (a) => a.status !== 'Disposed',
    satisfied: (a) => Boolean(a.lastInspection),
  },
  {
    key: 'coordinates',
    label: 'Geo coordinates',
    hint: 'Latitude / longitude missing — the asset cannot be mapped.',
    weight: 10,
    applies: () => true,
    satisfied: (a) => Number.isFinite(a.location.lat) && Number.isFinite(a.location.lng) && a.location.lat !== 0,
  },
  {
    key: 'esg',
    label: 'ESG telemetry',
    hint: 'No energy, water or carbon figures captured for reporting.',
    weight: 8,
    applies: (a) => BUILT_FORM.includes(a.category),
    satisfied: (a) => Boolean(a.esg),
  },
  {
    key: 'tags',
    label: 'Classification tags',
    hint: 'Fewer than two tags — portfolio segmentation will be incomplete.',
    weight: 6,
    applies: () => true,
    satisfied: (a) => a.tags.length >= 2,
  },
  {
    key: 'custodian',
    label: 'Named custodian',
    hint: 'No responsible officer named for the asset.',
    weight: 5,
    applies: () => true,
    satisfied: (a) => a.custodianName.trim().length > 0,
  },
  {
    key: 'notes',
    label: 'Custodian notes',
    hint: 'No narrative note explaining the current position of the asset.',
    weight: 5,
    applies: () => true,
    satisfied: (a) => Boolean(a.notes && a.notes.trim().length > 0),
  },
]

/** The checks this asset fails, heaviest first. */
export function qualityGaps(a: Asset): QualityGap[] {
  return QUALITY_CHECKS.filter((c) => c.applies(a) && !c.satisfied(a))
    .map(({ key, label, hint, weight }) => ({ key, label, hint, weight }))
    .sort((x, y) => y.weight - x.weight)
}

/** Field-level completeness, 0–100, derived from the checks that actually apply. */
export function completeness(a: Asset): number {
  let total = 0
  let earned = 0
  for (const c of QUALITY_CHECKS) {
    if (!c.applies(a)) continue
    total += c.weight
    if (c.satisfied(a)) earned += c.weight
  }
  if (total === 0) return 100
  return Math.round((earned / total) * 100)
}

/** Every gap across a set of assets, ranked by how many records it affects. */
export function gapFrequency(assets: Asset[]): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  for (const a of assets) {
    for (const g of qualityGaps(a)) counts.set(g.label, (counts.get(g.label) ?? 0) + 1)
  }
  const denominator = assets.length || 1
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / denominator) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count)
}

/** Score bands used by the KPI strip and the quality histogram. */
export const QUALITY_BANDS = [
  { label: '90–100', min: 90, max: 101, tone: 'positive' as Tone },
  { label: '70–89', min: 70, max: 90, tone: 'info' as Tone },
  { label: '50–69', min: 50, max: 70, tone: 'warning' as Tone },
  { label: 'Below 50', min: 0, max: 50, tone: 'critical' as Tone },
] as const

export function scoreTone(score: number): Tone {
  if (score >= 90) return 'positive'
  if (score >= 70) return 'info'
  if (score >= 50) return 'warning'
  return 'critical'
}

/** The registry's working definition of "needs attention". */
export const QUALITY_THRESHOLD = 70

export function needsAttention(a: Asset): boolean {
  return a.dataQualityScore < QUALITY_THRESHOLD
}

/* ================================================================== */
/* Depreciation                                                        */
/* ================================================================== */

export interface DepreciationRow {
  year: number
  age: number
  opening: number
  charge: number
  accumulated: number
  closing: number
  /** The financial year the asset is currently sitting in. */
  current: boolean
}

/** Land held freehold is carried at cost and never written down. */
export function isNonDepreciable(a: Asset): boolean {
  return a.category === 'Land' && a.landTitle?.tenure === 'Freehold'
}

/**
 * Straight-line (or 20% reducing balance) schedule generated from the asset's own
 * acquisition facts, capped at 95% of cost the same way the register is.
 */
export function depreciationSchedule(a: Asset, now: Date = new Date()): DepreciationRow[] {
  if (isNonDepreciable(a)) return []
  const startYear = new Date(a.acquisitionDate).getFullYear()
  if (!Number.isFinite(startYear)) return []

  const life = Math.max(1, Math.round(a.usefulLifeYears || 1))
  const span = Math.min(life, 40)
  const reducing = a.depreciationMethod === 'Reducing Balance'
  const rate = reducing ? 0.2 : 1 / life
  const cap = a.acquisitionCost * 0.95
  const thisYear = now.getFullYear()

  const rows: DepreciationRow[] = []
  let opening = a.acquisitionCost
  let accumulated = 0

  for (let i = 0; i < span; i++) {
    let charge = reducing ? opening * rate : a.acquisitionCost * rate
    if (accumulated + charge > cap) charge = Math.max(0, cap - accumulated)
    const closing = opening - charge
    const year = startYear + i
    accumulated += charge
    rows.push({
      year,
      age: i + 1,
      opening: Math.round(opening),
      charge: Math.round(charge),
      accumulated: Math.round(accumulated),
      closing: Math.round(closing),
      current: year === thisYear,
    })
    opening = closing
  }

  return rows
}

/* ================================================================== */
/* Presentation lookups                                                */
/* ================================================================== */

export const CATEGORY_ICON: Record<AssetCategory, LucideIcon> = {
  'Commercial Property': Building2Icon,
  Industrial: FactoryIcon,
  Land: LandPlotIcon,
  'Tourism & Hospitality': TreePalmIcon,
  Infrastructure: RouteIcon,
  'Building & Facility': WarehouseIcon,
  'Plant & Equipment': WrenchIcon,
  'ICT & Digital': CpuIcon,
}

export const DOCUMENT_ICON: Record<AssetDocument['type'], LucideIcon> = {
  'Title Deed': ScrollTextIcon,
  'Valuation Report': FileSpreadsheetIcon,
  Insurance: ShieldCheckIcon,
  Warranty: BadgeCheckIcon,
  Permit: FileTextIcon,
  'Floor Plan': RulerIcon,
  Photo: ImageIcon,
  Contract: ReceiptIcon,
}

/** 820 KB / 4.2 MB */
export function formatFileSize(sizeKb: number): string {
  if (!Number.isFinite(sizeKb)) return '—'
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`
  return `${Math.round(sizeKb)} KB`
}

/** Records created inside the calendar month containing `now`. */
export function addedThisMonth(assets: Asset[], now: Date = new Date()): Asset[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  return assets.filter((a) => {
    const d = new Date(a.createdAt)
    return Number.isFinite(d.getTime()) && d.getFullYear() === y && d.getMonth() === m
  })
}

/* ================================================================== */
/* CSV                                                                 */
/* ================================================================== */

export function assetCsvRow(a: Asset): Record<string, unknown> {
  return {
    Code: a.code,
    Name: a.name,
    Category: a.category,
    'Sub-category': a.subCategory,
    Status: a.status,
    Condition: a.condition,
    'Condition Score': a.conditionScore,
    Criticality: a.criticality,
    Ownership: a.ownership,
    Zone: a.location.zone,
    Town: a.location.town,
    District: a.location.district,
    Address: a.location.address,
    Latitude: a.location.lat,
    Longitude: a.location.lng,
    'Acquisition Date': a.acquisitionDate.slice(0, 10),
    'Acquisition Cost (RM)': Math.round(a.acquisitionCost),
    'Current Value (RM)': Math.round(a.currentValue),
    'Accumulated Depreciation (RM)': Math.round(a.accumulatedDepreciation),
    'Net Book Value (RM)': Math.round(a.netBookValue),
    'Useful Life (years)': a.usefulLifeYears,
    'Depreciation Method': a.depreciationMethod,
    'Custodian Department': a.custodianDepartment,
    Custodian: a.custodianName,
    'Utilisation (%)': a.utilisationRate,
    'Revenue YTD (RM)': Math.round(a.revenueYtd),
    'Opex YTD (RM)': Math.round(a.opexYtd),
    'Risk Score': a.riskScore,
    'Data Quality': a.dataQualityScore,
    'Title No': a.landTitle?.titleNo ?? '',
    'Lot No': a.landTitle?.lotNo ?? '',
    Mukim: a.landTitle?.mukim ?? '',
    Tenure: a.landTitle?.tenure ?? '',
    'Area (ha)': a.landTitle?.areaHectares ?? '',
    'Last Inspection': a.lastInspection?.slice(0, 10) ?? '',
    'Next Inspection': a.nextInspection?.slice(0, 10) ?? '',
    Tags: a.tags.join(' | '),
    'QR Payload': a.qrPayload,
  }
}

/** Timestamped filename, e.g. kdh-asset-register-2026-07-28.csv */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`
}

/* ================================================================== */
/* Minimal CSV parser (import wizard)                                  */
/* ================================================================== */

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/** RFC-4180-ish parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const cleaned = rows.filter((r) => r.some((c) => c.trim().length > 0))
  if (cleaned.length === 0) return { headers: [], rows: [] }
  const headers = cleaned[0].map((h) => h.replace(/^﻿/, '').trim())
  return { headers, rows: cleaned.slice(1) }
}
