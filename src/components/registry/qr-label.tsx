import { PrinterIcon, QrCodeIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

export const QR_PRINT_AREA_ID = 'kdh-qr-print-area'
/** Separate id so a single-asset label and the bulk sheet never collide in one print. */
export const QR_SINGLE_PRINT_AREA_ID = 'kdh-qr-print-area-single'

/**
 * Print rules scoped to the label sheet. Kept inline so nothing global is touched —
 * on paper the labels are forced to black-on-white regardless of the active theme.
 */
export function QrPrintStyles({ areaId = QR_PRINT_AREA_ID }: { areaId?: string } = {}) {
  return (
    <style>{`
      @media print {
        body > * { visibility: hidden !important; }
        #${areaId}, #${areaId} * { visibility: visible !important; }
        #${areaId} {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          overflow: visible !important;
          max-height: none !important;
          padding: 12mm !important;
          background: white !important;
          color: black !important;
          border: 0 !important;
        }
        #${areaId} * { color: black !important; border-color: black !important; }
        #${areaId} [data-qr-swatch] { background: white !important; }
      }
    `}</style>
  )
}

export function printQrLabels(): void {
  window.print()
}

export interface AssetQrLabelProps {
  asset: Asset
  size?: number
  className?: string
}

/** A single peel-and-stick asset label: identity block plus the scannable payload. */
export function AssetQrLabel({ asset, size = 92, className }: AssetQrLabelProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      <div data-qr-swatch className="shrink-0 rounded-md border border-border bg-card p-1.5 text-foreground">
        <QRCodeSVG
          value={asset.qrPayload}
          size={size}
          level="M"
          marginSize={0}
          bgColor="transparent"
          fgColor="currentColor"
          title={`QR code for ${asset.code}`}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-mono text-sm font-semibold tracking-tight">{asset.code}</p>
        <p className="line-clamp-2 text-xs leading-snug font-medium">{asset.name}</p>
        <p className="truncate text-[0.7rem] text-muted-foreground">{asset.category}</p>
        <p className="truncate text-[0.7rem] text-muted-foreground">
          {asset.location.town} · {asset.location.zone}
        </p>
        <p className="truncate text-[0.7rem] text-muted-foreground">Custodian: {asset.custodianName}</p>
        <p className="truncate font-mono text-[0.62rem] text-muted-foreground">
          KEJORA Development Holding · {formatDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}

export interface QrLabelsDialogProps {
  assets: Asset[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Bulk label sheet — what a facilities officer would take to the label printer. */
export function QrLabelsDialog({ assets, open, onOpenChange }: QrLabelsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <QrPrintStyles />
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCodeIcon className="size-4 text-primary" aria-hidden="true" />
            QR label sheet
          </DialogTitle>
          <DialogDescription>
            {assets.length} label{assets.length === 1 ? '' : 's'} ready for the asset tagging round. Each code resolves
            to the KDH One Asset record when scanned in the field.
          </DialogDescription>
        </DialogHeader>

        <div id={QR_PRINT_AREA_ID} className="max-h-[60svh] overflow-y-auto bg-background p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {assets.map((asset) => (
              <AssetQrLabel key={asset.id} asset={asset} size={80} />
            ))}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" onClick={printQrLabels}>
            <PrinterIcon aria-hidden="true" />
            Print labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
