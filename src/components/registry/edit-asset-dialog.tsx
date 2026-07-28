import { useEffect, useMemo, useState } from 'react'
import { SaveIcon, SparklesIcon } from 'lucide-react'

import { ScoreMeter } from '@/components/registry/detail/detail-parts'
import { completeness, qualityGaps, scoreTone } from '@/components/registry/registry-utils'
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
import { Textarea } from '@/components/ui/textarea'
import { formatMYR } from '@/lib/format'
import {
  ASSET_STATUSES,
  CONDITIONS,
  CRITICALITIES,
  DEPARTMENTS,
  type Asset,
  type AssetStatus,
  type Condition,
  type Criticality,
  type Department,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface EditDraft {
  name: string
  status: AssetStatus
  condition: Condition
  conditionScore: number
  criticality: Criticality
  custodianDepartment: Department
  custodianName: string
  utilisationRate: number
  currentValue: string
  lastInspection: string
  nextInspection: string
  tags: string
  notes: string
}

function fromAsset(asset: Asset): EditDraft {
  return {
    name: asset.name,
    status: asset.status,
    condition: asset.condition,
    conditionScore: asset.conditionScore,
    criticality: asset.criticality,
    custodianDepartment: asset.custodianDepartment,
    custodianName: asset.custodianName,
    utilisationRate: asset.utilisationRate,
    currentValue: String(Math.round(asset.currentValue)),
    lastInspection: asset.lastInspection?.slice(0, 10) ?? '',
    nextInspection: asset.nextInspection?.slice(0, 10) ?? '',
    tags: asset.tags.join(', '),
    notes: asset.notes ?? '',
  }
}

function num(value: string): number {
  const n = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface EditAssetDialogProps {
  asset: Asset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (id: string, patch: Partial<Asset>) => void
}

/**
 * Focused edit form over the fields an asset officer actually maintains — and the
 * ones that move the data-quality score, so "fix now" genuinely fixes something.
 */
export function EditAssetDialog({ asset, open, onOpenChange, onSave }: EditAssetDialogProps) {
  /** Edits are keyed to the asset they belong to, so a different record never inherits them. */
  const [edited, setEdited] = useState<{ id: string; draft: EditDraft } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setEdited(null)
      setError(null)
    }
  }, [open])

  const draft: EditDraft | null = asset ? (edited?.id === asset.id ? edited.draft : fromAsset(asset)) : null

  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    if (!asset || !draft) return
    setEdited({ id: asset.id, draft: { ...draft, [key]: value } })
    setError(null)
  }

  const patch: Partial<Asset> | null = useMemo(() => {
    if (!asset || !draft) return null
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return {
      name: draft.name.trim(),
      status: draft.status,
      condition: draft.condition,
      conditionScore: draft.conditionScore,
      criticality: draft.criticality,
      custodianDepartment: draft.custodianDepartment,
      custodianName: draft.custodianName.trim(),
      utilisationRate: draft.utilisationRate,
      currentValue: num(draft.currentValue),
      lastInspection: draft.lastInspection || undefined,
      nextInspection: draft.nextInspection || undefined,
      tags,
      notes: draft.notes.trim() || undefined,
    }
  }, [asset, draft])

  const projected = useMemo(() => {
    if (!asset || !patch) return { before: 0, after: 0, gaps: [] as ReturnType<typeof qualityGaps> }
    const merged = { ...asset, ...patch } as Asset
    return { before: completeness(asset), after: completeness(merged), gaps: qualityGaps(merged) }
  }, [asset, patch])

  if (!asset || !draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit asset</DialogTitle>
            <DialogDescription>Select an asset to edit.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const save = () => {
    if (!patch) return
    if (patch.name!.length < 4) {
      setError('The asset name must be at least 4 characters.')
      return
    }
    if (!patch.custodianName) {
      setError('Name the officer accountable for this asset.')
      return
    }
    onSave(asset.id, { ...patch, dataQualityScore: projected.after })
  }

  const delta = projected.after - projected.before

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">
            Edit <span className="font-mono text-sm text-muted-foreground">{asset.code}</span>
          </DialogTitle>
          <DialogDescription>
            Changes are written to the register immediately and recorded against you in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name" className="text-xs font-medium">
              Asset name
            </Label>
            <Input id="edit-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Condition</Label>
              <Select value={draft.condition} onValueChange={(v) => set('condition', v as Condition)}>
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Criticality</Label>
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
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Condition score — {draft.conditionScore}/100</Label>
              <Slider
                value={[draft.conditionScore]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => set('conditionScore', v[0] ?? 0)}
                aria-label="Condition score"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Utilisation — {draft.utilisationRate}%</Label>
              <Slider
                value={[draft.utilisationRate]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => set('utilisationRate', v[0] ?? 0)}
                aria-label="Utilisation rate"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Custodian department</Label>
              <Select
                value={draft.custodianDepartment}
                onValueChange={(v) => set('custodianDepartment', v as Department)}
              >
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-custodian" className="text-xs font-medium">
                Named custodian
              </Label>
              <Input
                id="edit-custodian"
                value={draft.custodianName}
                onChange={(e) => set('custodianName', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-value" className="text-xs font-medium">
                Current value (RM)
              </Label>
              <Input
                id="edit-value"
                inputMode="numeric"
                className="font-mono"
                value={draft.currentValue}
                onChange={(e) => set('currentValue', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{formatMYR(num(draft.currentValue))}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-last-insp" className="text-xs font-medium">
                Last inspection
              </Label>
              <Input
                id="edit-last-insp"
                type="date"
                value={draft.lastInspection}
                onChange={(e) => set('lastInspection', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-next-insp" className="text-xs font-medium">
                Next inspection
              </Label>
              <Input
                id="edit-next-insp"
                type="date"
                value={draft.nextInspection}
                onChange={(e) => set('nextInspection', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-tags" className="text-xs font-medium">
              Tags
            </Label>
            <Input id="edit-tags" value={draft.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes" className="text-xs font-medium">
              Custodian notes
            </Label>
            <Textarea id="edit-notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Data quality after saving</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                  {projected.after}
                </span>
                {delta !== 0 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-mono font-normal',
                      delta > 0 ? 'border-primary/25 bg-primary/10 text-primary' : 'border-destructive/25 bg-destructive/10 text-destructive',
                    )}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </Badge>
                )}
              </div>
            </div>
            <ScoreMeter className="mt-3" value={projected.after} tone={scoreTone(projected.after)} />
            {projected.gaps.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Still outstanding: {projected.gaps.map((g) => g.label).join(', ')}.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            <SaveIcon aria-hidden="true" />
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
