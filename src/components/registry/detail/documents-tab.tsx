import { FileTextIcon, FolderOpenIcon, PrinterIcon, QrCodeIcon } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/common/empty-state'
import { DetailBlock, Field, FieldGrid } from '@/components/registry/detail/detail-parts'
import { AssetQrLabel, QR_SINGLE_PRINT_AREA_ID, QrPrintStyles, printQrLabels } from '@/components/registry/qr-label'
import { DOCUMENT_ICON, formatFileSize } from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatNumber } from '@/lib/format'
import type { Asset } from '@/lib/types'

export function DocumentsTab({ asset }: { asset: Asset }) {
  const totalKb = asset.documents.reduce((s, d) => s + d.sizeKb, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <DetailBlock
        title={`Documents (${asset.documents.length})`}
        icon={FolderOpenIcon}
        description={asset.documents.length > 0 ? `${formatFileSize(totalKb)} on file` : undefined}
        className="lg:col-span-3"
      >
        {asset.documents.length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title="No documents attached"
            description="Title deeds, valuation reports, insurance policies and permits should be filed against this record."
          />
        ) : (
          <ul className="divide-y divide-border">
            {asset.documents.map((doc) => {
              const Icon = DOCUMENT_ICON[doc.type] ?? FileTextIcon
              return (
                <li key={doc.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{doc.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Uploaded {formatDate(doc.uploadedAt)} · {formatFileSize(doc.sizeKb)}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {doc.type}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </DetailBlock>

      <DetailBlock
        title="Field tag"
        icon={QrCodeIcon}
        description="Scanned by technicians to raise a ticket on the spot"
        className="lg:col-span-2"
        actions={
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              printQrLabels()
              toast.success('Label sent to printer', { description: `${asset.code} — ${asset.name}` })
            }}
          >
            <PrinterIcon aria-hidden="true" />
            Print label
          </Button>
        }
      >
        <QrPrintStyles areaId={QR_SINGLE_PRINT_AREA_ID} />
        <div id={QR_SINGLE_PRINT_AREA_ID}>
          <AssetQrLabel asset={asset} size={104} />
        </div>

        <FieldGrid className="mt-4 sm:grid-cols-1">
          <Field label="QR payload" value={asset.qrPayload} mono />
          <Field label="Encoded characters" value={`${formatNumber(asset.qrPayload.length)} chars · level M`} />
        </FieldGrid>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Every KDH asset carries a durable tag. Scanning it opens this record on a phone, pre-fills the asset on a new
          work order and stamps the inspection log — no typing, no wrong asset code.
        </p>
      </DetailBlock>
    </div>
  )
}
