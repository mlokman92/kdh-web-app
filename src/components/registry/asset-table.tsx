import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  QrCodeIcon,
  ScanSearchIcon,
  Trash2Icon,
} from 'lucide-react'

import { StatusBadge, TONE_DOT_CLASSES, TONE_TEXT_CLASSES, statusTone } from '@/components/common/status-badge'
import {
  CATEGORY_ICON,
  COLUMN_LABELS,
  scoreTone,
  type ColumnState,
  type Density,
  type SortDir,
  type SortKey,
} from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMYR, formatNumber } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface AssetTableProps {
  rows: Asset[]
  columns: ColumnState
  density: Density
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selectedIds: Set<string>
  onToggleRow: (id: string, checked: boolean) => void
  onTogglePage: (checked: boolean) => void
  onOpen: (asset: Asset) => void
  onEdit: (asset: Asset) => void
  onQrLabel: (asset: Asset) => void
  onExportRow: (asset: Asset) => void
  onCopyCode: (asset: Asset) => void
  onDelete: (asset: Asset) => void
}

const CHECKBOX_CLASSES =
  'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/25 data-[state=indeterminate]:text-primary'

/** The registry master table: sortable, selectable, column-configurable. */
export function AssetTable({
  rows,
  columns,
  density,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onToggleRow,
  onTogglePage,
  onOpen,
  onEdit,
  onQrLabel,
  onExportRow,
  onCopyCode,
  onDelete,
}: AssetTableProps) {
  const compact = density === 'compact'
  const cell = compact ? 'py-1.5' : 'py-2.5'
  const pageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const pagePartial = !pageSelected && rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="[&_[data-slot=table-container]]:max-h-[min(38rem,calc(100svh-19rem))] [&_[data-slot=table-container]]:overflow-y-auto">
      <Table>
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky top-0 z-20 w-9 border-b border-border bg-card pl-3">
              <Checkbox
                checked={pageSelected ? true : pagePartial ? 'indeterminate' : false}
                onCheckedChange={(value) => onTogglePage(value === true)}
                aria-label="Select every asset on this page"
                className={CHECKBOX_CLASSES}
              />
            </TableHead>

            <SortableHead label="Code" sortAs="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-[8.5rem]" />
            <SortableHead label="Asset" sortAs="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="min-w-[16rem]" />

            {columns.category && (
              <SortableHead label={COLUMN_LABELS.category} sortAs="category" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {columns.location && (
              <SortableHead label={COLUMN_LABELS.location} sortAs="location" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {columns.status && (
              <SortableHead label={COLUMN_LABELS.status} sortAs="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {columns.condition && (
              <SortableHead label={COLUMN_LABELS.condition} sortAs="condition" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-[10rem]" />
            )}
            {columns.criticality && (
              <SortableHead label={COLUMN_LABELS.criticality} sortAs="criticality" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            )}
            {columns.nbv && (
              <SortableHead label={COLUMN_LABELS.nbv} sortAs="nbv" sortKey={sortKey} sortDir={sortDir} onSort={onSort} numeric className="w-[9.5rem]" />
            )}
            {columns.utilisation && (
              <SortableHead label={COLUMN_LABELS.utilisation} sortAs="utilisation" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-[8.5rem]" />
            )}
            {columns.quality && (
              <SortableHead label={COLUMN_LABELS.quality} sortAs="quality" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-[8rem]" />
            )}

            <TableHead className="sticky top-0 z-20 w-10 border-b border-border bg-card pr-3">
              <span className="sr-only">Row actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((asset) => {
            const selected = selectedIds.has(asset.id)
            const CategoryIcon = CATEGORY_ICON[asset.category]
            const qualityTone = scoreTone(asset.dataQualityScore)
            const conditionToneName = statusTone(asset.condition)

            return (
              <TableRow
                key={asset.id}
                data-state={selected ? 'selected' : undefined}
                onClick={() => onOpen(asset)}
                className="cursor-pointer"
              >
                <TableCell className={cn(cell, 'pl-3')} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(value) => onToggleRow(asset.id, value === true)}
                    aria-label={`Select ${asset.name}`}
                    className={CHECKBOX_CLASSES}
                  />
                </TableCell>

                <TableCell className={cn(cell, 'font-mono text-xs font-medium text-foreground')}>
                  <span className="flex items-center gap-1.5">
                    {asset.code}
                    {asset.isUserAdded && (
                      <span
                        aria-label="Added during this session"
                        title="Added during this session"
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </span>
                </TableCell>

                <TableCell className={cn(cell, 'max-w-[22rem]')}>
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
                    >
                      <CategoryIcon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{asset.name}</p>
                      {!compact && (
                        <p className="truncate text-xs text-muted-foreground">
                          {asset.subCategory}
                          {asset.tags.length > 0 && ` · ${asset.tags.slice(0, 2).join(', ')}`}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                {columns.category && (
                  <TableCell className={cn(cell, 'text-muted-foreground')}>
                    <Badge variant="outline" className="max-w-[12rem] truncate font-normal">
                      {asset.category}
                    </Badge>
                  </TableCell>
                )}

                {columns.location && (
                  <TableCell className={cell}>
                    <p className="truncate text-foreground">{asset.location.town}</p>
                    {!compact && <p className="truncate text-xs text-muted-foreground">{asset.location.zone}</p>}
                  </TableCell>
                )}

                {columns.status && (
                  <TableCell className={cell}>
                    <StatusBadge status={asset.status} />
                  </TableCell>
                )}

                {columns.condition && (
                  <TableCell className={cell}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-7 shrink-0 font-mono text-xs tabular-nums', TONE_TEXT_CLASSES[conditionToneName])}>
                        {asset.conditionScore}
                      </span>
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className={cn('block h-full rounded-full', TONE_DOT_CLASSES[conditionToneName])}
                          style={{ width: `${Math.max(3, Math.min(100, asset.conditionScore))}%` }}
                        />
                      </span>
                      {!compact && <span className="truncate text-xs text-muted-foreground">{asset.condition}</span>}
                    </div>
                  </TableCell>
                )}

                {columns.criticality && (
                  <TableCell className={cell}>
                    <StatusBadge status={asset.criticality} />
                  </TableCell>
                )}

                {columns.nbv && (
                  <TableCell className={cn(cell, 'text-right font-mono text-xs tabular-nums text-foreground')}>
                    {formatMYR(asset.netBookValue)}
                  </TableCell>
                )}

                {columns.utilisation && (
                  <TableCell className={cell}>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, Math.min(100, asset.utilisationRate))}%` }}
                        />
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatNumber(asset.utilisationRate)}%
                      </span>
                    </div>
                  </TableCell>
                )}

                {columns.quality && (
                  <TableCell className={cell}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-5 min-w-9 items-center justify-center rounded-md border px-1.5 font-mono text-xs tabular-nums',
                          qualityTone === 'positive' && 'border-primary/25 bg-primary/10 text-primary',
                          qualityTone === 'info' && 'border-border bg-secondary text-secondary-foreground',
                          qualityTone === 'warning' &&
                            'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/30 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
                          qualityTone === 'critical' && 'border-destructive/25 bg-destructive/10 text-destructive',
                        )}
                      >
                        {asset.dataQualityScore}
                      </span>
                      {!compact && (
                        <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span
                            className={cn('block h-full rounded-full', TONE_DOT_CLASSES[qualityTone])}
                            style={{ width: `${Math.max(3, Math.min(100, asset.dataQualityScore))}%` }}
                          />
                        </span>
                      )}
                    </div>
                  </TableCell>
                )}

                <TableCell className={cn(cell, 'pr-3')} onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${asset.name}`}>
                        <MoreHorizontalIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="font-mono text-xs">{asset.code}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onOpen(asset)}>
                        <ScanSearchIcon aria-hidden="true" />
                        Open record
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEdit(asset)}>
                        <PencilIcon aria-hidden="true" />
                        Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onQrLabel(asset)}>
                        <QrCodeIcon aria-hidden="true" />
                        Generate QR label
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onCopyCode(asset)}>
                        <CopyIcon aria-hidden="true" />
                        Copy asset code
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onExportRow(asset)}>
                        <DownloadIcon aria-hidden="true" />
                        Export this record
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(asset)}>
                        <Trash2Icon aria-hidden="true" />
                        Delete asset
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SortableHead({
  label,
  sortAs,
  sortKey,
  sortDir,
  onSort,
  numeric,
  className,
}: {
  label: string
  sortAs: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  numeric?: boolean
  className?: string
}) {
  const active = sortKey === sortAs
  const Icon = !active ? ArrowUpDownIcon : sortDir === 'asc' ? ArrowUpIcon : ArrowDownIcon

  return (
    <TableHead
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('sticky top-0 z-20 border-b border-border bg-card', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortAs)}
        className={cn(
          '-mx-1 inline-flex h-6 max-w-full items-center gap-1 rounded-md px-1 text-xs font-semibold tracking-wide uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          active ? 'text-foreground' : 'text-muted-foreground',
          numeric && 'w-full justify-end',
        )}
      >
        <span className="truncate">{label}</span>
        <Icon className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
      </button>
    </TableHead>
  )
}
