import { CheckCheckIcon, DownloadIcon, QrCodeIcon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatNumber } from '@/lib/format'
import { ASSET_STATUSES, type AssetStatus } from '@/lib/types'

export interface BulkActionBarProps {
  count: number
  filteredCount: number
  onSelectAllFiltered: () => void
  onClear: () => void
  onExport: () => void
  onBulkStatus: (status: AssetStatus) => void
  onGenerateLabels: () => void
  onDelete: () => void
}

/** Appears the moment a row is ticked; every action mutates the register for real. */
export function BulkActionBar({
  count,
  filteredCount,
  onSelectAllFiltered,
  onClear,
  onExport,
  onBulkStatus,
  onGenerateLabels,
  onDelete,
}: BulkActionBarProps) {
  if (count === 0) return null
  const canSelectMore = count < filteredCount

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/40 px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <CheckCheckIcon className="size-4 text-primary" aria-hidden="true" />
        {formatNumber(count)} selected
      </span>

      {canSelectMore && (
        <Button variant="link" size="xs" onClick={onSelectAllFiltered} className="h-6 px-0">
          Select all {formatNumber(filteredCount)} filtered
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExport}>
          <DownloadIcon aria-hidden="true" />
          Export selected
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <RefreshCwIcon aria-hidden="true" />
              Bulk update status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Set status for {formatNumber(count)} records</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ASSET_STATUSES.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onBulkStatus(status)}>
                {status}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={onGenerateLabels}>
          <QrCodeIcon aria-hidden="true" />
          Generate QR labels
        </Button>

        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2Icon aria-hidden="true" />
          Delete
        </Button>

        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
