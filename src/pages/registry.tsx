import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DatabaseIcon, DownloadIcon, PlusIcon, SearchXIcon, ShieldAlertIcon, TableIcon, UploadIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { AddAssetDialog } from '@/components/registry/add-asset-dialog'
import { AssetDetailSheet } from '@/components/registry/asset-detail-sheet'
import { AssetTable } from '@/components/registry/asset-table'
import { BulkActionBar } from '@/components/registry/bulk-action-bar'
import { DataQualityPanel } from '@/components/registry/data-quality-panel'
import { EditAssetDialog } from '@/components/registry/edit-asset-dialog'
import { ImportCsvDialog } from '@/components/registry/import-csv-dialog'
import { QrLabelsDialog } from '@/components/registry/qr-label'
import { RegistrySummary } from '@/components/registry/registry-summary'
import { RegistryToolbar } from '@/components/registry/registry-toolbar'
import { TablePagination } from '@/components/registry/table-pagination'
import {
  FACET_KEYS,
  addedThisMonth,
  assetCsvRow,
  completeness,
  csvFilename,
  defaultColumns,
  emptyFacets,
  facetCounts,
  filterAssets,
  needsAttention,
  sortAssets,
  type ColumnKey,
  type ColumnState,
  type Density,
  type FacetKey,
  type FacetState,
  type PageSize,
  type SortDir,
  type SortKey,
} from '@/components/registry/registry-utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { downloadCsv, formatNumber } from '@/lib/format'
import { ASSET_CATEGORIES, ASSET_STATUSES, CONDITIONS, CRITICALITIES, OWNERSHIP_TYPES, ZONES, type Asset, type AssetStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { nextAssetCode, useAppStore, type NewAssetInput } from '@/store/app-store'
import { useAuthStore, visibleZones } from '@/store/auth-store'

const TAB_TRIGGER =
  'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'

/** Query params the shell and the notification centre can deep-link with. */
const PARAM_FACETS: Record<string, { key: FacetKey; options: readonly string[] }> = {
  category: { key: 'category', options: ASSET_CATEGORIES },
  status: { key: 'status', options: ASSET_STATUSES },
  condition: { key: 'condition', options: CONDITIONS },
  zone: { key: 'zone', options: ZONES },
  criticality: { key: 'criticality', options: CRITICALITIES },
  ownership: { key: 'ownership', options: OWNERSHIP_TYPES },
}

export default function Registry() {
  /* ---------------------------------------------------------------- */
  /* Store                                                             */
  /* ---------------------------------------------------------------- */

  const assets = useAppStore((s) => s.assets)
  const addAsset = useAppStore((s) => s.addAsset)
  const updateAsset = useAppStore((s) => s.updateAsset)
  const deleteAsset = useAppStore((s) => s.deleteAsset)
  const user = useAuthStore((s) => s.user)

  const zones = useMemo(() => visibleZones(user), [user])
  const scope = useMemo(
    () => assets.filter((a) => zones.includes(a.location.zone)),
    [assets, zones],
  )

  /* ---------------------------------------------------------------- */
  /* View state                                                        */
  /* ---------------------------------------------------------------- */

  const [view, setView] = useState<'register' | 'quality'>('register')
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<FacetState>(emptyFacets)
  const [recentOnly, setRecentOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('nbv')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [columns, setColumns] = useState<ColumnState>(defaultColumns)
  const [density, setDensity] = useState<Density>('comfortable')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(25)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [detailId, setDetailId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [labelAssets, setLabelAssets] = useState<Asset[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Deep links                                                        */
  /* ---------------------------------------------------------------- */

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    let touched = false

    const assetParam = searchParams.get('asset')
    if (assetParam) {
      const match = assets.find((a) => a.id === assetParam || a.code === assetParam)
      if (match) setDetailId(match.id)
      touched = true
    }

    if (searchParams.get('new') === '1') {
      setAddOpen(true)
      touched = true
    }

    if (searchParams.get('quality') === 'low' || searchParams.get('tab') === 'quality') {
      setView('quality')
      touched = true
    }

    const seeded = emptyFacets()
    let seededAny = false
    for (const [param, meta] of Object.entries(PARAM_FACETS)) {
      const raw = searchParams.get(param)
      if (!raw) continue
      const values = raw.split(',').map((v) => v.trim()).filter((v) => meta.options.includes(v))
      if (values.length > 0) {
        seeded[meta.key] = values
        seededAny = true
      }
    }
    if (seededAny) {
      setFacets(seeded)
      setPage(1)
      touched = true
    }

    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      touched = true
    }

    if (touched) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, assets])

  /* ---------------------------------------------------------------- */
  /* Derived rows                                                      */
  /* ---------------------------------------------------------------- */

  const recentIds = useMemo(() => new Set(addedThisMonth(scope).map((a) => a.id)), [scope])

  const searchScope = useMemo(
    () => (recentOnly ? scope.filter((a) => recentIds.has(a.id)) : scope),
    [scope, recentOnly, recentIds],
  )

  const filtered = useMemo(() => filterAssets(searchScope, query, facets), [searchScope, query, facets])
  const sorted = useMemo(() => sortAssets(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  const counts = useMemo(() => {
    const out = {} as Record<FacetKey, Record<string, number>>
    for (const key of FACET_KEYS) out[key] = facetCounts(searchScope, query, facets, key)
    return out
  }, [searchScope, query, facets])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const rows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, sorted.length)

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedAssets = useMemo(() => assets.filter((a) => selectedSet.has(a.id)), [assets, selectedSet])
  const detailAsset = useMemo(() => assets.find((a) => a.id === detailId) ?? null, [assets, detailId])
  const editAsset = useMemo(() => assets.find((a) => a.id === editId) ?? null, [assets, editId])
  const attentionCount = useMemo(() => filtered.filter(needsAttention).length, [filtered])

  /* ---------------------------------------------------------------- */
  /* Handlers                                                          */
  /* ---------------------------------------------------------------- */

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        // Text columns read best A→Z; scores and money read best highest-first.
        const textual = key === 'code' || key === 'name' || key === 'location' || key === 'category'
        setSortDir(textual ? 'asc' : 'desc')
      }
      setPage(1)
    },
    [sortKey],
  )

  const handleFacetChange = useCallback((key: FacetKey, next: string[]) => {
    setFacets((f) => ({ ...f, [key]: next }))
    setPage(1)
  }, [])

  const clearAll = useCallback(() => {
    setQuery('')
    setFacets(emptyFacets())
    setRecentOnly(false)
    setPage(1)
  }, [])

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((x) => x !== id)))
  }, [])

  const togglePage = useCallback(
    (checked: boolean) => {
      const ids = rows.map((r) => r.id)
      setSelectedIds((current) =>
        checked ? [...new Set([...current, ...ids])] : current.filter((x) => !ids.includes(x)),
      )
    },
    [rows],
  )

  const exportRows = useCallback((list: Asset[], label: string) => {
    if (list.length === 0) {
      toast.error('Nothing to export', { description: 'Adjust the filters so at least one asset is in view.' })
      return
    }
    downloadCsv(csvFilename(label), list.map(assetCsvRow))
    toast.success(`${formatNumber(list.length)} records exported`, {
      description: 'CSV generated in the browser — no data left this device.',
    })
  }, [])

  const openDetail = useCallback((asset: Asset) => setDetailId(asset.id), [])

  const openEdit = useCallback((asset: Asset) => setEditId(asset.id), [])

  const copyCode = useCallback((asset: Asset) => {
    navigator.clipboard
      ?.writeText(asset.code)
      .then(() => toast.success('Asset code copied', { description: asset.code }))
      .catch(() => toast.error('Could not copy to the clipboard'))
  }, [])

  const handleCreate = useCallback(
    (input: NewAssetInput) => {
      const created = addAsset(input)
      setAddOpen(false)
      setDetailId(created.id)
      toast.success(`Asset registered — ${created.code}`, {
        description: `${created.name} is now live in the register with a QR label ready to print.`,
      })
    },
    [addAsset],
  )

  const handleImport = useCallback(
    (inputs: NewAssetInput[]) => {
      let pool = useAppStore.getState().assets
      let last: Asset | null = null
      for (const input of inputs) {
        const code = nextAssetCode(pool, input.category)
        const provisional = {
          ...input,
          code,
          qrPayload: `https://oneasset.kdh.com.my/qr/${code}`,
        }
        const dataQualityScore = completeness({
          ...(provisional as unknown as Asset),
          id: 'import-preview',
          createdAt: '',
          updatedAt: '',
        })
        last = addAsset({ ...provisional, dataQualityScore })
        pool = [last, ...pool]
      }
      if (last) {
        toast.success(`${formatNumber(inputs.length)} assets imported`, {
          description: 'Every row is tagged "Imported Batch" and recorded in the audit trail.',
        })
      }
    },
    [addAsset],
  )

  const handleSaveEdit = useCallback(
    (id: string, patch: Partial<Asset>) => {
      updateAsset(id, patch)
      setEditId(null)
      toast.success('Asset updated', { description: `${patch.name ?? 'Record'} saved and written to the audit trail.` })
    },
    [updateAsset],
  )

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteAsset(deleteTarget.id)
    setSelectedIds((current) => current.filter((x) => x !== deleteTarget.id))
    if (detailId === deleteTarget.id) setDetailId(null)
    toast.success(`${deleteTarget.code} removed`, {
      description: `${deleteTarget.name} and its linked work orders were withdrawn from the register.`,
    })
    setDeleteTarget(null)
  }, [deleteTarget, deleteAsset, detailId])

  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.length
    for (const id of selectedIds) deleteAsset(id)
    if (detailId && selectedIds.includes(detailId)) setDetailId(null)
    setSelectedIds([])
    setBulkDeleteOpen(false)
    toast.success(`${formatNumber(count)} assets removed`, {
      description: 'Linked work orders were withdrawn with them. The audit trail keeps the full history.',
    })
  }, [selectedIds, deleteAsset, detailId])

  const handleBulkStatus = useCallback(
    (status: AssetStatus) => {
      for (const id of selectedIds) updateAsset(id, { status })
      toast.success(`Status set to "${status}"`, {
        description: `${formatNumber(selectedIds.length)} records updated across the register.`,
      })
    },
    [selectedIds, updateAsset],
  )

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5">
      <PageHeader
        title="Unified Digital Asset Registry"
        description="One authoritative record for every KDH property, industrial lot, land parcel and facility across the six KEJORA zones — valuation, condition, custody, documents and QR identity in a single register."
        icon={DatabaseIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'Asset Registry' }]}
        actions={
          <>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon aria-hidden="true" />
              Add asset
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <UploadIcon aria-hidden="true" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportRows(sorted, 'kdh-asset-register')}
            >
              <DownloadIcon aria-hidden="true" />
              Export
            </Button>
          </>
        }
      />

      <RegistrySummary
        filtered={filtered}
        scope={scope}
        onShowQuality={() => setView('quality')}
        onShowRecent={() => {
          setRecentOnly(true)
          setView('register')
          setPage(1)
        }}
      />

      <Tabs
        value={view}
        onValueChange={(v) => setView(v === 'quality' ? 'quality' : 'register')}
        className="flex flex-col gap-4"
      >
        <TabsList className="h-8 w-max">
          <TabsTrigger value="register" className={cn('gap-1.5 px-3', TAB_TRIGGER)}>
            <TableIcon aria-hidden="true" />
            Asset register
            <Badge variant="secondary" className="ml-1 h-4 px-1 font-mono text-[0.65rem] tabular-nums">
              {formatNumber(filtered.length)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="quality" className={cn('gap-1.5 px-3', TAB_TRIGGER)}>
            <ShieldAlertIcon aria-hidden="true" />
            Data quality
            {attentionCount > 0 && (
              <Badge
                variant="outline"
                className="ml-1 h-4 border-destructive/25 bg-destructive/10 px-1 font-mono text-[0.65rem] tabular-nums text-destructive"
              >
                {formatNumber(attentionCount)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="space-y-4">
          <RegistryToolbar
            query={query}
            onQueryChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            facets={facets}
            onFacetChange={handleFacetChange}
            counts={counts}
            columns={columns}
            onColumnToggle={(key: ColumnKey, next) => setColumns((c) => ({ ...c, [key]: next }))}
            onResetColumns={() => setColumns(defaultColumns())}
            density={density}
            onDensityChange={setDensity}
            onClearAll={clearAll}
            recentOnly={recentOnly}
            onRecentOnlyChange={(next) => {
              setRecentOnly(next)
              setPage(1)
            }}
          />

          <SectionCard
            title="Asset register"
            description={`${formatNumber(sorted.length)} records in view · ${formatNumber(scope.length)} within your zone scope`}
            icon={TableIcon}
            contentClassName="p-0"
            actions={
              selectedIds.length === 0 ? (
                <Badge variant="outline" className="font-normal">
                  {zones.length === ZONES.length ? 'All six KEJORA zones' : `${zones.length} zone scope`}
                </Badge>
              ) : null
            }
          >
            <BulkActionBar
              count={selectedIds.length}
              filteredCount={sorted.length}
              onSelectAllFiltered={() => setSelectedIds(sorted.map((a) => a.id))}
              onClear={() => setSelectedIds([])}
              onExport={() => exportRows(selectedAssets, 'kdh-asset-selection')}
              onBulkStatus={handleBulkStatus}
              onGenerateLabels={() => setLabelAssets(selectedAssets)}
              onDelete={() => setBulkDeleteOpen(true)}
            />

            {rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={SearchXIcon}
                  title="No assets match these filters"
                  description="Widen the search, remove a facet, or clear everything to see the full register again."
                  action={
                    <Button variant="outline" size="sm" onClick={clearAll}>
                      Clear all filters
                    </Button>
                  }
                />
              </div>
            ) : (
              <AssetTable
                rows={rows}
                columns={columns}
                density={density}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                selectedIds={selectedSet}
                onToggleRow={toggleRow}
                onTogglePage={togglePage}
                onOpen={openDetail}
                onEdit={openEdit}
                onQrLabel={(asset) => setLabelAssets([asset])}
                onExportRow={(asset) => exportRows([asset], `kdh-asset-${asset.code.toLowerCase()}`)}
                onCopyCode={copyCode}
                onDelete={setDeleteTarget}
              />
            )}

            <TablePagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={sorted.length}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="quality">
          <DataQualityPanel
            assets={filtered}
            onOpen={openDetail}
            onFix={(asset) => {
              setDetailId(asset.id)
              setEditId(asset.id)
            }}
          />
        </TabsContent>
      </Tabs>

      {/* ---------------------------------------------------------- */}

      <AssetDetailSheet
        asset={detailAsset}
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />

      <AddAssetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingAssets={assets}
        onCreate={handleCreate}
      />

      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} />

      <EditAssetDialog
        asset={editAsset}
        open={editId !== null}
        onOpenChange={(open) => {
          if (!open) setEditId(null)
        }}
        onSave={handleSaveEdit}
      />

      <QrLabelsDialog
        assets={labelAssets}
        open={labelAssets.length > 0}
        onOpenChange={(open) => {
          if (!open) setLabelAssets([])
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.code} from the register?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be withdrawn from the asset register along with any work orders raised against
              it. The action is written to the audit trail and can be undone by resetting the demo data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove asset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {formatNumber(selectedIds.length)} assets?</AlertDialogTitle>
            <AlertDialogDescription>
              Every selected record and its linked work orders will be withdrawn from the register. The audit trail
              keeps a full, attributable history of the removal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete}>Remove {formatNumber(selectedIds.length)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
