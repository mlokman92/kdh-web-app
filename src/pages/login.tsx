import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  BuildingIcon,
  EyeIcon,
  EyeOffIcon,
  GaugeIcon,
  KeyRoundIcon,
  LayersIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  MapIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { KdhMark } from '@/components/common/kdh-mark'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ASSETS, PORTFOLIO_VALUE, USERS, WORK_ORDERS } from '@/data/mock'
import { formatMYRCompact, formatNumber, formatPct } from '@/lib/format'
import { ZONES, type Role } from '@/lib/types'
import { useAuthStore } from '@/store/auth-store'

const DEMO_PASSWORD = 'kdh2026'

const SHORTCUT_ROLES: Role[] = [
  'Group CEO',
  'Asset Manager',
  'Property & Leasing Manager',
  'Facilities Manager',
]

function TopoPanel() {
  const rings = (cx: number, cy: number, count: number, rotate: number) =>
    Array.from({ length: count }, (_, i) => (
      <ellipse
        key={`${cx}-${cy}-${i}`}
        cx={cx}
        cy={cy}
        rx={34 + i * 30}
        ry={22 + i * 21}
        transform={`rotate(${rotate} ${cx} ${cy})`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.22 - i * 0.018}
      />
    ))

  return (
    <svg
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full text-primary-foreground"
    >
      <defs>
        <pattern id="kdh-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.12" />
        </pattern>
      </defs>
      <rect width="600" height="800" fill="url(#kdh-grid)" />
      {rings(120, 640, 9, -18)}
      {rings(520, 150, 8, 24)}
      <path
        d="M0 470 L170 392 L318 452 L470 358 L600 404 L600 800 L0 800 Z"
        fill="currentColor"
        opacity={0.07}
      />
      <path
        d="M0 470 L170 392 L318 452 L470 358 L600 404"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        opacity={0.35}
      />
      {[
        [170, 392],
        [318, 452],
        [470, 358],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={4} fill="currentColor" opacity={0.9} />
          <circle cx={x} cy={y} r={11} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.4} />
        </g>
      ))}
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [email, setEmail] = useState('ceo@kdh.com.my')
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(() => {
    const resolved = WORK_ORDERS.filter(
      (w) => w.slaStatus === 'Met' || w.slaStatus === 'Breached',
    )
    const met = resolved.filter((w) => w.slaStatus === 'Met').length
    const compliance = resolved.length > 0 ? (met / resolved.length) * 100 : 0
    return [
      { icon: BuildingIcon, value: formatNumber(ASSETS.length), label: 'Assets under management' },
      { icon: LayersIcon, value: formatMYRCompact(PORTFOLIO_VALUE), label: 'Portfolio book value' },
      { icon: MapIcon, value: String(ZONES.length), label: 'Operational zones' },
      { icon: GaugeIcon, value: formatPct(compliance), label: 'SLA compliance YTD' },
    ]
  }, [])

  async function signIn(withEmail: string, withPassword: string) {
    setPending(true)
    setError(null)
    await new Promise((resolve) => setTimeout(resolve, 600))

    const result: unknown = login(withEmail, withPassword)
    const authed = useAuthStore.getState().isAuthenticated || result === true

    if (!authed) {
      setPending(false)
      setError('Invalid credentials. Use the demo password kdh2026 with a KDH email address.')
      return
    }

    const user = useAuthStore.getState().user
    toast.success('Signed in to KDH One Asset', {
      description: user ? `${user.name} — ${user.role}` : withEmail,
    })
    setPending(false)
    navigate('/', { replace: true })
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    void signIn(email.trim(), password)
  }

  function onRoleShortcut(role: Role) {
    const user = USERS.find((u) => u.role === role)
    if (!user) return
    setEmail(user.email)
    setPassword(DEMO_PASSWORD)
    void signIn(user.email, DEMO_PASSWORD)
  }

  if (isAuthenticated) return <Navigate to="/" replace />

  return (
    <div className="relative min-h-svh bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Left — brand panel */}
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
        <TopoPanel />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
            <KdhMark className="size-6 text-primary-foreground" />
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight">KDH One Asset</p>
            <p className="text-xs text-primary-foreground/75">
              Kejora Development Holding Sdn Bhd
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <Badge
            variant="outline"
            className="mb-5 h-6 border-primary-foreground/30 bg-primary-foreground/10 px-2.5 text-primary-foreground"
          >
            Enterprise Asset Management Platform
          </Badge>
          <h1 className="font-serif text-4xl leading-tight font-medium tracking-tight xl:text-[2.75rem]">
            One register for every KEJORA asset — from Bandar Tenggara shoplots to Desaru chalets.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-primary-foreground/85">
            A single operating picture across property, land, industrial estates and facilities:
            live asset registry, GIS mapping, SLA-driven maintenance, tenancy and arrears control,
            with AI-assisted decision support for management.
          </p>
        </div>

        <div className="relative">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-primary-foreground/20 ring-1 ring-primary-foreground/20">
            {stats.map((s) => (
              <div key={s.label} className="bg-primary p-4">
                <div className="flex items-center gap-2 text-primary-foreground/70">
                  <s.icon className="size-3.5" aria-hidden="true" />
                  <span className="text-[0.7rem] tracking-wide uppercase">{s.label}</span>
                </div>
                <p className="mt-1.5 font-mono text-xl font-medium tracking-tight">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-primary-foreground/60">
            Prototype build · Data as at July 2026 · Prepared for KDH senior management
          </p>
        </div>
      </aside>

      {/* Right — sign in */}
      <main className="relative flex min-h-svh flex-col justify-center px-5 py-10 sm:px-10 lg:py-12">
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-7 cursor-default gap-1 px-2 font-mono text-[0.7rem] text-muted-foreground"
            title="Bilingual interface — English / Bahasa Melayu"
          >
            EN <span className="text-muted-foreground/50">/</span> BM
          </Badge>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md">
          {/* Compact brand header for mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <KdhMark className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">KDH One Asset</p>
              <p className="text-xs text-muted-foreground">Kejora Development Holding Sdn Bhd</p>
            </div>
          </div>

          <Card className="ring-1 ring-border">
            <CardHeader className="gap-1">
              <CardTitle className="text-lg tracking-tight">Sign in</CardTitle>
              <CardDescription>
                Access the KDH asset management console with your corporate account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Corporate email</Label>
                  <div className="relative">
                    <MailIcon
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      placeholder="nama@kdh.com.my"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={() =>
                        toast.info('Password reset is handled by KDH Corporate ICT', {
                          description: 'Hubungi meja bantuan ICT di ext. 2210 untuk set semula.',
                        })
                      }
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <LockIcon
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 pl-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                    Remember this device
                  </Label>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                      Authenticating…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <KeyRoundIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs font-medium text-foreground">Demo credentials</p>
                </div>
                <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                  ceo@kdh.com.my · kdh2026
                </p>
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                    Sign in as
                  </span>
                  <Separator className="flex-1" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SHORTCUT_ROLES.map((role) => {
                    const user = USERS.find((u) => u.role === role)
                    return (
                      <Button
                        key={role}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        className="h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left"
                        onClick={() => onRoleShortcut(role)}
                      >
                        <span className="w-full truncate text-xs font-medium">{role}</span>
                        <span className="w-full truncate text-[0.7rem] font-normal text-muted-foreground">
                          {user?.name ?? '—'}
                        </span>
                      </Button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
            Role-based access · Audit-logged · Demo environment, no live records
          </p>
        </div>
      </main>
    </div>
  )
}
