import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BotIcon, DatabaseIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react'
import { toast } from 'sonner'

import { CopilotComposer } from '@/components/copilot/composer'
import { answerQuestion, buildScope } from '@/components/copilot/engine'
import { CopilotIntro } from '@/components/copilot/intro'
import { MessageBubble, type ChatMessage } from '@/components/copilot/message'
import { CANNED_SESSIONS, SHOWCASE_PROMPTS } from '@/components/copilot/prompts'
import { CopilotRightRail } from '@/components/copilot/right-rail'
import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { ZONES } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

/** Characters revealed per animation tick — ~280 chars/second. */
const REVEAL_STEP = 5
const REVEAL_INTERVAL_MS = 18
const THINKING_MS = 460

export default function Copilot() {
  /* --- store slices (narrow selectors, zustand v5 safe) --- */
  const assets = useAppStore((s) => s.assets)
  const workOrders = useAppStore((s) => s.workOrders)
  const units = useAppStore((s) => s.units)
  const tenants = useAppStore((s) => s.tenants)
  const leases = useAppStore((s) => s.leases)
  const payments = useAppStore((s) => s.payments)
  const vendors = useAppStore((s) => s.vendors)
  const technicians = useAppStore((s) => s.technicians)
  const schedules = useAppStore((s) => s.schedules)
  const monthlyFinancials = useAppStore((s) => s.monthlyFinancials)
  const user = useAuthStore((s) => s.user)

  const now = useMemo(() => new Date(), [])

  const scope = useMemo(
    () =>
      buildScope(
        user,
        { assets, workOrders, units, tenants, leases, payments, vendors, technicians, schedules, monthlyFinancials },
        now,
      ),
    [user, assets, workOrders, units, tenants, leases, payments, vendors, technicians, schedules, monthlyFinancials, now],
  )

  /* --- conversation state --- */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stream, setStream] = useState<{ id: string; chars: number } | null>(null)
  const [input, setInput] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)

  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const idRef = useRef(0)
  const queueRef = useRef<string[]>([])
  const timersRef = useRef<number[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const roleRef = useRef(user?.id)

  const pushTimer = (id: number) => {
    timersRef.current.push(id)
  }

  useEffect(
    () => () => {
      for (const t of timersRef.current) window.clearTimeout(t)
      timersRef.current = []
    },
    [],
  )

  /* --- asking --- */
  const ask = useCallback((question: string) => {
    const q = question.trim()
    if (!q) return

    const userId = `msg-${(idRef.current += 1)}`
    const botId = `msg-${(idRef.current += 1)}`
    const at = new Date().toISOString()

    setMessages((ms) => [
      ...ms,
      { id: userId, role: 'user', text: q, phase: 'done', at },
      { id: botId, role: 'assistant', text: q, phase: 'thinking', at },
    ])
    setInput('')

    pushTimer(
      window.setTimeout(() => {
        const answer = answerQuestion(q, scopeRef.current)
        setMessages((ms) =>
          ms.map((m) => (m.id === botId ? { ...m, answer, phase: 'streaming', at: new Date().toISOString() } : m)),
        )
        setStream({ id: botId, chars: 0 })
      }, THINKING_MS),
    )
  }, [])

  /* --- typing effect --- */
  useEffect(() => {
    if (!stream) return
    const target = messagesRef.current.find((m) => m.id === stream.id)
    const full = target?.answer?.narrative ?? ''

    if (stream.chars >= full.length) {
      setMessages((ms) => ms.map((m) => (m.id === stream.id ? { ...m, phase: 'done' } : m)))
      setStream(null)
      return
    }

    const t = window.setTimeout(() => {
      setStream((s) => (s && s.id === stream.id ? { id: s.id, chars: Math.min(full.length, s.chars + REVEAL_STEP) } : s))
    }, REVEAL_INTERVAL_MS)
    return () => window.clearTimeout(t)
  }, [stream])

  /* --- queued multi-question runs (showcase + replayed sessions) --- */
  useEffect(() => {
    if (stream) return
    if (queueRef.current.length === 0) return
    const next = queueRef.current.shift()
    if (!next) return
    pushTimer(window.setTimeout(() => ask(next), 320))
  }, [stream, ask])

  /* --- keep the transcript pinned to the newest message --- */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' })
  }, [messages.length])

  /* --- follow the narrative as it types, without thrashing the scroller --- */
  useEffect(() => {
    if (!stream || stream.chars % 60 !== 0) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [stream])

  /* --- role switch really does change what the copilot can see --- */
  useEffect(() => {
    if (roleRef.current === user?.id) return
    roleRef.current = user?.id
    if (messagesRef.current.length === 0) return
    toast('Data scope changed', {
      description: `Now reasoning as ${user?.role ?? 'guest'} over ${scopeRef.current.zones.length} of ${ZONES.length} zones. Ask again to recompute with the new scope.`,
    })
  }, [user])

  /* --- controls --- */
  const stopStreaming = useCallback(() => {
    queueRef.current = []
    setStream((s) => {
      if (s) setMessages((ms) => ms.map((m) => (m.id === s.id ? { ...m, phase: 'done' } : m)))
      return null
    })
  }, [])

  const clearChat = useCallback(() => {
    queueRef.current = []
    for (const t of timersRef.current) window.clearTimeout(t)
    timersRef.current = []
    setStream(null)
    setMessages([])
    setActiveSessionId(undefined)
    toast('Conversation cleared', { description: 'The transcript has been discarded. Your data scope is unchanged.' })
  }, [])

  const regenerate = useCallback((id: string) => {
    const target = messagesRef.current.find((m) => m.id === id)
    if (!target) return
    setMessages((ms) =>
      ms.map((m) => (m.id === id ? { ...m, answer: undefined, phase: 'thinking', at: new Date().toISOString() } : m)),
    )
    pushTimer(
      window.setTimeout(() => {
        const answer = answerQuestion(target.text, scopeRef.current)
        setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, answer, phase: 'streaming' } : m)))
        setStream({ id, chars: 0 })
      }, THINKING_MS),
    )
    toast('Regenerating', { description: 'Re-reading the authorised records for this question.' })
  }, [])

  const runQueue = useCallback(
    (questions: string[]) => {
      if (questions.length === 0) return
      queueRef.current = questions.slice(1)
      ask(questions[0])
    },
    [ask],
  )

  const handleShowcase = useCallback(() => {
    setActiveSessionId(undefined)
    runQueue([...SHOWCASE_PROMPTS])
  }, [runQueue])

  const handleLoadSession = useCallback(
    (questions: string[], title: string) => {
      queueRef.current = []
      for (const t of timersRef.current) window.clearTimeout(t)
      timersRef.current = []
      setStream(null)
      setMessages([])
      setActiveSessionId(CANNED_SESSIONS.find((s) => s.title === title)?.id)
      toast('Session reloaded', { description: `${title} — replayed against today's records.` })
      pushTimer(window.setTimeout(() => runQueue(questions), 120))
    },
    [runQueue],
  )

  const handleAsk = useCallback(
    (question: string) => {
      queueRef.current = []
      setActiveSessionId(undefined)
      ask(question)
    },
    [ask],
  )

  const submit = useCallback(() => {
    if (input.trim().length === 0) return
    handleAsk(input)
  }, [handleAsk, input])

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

  const userInitials = user?.avatarInitials ?? 'KD'

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Management Copilot"
        description="Ask questions in plain language across the authorised KDH asset, property, maintenance and compliance record set. Every answer is computed from live records and shows its sources and its working."
        icon={BotIcon}
        breadcrumb={[{ label: 'KDH One Asset', href: '/' }, { label: 'AI Copilot' }]}
        actions={
          <>
            <Badge variant="outline" className="gap-1.5 font-normal">
              <DatabaseIcon className="size-3" aria-hidden="true" />
              {formatNumber(recordCount)} records
            </Badge>
            <Badge variant="outline" className="gap-1.5 font-normal">
              <ShieldCheckIcon className="size-3" aria-hidden="true" />
              {scope.zones.length}/{ZONES.length} zones
            </Badge>
            <Button variant="outline" size="sm" onClick={clearChat} disabled={messages.length === 0} className="gap-1.5">
              <PlusIcon className="size-3.5" aria-hidden="true" />
              New conversation
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Conversation column */}
        <div className="flex h-[calc(100svh-16rem)] min-h-[540px] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            {messages.length === 0 ? (
              <CopilotIntro scope={scope} onAsk={handleAsk} onRunShowcase={handleShowcase} />
            ) : (
              <div className="mx-auto max-w-4xl space-y-5">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    revealChars={stream && stream.id === m.id ? stream.chars : undefined}
                    userInitials={userInitials}
                    onFollowUp={handleAsk}
                    onRegenerate={regenerate}
                  />
                ))}
              </div>
            )}
          </div>

          <CopilotComposer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            onStop={stopStreaming}
            onClear={clearChat}
            streaming={stream !== null}
            canClear={messages.length > 0}
          />
        </div>

        {/* Right rail */}
        <div className="xl:sticky xl:top-6">
          <CopilotRightRail scope={scope} onLoadSession={handleLoadSession} activeSessionId={activeSessionId} />
        </div>
      </div>
    </div>
  )
}
