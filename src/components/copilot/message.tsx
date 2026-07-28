import { memo } from 'react'
import { CircleUserIcon } from 'lucide-react'

import { AnswerView } from '@/components/copilot/answer-view'
import type { CopilotAnswer } from '@/components/copilot/engine'
import { KdhMark } from '@/components/common/kdh-mark'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'

export type MessagePhase = 'thinking' | 'streaming' | 'done'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  /** User question, or the question the assistant is answering. */
  text: string
  answer?: CopilotAnswer
  phase: MessagePhase
  /** ISO datetime. */
  at: string
}

export interface MessageBubbleProps {
  message: ChatMessage
  /** Characters of the narrative revealed so far; undefined when not streaming. */
  revealChars?: number
  userInitials: string
  onFollowUp: (question: string) => void
  onRegenerate: (id: string) => void
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-primary/60"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  )
}

function MessageBubbleImpl({ message, revealChars, userInitials, onFollowUp, onRegenerate }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] rounded-xl rounded-tr-sm border border-border bg-secondary px-3.5 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-secondary-foreground">{message.text}</p>
          <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{formatDateTime(message.at)}</p>
        </div>
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-semibold text-muted-foreground"
        >
          {userInitials || <CircleUserIcon className="size-4" />}
        </span>
      </div>
    )
  }

  const answer = message.answer
  const narrative = answer?.narrative ?? ''
  const streaming = message.phase === 'streaming'
  const shown = streaming ? narrative.slice(0, Math.max(0, revealChars ?? 0)) : narrative

  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        <KdhMark className="size-4" />
      </span>

      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">KDH Copilot</p>
          {answer && message.phase === 'done' && (
            <Badge variant="secondary" className="font-normal">
              {answer.intentLabel}
            </Badge>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{formatDateTime(message.at)}</span>
        </div>

        {message.phase === 'thinking' ? (
          <div className="mt-2.5 flex items-center gap-2.5">
            <ThinkingDots />
            <span className="text-sm text-muted-foreground">
              Matching intent and reading authorised records…
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {shown}
            {streaming && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary align-baseline"
              />
            )}
          </p>
        )}

        {answer && (
          <AnswerView
            answer={answer}
            showPayload={message.phase === 'done'}
            onFollowUp={onFollowUp}
            onRegenerate={() => onRegenerate(message.id)}
          />
        )}
      </div>
    </div>
  )
}

export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.revealChars === next.revealChars &&
    prev.userInitials === next.userInitials &&
    prev.onFollowUp === next.onFollowUp &&
    prev.onRegenerate === next.onRegenerate
  )
})
