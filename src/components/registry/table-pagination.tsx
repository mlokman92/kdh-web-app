import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'

import { PAGE_SIZES, type PageSize } from '@/components/registry/registry-utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'

export interface TablePaginationProps {
  page: number
  pageCount: number
  pageSize: PageSize
  total: number
  rangeStart: number
  rangeEnd: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
}

export function TablePagination({
  page,
  pageCount,
  pageSize,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? (
          'No assets match the current filters'
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{formatNumber(rangeStart)}</span> to{' '}
            <span className="font-medium text-foreground">{formatNumber(rangeEnd)}</span> of{' '}
            <span className="font-medium text-foreground">{formatNumber(total)}</span> assets
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}>
            <SelectTrigger size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          Page <span className="font-medium text-foreground">{formatNumber(Math.min(page, pageCount))}</span> of{' '}
          {formatNumber(pageCount)}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            <ChevronsLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(pageCount)}
            aria-label="Last page"
          >
            <ChevronsRightIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
