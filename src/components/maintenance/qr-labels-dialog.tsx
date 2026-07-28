import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PrinterIcon, SearchIcon, TagIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { KdhMark } from '@/components/common/kdh-mark'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ZONES } from '@/lib/types'
import type { Zone } from '@/lib/types'
import { useAppStore } from '@/store/app-store'

const ALL = '__all__'
const DEFAULT_SELECTION = 12

/**
 * Print rules.
 *
 * The dialog lives in a Radix portal and is centred with a CSS transform, which
 * would otherwise trap the sheet in a single non-paginating box. So for print we
 * hide the app shell entirely and return the dialog to normal document flow — the
 * label grid then paginates like an ordinary page of content.
 */
const PRINT_CSS = `
@media print {
  #root { display: none !important; }
  [data-slot="dialog-overlay"] { display: none !important; }
  [data-slot="dialog-content"] {
    position: static !important;
    transform: none !important;
    display: block !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    --tw-ring-shadow: 0 0 rgb(0 0 0 / 0) !important;
  }
  .kdh-no-print { display: none !important; }
  .kdh-print-body { display: block !important; gap: 0 !important; }
  .kdh-print-scroll {
    overflow: visible !important;
    max-height: none !important;
    border: 0 !important;
    background: transparent !important;
  }
  #kdh-qr-print-sheet { padding: 0 !important; }
  .kdh-qr-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .kdh-qr-label { break-inside: avoid; page-break-inside: avoid; }
  @page { margin: 12mm; }
}
`

export interface QrLabelsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Printable asset label sheet. Filter the register, tick the assets you want, and
 * print a physical sheet of QR tags for the field team to fix to each asset.
 */
export function QrLabelsDialog({ open, onOpenChange }: QrLabelsDialogProps) {
  const assets = useAppStore((s) => s.assets)

  const [query, setQuery] = useState('')
  const [zone, setZone] = useState<Zone | typeof ALL>(ALL)
  const [selected, setSelected] = useState<string[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (zone !== ALL && a.location.zone !== zone) return false
      if (!q) return true
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.location.town.toLowerCase().includes(q)
      )
    })
  }, [assets, query, zone])

  /* Seed a sensible sheet the first time the dialog opens. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setZone(ALL)
    setSelected(assets.slice(0, DEFAULT_SELECTION).map((a) => a.id))
  }, [open, assets])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const sheet = useMemo(() => assets.filter((a) => selectedSet.has(a.id)), [assets, selectedSet])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function selectAllFiltered() {
    setSelected((prev) => [...new Set([...prev, ...filtered.map((a) => a.id)])])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-5xl">
        <style>{PRINT_CSS}</style>

        <DialogHeader className="kdh-no-print">
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="size-4 text-primary" aria-hidden="true" />
            QR Label Sheet
          </DialogTitle>
          <DialogDescription>
            Generate printable QR tags for physical asset labelling. Each label resolves to the asset's record when
            scanned in the field.
          </DialogDescription>
        </DialogHeader>

        <div className="kdh-print-body grid min-h-0 flex-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          {/* ---------------- Selection panel ---------------- */}
          <div className="kdh-no-print flex min-h-0 flex-col gap-3 rounded-lg border border-border bg-card p-3">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search assets…"
                aria-label="Search assets for labelling"
                className="pl-8"
              />
            </div>

            <Select value={zone} onValueChange={(v) => setZone(v as Zone | typeof ALL)}>
              <SelectTrigger className="w-full" aria-label="Filter by zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All zones</SelectItem>
                {ZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={selectAllFiltered}>
                Select {filtered.length}
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {filtered.map((a) => (
                  <li key={a.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-accent/40">
                      <Checkbox
                        checked={selectedSet.has(a.id)}
                        onCheckedChange={() => toggle(a.id)}
                        className="mt-0.5"
                        aria-label={`Include ${a.code} on the label sheet`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">{a.name}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {a.code} · {a.location.town}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">No assets match.</li>
                )}
              </ul>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              {sheet.length} label{sheet.length === 1 ? '' : 's'} on the sheet
            </p>
          </div>

          {/* ---------------- Print sheet ---------------- */}
          <div className="kdh-print-scroll max-h-[60vh] min-h-0 overflow-y-auto rounded-lg border border-border bg-muted/30">
            <div id="kdh-qr-print-sheet" className="p-4 text-foreground">
              {sheet.length === 0 ? (
                <EmptyState
                  icon={TagIcon}
                  title="No labels selected"
                  description="Tick assets on the left to build a print sheet."
                />
              ) : (
                <div className="kdh-qr-grid grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {sheet.map((a) => (
                    <div
                      key={a.id}
                      className="kdh-qr-label flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <KdhMark className="size-4 text-primary" />
                        <span className="truncate text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
                          KEJORA · KDH
                        </span>
                      </div>

                      <QRCodeSVG
                        value={a.qrPayload}
                        size={96}
                        level="M"
                        fgColor="currentColor"
                        bgColor="transparent"
                        title={`QR label for ${a.code}`}
                      />

                      <div className="w-full min-w-0">
                        <p className="truncate font-mono text-xs font-semibold text-foreground">{a.code}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-foreground">{a.name}</p>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">{a.location.town}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{a.location.zone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="kdh-no-print sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block">
            Scanning a label opens the asset record and the raise-a-job flow.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => window.print()} disabled={sheet.length === 0}>
              <PrinterIcon aria-hidden="true" />
              Print {sheet.length > 0 ? `${sheet.length} labels` : 'sheet'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
