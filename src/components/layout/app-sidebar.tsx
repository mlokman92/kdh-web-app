import { useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BotIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MapPinnedIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  UserCogIcon,
  WrenchIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { KdhMark } from '@/components/common/kdh-mark'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { formatNumber } from '@/lib/format'
import { ROLES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

export interface NavItem {
  /** Full label shown in the sidebar. */
  title: string
  /** Short label used in breadcrumbs and the command palette. */
  short: string
  url: string
  icon: LucideIcon
  description: string
  /** Which live counter (if any) drives this item's badge. */
  badge?: 'assets' | 'openWorkOrders' | 'arrears'
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Dashboard',
        short: 'Dashboard',
        url: '/',
        icon: LayoutDashboardIcon,
        description: 'Portfolio performance, risk and SLA at a glance',
      },
    ],
  },
  {
    label: 'Asset Operations',
    items: [
      {
        title: 'Asset Registry',
        short: 'Registry',
        url: '/registry',
        icon: DatabaseIcon,
        description: 'Master register of every KDH asset with lifecycle and valuation',
        badge: 'assets',
      },
      {
        title: 'GIS Asset Map',
        short: 'GIS Map',
        url: '/map',
        icon: MapPinnedIcon,
        description: 'Spatial view of assets across the six KEJORA zones',
      },
      {
        title: 'Maintenance & Work Orders',
        short: 'Maintenance',
        url: '/maintenance',
        icon: WrenchIcon,
        description: 'Work orders, SLA tracking, planned maintenance and vendors',
        badge: 'openWorkOrders',
      },
    ],
  },
  {
    label: 'Commercial',
    items: [
      {
        title: 'Property & Lease',
        short: 'Property',
        url: '/property',
        icon: HandshakeIcon,
        description: 'Occupancy, tenancy, rental collection and arrears',
        badge: 'arrears',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        title: 'AI Copilot',
        short: 'Copilot',
        url: '/copilot',
        icon: BotIcon,
        description: 'Ask questions of the portfolio in plain language',
      },
    ],
  },
  {
    label: 'Field',
    items: [
      {
        title: 'Mobile Apps',
        short: 'Mobile',
        url: '/mobile',
        icon: SmartphoneIcon,
        description: 'Scan the QR code to try the companion field app',
      },
    ],
  },
]

/** Flat list of every navigable page — reused by the topbar and palette. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

/** Resolve the nav entry that owns a pathname. */
export function routeMeta(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0]
  return NAV_ITEMS.find((i) => i.url !== '/' && pathname.startsWith(i.url))
}

export function AppSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { isMobile } = useSidebar()

  const isActive = (url: string) => (url === '/' ? pathname === '/' : pathname.startsWith(url))

  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)
  const leases = useAppStore((s) => s.leases)
  const resetDemoData = useAppStore((s) => s.resetDemoData)

  const user = useAuthStore((s) => s.user)
  const switchRole = useAuthStore((s) => s.switchRole)
  const logout = useAuthStore((s) => s.logout)

  const counts = useMemo(
    () => ({
      assets: assets.length,
      openWorkOrders: workOrders.filter(
        (w) => w.status !== 'Closed' && w.status !== 'Cancelled',
      ).length,
      arrears: leases.filter((l) => l.outstandingAmount > 0).length,
    }),
    [assets, workOrders, leases],
  )

  const zoneScopeLabel =
    user?.zoneScope === 'all'
      ? 'All zones'
      : `${user?.zoneScope.length ?? 0} zones`

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <KdhMark className="size-5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              KDH One Asset
            </p>
            <p className="truncate text-[0.7rem] text-muted-foreground">KEJORA Group</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="text-[0.68rem] tracking-wider text-muted-foreground uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const badgeValue = item.badge ? counts[item.badge] : undefined
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="h-9"
                    >
                      <NavLink to={item.url} end={item.url === '/'}>
                        <item.icon
                          className={cn(
                            'shrink-0',
                            isActive(item.url) ? 'text-sidebar-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className="truncate">{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    {badgeValue !== undefined && badgeValue > 0 && (
                      <SidebarMenuBadge className="top-2 font-mono text-[0.7rem] text-muted-foreground">
                        {formatNumber(badgeValue)}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-medium text-primary">
                      {user?.avatarInitials ?? 'KDH'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user?.name ?? 'Guest'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.role ?? 'Not signed in'}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side={isMobile ? 'bottom' : 'right'}
                sideOffset={8}
                className="w-64"
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{user?.name ?? 'Guest'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? '—'}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {user?.department ?? '—'} · {zoneScopeLabel}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <UserCogIcon className="size-4" />
                    Switch role
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-60">
                    {ROLES.map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onSelect={() => {
                          switchRole(role)
                          toast.success(`Viewing as ${role}`, {
                            description: 'Zone scope and permissions updated for this session.',
                          })
                        }}
                      >
                        <span className="flex-1 truncate">{role}</span>
                        {user?.role === role && <CheckIcon className="size-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  onSelect={() => {
                    resetDemoData()
                    toast.success('Demo data reset', {
                      description: 'All assets, work orders and leases restored to baseline.',
                    })
                  }}
                >
                  <RotateCcwIcon className="size-4" />
                  Reset demo data
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    logout()
                    toast.info('Signed out')
                    navigate('/login', { replace: true })
                  }}
                >
                  <LogOutIcon className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
