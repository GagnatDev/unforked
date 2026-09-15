import { countOutboxOps } from '@/local/db'
import { type CrossTabMessage, isLeader, postCrossTab, subscribeCrossTab } from '@/local/crossTab'
import { hasUnsavedWork, onUnsavedWorkCleared } from './unsavedWork'
import { reloadForLogin } from './session'

/**
 * Re-authentication is meant to be invisible (see `lib/session.ts`): a 401 says
 * the sidecar session is gone, and only a top-level navigation can get it back,
 * so the app performs one place-preserving load and the user lands where they
 * were. This module decides *when* that is safe, because two things must never
 * be interrupted:
 *
 *   1. **Offline.** A request can only see a 401 when a server answered, but a
 *      stale 401 or a flapping connection must never navigate — there is no
 *      sidecar to reach and the load would strand the app on an error page.
 *      A cached identity keeps local reads and edits working instead.
 *   2. **Work in progress.** Queued outbox mutations survive a reload, but the
 *      reload still yanks the user mid-flow, and in-page work that never
 *      reached the outbox (a half-typed recipe, registered via
 *      `lib/unsavedWork.ts`) would be lost outright.
 *
 * So a 401 is classified rather than acted on:
 *
 *   - **offline**   → never navigate; the work stays queued and retries later.
 *   - **reloading** → nothing to protect: re-auth now, silently.
 *   - **deferred**  → something to protect: hold the pending flag (the quiet
 *                     "will sync when you sign back in" indicator), and re-auth
 *                     at the next natural break — the user stepping away and
 *                     coming back, or the unsaved work being released.
 *   - **lost**      → the navigation budget is spent; the manual sign-in screen
 *                     takes over. Every screen that surfaces the pending state
 *                     also offers an explicit sign-in button as a backstop.
 *
 * A deferral is never a dead end: the local workspace stays usable throughout,
 * and the outbox is independent of the service-worker cache, so neither the
 * deferral nor the navigation can delete queued work.
 */

/** Fired whenever the deferred-reauth flag changes, so the UI can reflect it. */
const REAUTH_STATE_EVENT = 'homectl:reauth-state'

export type ReauthDisposition = 'offline' | 'reloading' | 'deferred' | 'lost'

/** Presence of a confirmed or cached local identity, not live authorization. */
let sessionEstablished = false
/** Whether a re-auth navigation is waiting for a natural break (this tab). */
let deferred = false
/** Whether another tab reported a pending re-auth (mirror its indicator). */
let remoteDeferred = false
/** Whether the tab has gone hidden since re-auth was deferred (the break). */
let sawHidden = false
/** Whether the natural-break listeners are registered. */
let listening = false
/** Unsubscribe for the unsaved-work listener, once armed. */
let unsavedWorkUnsubscribe: (() => void) | null = null
/** Unsubscribe for the cross-tab message listener, once started. */
let crossTabUnsubscribe: (() => void) | null = null

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function setSessionEstablished(value: boolean): void { sessionEstablished = value }
export function isReauthDeferred(): boolean { return deferred || remoteDeferred }

function dispatchReauthState(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REAUTH_STATE_EVENT))
}
function emitState(pending: boolean): void {
  dispatchReauthState()
  postCrossTab({ kind: 'reauth-state', pending })
}
export function onReauthStateChange(handler: () => void): () => void {
  window.addEventListener(REAUTH_STATE_EVENT, handler)
  return () => window.removeEventListener(REAUTH_STATE_EVENT, handler)
}

/**
 * Classify a 401 and re-authenticate accordingly. Navigates on its own whenever
 * nothing would be interrupted — the common case, and the one the user should
 * never notice — and otherwise waits for a break.
 */
export async function requestReauth(): Promise<ReauthDisposition> {
  if (isOffline()) return 'offline'

  // Only the leader tab navigates, so open tabs never race on reloadForLogin.
  // A follower keeps its identity: the leader's load refreshes the shared
  // session cookie for every tab, and the mirrored indicator covers the wait.
  if (!isLeader()) {
    postCrossTab({ kind: 'reauth-request' })
    return 'deferred'
  }

  // A deferral is already pending; the natural-break listeners own the reload.
  if (deferred) return 'deferred'

  // Cold start / not yet authenticated: nothing in flight to protect, and no
  // cached workspace to keep open. (This is also the "next app open" break for
  // work that was deferred in a previous session and survived the reload.)
  if (!sessionEstablished) return reloadForLogin() ? 'reloading' : 'lost'

  if (hasUnsavedWork()) {
    deferReauth()
    return 'deferred'
  }

  const queued = await countOutboxOps().catch(() => 0)
  if (queued > 0) {
    deferReauth()
    return 'deferred'
  }

  return reloadForLogin() ? 'reloading' : 'lost'
}

function deferReauth(): void {
  if (deferred) return
  deferred = true
  // If the tab is already hidden (a background pull hit the 401 while the app
  // was backgrounded), the very next return to visible is the break.
  sawHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  armNaturalBreak()
  emitState(true)
}

function armNaturalBreak(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  unsavedWorkUnsubscribe = onUnsavedWorkCleared(onWorkCleared)
}

function disarmNaturalBreak(): void {
  if (!listening) return
  listening = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unsavedWorkUnsubscribe?.()
  unsavedWorkUnsubscribe = null
}

/** Re-auth now unless in-page work would be lost; that break comes separately. */
function takeBreak(): void {
  if (!deferred || hasUnsavedWork()) return
  // Only stop listening once a navigation is actually under way. A refused
  // attempt means the budget is spent for now, and a later break may still
  // recover the session on its own rather than stranding the manual screen.
  if (reloadForLogin()) disarmNaturalBreak()
}

function onVisibilityChange(): void {
  if (!deferred || typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') {
    sawHidden = true
    return
  }
  // Visible again after having been hidden: the user stepped away and came
  // back, so this is a safe moment to perform the deferred navigation.
  if (sawHidden) takeBreak()
}

/** The last draft was saved or abandoned; nothing in the page to lose now. */
function onWorkCleared(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  takeBreak()
}

/**
 * Clear a pending deferral — e.g. the session recovered on its own, or the
 * identity was dropped for another reason. Safe to call when nothing is
 * deferred. Other tabs must independently verify the live owner before
 * resuming sync, so this always announces the healthy session: a tab that
 * reloaded to re-auth comes back clean, yet its peers still need to drop the
 * indicator.
 */
export function clearDeferredReauth(): void {
  const wasPending = deferred || remoteDeferred
  deferred = false
  remoteDeferred = false
  sawHidden = false
  disarmNaturalBreak()
  if (wasPending) dispatchReauthState()
  postCrossTab({ kind: 'reauth-state', pending: false })
}

function onCrossTabMessage(message: CrossTabMessage): void {
  if (message.kind === 'reauth-request') {
    if (isLeader()) void requestReauth()
  } else if (message.kind === 'reauth-state') {
    remoteDeferred = message.pending
    if (!message.pending) {
      deferred = false
      sawHidden = false
      disarmNaturalBreak()
    }
    dispatchReauthState()
  }
}

export function startReauthCrossTab(): void {
  if (!crossTabUnsubscribe) crossTabUnsubscribe = subscribeCrossTab(onCrossTabMessage)
}

export function __resetReauthForTests(): void {
  sessionEstablished = false
  deferred = false
  remoteDeferred = false
  sawHidden = false
  disarmNaturalBreak()
  crossTabUnsubscribe?.()
  crossTabUnsubscribe = null
}
