import {
  BuildingIcon,
  DatabaseIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { CopilotScope } from '@/components/copilot/engine'
import { PROMPT_GROUPS, SHOWCASE_PROMPTS, type PromptTheme } from '@/components/copilot/prompts'
import { KdhMark } from '@/components/common/kdh-mark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { ZONES } from '@/lib/types'

const THEME_ICONS: Record<PromptTheme, LucideIcon> = {
  Portfolio: BuildingIcon,
  Maintenance: WrenchIcon,
  'Property & Revenue': TrendingUpIcon,
  'Risk & Compliance': TriangleAlertIcon,
}

export interface CopilotIntroProps {
  scope: CopilotScope
  onAsk: (question: string) => void
  onRunShowcase: () => void
}

export function CopilotIntro({ scope, onAsk, onRunShowcase }: CopilotIntroProps) {
  const recordCount =
    scope.assets.length +
    scope.workOrders.length +
    scope.units.length +
    scope.leases.length +
    scope.payments.length +
    scope.tenants.length +
    scope.vendors.length +
    scope.technicians.length +
    scope.schedules.length

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-1 py-6">
      {/* Branded intro */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <KdhMark className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Ask anything about the KDH portfolio
          </h2>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            The Management Copilot reasons directly over {formatNumber(recordCount)} authorised records — assets, units,
            leases, rent ledger, work orders, contractors and compliance data. Every answer shows its sources and its
            working, so nothing has to be taken on trust.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="outline" className="gap-1.5 font-normal">
            <DatabaseIcon className="size-3" aria-hidden="true" />
            {formatNumber(recordCount)} records in scope
          </Badge>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <ShieldCheckIcon className="size-3" aria-hidden="true" />
            {scope.zones.length} of {ZONES.length} zones authorised
          </Badge>
          <Badge variant="outline" className="gap-1.5 font-normal">
            <SparklesIcon className="size-3" aria-hidden="true" />
            {scope.user?.role ?? 'Guest'}
          </Badge>
        </div>
      </div>

      {/* Showcase — suggested opening questions */}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Suggested to start</p>
            <p className="text-xs text-muted-foreground">
              Three questions that show the breadth of the engine — value, SLA and lease exposure.
            </p>
          </div>
          <Button size="sm" onClick={onRunShowcase} className="gap-1.5">
            <PlayIcon className="size-3.5" aria-hidden="true" />
            Run all three
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SHOWCASE_PROMPTS.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => onAsk(p)}
              className="group rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="font-mono text-[10px] text-primary">{String(i + 1).padStart(2, '0')}</span>
              <span className="mt-0.5 block text-xs leading-snug font-medium text-foreground">{p}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Themed prompt library */}
      <div className="grid gap-3 sm:grid-cols-2">
        {PROMPT_GROUPS.map((group) => {
          const Icon = THEME_ICONS[group.theme]
          return (
            <div key={group.theme} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{group.theme}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{group.blurb}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.prompts.map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="xs"
                    onClick={() => onAsk(p)}
                    className="h-auto min-h-7 rounded-full py-1 text-left font-normal whitespace-normal"
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
