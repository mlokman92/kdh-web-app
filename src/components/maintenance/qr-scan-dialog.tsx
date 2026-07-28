import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import {
  CheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  QrCodeIcon,
  RotateCcwIcon,
  ScanLineIcon,
  WrenchIcon,
} from 'lucide-react'

import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatMYRCompact } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

/** Keyframes for the scanner viewport — scoped to this component's class names. */
const SCANNER_CSS = `
@keyframes kdh-scanline {
  0%   { top: 6%;  opacity: 0.35; }
  50%  { top: 90%; opacity: 1; }
  100% { top: 6%;  opacity: 0.35; }
}
@keyframes kdh-reticle {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 0.9; }
}
.kdh-scanline { animation: kdh-scanline 2.6s ease-in-out infinite; }
.kdh-reticle  { animation: kdh-reticle 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .kdh-scanline, .kdh-reticle { animation: none; }
  .kdh-scanline { top: 50%; opacity: 0.8; }
}
`

type ScanPhase = 'scanning' | 'decoding' | 'locked'

export interface QrScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired when the operator confirms the scanned asset and wants to log a job. */
  onRaiseForAsset: (assetId: string) => void
}

function CornerBrackets() {
  const base = 'absolute size-7 border-primary/70'
  return (
    <>
      <span aria-hidden="true" className={cn(base, 'top-3 left-3 rounded-tl-md border-t-2 border-l-2')} />
      <span aria-hidden="true" className={cn(base, 'top-3 right-3 rounded-tr-md border-t-2 border-r-2')} />
      <span aria-hidden="true" className={cn(base, 'bottom-3 left-3 rounded-bl-md border-b-2 border-l-2')} />
      <span aria-hidden="true" className={cn(base, 'right-3 bottom-3 rounded-br-md border-r-2 border-b-2')} />
    </>
  )
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Simulated field scan. A KDH technician points their phone at the label on the
 * asset; here the operator picks the asset they scanned, the payload is "decoded",
 * and the flow hands straight over to a pre-filled work order.
 */
export function QrScanDialog({ open, onOpenChange, onRaiseForAsset }: QrScanDialogProps) {
  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)

  const [phase, setPhase] = useState<ScanPhase>('scanning')
  const [scannedId, setScannedId] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setPhase('scanning')
    setScannedId(null)
  }, [open])

  /* Simulated decode latency — the pause is what makes it read as a real scan. */
  useEffect(() => {
    if (phase !== 'decoding') return
    const id = window.setTimeout(() => setPhase('locked'), 750)
    return () => window.clearTimeout(id)
  }, [phase])

  const asset = useMemo(() => assets.find((a) => a.id === scannedId) ?? null, [assets, scannedId])

  const openJobs = useMemo(() => {
    if (!asset) return 0
    return workOrders.filter(
      (w) => w.assetId === asset.id && w.status !== 'Closed' && w.status !== 'Cancelled',
    ).length
  }, [workOrders, asset])

  function handlePick(picked: Asset) {
    setScannedId(picked.id)
    setPhase('decoding')
  }

  function handleReset() {
    setScannedId(null)
    setPhase('scanning')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <style>{SCANNER_CSS}</style>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLineIcon className="size-4 text-primary" aria-hidden="true" />
            Scan Asset QR
          </DialogTitle>
          <DialogDescription>
            Field simulation — every KDH asset carries a printed QR label. Select the asset you scanned to pull up its
            record and raise a job on the spot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          {/* ---------------- Scanner viewport ---------------- */}
          <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/40">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <CornerBrackets />

            {phase === 'locked' && asset ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="rounded-lg border border-border bg-card p-3 text-foreground">
                  <QRCodeSVG
                    value={asset.qrPayload}
                    size={124}
                    level="M"
                    fgColor="currentColor"
                    bgColor="transparent"
                    title={`QR label for ${asset.code}`}
                  />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <CheckIcon className="size-3.5" aria-hidden="true" />
                  Tag decoded
                </span>
                <p className="max-w-[240px] font-mono text-[11px] break-all text-muted-foreground">
                  {asset.qrPayload}
                </p>
              </div>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="kdh-scanline absolute inset-x-6 h-0.5 rounded-full bg-primary shadow-[0_0_12px_0_var(--primary)]"
                />
                <div className="kdh-reticle absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center">
                  <QrCodeIcon className="size-11 text-primary/70" aria-hidden="true" />
                  <p className="px-8 text-xs text-muted-foreground">
                    {phase === 'decoding' ? 'Decoding QR payload…' : 'Align the label within the frame'}
                  </p>
                </div>
              </>
            )}

            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono">KDH-SCAN v2.4</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    phase === 'locked' ? 'bg-primary' : 'bg-muted-foreground/60',
                  )}
                />
                {phase === 'locked' ? 'Locked' : 'Live'}
              </span>
            </div>
          </div>

          {/* ---------------- Picker / identity ---------------- */}
          {phase === 'locked' && asset ? (
            <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{asset.code}</p>
                  <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">{asset.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {asset.location.town} · {asset.location.zone}
                    </span>
                  </p>
                </div>
                <StatusBadge status={asset.status} className="shrink-0" />
              </div>

              <dl className="divide-y divide-border px-4 py-1">
                <IdentityRow label="Category" value={`${asset.category} · ${asset.subCategory}`} />
                <IdentityRow label="Condition" value={`${asset.condition} (${asset.conditionScore}/100)`} />
                <IdentityRow label="Criticality" value={asset.criticality} />
                <IdentityRow label="Custodian" value={`${asset.custodianName}, ${asset.custodianDepartment}`} />
                <IdentityRow label="Current value" value={formatMYRCompact(asset.currentValue)} />
                <IdentityRow label="Last inspection" value={formatDate(asset.lastInspection)} />
                <IdentityRow label="Next inspection" value={formatDate(asset.nextInspection)} />
                <IdentityRow
                  label="Open work orders"
                  value={openJobs === 0 ? 'None — asset is clear' : `${openJobs} in progress`}
                />
              </dl>

              <Separator />

              <div className="flex flex-wrap items-center gap-2 p-4">
                <Button onClick={() => onRaiseForAsset(asset.id)}>
                  <WrenchIcon aria-hidden="true" />
                  Raise Work Order
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/registry?asset=${asset.id}`}>
                    <ExternalLinkIcon aria-hidden="true" />
                    Open in registry
                  </Link>
                </Button>
                <Button variant="ghost" onClick={handleReset}>
                  <RotateCcwIcon aria-hidden="true" />
                  Scan another
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-foreground">Select the asset you scanned</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Search the register by code, name, town or zone.
                </p>
              </div>
              <Command
                className="bg-transparent"
                filter={(itemValue, search) =>
                  itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
                }
              >
                <CommandInput placeholder="KDH-CP-0012, Kompleks Niaga, Bandar Penawar…" />
                <CommandList className="max-h-[280px]">
                  <CommandEmpty>No asset matches that search.</CommandEmpty>
                  <CommandGroup heading={`${assets.length} tagged assets`}>
                    {assets.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.code} ${a.name} ${a.location.town} ${a.location.zone} ${a.category}`}
                        onSelect={() => handlePick(a)}
                        className="items-start gap-2.5"
                      >
                        <QrCodeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{a.name}</span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">{a.code}</span>
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {a.location.town} · {a.location.zone}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block">
            In the field this step is a camera scan — the payload resolves to the same asset record.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
