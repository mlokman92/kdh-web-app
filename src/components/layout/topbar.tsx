import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BellIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  InfoIcon,
  OctagonAlertIcon,
  SearchIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { routeMeta } from '@/components/layout/app-sidebar'
import { useCommandPalette } from '@/components/layout/command-palette'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatRelative } from '@/lib/format'
import type { Notification } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

/**
 * Notifications are authored against a richer route map than this prototype ships
 * (`/work-orders/:id`, `/leases/:id`, `/finance`, …). This folds them onto the six real
 * pages *and* onto the query parameters those pages actually implement, so a click
 * always lands on the record or the view the notification is talking about rather than
 * merely the right page with nothing selected.
 *
 * Supported by the destination pages:
 *   /registry     ?asset= ?q= ?new=1 ?tab=quality ?category= ?status= ?condition=
 *                 ?zone= ?criticality= ?ownership=
 *   /property     ?lease= ?status= ?tab=
 *   /maintenance  ?wo= ?sla= ?new=1 ?tab=
 *   /map          ?asset= ?zone=
 */
export function resolveAppLink(link?: string): string {
  if (!link) return '/'

  const [rawPath, rawSearch] = link.split('?')
  const path = rawPath.replace(/\/+$/, '')
  const params = new URLSearchParams(rawSearch ?? '')

  /* Legacy filter vocabulary -> the params the pages really read. */
  const legacyFilter = params.get('filter')
  if (legacyFilter) {
    params.delete('filter')
    if (legacyFilter === 'overdue') params.set('sla', 'Breached')
    if (legacyFilter === 'data-quality') params.set('tab', 'quality')
  }
  if (params.get('notice')) {
    params.delete('notice')
    params.set('tab', 'arrears')
  }

  const build = (base: string, extra?: [string, string]) => {
    if (extra) params.set(extra[0], extra[1])
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  /* `/segment/:id` keeps the id and re-expresses it as the page's own param. */
  const match = /^\/([a-z-]+)(?:\/(.+))?$/.exec(path)
  const segment = match?.[1] ?? ''
  const id = match?.[2]

  switch (segment) {
    case 'work-orders':
    case 'maintenance':
      return build('/maintenance', id ? ['wo', id] : undefined)
    case 'vendors':
      return build('/maintenance', ['tab', 'vendors'])
    case 'technicians':
      return build('/maintenance', ['tab', 'technicians'])
    case 'leases':
    case 'property':
      return build('/property', id ? ['lease', id] : undefined)
    case 'tenants':
      return build('/property', ['tab', 'tenants'])
    case 'finance':
      return build('/property', ['tab', 'arrears'])
    case 'assets':
    case 'registry':
      return build('/registry', id ? ['asset', id] : undefined)
    case 'gis':
    case 'map':
      return build('/map', id ? ['asset', id] : undefined)
    case 'copilot':
      return build('/copilot')
    default:
      return build('/')
  }
}

const SEVERITY_ICON = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  critical: OctagonAlertIcon,
} as const

const SEVERITY_CLASS = {
  info: 'border-border bg-muted text-muted-foreground',
  success: 'border-primary/20 bg-primary/10 text-primary',
  warning:
    'border-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/25 bg-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]/12 text-[color-mix(in_oklch,var(--destructive)_58%,var(--chart-1))]',
  critical: 'border-destructive/20 bg-destructive/10 text-destructive',
} as const

function NotificationRow({
  item,
  onOpen,
}: {
  item: Notification
  onOpen: (item: Notification) => void
}) {
  const Icon = SEVERITY_ICON[item.severity]
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60',
        !item.read && 'bg-primary/[0.04]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border',
          SEVERITY_CLASS[item.severity],
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 flex-1 text-sm font-medium text-foreground">
            {item.title}
          </span>
          {!item.read && (
            <span
              aria-label="Unread"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>
        <span className="mt-1 block font-mono text-[0.7rem] text-muted-foreground/80">
          {formatRelative(item.at)}
        </span>
      </span>
    </button>
  )
}

/** Sticky application header: breadcrumb, search, notifications, identity. */
export function Topbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setOpen } = useCommandPalette()

  const notifications = useAppStore((s) => s.notifications)
  const markNotificationRead = useAppStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useAppStore((s) => s.markAllNotificationsRead)
  const user = useAuthStore((s) => s.user)

  const current = routeMeta(pathname)
  const unread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
  const sorted = useMemo(
    () => notifications.slice().sort((a, b) => b.at.localeCompare(a.at)),
    [notifications],
  )

  const zoneScope =
    user?.zoneScope === 'all' ? 'All zones' : `${user?.zoneScope.length ?? 0} zones`

  function openNotification(item: Notification) {
    markNotificationRead(item.id)
    navigate(resolveAppLink(item.link))
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <SidebarTrigger className="text-muted-foreground" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to="/">KDH One Asset</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">{current?.title ?? 'Not found'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2 text-muted-foreground sm:w-64 sm:justify-start"
          aria-label="Search assets, work orders and pages"
        >
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-mono text-[0.65rem] text-muted-foreground sm:inline">
            Ctrl K
          </kbd>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative text-muted-foreground"
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
            >
              <BellIcon className="size-4" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">
                  {unread > 0 ? `${unread} unread` : 'All caught up'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                disabled={unread === 0}
                onClick={() => {
                  markAllNotificationsRead()
                  toast.success('All notifications marked as read')
                }}
              >
                <CheckCheckIcon className="size-3" />
                Mark all read
              </Button>
            </div>
            <ScrollArea className="h-[22rem]">
              {sorted.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={openNotification} />
              ))}
            </ScrollArea>
            <div className="border-t border-border px-3 py-2">
              <Button
                variant="ghost"
                size="xs"
                className="w-full text-muted-foreground"
                onClick={() => navigate('/')}
              >
                View operations dashboard
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <ThemeToggle />

        <Separator orientation="vertical" className="mx-0.5 hidden h-5 md:block" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="hidden h-7 cursor-default gap-1.5 px-2 md:inline-flex"
            >
              <ShieldCheckIcon className="size-3 text-primary" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{user?.role ?? 'Guest'}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{zoneScope}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="max-w-xs">
            {user
              ? `${user.name} — ${user.department}. Access scope: ${
                  user.zoneScope === 'all' ? 'all six KEJORA zones' : user.zoneScope.join(', ')
                }`
              : 'Not signed in'}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
