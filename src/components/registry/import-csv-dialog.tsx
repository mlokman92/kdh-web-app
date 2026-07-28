import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react'

import { parseCsv, type ParsedCsv } from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadCsv, formatMYR, formatNumber } from '@/lib/format'
import { TOWNS } from '@/lib/geo'
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  OWNERSHIP_TYPES,
  ZONES,
  type AssetCategory,
  type AssetStatus,
  type Condition,
  type Criticality,
  type Department,
  type OwnershipType,
  type Zone,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import type { NewAssetInput } from '@/store/app-store'

/* ------------------------------------------------------------------ */
/* Field map                                                           */
/* ------------------------------------------------------------------ */

const IMPORT_FIELDS = [
  { key: 'name', label: 'Asset name', required: true, aliases: ['name', 'asset', 'asset name', 'nama'] },
  { key: 'category', label: 'Category', required: true, aliases: ['category', 'kategori', 'class'] },
  { key: 'subCategory', label: 'Sub-category', required: false, aliases: ['sub-category', 'subcategory', 'sub category', 'type'] },
  { key: 'status', label: 'Status', required: false, aliases: ['status', 'state'] },
  { key: 'condition', label: 'Condition', required: false, aliases: ['condition', 'keadaan'] },
  { key: 'criticality', label: 'Criticality', required: false, aliases: ['criticality', 'critical', 'kritikal'] },
  { key: 'ownership', label: 'Ownership', required: false, aliases: ['ownership', 'tenure type', 'milik'] },
  { key: 'zone', label: 'Zone', required: false, aliases: ['zone', 'zon'] },
  { key: 'town', label: 'Town', required: false, aliases: ['town', 'bandar', 'location', 'lokasi'] },
  { key: 'address', label: 'Address', required: false, aliases: ['address', 'alamat'] },
  { key: 'acquisitionDate', label: 'Acquisition date', required: false, aliases: ['acquisition date', 'acquired', 'tarikh perolehan', 'date'] },
  { key: 'acquisitionCost', label: 'Acquisition cost', required: true, aliases: ['acquisition cost', 'cost', 'kos', 'purchase price', 'value'] },
  { key: 'currentValue', label: 'Current value', required: false, aliases: ['current value', 'market value', 'nilai semasa'] },
  { key: 'custodianName', label: 'Custodian', required: false, aliases: ['custodian', 'officer', 'pegawai', 'owner'] },
] as const

type ImportField = (typeof IMPORT_FIELDS)[number]['key']
type Mapping = Partial<Record<ImportField, number>>

const NONE_VALUE = '__none__'

function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {}
  const normalised = headers.map((h) => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[_-]+/g, ' ').trim())
  for (const field of IMPORT_FIELDS) {
    const idx = normalised.findIndex((h) => field.aliases.some((a) => h === a))
    const loose = idx >= 0 ? idx : normalised.findIndex((h) => field.aliases.some((a) => h.includes(a)))
    if (loose >= 0 && !Object.values(mapping).includes(loose)) mapping[field.key] = loose
  }
  return mapping
}

/* ------------------------------------------------------------------ */
/* Demo batch                                                          */
/* ------------------------------------------------------------------ */

const DEMO_CSV: ParsedCsv = {
  headers: [
    'Asset Name',
    'Category',
    'Sub-category',
    'Status',
    'Condition',
    'Criticality',
    'Ownership',
    'Zone',
    'Town',
    'Address',
    'Acquisition Date',
    'Acquisition Cost (RM)',
    'Current Value (RM)',
    'Custodian',
  ],
  rows: [
    ['Kompleks Gerai Pengerang Fasa 3', 'Commercial Property', 'Medan Selera', 'Active', 'Good', 'High', 'Owned', 'Zon Pengerang–Sungai Rengit', 'Pengerang', 'PTD 5512, Jalan Dagang, 81600 Pengerang, Johor', '2023-04-18', '3850000', '4420000', 'Amirul Hakim bin Yusof'],
    ['Gudang Logistik Bandar Mas 4', 'Industrial', 'Gudang Logistik', 'Leased', 'Excellent', 'Critical', 'Owned', 'Zon Bandar Mas–Air Tawar', 'Bandar Mas', 'PTD 2280, Jalan Perdana, 81900 Bandar Mas, Johor', '2021-09-02', '12400000', '14150000', 'Chong Wei Ming'],
    ['Chalet Tanjung Balau Blok C', 'Tourism & Hospitality', 'Chalet Pantai', 'Active', 'Fair', 'Medium', 'Owned', 'Zon Desaru–Penawar', 'Tanjung Balau', 'Lot 318, Jalan Sentosa, 81930 Tanjung Balau, Johor', '2019-06-25', '2650000', '2980000', 'Siti Zubaidah binti Omar'],
    ['Tanah Rizab Perindustrian Tenggara', 'Land', 'Rizab Perindustrian', 'Idle', 'Good', 'Medium', 'Owned', 'Zon Bandar Tenggara', 'Bandar Tenggara', 'PTD 8814, Jalan Utama, 81440 Bandar Tenggara, Johor', '2016-02-11', '8900000', '15600000', 'Ganesan a/l Muthu'],
    ['Dewan Serbaguna Sedili Besar', 'Building & Facility', 'Dewan Serbaguna', 'Active', 'Fair', 'Low', 'Owned', 'Zon Sedili–Kota Tinggi', 'Sedili Besar', 'Lot 122, Jalan Bakti, 81907 Sedili Besar, Johor', '2014-11-30', '1750000', '1920000', 'Rosnah binti Abu Bakar'],
    ['Genset Sandaran Kompleks Mersing', 'Plant & Equipment', 'Genset Sandaran', 'Active', 'Good', 'High', 'Owned', 'Zon Mersing', 'Mersing', 'No. 12, Jalan Melur, 86800 Mersing, Johor', '2024-03-07', '480000', '395000', 'Hafiz bin Zainuddin'],
  ],
}

/* ------------------------------------------------------------------ */
/* Row -> asset                                                        */
/* ------------------------------------------------------------------ */

function matchOption<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const v = value.trim().toLowerCase()
  if (!v) return fallback
  return options.find((o) => o.toLowerCase() === v) ?? options.find((o) => o.toLowerCase().includes(v)) ?? fallback
}

function num(value: string): number {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

interface StagedRow {
  raw: string[]
  name: string
  category: AssetCategory
  subCategory: string
  status: AssetStatus
  condition: Condition
  criticality: Criticality
  ownership: OwnershipType
  zone: Zone
  town: string
  district: string
  lat: number
  lng: number
  address: string
  acquisitionDate: string
  acquisitionCost: number
  currentValue: number
  custodianName: string
  issues: string[]
}

/** Keeps imported rows consistent with how the register assigns custody by category. */
const CATEGORY_DEPARTMENT: Record<AssetCategory, Department> = {
  'Commercial Property': 'Property Management',
  Industrial: 'Industrial Estates',
  Land: 'Land & Development',
  'Tourism & Hospitality': 'Tourism & Recreation',
  Infrastructure: 'Facilities & Maintenance',
  'Building & Facility': 'Facilities & Maintenance',
  'Plant & Equipment': 'Facilities & Maintenance',
  'ICT & Digital': 'Corporate Services',
}

const CONDITION_SCORE: Record<Condition, number> = {
  Excellent: 93,
  Good: 80,
  Fair: 62,
  Poor: 42,
  Critical: 22,
}

function stageRow(row: string[], mapping: Mapping): StagedRow {
  const read = (key: ImportField): string => {
    const idx = mapping[key]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  const issues: string[] = []
  const name = read('name')
  if (!name) issues.push('Missing asset name — row will be skipped')

  const category = matchOption(read('category'), ASSET_CATEGORIES, 'Building & Facility')
  if (read('category') && category !== read('category').trim()) issues.push(`Category resolved to "${category}"`)

  const townName = read('town')
  const town = TOWNS.find((t) => t.name.toLowerCase() === townName.toLowerCase())
  const zone = town ? town.zone : matchOption(read('zone'), ZONES, 'Zon Bandar Tenggara')
  const anchor = town ?? TOWNS.find((t) => t.zone === zone) ?? TOWNS[0]
  if (townName && !town) issues.push(`Town "${townName}" not recognised — anchored to ${anchor.name}`)

  const cost = num(read('acquisitionCost'))
  if (cost <= 0) issues.push('Acquisition cost missing or non-numeric')

  const rawDate = read('acquisitionDate')
  const parsedDate = rawDate && !Number.isNaN(new Date(rawDate).getTime()) ? new Date(rawDate) : new Date()
  if (rawDate && Number.isNaN(new Date(rawDate).getTime())) issues.push('Acquisition date unreadable — defaulted to today')

  const condition = matchOption(read('condition'), CONDITIONS, 'Good')

  return {
    raw: row,
    name,
    category,
    subCategory: read('subCategory') || category,
    status: matchOption(read('status'), ASSET_STATUSES, 'Active'),
    condition,
    criticality: matchOption(read('criticality'), CRITICALITIES, 'Medium'),
    ownership: matchOption(read('ownership'), OWNERSHIP_TYPES, 'Owned'),
    zone,
    town: town?.name ?? anchor.name,
    district: anchor.district,
    lat: anchor.lat,
    lng: anchor.lng,
    address: read('address') || `${anchor.name}, Johor`,
    acquisitionDate: parsedDate.toISOString().slice(0, 10),
    acquisitionCost: cost,
    currentValue: num(read('currentValue')) || cost,
    custodianName: read('custodianName') || 'Belum ditetapkan',
    issues,
  }
}

function toNewAsset(staged: StagedRow): NewAssetInput {
  const life =
    staged.category === 'Land' ? 99 : staged.category === 'ICT & Digital' ? 5 : staged.category === 'Plant & Equipment' ? 10 : 40
  const ageYears = Math.max(
    0,
    (Date.now() - new Date(staged.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  )
  const accumulated = Math.round(Math.min((staged.acquisitionCost * ageYears) / life, staged.acquisitionCost * 0.95))

  return {
    name: staged.name,
    category: staged.category,
    subCategory: staged.subCategory,
    status: staged.status,
    condition: staged.condition,
    conditionScore: CONDITION_SCORE[staged.condition],
    criticality: staged.criticality,
    location: {
      lat: staged.lat,
      lng: staged.lng,
      zone: staged.zone,
      town: staged.town,
      district: staged.district,
      address: staged.address,
    },
    acquisitionDate: staged.acquisitionDate,
    acquisitionCost: staged.acquisitionCost,
    currentValue: staged.currentValue,
    accumulatedDepreciation: accumulated,
    netBookValue: staged.acquisitionCost - accumulated,
    usefulLifeYears: life,
    depreciationMethod: 'Straight Line',
    custodianDepartment: CATEGORY_DEPARTMENT[staged.category],
    custodianName: staged.custodianName,
    ownership: staged.ownership,
    qrPayload: '',
    tags: ['Imported Batch'],
    documents: [],
    utilisationRate: staged.status === 'Idle' ? 12 : 68,
    revenueYtd: 0,
    opexYtd: 0,
    riskScore: Math.max(3, Math.min(99, Math.round((100 - CONDITION_SCORE[staged.condition]) * 0.62 + 16))),
    dataQualityScore: 0,
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Stage = 'choose' | 'map' | 'importing' | 'done'

export interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (inputs: NewAssetInput[]) => void
}

/** Guided CSV intake: choose file, confirm the column mapping, preview, import. */
export function ImportCsvDialog({ open, onOpenChange, onImport }: ImportCsvDialogProps) {
  const [stage, setStage] = useState<Stage>('choose')
  const [fileName, setFileName] = useState<string>('')
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [progress, setProgress] = useState(0)
  const [imported, setImported] = useState(0)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStage('choose')
      setFileName('')
      setParsed(null)
      setMapping({})
      setProgress(0)
      setImported(0)
      setParseError(null)
    }
  }, [open])

  const staged = useMemo(() => {
    if (!parsed) return []
    return parsed.rows.map((row) => stageRow(row, mapping))
  }, [parsed, mapping])

  const validRows = useMemo(() => staged.filter((s) => s.name.length > 0 && s.acquisitionCost > 0), [staged])

  /* Simulated ingest — paced so the progress bar is legible during a pitch. */
  useEffect(() => {
    if (stage !== 'importing') return
    setProgress(0)
    const total = Math.max(1, validRows.length)
    let tick = 0
    const timer = window.setInterval(() => {
      tick += 1
      const pct = Math.min(100, Math.round((tick / 14) * 100))
      setProgress(pct)
      setImported(Math.round((pct / 100) * total))
      if (pct >= 100) {
        window.clearInterval(timer)
        onImport(validRows.map(toNewAsset))
        setStage('done')
      }
    }, 110)
    return () => window.clearInterval(timer)
  }, [stage])

  const acceptParsed = (data: ParsedCsv, label: string) => {
    if (data.headers.length === 0 || data.rows.length === 0) {
      setParseError('That file has no readable rows. Check that it is a comma-separated file with a header row.')
      return
    }
    setParseError(null)
    setParsed(data)
    setMapping(autoMap(data.headers))
    setFileName(label)
    setStage('map')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => acceptParsed(parseCsv(String(reader.result ?? '')), file.name)
    reader.onerror = () => setParseError('The file could not be read.')
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    downloadCsv(
      'kdh-asset-import-template.csv',
      DEMO_CSV.rows.slice(0, 2).map((row) => {
        const obj: Record<string, string> = {}
        DEMO_CSV.headers.forEach((h, i) => {
          obj[h] = row[i] ?? ''
        })
        return obj
      }),
    )
  }

  const totalCost = validRows.reduce((s, r) => s + r.acquisitionCost, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Import assets from CSV</DialogTitle>
          <DialogDescription>
            Bring an existing spreadsheet into the register. Columns are matched automatically and every value is
            validated against the KDH classification lists before anything is written.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {stage === 'choose' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                >
                  <UploadIcon className="size-5" />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">Choose a CSV file</span>
                  <span className="block text-sm text-muted-foreground">
                    Exports from Excel, Google Sheets or the existing asset ledger all work.
                  </span>
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose a CSV file to import"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                  e.target.value = ''
                }}
              />

              {parseError && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {parseError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => acceptParsed(DEMO_CSV, 'kdh-sample-batch.csv')}>
                  <FileSpreadsheetIcon aria-hidden="true" />
                  Use the sample batch ({DEMO_CSV.rows.length} rows)
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <DownloadIcon aria-hidden="true" />
                  Download template
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Expected columns</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {IMPORT_FIELDS.map((f) => (
                    <Badge key={f.key} variant={f.required ? 'default' : 'outline'} className="font-normal">
                      {f.label}
                      {f.required && ' *'}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Only asset name and acquisition cost are mandatory. Anything else is inferred from the KDH standards
                  — unrecognised towns are anchored to the nearest KEJORA settlement.
                </p>
              </div>
            </div>
          )}

          {stage === 'map' && parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <FileSpreadsheetIcon className="size-4 text-primary" aria-hidden="true" />
                <span className="font-mono text-xs text-foreground">{fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatNumber(parsed.rows.length)} rows · {parsed.headers.length} columns detected
                </span>
                <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setStage('choose')}>
                  Change file
                </Button>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Column mapping</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {IMPORT_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground" htmlFor={`map-${field.key}`}>
                        {field.label}
                        {field.required && <span className="text-destructive"> *</span>}
                      </label>
                      <Select
                        value={mapping[field.key] === undefined ? NONE_VALUE : String(mapping[field.key])}
                        onValueChange={(v) =>
                          setMapping((m) => ({
                            ...m,
                            [field.key]: v === NONE_VALUE ? undefined : Number(v),
                          }))
                        }
                      >
                        <SelectTrigger id={`map-${field.key}`} size="sm" className="w-full">
                          <SelectValue placeholder="Not mapped" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Not mapped</SelectItem>
                          {parsed.headers.map((h, i) => (
                            <SelectItem key={`${h}-${i}`} value={String(i)}>
                              {h || `Column ${i + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Preview</p>
                  <Badge variant="outline" className="font-normal">
                    {formatNumber(validRows.length)} of {formatNumber(staged.length)} rows ready
                  </Badge>
                  {validRows.length > 0 && (
                    <Badge variant="secondary" className="font-mono font-normal">
                      {formatMYR(totalCost)} total cost
                    </Badge>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border [&_[data-slot=table-container]]:overflow-visible">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="bg-muted/60">Asset name</TableHead>
                        <TableHead className="bg-muted/60">Category</TableHead>
                        <TableHead className="bg-muted/60">Zone / Town</TableHead>
                        <TableHead className="bg-muted/60 text-right">Cost</TableHead>
                        <TableHead className="bg-muted/60">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staged.slice(0, 40).map((row, i) => {
                        const ok = row.name.length > 0 && row.acquisitionCost > 0
                        return (
                          <TableRow key={i} className={cn(!ok && 'opacity-60')}>
                            <TableCell className="max-w-[14rem]">
                              <p className="truncate text-sm text-foreground">{row.name || '—'}</p>
                              {row.issues.length > 0 && (
                                <p className="truncate text-xs text-muted-foreground">{row.issues.join(' · ')}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.category}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.town} · {row.zone}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {formatMYR(row.acquisitionCost)}
                            </TableCell>
                            <TableCell>
                              {ok ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'font-normal',
                                    row.issues.length > 0
                                      ? 'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/30 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]'
                                      : 'border-primary/25 bg-primary/10 text-primary',
                                  )}
                                >
                                  {row.issues.length > 0 ? 'Ready with defaults' : 'Ready'}
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="font-normal">
                                  Skipped
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {staged.length > 40 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing the first 40 rows — all {formatNumber(staged.length)} will be processed.
                  </p>
                )}
              </div>
            </div>
          )}

          {stage === 'importing' && (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Writing records to the asset register…</span>
                <span className="font-mono tabular-nums text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground">
                {formatNumber(imported)} of {formatNumber(validRows.length)} assets processed. Codes, QR payloads and
                audit entries are generated as each row lands.
              </p>
            </div>
          )}

          {stage === 'done' && (
            <div className="space-y-4 py-8 text-center">
              <span
                aria-hidden="true"
                className="mx-auto flex size-12 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"
              >
                <CheckCircle2Icon className="size-6" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {formatNumber(validRows.length)} assets imported
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatMYR(totalCost)} of acquisition cost added to the register from {fileName}. Every new record is
                  tagged "Imported Batch" so you can review them as a set.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {stage === 'map' ? `${formatNumber(validRows.length)} rows will be written` : 'No data leaves this browser'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {stage === 'done' ? 'Close' : 'Cancel'}
            </Button>
            {stage === 'map' && (
              <Button size="sm" disabled={validRows.length === 0} onClick={() => setStage('importing')}>
                <UploadIcon aria-hidden="true" />
                Import {formatNumber(validRows.length)} assets
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
