import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  BanknoteIcon,
  FolderOpenIcon,
  HistoryIcon,
  LayoutPanelLeftIcon,
  MapPinIcon,
  PencilIcon,
  StoreIcon,
  Trash2Icon,
  WrenchIcon,
} from 'lucide-react'

import { StatusBadge } from '@/components/common/status-badge'
import { AuditTab } from '@/components/registry/detail/audit-tab'
import { CommercialTab } from '@/components/registry/detail/commercial-tab'
import { DocumentsTab } from '@/components/registry/detail/documents-tab'
import { FinancialsTab } from '@/components/registry/detail/financials-tab'
import { LocationTab } from '@/components/registry/detail/location-tab'
import { MaintenanceTab } from '@/components/registry/detail/maintenance-tab'
import { OverviewTab } from '@/components/registry/detail/overview-tab'
import { CATEGORY_ICON, scoreTone } from '@/components/registry/registry-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateTime, formatMYR } from '@/lib/format'
import type { Asset } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'

const TAB_TRIGGER =
  'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutPanelLeftIcon },
  { value: 'financials', label: 'Financials', icon: BanknoteIcon },
  { value: 'location', label: 'Location', icon: MapPinIcon },
  { value: 'maintenance', label: 'Maintenance', icon: WrenchIcon },
  { value: 'commercial', label: 'Commercial', icon: StoreIcon },
  { value: 'documents', label: 'Documents', icon: FolderOpenIcon },
  { value: 'audit', label: 'Audit', icon: HistoryIcon },
] as const

export interface AssetDetailSheetProps {
  asset: Asset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (asset: Asset) => void
  onDelete: (asset: Asset) => void
}

/** The full asset record — seven tabs over one authoritative row of the register. */
export function AssetDetailSheet({ asset, open, onOpenChange, onEdit, onDelete }: AssetDetailSheetProps) {
  const [tab, setTab] = useState<string>('overview')

  useEffect(() => {
    if (asset) setTab('overview')
  }, [asset?.id])

  const assetId = asset?.id ?? ''
  const assetCode = asset?.code ?? ''

  const workOrders = useAppStore(
    useShallow((s) => s.workOrders.filter((w) => w.assetId === assetId)),
  )
  const schedules = useAppStore(useShallow((s) => s.schedules.filter((x) => x.assetId === assetId)))
  const units = useAppStore(useShallow((s) => s.units.filter((u) => u.assetId === assetId)))
  const leases = useAppStore(useShallow((s) => s.leases.filter((l) => l.assetId === assetId)))
  const auditLog = useAppStore(
    useShallow((s) =>
      s.auditLog.filter((e) => e.entityId === assetCode || e.entityId === assetId),
    ),
  )

  const sortedWorkOrders = useMemo(
    () => workOrders.slice().sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)),
    [workOrders],
  )
  const sortedAudit = useMemo(() => auditLog.slice().sort((a, b) => b.at.localeCompare(a.at)), [auditLog])

  const CategoryIcon = asset ? CATEGORY_ICON[asset.category] : LayoutPanelLeftIcon
  const qualityTone = asset ? scoreTone(asset.dataQualityScore) : 'neutral'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-4xl"
      >
        {asset ? (
          <>
            <SheetHeader className="gap-2 border-b border-border px-5 py-4 pr-14">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary"
                >
                  <CategoryIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{asset.code}</p>
                  <SheetTitle className="truncate text-lg font-semibold">{asset.name}</SheetTitle>
                  <SheetDescription className="truncate text-xs">
                    {asset.subCategory} · {asset.location.town}, {asset.location.zone} · updated{' '}
                    {formatDateTime(asset.updatedAt)}
                  </SheetDescription>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={asset.status} />
                <StatusBadge status={asset.condition} />
                <StatusBadge status={asset.criticality} />
                <Badge variant="outline" className="font-normal">
                  {asset.ownership}
                </Badge>
                <Badge variant="outline" className="font-mono font-normal">
                  NBV {formatMYR(asset.netBookValue)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono font-normal',
                    qualityTone === 'positive' && 'border-primary/25 bg-primary/10 text-primary',
                    qualityTone === 'warning' &&
                      'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/30 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
                    qualityTone === 'critical' && 'border-destructive/25 bg-destructive/10 text-destructive',
                  )}
                >
                  DQ {asset.dataQualityScore}
                </Badge>

                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(asset)}>
                    <PencilIcon aria-hidden="true" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(asset)}>
                    <Trash2Icon aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <div className="overflow-x-auto border-b border-border px-5 py-2">
                <TabsList className="h-8 w-max">
                  {TABS.map(({ value, label, icon: Icon }) => (
                    <TabsTrigger key={value} value={value} className={cn('gap-1.5 px-2.5', TAB_TRIGGER)}>
                      <Icon aria-hidden="true" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-background px-5 py-4">
                <TabsContent value="overview">
                  <OverviewTab asset={asset} onFix={() => onEdit(asset)} />
                </TabsContent>
                <TabsContent value="financials">
                  <FinancialsTab asset={asset} />
                </TabsContent>
                <TabsContent value="location">
                  <LocationTab asset={asset} />
                </TabsContent>
                <TabsContent value="maintenance">
                  <MaintenanceTab asset={asset} workOrders={sortedWorkOrders} schedules={schedules} />
                </TabsContent>
                <TabsContent value="commercial">
                  <CommercialTab asset={asset} units={units} leases={leases} />
                </TabsContent>
                <TabsContent value="documents">
                  <DocumentsTab asset={asset} />
                </TabsContent>
                <TabsContent value="audit">
                  <AuditTab entries={sortedAudit} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : (
          <>
            <SheetHeader className="px-5 py-4">
              <SheetTitle>Asset record</SheetTitle>
              <SheetDescription>Select an asset from the register to view its full record.</SheetDescription>
            </SheetHeader>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
