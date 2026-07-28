import { Link } from 'react-router-dom'
import { ShieldAlertIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import type { RiskRow } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/** Score bands. Written labels accompany every band so the tint is never the message. */
function band(score: number): { label: string; text: string; fill: string } {
  if (score >= 70) return { label: 'Sangat tinggi', text: 'text-destructive', fill: 'bg-destructive' }
  if (score >= 55) return { label: 'Tinggi', text: 'text-destructive', fill: 'bg-destructive/70' }
  if (score >= 40) return { label: 'Sederhana', text: 'text-foreground', fill: 'bg-primary' }
  return { label: 'Rendah', text: 'text-muted-foreground', fill: 'bg-primary/60' }
}

export interface RiskRegisterPanelProps {
  rows: RiskRow[]
}

/**
 * Composite risk: the asset's own score blended with live signals — condition,
 * criticality, SLA breaches, overdue inspections, lapsed cover. Reasons come straight
 * from `analytics.riskRegister` so the copilot and the board see the same sentence.
 */
export function RiskRegisterPanel({ rows }: RiskRegisterPanelProps) {
  return (
    <SectionCard
      title="Daftar Risiko"
      description="Enam aset berisiko tertinggi mengikut skor komposit"
      icon={ShieldAlertIcon}
      contentClassName="p-0"
      actions={
        <Button variant="outline" size="xs" asChild>
          <Link to="/registry?condition=Critical">Aset kritikal</Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Tiada aset berisiko" description="Tiada aset dalam skop ini mencetuskan penunjuk risiko." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const b = band(r.score)
            return (
              <li key={r.asset.id}>
                <Link
                  to={`/registry?asset=${r.asset.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{r.asset.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="font-mono">{r.asset.code}</span> · {r.asset.location.zone}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('text-sm font-semibold tabular-nums', b.text)}>
                        {r.score.toFixed(0)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{b.label}</p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', b.fill)} style={{ width: `${r.score}%` }} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={r.asset.condition} className="text-[10px]" />
                    <StatusBadge status={r.asset.criticality} className="text-[10px]" />
                    {r.reasons.slice(0, 2).map((reason) => (
                      <span
                        key={reason}
                        className="rounded border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
                      >
                        {reason}
                      </span>
                    ))}
                    {r.openWorkOrders > 0 && (
                      <span className="rounded border border-border bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                        {r.openWorkOrders} AK terbuka
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
