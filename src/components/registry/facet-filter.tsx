import { CheckIcon, ChevronDownIcon, ListFilterIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface FacetFilterProps {
  label: string
  options: readonly string[]
  counts: Record<string, number>
  selected: string[]
  onChange: (next: string[]) => void
  /** Show the type-ahead box inside the popover (used for long lists). */
  searchable?: boolean
  className?: string
}

/**
 * Multi-select facet popover with live option counts — the counts respect every
 * other active filter, so the numbers always describe what a click would return.
 */
export function FacetFilter({
  label,
  options,
  counts,
  selected,
  onChange,
  searchable = false,
  className,
}: FacetFilterProps) {
  const selectedSet = new Set(selected)

  const toggle = (option: string) => {
    onChange(selectedSet.has(option) ? selected.filter((v) => v !== option) : [...selected, option])
  }

  const availableCount = options.reduce((n, o) => n + (counts[o] ?? 0), 0)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 border-dashed', selected.length > 0 && 'border-solid border-primary/40', className)}
        >
          <ListFilterIcon aria-hidden="true" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 px-1 font-mono text-[0.65rem] tabular-nums">
              {selected.length}
            </Badge>
          )}
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList className="max-h-72">
            <CommandEmpty>No matching {label.toLowerCase()}.</CommandEmpty>
            <CommandGroup heading={`${label} · ${formatNumber(availableCount)} records`}>
              {options.map((option) => {
                const checked = selectedSet.has(option)
                const count = counts[option] ?? 0
                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                    className="gap-2"
                    disabled={count === 0 && !checked}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {checked && <CheckIcon className="size-3" />}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate', count === 0 && !checked && 'opacity-50')}>
                      {option}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatNumber(count)}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__clear-${label}`}
                    onSelect={() => onChange([])}
                    className="justify-center text-xs font-medium text-muted-foreground"
                  >
                    Clear {label.toLowerCase()} filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
