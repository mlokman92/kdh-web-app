/**
 * Mobile Apps — the "scan this now" screen.
 *
 * Shown on the projector during a pitch so the room can pull the companion app
 * onto their own phones. Everything is sized to be readable and scannable from
 * the back of a meeting room, so the QR is deliberately oversized.
 */

import {
  BellRingIcon,
  ClipboardListIcon,
  type LucideIcon,
  MapPinnedIcon,
  QrCodeIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  WifiOffIcon,
} from 'lucide-react'

import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface ScreenSpec {
  icon: LucideIcon
  title: string
  malay: string
  body: string
}

/** The six screens that ship in the companion app. */
const SCREENS: ScreenSpec[] = [
  {
    icon: SmartphoneIcon,
    title: 'Dashboard Overview',
    malay: 'Papan Pemuka',
    body: 'Portfolio value, SLA compliance, occupancy and collection rate — the same figures as the web console, sized for a phone.',
  },
  {
    icon: QrCodeIcon,
    title: 'Asset Passport',
    malay: 'Pasport Aset',
    body: 'Full asset profile: identity, financials, land title, insurance, documents and lifecycle history, with a printable QR tag.',
  },
  {
    icon: MapPinnedIcon,
    title: 'GIS Asset Map',
    malay: 'Peta Aset',
    body: 'The six KEJORA zones with pinch-zoom, pin clustering and tap-to-inspect — drawn on-device, so it works with no signal.',
  },
  {
    icon: ScanLineIcon,
    title: 'Scan to Raise a Job',
    malay: 'Imbas & Lapor',
    body: 'A field officer scans the asset tag, confirms the asset, and raises a work order on the spot without typing a code.',
  },
  {
    icon: ClipboardListIcon,
    title: 'Maintenance Tasks',
    malay: 'Tugasan Penyelenggaraan',
    body: 'Jobs grouped by SLA urgency with live countdowns, an interactive checklist and one-tap status changes.',
  },
  {
    icon: SparklesIcon,
    title: 'AI Copilot Alerts',
    malay: 'Amaran Copilot',
    body: 'Proactive insights pushed to management, each with a recommendation, a confidence score and its data citations.',
  },
]

const STEPS = [
  { n: 1, text: 'Open the camera app on your phone.' },
  { n: 2, text: 'Point it at the code until the link appears.' },
  { n: 3, text: 'Tap the link to launch KDH One Asset Mobile.' },
]

export default function MobileApps() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Mobile Apps"
        description="Aplikasi mudah alih KDH One Asset — imbas kod QR untuk mencuba pada telefon anda. Scan the code to try the companion field app on your own phone."
        icon={SmartphoneIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'Mobile Apps' }]}
        actions={<Badge variant="secondary">Prototype build</Badge>}
      />

      {/* ---- Scan panel --------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col items-center gap-4 p-6">
            {/*
              The label always prints on white regardless of theme — a dark
              surface behind a QR is the fastest way to make it unscannable.
            */}
            <div className="rounded-2xl border border-border bg-white p-4">
              <img
                src="/kdh-app-qr.png"
                alt="QR code linking to the KDH One Asset mobile app"
                width={280}
                height={280}
                className="size-[280px] max-w-full"
              />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Imbas untuk mencuba</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scan with your phone camera to open the app
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <SectionCard title="Cara mencuba" description="How to try it, in three steps" icon={QrCodeIcon}>
            <ol className="space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                    {s.n}
                  </span>
                  <span className="text-sm text-foreground">{s.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              The mobile app runs on the same asset model as this console and ships with the same
              demo dataset, so the figures you see on a phone match the figures on this screen.
            </p>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <Highlight
              icon={WifiOffIcon}
              title="Works offline"
              body="Maps and data render on-device. No tile server, no connection required."
            />
            <Highlight
              icon={ScanLineIcon}
              title="Built for the field"
              body="Scan a tag, raise a job, close it out — without returning to a desk."
            />
            <Highlight
              icon={ShieldCheckIcon}
              title="One source of truth"
              body="Shares the asset registry, work orders and SLA rules with the web console."
            />
          </div>
        </div>
      </div>

      {/* ---- What's inside ------------------------------------------------ */}
      <SectionCard
        title="Apa yang ada di dalam"
        description="Six screens ship in this build"
        icon={SmartphoneIcon}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {SCREENS.map((s) => (
            <div
              key={s.title}
              className="flex gap-3 rounded-lg border border-border bg-background/40 p-3"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"
              >
                <s.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.malay}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ---- Honest note about the build ---------------------------------- */}
      <SectionCard
        title="Nota prototaip"
        description="What this build is, and is not"
        icon={BellRingIcon}
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-primary">
              •
            </span>
            <span>
              This is a requirement-gathering prototype. It runs on generated demo data — no live
              KDH systems are connected.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-primary">
              •
            </span>
            <span>
              The QR scanner in the app is simulated for demo reliability, so it never asks for
              camera permission on your device.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-primary">
              •
            </span>
            <span>
              Anything you add or change on your phone stays on your phone. It will not affect what
              anyone else sees.
            </span>
          </li>
        </ul>
      </SectionCard>
    </div>
  )
}

function Highlight({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
