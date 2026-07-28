import { useRef, type KeyboardEvent } from 'react'
import { CornerDownLeftIcon, EraserIcon, LockIcon, SendIcon, SparklesIcon, SquareIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onClear: () => void
  streaming: boolean
  canClear: boolean
  className?: string
}

export function CopilotComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  onClear,
  streaming,
  canClear,
  className,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!streaming && value.trim().length > 0) onSubmit()
    }
  }

  return (
    <div className={cn('border-t border-border bg-card/80 px-3 py-3 backdrop-blur sm:px-4', className)}>
      <div className="rounded-xl border border-border bg-background focus-within:border-primary/40 focus-within:ring-[3px] focus-within:ring-ring/20">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          aria-label="Ask the KDH Copilot a question"
          placeholder="Ask about portfolio value, occupancy, arrears, SLA performance, insurance, ESG…"
          className="min-h-[58px] resize-none border-0 bg-transparent px-3.5 py-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              <SparklesIcon className="size-3" aria-hidden="true" />
              KDH Copilot — secure, on-premise reasoning
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={onClear}
              disabled={!canClear}
              className="gap-1.5 text-muted-foreground"
            >
              <EraserIcon className="size-3.5" aria-hidden="true" />
              Clear chat
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
              <CornerDownLeftIcon className="size-3" aria-hidden="true" />
              Enter to send · Shift + Enter for a new line
            </span>
            {streaming ? (
              <Button variant="outline" size="sm" onClick={onStop} className="gap-1.5">
                <SquareIcon className="size-3.5 fill-current" aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={onSubmit} disabled={value.trim().length === 0} className="gap-1.5">
                <SendIcon className="size-3.5" aria-hidden="true" />
                Ask
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <LockIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        Responses are generated deterministically from authorised internal KDH records only. No data leaves the KDH
        network, and no figure is estimated — every number is traceable through “Show working”.
      </p>
    </div>
  )
}
