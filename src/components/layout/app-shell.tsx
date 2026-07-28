import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { CommandPalette, CommandPaletteProvider } from '@/components/layout/command-palette'
import { Topbar } from '@/components/layout/topbar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Application frame: sidebar navigation, sticky topbar and routed content. */
export function AppShell() {
  return (
    <TooltipProvider delayDuration={200}>
      <CommandPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-background">
            <Topbar />
            <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
              <Outlet />
            </div>
          </SidebarInset>
          <CommandPalette />
        </SidebarProvider>
      </CommandPaletteProvider>
    </TooltipProvider>
  )
}
