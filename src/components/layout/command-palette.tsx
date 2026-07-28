import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardListIcon,
  DatabaseIcon,
  MoonIcon,
  PlusIcon,
  RotateCcwIcon,
  SunIcon,
  WrenchIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { NAV_ITEMS } from '@/components/layout/app-sidebar'
import { StatusBadge } from '@/components/common/status-badge'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useAppStore } from '@/store/app-store'

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

/** Access the global command palette (used by the topbar search button). */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  }
  return ctx
}

/** Provides palette state and binds the Ctrl/Cmd + K shortcut. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle])

  return (
    <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
  )
}

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return fields.some((f) => f.toLowerCase().includes(q))
}

/** Ctrl/Cmd + K palette: navigation, asset & work order lookup, quick actions. */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)
  const resetDemoData = useAppStore((s) => s.resetDemoData)

  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const navResults = useMemo(
    () => NAV_ITEMS.filter((i) => matches(query, i.title, i.short, i.description, i.url)),
    [query],
  )

  const assetResults = useMemo(() => {
    if (!query) {
      return assets
        .slice()
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 5)
    }
    return assets
      .filter((a) =>
        matches(query, a.name, a.code, a.category, a.location.town, a.location.zone),
      )
      .slice(0, 6)
  }, [assets, query])

  const workOrderResults = useMemo(() => {
    const active = workOrders.filter((w) => w.status !== 'Closed' && w.status !== 'Cancelled')
    if (!query) {
      return active
        .filter((w) => w.slaStatus === 'Breached' || w.priority === 'P1 - Critical')
        .slice(0, 5)
    }
    return workOrders
      .filter((w) => matches(query, w.code, w.title, w.assetName, w.assetCode, w.assignedTo))
      .slice(0, 6)
  }, [workOrders, query])

  const go = useCallback(
    (to: string) => {
      setOpen(false)
      navigate(to)
    },
    [navigate, setOpen],
  )

  const isDark = resolvedTheme === 'dark'

  const actions = useMemo(
    () => [
      {
        id: 'new-wo',
        label: 'Create work order',
        keywords: 'raise ticket maintenance baru',
        icon: PlusIcon,
        run: () => {
          go('/maintenance?new=1')
          toast.info('New work order', { description: 'Complete the details to raise the ticket.' })
        },
      },
      {
        id: 'new-asset',
        label: 'Add asset to register',
        keywords: 'create asset daftar aset',
        icon: DatabaseIcon,
        run: () => {
          go('/registry?new=1')
          toast.info('New asset record', { description: 'Capture the asset details to register it.' })
        },
      },
      {
        id: 'reset',
        label: 'Reset demo data',
        keywords: 'restore baseline seed',
        icon: RotateCcwIcon,
        run: () => {
          resetDemoData()
          setOpen(false)
          toast.success('Demo data reset', {
            description: 'All records restored to the baseline data set.',
          })
        },
      },
      {
        id: 'theme',
        label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
        keywords: 'theme dark light appearance',
        icon: isDark ? SunIcon : MoonIcon,
        run: () => {
          setTheme(isDark ? 'light' : 'dark')
          setOpen(false)
        },
      },
    ],
    [go, isDark, resetDemoData, setOpen, setTheme],
  )

  const actionResults = actions.filter((a) => matches(query, a.label, a.keywords))
  const nothing =
    navResults.length === 0 &&
    assetResults.length === 0 &&
    workOrderResults.length === 0 &&
    actionResults.length === 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search KDH One Asset"
      description="Search assets, work orders and pages, or run a quick action."
      className="max-w-2xl"
    >
      <Command shouldFilter={false} className="rounded-xl">
        <CommandInput
          placeholder="Search assets, work orders, pages…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[420px]">
          {nothing && <CommandEmpty>No results for “{query}”.</CommandEmpty>}

          {navResults.length > 0 && (
            <CommandGroup heading="Navigation">
              {navResults.map((item) => (
                <CommandItem key={item.url} value={item.url} onSelect={() => go(item.url)}>
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{item.title}</span>
                  <CommandShortcut className="font-mono">{item.url}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {assetResults.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={query ? 'Assets' : 'Assets — highest risk'}>
                {assetResults.map((asset) => (
                  <CommandItem
                    key={asset.id}
                    value={`asset-${asset.id}`}
                    onSelect={() => go(`/registry?asset=${asset.id}`)}
                  >
                    <DatabaseIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {asset.name}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {asset.code}
                      </span>
                    </span>
                    <StatusBadge status={asset.status} className="ml-auto" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {workOrderResults.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={query ? 'Work orders' : 'Work orders — needs attention'}>
                {workOrderResults.map((wo) => (
                  <CommandItem
                    key={wo.id}
                    value={`wo-${wo.id}`}
                    onSelect={() => go(`/maintenance?wo=${wo.id}`)}
                  >
                    <WrenchIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {wo.title}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {wo.code}
                      </span>
                    </span>
                    <StatusBadge status={wo.slaStatus} className="ml-auto" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {actionResults.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                {actionResults.map((action) => (
                  <CommandItem key={action.id} value={action.id} onSelect={action.run}>
                    <action.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{action.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <div className="flex items-center justify-between px-3 py-2 text-[0.7rem] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ClipboardListIcon className="size-3.5" aria-hidden="true" />
              {assets.length} assets · {workOrders.length} work orders indexed
            </span>
            <span className="font-mono">Ctrl K</span>
          </div>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
