/**
 * KDH One Asset — authentication & RBAC store.
 *
 * Mock auth only. No network calls, no tokens, no backend. The role switcher is the
 * centrepiece of the RBAC demo: swapping role swaps the whole persona *including*
 * `zoneScope`, so every zone-filtered screen reacts immediately.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { USERS } from '@/data/mock'
import { ZONES, type AppUser, type Role, type Zone } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* Demo credentials                                                    */
/* ------------------------------------------------------------------ */

/** Pre-filled on the sign-in screen so the pitch never fumbles a password. */
export const DEMO_EMAIL = 'ceo@kdh.com.my'
export const DEMO_PASSWORD = 'kdh2026'

/** Any password at least this long is accepted for a known KDH email. */
const MIN_PASSWORD_LENGTH = 4

const AUTH_PERSIST_KEY = 'kdh-one-asset-auth'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Look up a demo persona by email, case- and whitespace-insensitive. */
export function findUserByEmail(email: string): AppUser | undefined {
  const needle = email.trim().toLowerCase()
  if (!needle) return undefined
  return USERS.find((u) => u.email.toLowerCase() === needle)
}

/** Look up the single demo persona that holds a given role. */
export function findUserByRole(role: Role): AppUser | undefined {
  return USERS.find((u) => u.role === role)
}

/**
 * Zones a user is allowed to see.
 *
 * Returns every KEJORA zone when the user's scope is `'all'`. When no user is signed
 * in the demo fails open (all zones) so a screen rendered before hydration is never
 * blank — the sign-in gate, not this helper, is what keeps strangers out.
 */
export function visibleZones(user: AppUser | null): Zone[] {
  if (!user || user.zoneScope === 'all') return [...ZONES]
  return ZONES.filter((z) => user.zoneScope.includes(z))
}

/** Convenience predicate for row-level filtering. */
export function canSeeZone(user: AppUser | null, zone: Zone): boolean {
  if (!user || user.zoneScope === 'all') return true
  return user.zoneScope.includes(zone)
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface AuthState {
  user: AppUser | null
  isAuthenticated: boolean
  /** ISO datetime of the last successful sign-in. */
  lastLoginAt?: string

  /**
   * Mock sign-in. Succeeds when the email matches a KDH demo persona and the password
   * is at least 4 characters, or when the published demo credentials are used verbatim.
   */
  login(email: string, password: string): boolean
  logout(): void
  /** Swap to the demo persona holding `role` — changes name, department and zoneScope. */
  switchRole(role: Role): void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      lastLoginAt: undefined,

      login: (email, password) => {
        const normalisedEmail = email.trim().toLowerCase()
        const pass = password ?? ''

        const isDemoPair = normalisedEmail === DEMO_EMAIL && pass === DEMO_PASSWORD
        const match = findUserByEmail(normalisedEmail)

        if (!match) return false
        if (!isDemoPair && pass.length < MIN_PASSWORD_LENGTH) return false

        set({ user: match, isAuthenticated: true, lastLoginAt: new Date().toISOString() })
        return true
      },

      logout: () => set({ user: null, isAuthenticated: false }),

      switchRole: (role) => {
        const next = findUserByRole(role)
        if (!next) return
        set({ user: next, isAuthenticated: true })
      },
    }),
    {
      name: AUTH_PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      /** Credentials are never stored — only which persona is signed in. */
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        lastLoginAt: s.lastLoginAt,
      }),
      migrate: (persisted) => persisted as AuthState,
      /**
       * Re-resolve the persisted persona against the current `USERS` list rather than
       * trusting the stored copy. A snapshot written by an earlier build could otherwise
       * keep a stale role, department or `zoneScope` alive, and every zone-scoped screen
       * would silently scope to a persona that no longer exists. An unknown email is
       * signed out rather than admitted.
       */
      merge: (persisted, current) => {
        const snapshot = persisted as Partial<AuthState> | undefined
        if (!snapshot?.user) return current
        const fresh = findUserByEmail(snapshot.user.email)
        if (!fresh) return current
        return { ...current, ...snapshot, user: fresh, isAuthenticated: true }
      },
    },
  ),
)

/** Non-reactive read for helpers that live outside React. */
export function currentUser(): AppUser | null {
  return useAuthStore.getState().user
}
