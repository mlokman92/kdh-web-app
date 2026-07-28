import { AlignJustifyIcon, Columns3Icon, RotateCcwIcon, Rows3Icon, SearchIcon, XIcon } from 'lucide-react'

import { FacetFilter } from '@/components/registry/facet-filter'
import {
  COLUMN_KEYS,
  COLUMN_LABELS,
  FACET_KEYS,
  FACET_META,
  activeFacetCount,
  type ColumnKey,
  type ColumnState,
  type Density,
  type FacetKey,
  type FacetState,
} from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface RegistryToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  facets: FacetState
  onFacetChange: (key: FacetKey, next: string[]) => void
  counts: Record<FacetKey, Record<string, number>>
  columns: ColumnState
  onColumnToggle: (key: ColumnKey, next: boolean) => void
  onResetColumns: () => void
  density: Density
  onDensityChange: (next: Density) => void
  onClearAll: () => void
  /** Extra "added this month" filter, driven from the summary strip. */
  recentOnly: boolean
  onRecentOnlyChange: (next: boolean) => void
}

/**
 * Search, faceted filtering, column visibility and density — the control surface
 * that sits directly above the master table.
 */
export function RegistryToolbar({
  query,
  onQueryChange,
  facets,
  onFacetChange,
  counts,
  columns,
  onColumnToggle,
  onResetColumns,
  density,
  onDensityChange,
  onClearAll,
  recentOnly,
  onRecentOnlyChange,
}: RegistryToolbarProps) {
  const filterCount = activeFacetCount(facets)
  const hasFilters = filterCount > 0 || query.trim().length > 0 || recentOnly
  const hiddenColumns = COLUMN_KEYS.filter((k) => !columns[k]).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-8 w-full max-w-xs min-w-[15rem] sm:w-72">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, code, town, custodian, tag…"
            aria-label="Search the asset register"
          />
          {query.length > 0 && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => onQueryChange('')} aria-label="Clear search">
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        {FACET_KEYS.map((key) => (
          <FacetFilter
            key={key}
            label={FACET_META[key].label}
            options={FACET_META[key].options}
            counts={counts[key]}
            selected={facets[key]}
            onChange={(next) => onFacetChange(key, next)}
            searchable={FACET_META[key].options.length > 6}
          />
        ))}

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Columns3Icon aria-hidden="true" />
                Columns
                {hiddenColumns > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 font-mono text-[0.65rem] tabular-nums">
                    {COLUMN_KEYS.length - hiddenColumns}/{COLUMN_KEYS.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMN_KEYS.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={columns[key]}
                  onCheckedChange={(value) => onColumnToggle(key, Boolean(value))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {COLUMN_LABELS[key]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onResetColumns} className="font-medium">
                <RotateCcwIcon aria-hidden="true" />
                Show all columns
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={density}
                  onValueChange={(value) => {
                    if (value === 'comfortable' || value === 'compact') onDensityChange(value)
                  }}
                  className="h-8"
                  aria-label="Row density"
                >
                  <ToggleGroupItem
                    value="comfortable"
                    aria-label="Comfortable row height"
                    className="h-8 px-2 data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  >
                    <Rows3Icon aria-hidden="true" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="compact"
                    aria-label="Compact row height"
                    className="h-8 px-2 data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  >
                    <AlignJustifyIcon aria-hidden="true" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </TooltipTrigger>
            <TooltipContent>Row density — {density === 'compact' ? 'compact' : 'comfortable'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Filters</span>

          {query.trim().length > 0 && (
            <FilterChip label="Search" value={`"${query.trim()}"`} onRemove={() => onQueryChange('')} />
          )}

          {recentOnly && (
            <FilterChip label="Added" value="This month" onRemove={() => onRecentOnlyChange(false)} />
          )}

          {FACET_KEYS.map((key) =>
            facets[key].map((value) => (
              <FilterChip
                key={`${key}-${value}`}
                label={FACET_META[key].label}
                value={value}
                onRemove={() => onFacetChange(key, facets[key].filter((v) => v !== value))}
              />
            )),
          )}

          <Button variant="ghost" size="xs" onClick={onClearAll} className="ml-1 gap-1 text-muted-foreground">
            <RotateCcwIcon aria-hidden="true" />
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string
  value: string
  onRemove: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border border-border bg-muted/60 pr-1 pl-2 text-xs text-foreground',
      )}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="max-w-[14rem] truncate font-medium">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter ${value}`}
        className="flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}
