import { useMemo } from 'react'
import {
  BuildingIcon,
  ClockIcon,
  FileTextIcon,
  HistoryIcon,
  MessageSquareIcon,
  RadioIcon,
  ShieldCheckIcon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react'

import type { CopilotScope } from '@/components/copilot/engine'
import { CANNED_SESSIONS } from '@/components/copilot/prompts'
import { SectionCard } from '@/components/common/section-card'
import { TONE_DOT_CLASSES } from '@/components/common/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { ZONES } from '@/lib/types'
import { cn } from '@/lib/utils'

function maxIso(values: (string | undefined)[]): string | undefined {
  let best: string | undefined
  for (const v of values) {
    if (!v) continue
    if (!best || v > best) best = v
  }
  return best
}

export interface RightRailProps {
  scope: CopilotScope
  onLoadSession: (questions: string[], title: string) => void
  activeSessionId?: string
}

export function CopilotRightRail({ scope, onLoadSession, activeSessionId }: RightRailProps) {
  const user = scope.user
  const authorisedZones = scope.zones
  const restricted = ZONES.filter((z) => !authorisedZones.includes(z))

  const datasets = useMemo(
    () => [
      { label: 'Asset register', icon: BuildingIcon, count: scope.assets.length, at: maxIso(scope.assets.map((a) => a.updatedAt)) },
      { label: 'Work orders', icon: WrenchIcon, count: scope.workOrders.length, at: maxIso(scope.workOrders.map((w) => w.raisedAt)) },
      { label: 'Leases & tenants', icon: FileTextIcon, count: scope.leases.length + scope.tenants.length, at: maxIso(scope.leases.map((l) => l.lastPaymentDate)) },
      { label: 'Rent ledger', icon: RadioIcon, count: scope.payments.length, at: maxIso(scope.payments.map((p) => p.paidDate)) },
      { label: 'Contractors & crews', icon: UsersIcon, count: scope.vendors.length + scope.technicians.length, at: maxIso(scope.workOrders.map((w) => w.raisedAt)) },
    ],
    [scope],
  )

  const financialPeriod = scope.monthlyFinancials[scope.monthlyFinancials.length - 1]

  return (
    <div className="space-y-4">
      <SectionCard
        title="Authorised data scope"
        description="Row-level security applied to every answer"
        icon={ShieldCheckIcon}
        contentClassName="p-4 space-y-3.5"
      >
        <div className="flex items-center gap-3">
          <Avatar className="size-9 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
              {user?.avatarInitials ?? 'KD'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user?.name ?? 'Guest session'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.role ?? 'Unauthenticated'} · {user?.department ?? '—'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">
            Zone scope
            <span className="ml-1.5 font-normal text-muted-foreground">
              {authorisedZones.length} of {ZONES.length}
            </span>
          </p>
          <div className="flex flex-wrap gap-1">
            {authorisedZones.map((z) => (
              <Badge key={z} variant="outline" className="gap-1 border-primary/25 bg-primary/10 font-normal text-primary">
                <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES.positive)} />
                {z.replace(/^Zon\s+/, '')}
              </Badge>
            ))}
            {restricted.map((z) => (
              <Badge key={z} variant="outline" className="gap-1 font-normal text-muted-foreground line-through">
                {z.replace(/^Zon\s+/, '')}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Queryable datasets</p>
          <ul className="space-y-1">
            {datasets.map((d) => (
              <li key={d.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <d.icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{d.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-foreground">{formatNumber(d.count)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {scope.allZones
            ? 'Your role carries group-wide visibility, so the copilot reasons over every KEJORA zone. Switch role in the sidebar to see the same questions answered against a narrower dataset.'
            : `Records outside your ${authorisedZones.length} authorised zones are excluded before any figure is computed — not merely hidden from the result. Switch role in the sidebar to widen or narrow this scope.`}
        </p>
      </SectionCard>

      <SectionCard
        title="Conversation history"
        description="Previous copilot sessions"
        icon={HistoryIcon}
        contentClassName="p-2"
      >
        <ul className="space-y-0.5">
          {CANNED_SESSIONS.map((session) => (
            <li key={session.id}>
              <Button
                variant="ghost"
                onClick={() => onLoadSession(session.questions, session.title)}
                className={cn(
                  'h-auto w-full justify-start gap-2.5 px-2 py-2 text-left font-normal',
                  activeSessionId === session.id && 'bg-accent/60',
                )}
              >
                <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">{session.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {session.questions.length} questions ·{' '}
                    {formatRelative(new Date(scope.now.getTime() - session.hoursAgo * 3_600_000).toISOString(), scope.now)}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Data freshness"
        description="Last sync per source system"
        icon={ClockIcon}
        contentClassName="p-4"
      >
        <ul className="space-y-2.5">
          {datasets.map((d) => (
            <li key={d.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{d.label}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{formatDateTime(d.at)}</p>
              </div>
              <Badge variant="outline" className="shrink-0 gap-1 font-normal">
                <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES.positive)} />
                {formatRelative(d.at, scope.now)}
              </Badge>
            </li>
          ))}
          <li className="flex items-start justify-between gap-3 border-t border-border pt-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">Financial roll-up</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                Period closed {financialPeriod ? financialPeriod.period : '—'}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 gap-1 font-normal">
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONE_DOT_CLASSES.positive)} />
              Group level
            </Badge>
          </li>
        </ul>
      </SectionCard>
    </div>
  )
}
