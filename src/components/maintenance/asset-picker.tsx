import { useMemo, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon, MapPinIcon } from 'lucide-react'

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface AssetPickerProps {
  assets: Asset[]
  value?: string
  onChange: (assetId: string) => void
  placeholder?: string
  /** Rendered on the trigger for screen readers. */
  label?: string
  className?: string
}

/**
 * Searchable asset selector — the same control backs the raise form and the
 * simulated QR scan, so field staff and office staff pick assets identically.
 */
export function AssetPicker({
  assets,
  value,
  onChange,
  placeholder = 'Search asset by code, name or town…',
  label = 'Select asset',
  className,
}: AssetPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => assets.find((a) => a.id === value), [assets, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className={cn('h-auto w-full justify-between gap-2 py-2 text-left font-normal', className)}
        >
          {selected ? (
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{selected.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{selected.code}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{selected.location.town}</span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[320px] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
          }
        >
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>No asset matches that search.</CommandEmpty>
            <CommandGroup heading={`${assets.length} assets in register`}>
              {assets.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={`${asset.code} ${asset.name} ${asset.location.town} ${asset.location.zone} ${asset.category}`}
                  onSelect={() => {
                    onChange(asset.id)
                    setOpen(false)
                  }}
                  className="items-start gap-2"
                >
                  <CheckIcon
                    aria-hidden="true"
                    className={cn('mt-0.5 size-4 shrink-0', asset.id === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{asset.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{asset.code}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {asset.location.town} · {asset.category}
                      </span>
                    </span>
                  </span>
                  <StatusBadge status={asset.condition} className="shrink-0 text-[10px]" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
