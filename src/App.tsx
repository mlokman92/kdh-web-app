import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CompassIcon } from 'lucide-react'
import { KdhMark } from '@/components/common/kdh-mark'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import Login from '@/pages/login'
import Dashboard from '@/pages/dashboard'
import Registry from '@/pages/registry'
import GisMap from '@/pages/gis-map'
import Maintenance from '@/pages/maintenance'
import Property from '@/pages/property'
import Copilot from '@/pages/copilot'
import MobileApps from '@/pages/mobile-apps'
import { useAuthStore } from '@/store/auth-store'

function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <KdhMark className="size-7" />
      </span>
      <div className="space-y-1.5">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          The page you requested is not part of the KDH One Asset console. It may have been moved,
          or the link may be out of date.
        </p>
      </div>
      <Button asChild>
        <Link to="/">
          <CompassIcon className="size-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="registry" element={<Registry />} />
            <Route path="map" element={<GisMap />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="property" element={<Property />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="mobile" element={<MobileApps />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  )
}
