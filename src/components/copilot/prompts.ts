/**
 * Curated prompt library for the Management Copilot.
 *
 * Every question here is guaranteed to hit a registered intent in
 * `engine.ts`, so a demo can never land on the fallback by accident.
 */

export const PROMPT_THEMES = ['Portfolio', 'Maintenance', 'Property & Revenue', 'Risk & Compliance'] as const
export type PromptTheme = (typeof PROMPT_THEMES)[number]

export interface PromptGroup {
  theme: PromptTheme
  blurb: string
  prompts: string[]
}

export const PROMPT_GROUPS: readonly PromptGroup[] = [
  {
    theme: 'Portfolio',
    blurb: 'Value, composition and concentration across the register',
    prompts: [
      'What is the total portfolio value?',
      'How many assets do we have by category?',
      'What are our highest value assets?',
      'Break the portfolio down by zone',
      'Which assets are worth more than RM 20 million?',
      'Compare Zon Desaru–Penawar and Zon Mersing',
    ],
  },
  {
    theme: 'Property & Revenue',
    blurb: 'Occupancy, rent roll, collections and arrears',
    prompts: [
      'What is the occupancy rate?',
      'How much revenue are vacant units costing us?',
      'What is our total arrears?',
      'Which leases expire in the next 90 days?',
      'What is our collection rate?',
      'Show the rent roll',
      'Which assets generate the most revenue?',
    ],
  },
  {
    theme: 'Maintenance',
    blurb: 'Work order load, SLA performance, crews and contractors',
    prompts: [
      'How many work orders have breached SLA?',
      'What is our average resolution time?',
      'Show technician workload',
      'How are our vendors performing?',
      'What is our maintenance spend versus budget?',
      'Which P1 tickets are still open in Pengerang?',
    ],
  },
  {
    theme: 'Risk & Compliance',
    blurb: 'Condition, statutory obligations, insurance and ESG',
    prompts: [
      'Show the risk register',
      'Which assets are in poor or critical condition?',
      'Which insurance policies expire soon?',
      'Which inspections are overdue?',
      'What is our ESG position?',
      'How complete is our asset register?',
    ],
  },
]

/** The three questions the pitch opens with — each produces a chart-rich answer. */
export const SHOWCASE_PROMPTS: readonly string[] = [
  'What is the total portfolio value?',
  'How many work orders have breached SLA?',
  'Which leases expire in the next 90 days?',
]

export interface CannedSession {
  id: string
  title: string
  /** Hours before now, used to render a relative timestamp. */
  hoursAgo: number
  questions: string[]
}

/**
 * "Previous sessions" in the right rail. Selecting one replays its questions
 * through the real engine, so the numbers are never stale or invented.
 */
export const CANNED_SESSIONS: readonly CannedSession[] = [
  {
    id: 'ses-1',
    title: 'Board pack — Q3 portfolio position',
    hoursAgo: 3,
    questions: [
      'What is the total portfolio value?',
      'Break the portfolio down by zone',
      'Which assets generate the most revenue?',
    ],
  },
  {
    id: 'ses-2',
    title: 'Arrears escalation review',
    hoursAgo: 27,
    questions: ['What is our total arrears?', 'What is our collection rate?', 'Which leases expire in the next 60 days?'],
  },
  {
    id: 'ses-3',
    title: 'Facilities SLA deep dive',
    hoursAgo: 52,
    questions: [
      'How many work orders have breached SLA?',
      'What is our average resolution time?',
      'Show technician workload',
    ],
  },
  {
    id: 'ses-4',
    title: 'Insurance & statutory exposure',
    hoursAgo: 96,
    questions: ['Which insurance policies expire soon?', 'Which inspections are overdue?', 'Show the risk register'],
  },
  {
    id: 'ses-5',
    title: 'Desaru occupancy turnaround',
    hoursAgo: 145,
    questions: [
      'What is the occupancy rate in Desaru?',
      'How much revenue are vacant units costing us?',
      'Show the rent roll',
    ],
  },
]
