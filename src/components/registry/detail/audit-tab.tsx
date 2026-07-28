import { HistoryIcon } from 'lucide-react'

import { EmptyState } from '@/components/common/empty-state'
import { DetailBlock } from '@/components/registry/detail/detail-parts'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatRelative, initials } from '@/lib/format'
import type { AuditEntry } from '@/lib/types'

export function AuditTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <DetailBlock
      title={`Audit trail (${entries.length})`}
      icon={HistoryIcon}
      description="Every change to this record, attributable and time-stamped"
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No audit entries yet"
          description="Edits, status changes and deletions made from this console will be recorded here against the signed-in officer."
        />
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {entries.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-[1.42rem] size-2 rounded-full bg-primary ring-4 ring-card"
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{entry.action}</p>
                <Badge variant="outline" className="font-normal">
                  {entry.entity}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{entry.entityId}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted font-mono text-[0.6rem] text-muted-foreground">
                    {initials(entry.actor)}
                  </span>
                  {entry.actor}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatDateTime(entry.at)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelative(entry.at)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </DetailBlock>
  )
}
