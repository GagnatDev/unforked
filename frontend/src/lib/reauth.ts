import { countOutboxOps } from '@/local/db'
import { type CrossTabMessage, isLeader, postCrossTab, subscribeCrossTab } from '@/local/crossTab'
import { reloadForLogin } from './session'

/**
 * Deferred re-authentication — the auth/sidecar hardening half of the
 * offline-first data layer (spec #84, section A7).
 *
 * A lost `hs_session` surfaces to the SPA as a `401`. The only fix is a
 * top-level navigation that reaches the sidecar, and `reloadForLogin` performs
 * it — but that navigation unregisters the service worker and does a full page
 * load. Doing that blindly on every `401` breaks two offline-first constraints:
 *
 *   1. **Offline must never navigate.** A request can only *see* a `401` when a
 *      server actually answered, so being offline shows up as a thrown fetch,
 *      not a `401` — but a stale cached `401` (or a flapping connection that
 *      leaves `navigator.onLine` false) must never trigger the reload either.
 *   2. **Never yank the user mid-edit.** When unsynced work is queued in the
 *      durable outbox, reloading now would interrupt the user and unregister
 *      the worker mid-flow. The work is safe (IndexedDB survives the reload),
 *      so we defer the navigation to a natural break instead.
 *
 * So a `401` is *classified* rather than acted on directly:
 *
 *   - **offline**   → never navigate; the work stays queued and retries later.
 *   - **reloading** → online with nothing queued (or no session yet to protect):
 *                     reload now so the sidecar can silently re-authenticate.
 *   - **deferred**  → online with unsynced work: remember re-auth is pending,
 *                     surface the quiet "will sync when you sign back in"
 *                     indicator, and navigate at the next natural break (the tab
 *                     going hidden and coming back — the user has stepped away).
 *
 * The durable IndexedDB outbox is independent of the service-worker cache, so
 * unregistering the worker never touches it: queued mutations survive the
 * reload and drain once the session is valid again.
 */

/** Fired whenever the deferred-reauth flag changes, so the UI can reflect it. */
const REAUTH_STATE_EVENT = 'homectl:reauth-state'

export type ReauthDisposition = 'offline' | 'reloading' | 'deferred' | 'lost'

/**
 * Whether an authenticated identity is currently in hand. A `401` before this
 * is true is a cold start / pre-auth load with nothing to protect, so we reload
 * immediately; once true we are mid-session and unsynced work must be honoured.
 */
let sessionEstablished = false
/** Whether a re-auth navigation is deferred behind unsynced work (this tab). */
let deferred = false
/** Whether another tab reported a pending re-auth (mirror its indicator). */
let remoteDeferred = false
/** Whether the tab has gone hidden since re-auth was deferred (the break). */
let sawHidden = false
/** Whether the natural-break visibility listener is registered. */
let listening = false
/** Unsubscribe for the cross-tab message listener, once started. */
let crossTabUnsubscribe: (() => void) | null = null

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Record whether we hold an authenticated identity. Called by `AuthContext`
 * when `GET /api/auth/me` succeeds (true) and when the session is lost or the
 * user logs out (false).
 */
export function setSessionEstablished(value: boolean): void {
  sessionEstablished = value
}

/**
 * Whether the quiet "will sync" indicator should show: either this tab deferred
 * re-auth behind its own queued work, or another tab told us re-auth is pending
 * (phase 6 — every open tab shows the same state).
 */
export function isReauthDeferred(): boolean {
  return deferred || remoteDeferred
}

/** Fire the in-tab state event so the UI reflects the current pending flag. */
function dispatchReauthState(): void {
  try {
    window.dispatchEvent(new Event(REAUTH_STATE_EVENT))
  } catch {
    // No window (SSR/test) — nothing to notify.
  }
}

/** Update the UI and tell other tabs whether this tab's re-auth is pending. */
function emitState(pending: boolean): void {
  dispatchReauthState()
  postCrossTab({ kind: 'reauth-state', pending })
}

/** Subscribe to deferred-reauth state changes. Returns an unsubscribe function. */
export function onReauthStateChange(handler: () => void): () => void {
  window.addEventListener(REAUTH_STATE_EVENT, handler)
  return () => window.removeEventListener(REAUTH_STATE_EVENT, handler)
}

/**
 * Classify a `401` and re-authenticate accordingly (spec A7). Never navigates
 * while offline, and never navigates mid-edit while unsynced work is queued —
 * it defers to the next natural break in that case. Returns the disposition so
 * the caller (e.g. `AuthContext`) can reflect it in the UI.
 */
export async function requestReauth(): Promise<ReauthDisposition> {
  if (isOffline()) return 'offline'

  // Only the leader tab performs the re-auth navigation, so multiple open tabs
  // never race on reloadForLogin (phase 6). A follower hands the decision to the
  // leader and keeps its identity: the leader's reload refreshes the shared
  // session cookie for every tab, and the quiet indicator (mirrored across tabs)
  // covers the wait.
  if (!isLeader()) {
    postCrossTab({ kind: 'reauth-request' })
    return 'deferred'
  }

  // A deferral is already pending; the natural-break listener owns the reload.
  if (deferred) return 'deferred'

  // Cold start / not yet authenticated: no in-flight edit to protect, so reach
  // the sidecar right away. (This is also the "next app open" break for work
  // that was deferred in a previous session and survived the reload.)
  if (!sessionEstablished) {
    return reloadForLogin() ? 'reloading' : 'lost'
  }

  const queued = await countOutboxOps().catch(() => 0)
  if (queued === 0) {
    return reloadForLogin() ? 'reloading' : 'lost'
  }

  deferReauth()
  return 'deferred'
}

function deferReauth(): void {
  if (deferred) return
  deferred = true
  // If the tab is already hidden (e.g. a background pull hit the 401 while the
  // app was backgrounded), the very next return to visible is the break.
  sawHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  armNaturalBreak()
  emitState(true)
}

function armNaturalBreak(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function onVisibilityChange(): void {
  if (!deferred || typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') {
    sawHidden = true
    return
  }
  // Visible again after having been hidden: the user stepped away and came
  // back, so this is a safe moment to perform the deferred re-auth navigation.
  if (sawHidden) reloadForLogin()
}

/**
 * Clear a pending deferral — e.g. the session recovered on its own, or the
 * identity was dropped for another reason. Safe to call when nothing is
 * deferred.
 *
 * Always announces the healthy session to other tabs, even when this tab held no
 * local flag: a tab that reloaded to re-auth comes back clean, yet its peers
 * still need to drop the indicator (phase 6).
 */
export function clearDeferredReauth(): void {
  const wasPending = deferred || remoteDeferred
  deferred = false
  remoteDeferred = false
  sawHidden = false
  if (wasPending) dispatchReauthState()
  postCrossTab({ kind: 'reauth-state', pending: false })
}

/**
 * Handle a message from another tab (phase 6). The leader drives the actual
 * re-auth navigation on a follower's request; every tab mirrors the pending
 * indicator so they stay consistent.
 */
function onCrossTabMessage(message: CrossTabMessage): void {
  if (message.kind === 'reauth-request') {
    if (isLeader()) void requestReauth()
    return
  }
  if (message.kind === 'reauth-state') {
    remoteDeferred = message.pending
    if (!message.pending) {
      // The session is healthy again elsewhere — drop any local deferral too.
      deferred = false
      sawHidden = false
    }
    dispatchReauthState()
  }
}

/**
 * Start listening for cross-tab re-auth coordination (phase 6). Idempotent;
 * call once at app startup.
 */
export function startReauthCrossTab(): void {
  if (crossTabUnsubscribe) return
  crossTabUnsubscribe = subscribeCrossTab(onCrossTabMessage)
}

/** Test hook: reset all module-level state (and detach the listeners). */
export function __resetReauthForTests(): void {
  sessionEstablished = false
  deferred = false
  remoteDeferred = false
  sawHidden = false
  if (listening && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  listening = false
  crossTabUnsubscribe?.()
  crossTabUnsubscribe = null
}
