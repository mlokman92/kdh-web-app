import { useEffect, useMemo, useState } from 'react'
import { ClipboardListIcon, TimerIcon } from 'lucide-react'
import { toast } from 'sonner'

import { AssetPicker } from '@/components/maintenance/asset-picker'
import { SLA_HOURS_BY_PRIORITY, buildChecklist } from '@/components/maintenance/shared'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatMYR } from '@/lib/format'
import { PRIORITIES, WO_SOURCES, WO_TYPES } from '@/lib/types'
import type { Priority, WorkOrder, WorkOrderSource, WorkOrderType } from '@/lib/types'
import { useAppStore } from '@/store/app-store'

const UNASSIGNED = 'Unassigned'

export interface RaiseWorkOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selected asset, e.g. straight out of the QR scan flow. */
  presetAssetId?: string
  presetSource?: WorkOrderSource
  presetTitle?: string
  presetType?: WorkOrderType
  /** Called with the freshly created record so the caller can open it. */
  onCreated?: (wo: WorkOrder) => void
}

/**
 * Raise a work order against any asset in the register. Priority drives the SLA
 * suggestion from the KDH service catalogue, and picking a technician promotes the
 * ticket straight to "Assigned" rather than leaving it in triage.
 */
export function RaiseWorkOrderDialog({
  open,
  onOpenChange,
  presetAssetId,
  presetSource = 'Call Centre',
  presetTitle = '',
  presetType = 'Corrective',
  onCreated,
}: RaiseWorkOrderDialogProps) {
  const assets = useAppStore((s) => s.assets)
  const technicians = useAppStore((s) => s.technicians)
  const addWorkOrder = useAppStore((s) => s.addWorkOrder)

  const [assetId, setAssetId] = useState(presetAssetId ?? '')
  const [title, setTitle] = useState(presetTitle)
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkOrderType>(presetType)
  const [priority, setPriority] = useState<Priority>('P3 - Medium')
  const [slaHours, setSlaHours] = useState(String(SLA_HOURS_BY_PRIORITY['P3 - Medium']))
  const [source, setSource] = useState<WorkOrderSource>(presetSource)
  const [assignee, setAssignee] = useState(UNASSIGNED)
  const [estimatedCost, setEstimatedCost] = useState('')
  const [touched, setTouched] = useState(false)

  /* Re-arm the form every time the dialog is opened so presets always land. */
  useEffect(() => {
    if (!open) return
    setAssetId(presetAssetId ?? '')
    setTitle(presetTitle)
    setDescription('')
    setType(presetType)
    setPriority('P3 - Medium')
    setSlaHours(String(SLA_HOURS_BY_PRIORITY['P3 - Medium']))
    setSource(presetSource)
    setAssignee(UNASSIGNED)
    setEstimatedCost('')
    setTouched(false)
  }, [open, presetAssetId, presetSource, presetTitle, presetType])

  const asset = useMemo(() => assets.find((a) => a.id === assetId), [assets, assetId])

  /** Technicians covering the chosen asset's zone float to the top of the list. */
  const rankedTechnicians = useMemo(() => {
    if (!asset) return technicians
    return technicians
      .slice()
      .sort((a, b) =>
        Number(b.zone === asset.location.zone) - Number(a.zone === asset.location.zone) || a.openJobs - b.openJobs,
      )
  }, [technicians, asset])

  const team = useMemo(() => {
    if (assignee === UNASSIGNED) return 'Pending Triage'
    return technicians.find((t) => t.name === assignee)?.team ?? 'Pasukan Zon'
  }, [assignee, technicians])

  const hours = Number(slaHours)
  const cost = Number(estimatedCost)
  const validHours = Number.isFinite(hours) && hours > 0
  const validCost = estimatedCost === '' || (Number.isFinite(cost) && cost >= 0)
  const canSubmit = Boolean(assetId) && title.trim().length >= 4 && validHours && validCost

  function handlePriorityChange(next: Priority) {
    setPriority(next)
    // The SLA target follows the catalogue unless the user has overridden it.
    setSlaHours(String(SLA_HOURS_BY_PRIORITY[next]))
  }

  function handleSubmit() {
    setTouched(true)
    if (!canSubmit || !asset) return

    const wo = addWorkOrder({
      assetId,
      title: title.trim(),
      description:
        description.trim() ||
        `${title.trim()} dilaporkan di ${asset.name} (${asset.code}), ${asset.location.town}, ${asset.location.zone}. Keutamaan ${priority} dengan SLA ${hours} jam. Sumber laporan: ${source}.`,
      type,
      priority,
      status: assignee === UNASSIGNED ? 'Open' : 'Assigned',
      source,
      assignedTo: assignee,
      team,
      slaHours: hours,
      estimatedCost: estimatedCost === '' ? 0 : cost,
      checklist: buildChecklist(type, Date.now().toString(36)),
    })

    toast.success(`Work order ${wo.code} raised`, {
      description: `${wo.title} · ${wo.assetCode} · SLA ${wo.slaHours}h, ${
        assignee === UNASSIGNED ? 'awaiting triage' : `assigned to ${assignee}`
      }.`,
    })

    onOpenChange(false)
    onCreated?.(wo)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardListIcon className="size-4 text-primary" aria-hidden="true" />
            Raise Work Order
          </DialogTitle>
          <DialogDescription>
            Log a new job against a registered asset. The SLA clock starts the moment the ticket is created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="wo-asset">Asset</Label>
            <AssetPicker
              assets={assets}
              value={assetId}
              onChange={setAssetId}
              label="Select the asset this work order relates to"
            />
            {asset && (
              <p className="text-xs text-muted-foreground">
                {asset.category} · {asset.location.zone} · custodian {asset.custodianName}
              </p>
            )}
            {touched && !assetId && (
              <p className="text-xs text-destructive">Select the asset this job belongs to.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wo-title">Title</Label>
            <Input
              id="wo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Air-conditioning unit not cooling at ground floor lobby"
            />
            {touched && title.trim().length < 4 && (
              <p className="text-xs text-destructive">Give the job a descriptive title.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wo-description">Description</Label>
            <Textarea
              id="wo-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What was observed, where, and any access constraints. Leave blank to auto-generate from the asset record."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="wo-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as WorkOrderType)}>
                <SelectTrigger id="wo-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WO_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wo-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => handlePriorityChange(v as Priority)}>
                <SelectTrigger id="wo-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p} — {SLA_HOURS_BY_PRIORITY[p]}h SLA
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wo-sla">SLA target (hours)</Label>
              <Input
                id="wo-sla"
                inputMode="numeric"
                value={slaHours}
                onChange={(e) => setSlaHours(e.target.value)}
                className="font-mono"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TimerIcon className="size-3" aria-hidden="true" />
                Catalogue default for {priority} is {SLA_HOURS_BY_PRIORITY[priority]}h.
              </p>
              {touched && !validHours && (
                <p className="text-xs text-destructive">Enter an SLA target greater than zero.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wo-source">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as WorkOrderSource)}>
                <SelectTrigger id="wo-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WO_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wo-assignee">Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="wo-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned — leave in triage</SelectItem>
                  {rankedTechnicians.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name} · {t.openJobs} open
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Team: {team}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wo-cost">Estimated cost (RM)</Label>
              <Input
                id="wo-cost"
                inputMode="decimal"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
                className="font-mono"
              />
              {validCost && estimatedCost !== '' && (
                <p className="text-xs text-muted-foreground">{formatMYR(cost)}</p>
              )}
              {touched && !validCost && (
                <p className="text-xs text-destructive">Enter a valid amount.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Raise Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
