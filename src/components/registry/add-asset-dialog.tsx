import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CheckIcon,
  IdCardIcon,
  MapPinIcon,
  SaveIcon,
  TagsIcon,
} from 'lucide-react'

import { StatusBadge } from '@/components/common/status-badge'
import { Field, FieldGrid, ScoreMeter } from '@/components/registry/detail/detail-parts'
import { completeness, scoreTone } from '@/components/registry/registry-utils'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatMYR, formatNumber, formatPct } from '@/lib/format'
import { TOWNS } from '@/lib/geo'
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  DEPARTMENTS,
  OWNERSHIP_TYPES,
  TENURES,
  ZONES,
  type Asset,
  type AssetCategory,
  type AssetStatus,
  type Condition,
  type Criticality,
  type Department,
  type OwnershipType,
  type Tenure,
  type Zone,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { nextAssetCode, type NewAssetInput } from '@/store/app-store'

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const SUBCATEGORY_SUGGESTIONS: Record<AssetCategory, readonly string[]> = {
  'Commercial Property': ['Kompleks Niaga', 'Deretan Kedai', 'Pasar Awam', 'Medan Selera', 'Ruang Pejabat'],
  Industrial: ['Kilang Berkembar', 'Gudang Logistik', 'Lot Perindustrian', 'Bengkel Ringan'],
  Land: ['Tanah Pembangunan', 'Tanah Pertanian', 'Rizab Perindustrian', 'Tanah Pelancongan'],
  'Tourism & Hospitality': ['Chalet Pantai', 'Resort', 'Pusat Rekreasi', 'Jeti Pelancongan'],
  Infrastructure: ['Jalan Perindustrian', 'Sistem Perparitan', 'Loji Rawatan Air', 'Jambatan'],
  'Building & Facility': ['Dewan Serbaguna', 'Surau', 'Pusat Komuniti', 'Bangunan Pentadbiran'],
  'Plant & Equipment': ['Genset Sandaran', 'Sistem Penyaman Udara', 'Lif Penumpang', 'Pam Air'],
  'ICT & Digital': ['Pelayan Pusat Data', 'Rangkaian Kampus', 'Sistem CCTV', 'Perisian Korporat'],
}

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

const CATEGORY_LIFE: Record<AssetCategory, number> = {
  'Commercial Property': 50,
  Industrial: 40,
  Land: 99,
  'Tourism & Hospitality': 30,
  Infrastructure: 40,
  'Building & Facility': 40,
  'Plant & Equipment': 10,
  'ICT & Digital': 5,
}

const LAND_TITLE_CATEGORIES: readonly AssetCategory[] = [
  'Commercial Property',
  'Industrial',
  'Land',
  'Tourism & Hospitality',
  'Infrastructure',
  'Building & Facility',
]

const MUKIMS = [
  'Mukim Pantai Timur',
  'Mukim Sedili',
  'Mukim Tenggara',
  'Mukim Pengerang',
  'Mukim Johor Lama',
  'Mukim Kota Tinggi',
  'Mukim Penawar',
  'Mukim Mersing',
  'Mukim Jemaluang',
  'Mukim Padang Endau',
  'Mukim Tanjung Surat',
] as const

/**
 * The shipped Switch styles target a forward-looking `data-checked` attribute while
 * the installed Radix primitive emits `data-state`. These literals bridge the gap
 * without touching anything in components/ui.
 */
const SWITCH_STATE_CLASSES =
  'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&_[data-slot=switch-thumb][data-state=checked]]:translate-x-[calc(100%-2px)] [&_[data-slot=switch-thumb][data-state=unchecked]]:translate-x-0'

const STEPS = [
  { key: 'identity', label: 'Identity', icon: IdCardIcon },
  { key: 'classification', label: 'Classification & custody', icon: TagsIcon },
  { key: 'location', label: 'Location', icon: MapPinIcon },
  { key: 'financials', label: 'Financials', icon: BanknoteIcon },
  { key: 'review', label: 'Review', icon: CheckIcon },
] as const

/* ------------------------------------------------------------------ */
/* Draft shape                                                         */
/* ------------------------------------------------------------------ */

interface AssetDraft {
  name: string
  category: AssetCategory
  subCategory: string
  ownership: OwnershipType
  status: AssetStatus
  condition: Condition
  conditionScore: number
  criticality: Criticality
  custodianDepartment: Department
  custodianName: string
  tags: string
  notes: string
  zone: Zone
  town: string
  district: string
  address: string
  lat: string
  lng: string
  hasLandTitle: boolean
  titleNo: string
  lotNo: string
  mukim: string
  tenure: Tenure
  areaHectares: string
  acquisitionDate: string
  acquisitionCost: string
  currentValue: string
  usefulLifeYears: string
  depreciationMethod: Asset['depreciationMethod']
  utilisationRate: number
  revenueYtd: string
  opexYtd: string
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function emptyDraft(): AssetDraft {
  const town = TOWNS[0]
  return {
    name: '',
    category: 'Commercial Property',
    subCategory: '',
    ownership: 'Owned',
    status: 'Active',
    condition: 'Good',
    conditionScore: 78,
    criticality: 'Medium',
    custodianDepartment: 'Property Management',
    custodianName: '',
    tags: '',
    notes: '',
    zone: town.zone,
    town: town.name,
    district: town.district,
    address: '',
    lat: town.lat.toFixed(5),
    lng: town.lng.toFixed(5),
    hasLandTitle: true,
    titleNo: '',
    lotNo: '',
    mukim: MUKIMS[0],
    tenure: 'Leasehold 99yr',
    areaHectares: '',
    acquisitionDate: todayIso(),
    acquisitionCost: '',
    currentValue: '',
    usefulLifeYears: String(CATEGORY_LIFE['Commercial Property']),
    depreciationMethod: 'Straight Line',
    utilisationRate: 65,
    revenueYtd: '0',
    opexYtd: '0',
  }
}

function num(value: string): number {
  const n = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/* ------------------------------------------------------------------ */
/* Derived economics                                                   */
/* ------------------------------------------------------------------ */

interface DraftEconomics {
  ageYears: number
  accumulated: number
  netBookValue: number
  annualCharge: number
}

function economics(draft: AssetDraft): DraftEconomics {
  const cost = num(draft.acquisitionCost)
  const life = Math.max(1, num(draft.usefulLifeYears) || 1)
  const acq = new Date(draft.acquisitionDate).getTime()
  const ageYears = Number.isFinite(acq) ? Math.max(0, (Date.now() - acq) / (1000 * 60 * 60 * 24 * 365.25)) : 0

  const raw =
    draft.depreciationMethod === 'Reducing Balance'
      ? cost * (1 - Math.pow(0.8, ageYears))
      : (cost * ageYears) / life
  const accumulated = Math.max(0, Math.min(raw, cost * 0.95))

  return {
    ageYears,
    accumulated: Math.round(accumulated),
    netBookValue: Math.round(cost - accumulated),
    annualCharge: Math.round(draft.depreciationMethod === 'Reducing Balance' ? (cost - accumulated) * 0.2 : cost / life),
  }
}

/** Mirrors the register's own risk weighting so a new record ranks honestly. */
function riskFor(draft: AssetDraft): number {
  const criticalityRisk: Record<Criticality, number> = { Critical: 22, High: 14, Medium: 7, Low: 2 }
  const score = (100 - draft.conditionScore) * 0.62 + criticalityRisk[draft.criticality] + 9
  return Math.max(3, Math.min(99, Math.round(score)))
}

/** Build the provisional Asset used for the review preview and for submission. */
function toAsset(draft: AssetDraft, code: string): NewAssetInput {
  const econ = economics(draft)
  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const useLandTitle = draft.hasLandTitle && LAND_TITLE_CATEGORIES.includes(draft.category)

  return {
    name: draft.name.trim(),
    category: draft.category,
    subCategory: draft.subCategory.trim() || SUBCATEGORY_SUGGESTIONS[draft.category][0],
    status: draft.status,
    condition: draft.condition,
    conditionScore: draft.conditionScore,
    criticality: draft.criticality,
    location: {
      lat: num(draft.lat),
      lng: num(draft.lng),
      zone: draft.zone,
      town: draft.town,
      district: draft.district,
      address: draft.address.trim(),
    },
    acquisitionDate: draft.acquisitionDate,
    acquisitionCost: num(draft.acquisitionCost),
    currentValue: num(draft.currentValue) || num(draft.acquisitionCost),
    accumulatedDepreciation: econ.accumulated,
    netBookValue: econ.netBookValue,
    usefulLifeYears: Math.max(1, num(draft.usefulLifeYears)),
    depreciationMethod: draft.depreciationMethod,
    custodianDepartment: draft.custodianDepartment,
    custodianName: draft.custodianName.trim(),
    ownership: draft.ownership,
    landTitle: useLandTitle
      ? {
          titleNo: draft.titleNo.trim() || '—',
          lotNo: draft.lotNo.trim() || '—',
          mukim: draft.mukim,
          tenure: draft.tenure,
          leaseExpiry:
            draft.tenure === 'Freehold'
              ? undefined
              : `${new Date(draft.acquisitionDate).getFullYear() + Number(draft.tenure.replace(/\D/g, '') || 99)}-06-30`,
          areaHectares: num(draft.areaHectares),
        }
      : undefined,
    qrPayload: `https://oneasset.kdh.com.my/qr/${code}`,
    tags,
    documents: [],
    utilisationRate: draft.utilisationRate,
    revenueYtd: num(draft.revenueYtd),
    opexYtd: num(draft.opexYtd),
    riskScore: riskFor(draft),
    dataQualityScore: 0,
    notes: draft.notes.trim() || undefined,
    code,
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

type Errors = Partial<Record<keyof AssetDraft, string>>

function validateStep(step: number, draft: AssetDraft): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (draft.name.trim().length < 4) e.name = 'Give the asset a recognisable name of at least 4 characters.'
    if (!draft.subCategory.trim()) e.subCategory = 'Choose or type a sub-category.'
  }
  if (step === 1) {
    if (!draft.custodianName.trim()) e.custodianName = 'Name the officer accountable for this asset.'
    if (draft.conditionScore < 0 || draft.conditionScore > 100) e.conditionScore = 'Condition score must be 0–100.'
  }
  if (step === 2) {
    if (!draft.town.trim()) e.town = 'Select the town the asset sits in.'
    if (draft.address.trim().length < 8) e.address = 'Record a postal address of at least 8 characters.'
    const lat = num(draft.lat)
    const lng = num(draft.lng)
    if (lat < 1.2 || lat > 2.7) e.lat = 'Latitude must fall inside the KEJORA region (1.20–2.70).'
    if (lng < 103.3 || lng > 104.6) e.lng = 'Longitude must fall inside the KEJORA region (103.30–104.60).'
    if (draft.hasLandTitle && LAND_TITLE_CATEGORIES.includes(draft.category)) {
      if (!draft.titleNo.trim()) e.titleNo = 'Enter the title number, or switch off the land title block.'
      if (num(draft.areaHectares) <= 0) e.areaHectares = 'Enter the titled area in hectares.'
    }
  }
  if (step === 3) {
    if (!draft.acquisitionDate) e.acquisitionDate = 'An acquisition date is required.'
    else if (new Date(draft.acquisitionDate).getTime() > Date.now())
      e.acquisitionDate = 'Acquisition date cannot be in the future.'
    if (num(draft.acquisitionCost) <= 0) e.acquisitionCost = 'Acquisition cost must be greater than zero.'
    if (num(draft.currentValue) < 0) e.currentValue = 'Current value cannot be negative.'
    if (num(draft.usefulLifeYears) < 1) e.usefulLifeYears = 'Useful life must be at least one year.'
  }
  return e
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface AddAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingAssets: Asset[]
  onCreate: (input: NewAssetInput) => void
}

/** Five-step capture wizard — the primary "add real data" path in the demo. */
export function AddAssetDialog({ open, onOpenChange, existingAssets, onCreate }: AddAssetDialogProps) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft)
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (open) {
      setStep(0)
      setDraft(emptyDraft())
      setErrors({})
    }
  }, [open])

  const set = <K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  const code = useMemo(() => nextAssetCode(existingAssets, draft.category), [existingAssets, draft.category])
  const econ = useMemo(() => economics(draft), [draft])
  const preview = useMemo(() => toAsset(draft, code), [draft, code])
  const qualityScore = useMemo(
    () => completeness({ ...(preview as unknown as Asset), id: 'preview', createdAt: '', updatedAt: '' }),
    [preview],
  )

  const townsInZone = useMemo(() => TOWNS.filter((t) => t.zone === draft.zone), [draft.zone])
  const showLandTitle = LAND_TITLE_CATEGORIES.includes(draft.category)

  const goNext = () => {
    const found = validateStep(step, draft)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const submit = () => {
    for (let i = 0; i < 4; i++) {
      const found = validateStep(i, draft)
      if (Object.keys(found).length > 0) {
        setErrors(found)
        setStep(i)
        return
      }
    }
    onCreate({ ...toAsset(draft, code), dataQualityScore: qualityScore })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Register a new asset</DialogTitle>
          <DialogDescription>
            Capture the asset once and it flows straight into the register, the GIS map, maintenance and the audit
            trail. Provisional code{' '}
            <span className="font-mono font-medium text-foreground">{code}</span>.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} onJump={(i) => setStep(Math.min(i, step))} />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && <IdentityStep draft={draft} set={set} errors={errors} />}
          {step === 1 && <ClassificationStep draft={draft} set={set} errors={errors} />}
          {step === 2 && (
            <LocationStep
              draft={draft}
              set={set}
              errors={errors}
              townsInZone={townsInZone}
              showLandTitle={showLandTitle}
            />
          )}
          {step === 3 && <FinancialsStep draft={draft} set={set} errors={errors} econ={econ} />}
          {step === 4 && (
            <ReviewStep draft={draft} code={code} econ={econ} qualityScore={qualityScore} showLandTitle={showLandTitle} />
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </p>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                <ArrowLeftIcon aria-hidden="true" />
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={goNext}>
                Continue
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit}>
                <SaveIcon aria-hidden="true" />
                Register asset
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Step chrome                                                         */
/* ------------------------------------------------------------------ */

function StepIndicator({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-5 py-3">
      {STEPS.map((s, i) => {
        const done = i < step
        const active = i === step
        const Icon = s.icon
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={i > step}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium transition-colors',
                active ? 'text-foreground' : done ? 'text-primary hover:bg-accent/50' : 'text-muted-foreground',
                i > step && 'cursor-default',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? <CheckIcon className="size-3" /> : <Icon className="size-3" />}
              </span>
              <span className="hidden truncate sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('h-px min-w-3 flex-1', done ? 'bg-primary/40' : 'bg-border')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function FormRow({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

type SetFn = <K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) => void

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function IdentityStep({ draft, set, errors }: { draft: AssetDraft; set: SetFn; errors: Errors }) {
  return (
    <div className="space-y-4">
      <FormRow label="Asset name" htmlFor="asset-name" error={errors.name} hint="As it should read on the asset register and the printed label.">
        <Input
          id="asset-name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Kompleks Niaga Bandar Penawar"
          aria-invalid={Boolean(errors.name)}
        />
      </FormRow>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Category" hint="Drives the asset code prefix and the default custodian.">
          <Select
            value={draft.category}
            onValueChange={(v) => {
              const category = v as AssetCategory
              set('category', category)
              set('custodianDepartment', CATEGORY_DEPARTMENT[category])
              set('usefulLifeYears', String(CATEGORY_LIFE[category]))
              set('subCategory', '')
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Ownership">
          <Select value={draft.ownership} onValueChange={(v) => set('ownership', v as OwnershipType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNERSHIP_TYPES.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <FormRow label="Sub-category" htmlFor="asset-subcategory" error={errors.subCategory}>
        <Input
          id="asset-subcategory"
          value={draft.subCategory}
          onChange={(e) => set('subCategory', e.target.value)}
          placeholder="Type or pick a suggestion below"
          aria-invalid={Boolean(errors.subCategory)}
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SUBCATEGORY_SUGGESTIONS[draft.category].map((s) => (
            <button key={s} type="button" onClick={() => set('subCategory', s)}>
              <Badge
                variant={draft.subCategory === s ? 'default' : 'outline'}
                className="cursor-pointer font-normal"
              >
                {s}
              </Badge>
            </button>
          ))}
        </div>
      </FormRow>
    </div>
  )
}

function ClassificationStep({ draft, set, errors }: { draft: AssetDraft; set: SetFn; errors: Errors }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Status">
          <Select value={draft.status} onValueChange={(v) => set('status', v as AssetStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Condition">
          <Select
            value={draft.condition}
            onValueChange={(v) => {
              const condition = v as Condition
              set('condition', condition)
              const defaults: Record<Condition, number> = {
                Excellent: 94,
                Good: 80,
                Fair: 62,
                Poor: 42,
                Critical: 22,
              }
              set('conditionScore', defaults[condition])
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Criticality">
          <Select value={draft.criticality} onValueChange={(v) => set('criticality', v as Criticality)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITICALITIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <FormRow
        label={`Condition score — ${draft.conditionScore}/100`}
        error={errors.conditionScore}
        hint="Surveyor's assessment of physical condition; feeds the risk register."
      >
        <Slider
          value={[draft.conditionScore]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => set('conditionScore', v[0] ?? 0)}
          aria-label="Condition score"
        />
      </FormRow>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Custodian department">
          <Select value={draft.custodianDepartment} onValueChange={(v) => set('custodianDepartment', v as Department)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Named custodian" htmlFor="asset-custodian" error={errors.custodianName}>
          <Input
            id="asset-custodian"
            value={draft.custodianName}
            onChange={(e) => set('custodianName', e.target.value)}
            placeholder="e.g. Nurul Aina binti Hassan"
            aria-invalid={Boolean(errors.custodianName)}
          />
        </FormRow>
      </div>

      <FormRow label="Tags" htmlFor="asset-tags" hint="Comma separated — used for portfolio segmentation.">
        <Input
          id="asset-tags"
          value={draft.tags}
          onChange={(e) => set('tags', e.target.value)}
          placeholder="Income Generating, Zone Flagship"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {['Income Generating', 'Zone Flagship', 'Community Asset', 'Strategic Land', 'Statutory Inspection'].map(
            (tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  const current = draft.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                  if (current.includes(tag)) set('tags', current.filter((t) => t !== tag).join(', '))
                  else set('tags', [...current, tag].join(', '))
                }}
              >
                <Badge variant="outline" className="cursor-pointer font-normal">
                  {tag}
                </Badge>
              </button>
            ),
          )}
        </div>
      </FormRow>

      <FormRow label="Custodian notes" htmlFor="asset-notes" hint="Optional, but it lifts the record's data quality score.">
        <Textarea
          id="asset-notes"
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          placeholder="e.g. Bumbung dijadualkan untuk pemeriksaan menyeluruh suku berikutnya."
        />
      </FormRow>
    </div>
  )
}

function LocationStep({
  draft,
  set,
  errors,
  townsInZone,
  showLandTitle,
}: {
  draft: AssetDraft
  set: SetFn
  errors: Errors
  townsInZone: typeof TOWNS
  showLandTitle: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="KEJORA zone">
          <Select
            value={draft.zone}
            onValueChange={(v) => {
              const zone = v as Zone
              const first = TOWNS.find((t) => t.zone === zone)
              set('zone', zone)
              if (first) {
                set('town', first.name)
                set('district', first.district)
                set('lat', first.lat.toFixed(5))
                set('lng', first.lng.toFixed(5))
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Town / Bandar" error={errors.town} hint="Selecting a town seeds the coordinates.">
          <Select
            value={draft.town}
            onValueChange={(v) => {
              const town = TOWNS.find((t) => t.name === v)
              set('town', v)
              if (town) {
                set('district', town.district)
                set('lat', town.lat.toFixed(5))
                set('lng', town.lng.toFixed(5))
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {townsInZone.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="District / Daerah" htmlFor="asset-district">
          <Input id="asset-district" value={draft.district} onChange={(e) => set('district', e.target.value)} />
        </FormRow>
        <FormRow label="Latitude" htmlFor="asset-lat" error={errors.lat}>
          <Input
            id="asset-lat"
            className="font-mono"
            value={draft.lat}
            onChange={(e) => set('lat', e.target.value)}
            aria-invalid={Boolean(errors.lat)}
          />
        </FormRow>
        <FormRow label="Longitude" htmlFor="asset-lng" error={errors.lng}>
          <Input
            id="asset-lng"
            className="font-mono"
            value={draft.lng}
            onChange={(e) => set('lng', e.target.value)}
            aria-invalid={Boolean(errors.lng)}
          />
        </FormRow>
      </div>

      <FormRow label="Postal address" htmlFor="asset-address" error={errors.address}>
        <Textarea
          id="asset-address"
          rows={2}
          value={draft.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="PTD 4821, Jalan Perdana, 81930 Bandar Penawar, Johor"
          aria-invalid={Boolean(errors.address)}
        />
      </FormRow>

      {showLandTitle && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Land title (hakmilik)</p>
              <p className="text-xs text-muted-foreground">
                Recording the geran closes the largest single data gap in the register.
              </p>
            </div>
            <Switch
              checked={draft.hasLandTitle}
              onCheckedChange={(v) => set('hasLandTitle', Boolean(v))}
              aria-label="Record a land title for this asset"
              className={SWITCH_STATE_CLASSES}
            />
          </div>

          {draft.hasLandTitle && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormRow label="Title no." htmlFor="asset-title-no" error={errors.titleNo}>
                <Input
                  id="asset-title-no"
                  className="font-mono"
                  value={draft.titleNo}
                  onChange={(e) => set('titleNo', e.target.value)}
                  placeholder="GRN 48213"
                  aria-invalid={Boolean(errors.titleNo)}
                />
              </FormRow>
              <FormRow label="Lot no." htmlFor="asset-lot-no">
                <Input
                  id="asset-lot-no"
                  className="font-mono"
                  value={draft.lotNo}
                  onChange={(e) => set('lotNo', e.target.value)}
                  placeholder="PTD 4821"
                />
              </FormRow>
              <FormRow label="Mukim">
                <Select value={draft.mukim} onValueChange={(v) => set('mukim', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MUKIMS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Tenure">
                <Select value={draft.tenure} onValueChange={(v) => set('tenure', v as Tenure)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENURES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Titled area (hectares)" htmlFor="asset-hectares" error={errors.areaHectares}>
                <Input
                  id="asset-hectares"
                  inputMode="decimal"
                  className="font-mono"
                  value={draft.areaHectares}
                  onChange={(e) => set('areaHectares', e.target.value)}
                  placeholder="2.45"
                  aria-invalid={Boolean(errors.areaHectares)}
                />
              </FormRow>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FinancialsStep({
  draft,
  set,
  errors,
  econ,
}: {
  draft: AssetDraft
  set: SetFn
  errors: Errors
  econ: DraftEconomics
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Acquisition date" htmlFor="asset-acq-date" error={errors.acquisitionDate}>
          <Input
            id="asset-acq-date"
            type="date"
            value={draft.acquisitionDate}
            onChange={(e) => set('acquisitionDate', e.target.value)}
            aria-invalid={Boolean(errors.acquisitionDate)}
          />
        </FormRow>
        <FormRow label="Acquisition cost (RM)" htmlFor="asset-acq-cost" error={errors.acquisitionCost}>
          <Input
            id="asset-acq-cost"
            inputMode="numeric"
            className="font-mono"
            value={draft.acquisitionCost}
            onChange={(e) => set('acquisitionCost', e.target.value)}
            placeholder="4500000"
            aria-invalid={Boolean(errors.acquisitionCost)}
          />
        </FormRow>
        <FormRow
          label="Current market value (RM)"
          htmlFor="asset-current-value"
          error={errors.currentValue}
          hint="Leave blank to carry the acquisition cost forward."
        >
          <Input
            id="asset-current-value"
            inputMode="numeric"
            className="font-mono"
            value={draft.currentValue}
            onChange={(e) => set('currentValue', e.target.value)}
            placeholder="5200000"
            aria-invalid={Boolean(errors.currentValue)}
          />
        </FormRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormRow label="Useful life (years)" htmlFor="asset-life" error={errors.usefulLifeYears}>
          <Input
            id="asset-life"
            inputMode="numeric"
            className="font-mono"
            value={draft.usefulLifeYears}
            onChange={(e) => set('usefulLifeYears', e.target.value)}
            aria-invalid={Boolean(errors.usefulLifeYears)}
          />
        </FormRow>
        <FormRow label="Depreciation method">
          <Select
            value={draft.depreciationMethod}
            onValueChange={(v) => set('depreciationMethod', v as Asset['depreciationMethod'])}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Straight Line">Straight Line</SelectItem>
              <SelectItem value="Reducing Balance">Reducing Balance (20%)</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow label={`Utilisation — ${draft.utilisationRate}%`}>
          <Slider
            value={[draft.utilisationRate]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => set('utilisationRate', v[0] ?? 0)}
            aria-label="Utilisation rate"
          />
        </FormRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Revenue year-to-date (RM)" htmlFor="asset-revenue">
          <Input
            id="asset-revenue"
            inputMode="numeric"
            className="font-mono"
            value={draft.revenueYtd}
            onChange={(e) => set('revenueYtd', e.target.value)}
          />
        </FormRow>
        <FormRow label="Operating expenditure year-to-date (RM)" htmlFor="asset-opex">
          <Input
            id="asset-opex"
            inputMode="numeric"
            className="font-mono"
            value={draft.opexYtd}
            onChange={(e) => set('opexYtd', e.target.value)}
          />
        </FormRow>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Calculated on save</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Asset age" value={`${formatNumber(econ.ageYears, 1)} years`} mono />
          <Field label="Annual charge" value={formatMYR(econ.annualCharge)} mono />
          <Field label="Accumulated depreciation" value={formatMYR(econ.accumulated)} mono />
          <Field label="Net book value" value={formatMYR(econ.netBookValue)} mono />
        </div>
      </div>
    </div>
  )
}

function ReviewStep({
  draft,
  code,
  econ,
  qualityScore,
  showLandTitle,
}: {
  draft: AssetDraft
  code: string
  econ: DraftEconomics
  qualityScore: number
  showLandTitle: boolean
}) {
  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{code}</span>
          <span className="text-sm font-medium text-foreground">{draft.name || 'Unnamed asset'}</span>
          <StatusBadge status={draft.status} />
          <StatusBadge status={draft.condition} />
          <StatusBadge status={draft.criticality} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {draft.category} · {draft.subCategory || SUBCATEGORY_SUGGESTIONS[draft.category][0]} · {draft.town},{' '}
          {draft.zone}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Identity & custody</h4>
          <FieldGrid className="sm:grid-cols-2">
            <Field label="Ownership" value={draft.ownership} />
            <Field label="Custodian dept." value={draft.custodianDepartment} />
            <Field label="Custodian" value={draft.custodianName} />
            <Field label="Condition score" value={`${draft.conditionScore}/100`} mono />
          </FieldGrid>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Location</h4>
          <FieldGrid className="sm:grid-cols-2">
            <Field label="Zone" value={draft.zone} />
            <Field label="Town" value={draft.town} />
            <Field label="District" value={draft.district} />
            <Field label="Coordinates" value={`${draft.lat}, ${draft.lng}`} mono />
            <Field label="Address" value={draft.address} className="col-span-2" />
          </FieldGrid>
          {showLandTitle && draft.hasLandTitle && (
            <FieldGrid className="mt-3 sm:grid-cols-2">
              <Field label="Title no." value={draft.titleNo} mono />
              <Field label="Lot no." value={draft.lotNo} mono />
              <Field label="Mukim" value={draft.mukim} />
              <Field label="Tenure" value={draft.tenure} />
              <Field label="Area" value={`${draft.areaHectares || '0'} ha`} mono />
            </FieldGrid>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Financial position</h4>
        <FieldGrid className="sm:grid-cols-4">
          <Field label="Acquisition" value={formatDate(draft.acquisitionDate)} />
          <Field label="Cost" value={formatMYR(num(draft.acquisitionCost))} mono />
          <Field
            label="Current value"
            value={formatMYR(num(draft.currentValue) || num(draft.acquisitionCost))}
            mono
          />
          <Field label="Net book value" value={formatMYR(econ.netBookValue)} mono />
          <Field label="Method" value={draft.depreciationMethod} />
          <Field label="Useful life" value={`${draft.usefulLifeYears} years`} />
          <Field label="Utilisation" value={formatPct(draft.utilisationRate, 0)} />
          <Field label="Net YTD" value={formatMYR(num(draft.revenueYtd) - num(draft.opexYtd))} mono />
        </FieldGrid>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Projected data quality</h4>
            <p className="text-xs text-muted-foreground">
              Scored on the same completeness rules as every other record in the register.
            </p>
          </div>
          <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{qualityScore}</span>
        </div>
        <ScoreMeter className="mt-3" value={qualityScore} tone={scoreTone(qualityScore)} />
        <p className="mt-2 text-xs text-muted-foreground">
          Documents, insurance and inspection dates can be attached after the record is created — the Data Quality tab
          will list exactly what is still outstanding.
        </p>
      </section>
    </div>
  )
}
