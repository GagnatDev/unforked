import { type CrossTabMessage, isLeader, postCrossTab, subscribeCrossTab } from '@/local/crossTab'
import { reloadForLogin } from './session'

/**
 * A cached identity is product policy, not server authorization. A 401 pauses
 * reconciliation without navigating away from local reads or edits — even if
 * the durable outbox is empty. Returning from the background is not consent to
 * leave. Only explicit sign-in actions navigate a cached user to the sidecar.
 *
 * No-identity cold starts retain the bounded sidecar recovery path. A7's outbox
 * durability is unchanged: neither deferred auth nor navigation deletes it.
 */
const REAUTH_STATE_EVENT = 'homectl:reauth-state'
export type ReauthDisposition = 'offline' | 'reloading' | 'deferred' | 'lost'
let sessionEstablished = false
let deferred = false
let remoteDeferred = false
let crossTabUnsubscribe: (() => void) | null = null

/** Presence of a confirmed or cached local identity, not live authorization. */
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
export async function requestReauth(): Promise<ReauthDisposition> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (sessionEstablished) {
    if (!deferred) { deferred = true; emitState(true) }
    return 'deferred'
  }
  if (!isLeader()) {
    postCrossTab({ kind: 'reauth-request' })
    return 'deferred'
  }
  return reloadForLogin() ? 'reloading' : 'lost'
}

/** Other tabs must independently verify the live owner before resuming sync. */
export function clearDeferredReauth(): void {
  const wasPending = deferred || remoteDeferred
  deferred = false
  remoteDeferred = false
  if (wasPending) dispatchReauthState()
  postCrossTab({ kind: 'reauth-state', pending: false })
}
function onCrossTabMessage(message: CrossTabMessage): void {
  if (message.kind === 'reauth-request') {
    if (isLeader()) void requestReauth()
  } else if (message.kind === 'reauth-state') {
    remoteDeferred = message.pending
    if (!message.pending) deferred = false
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
  crossTabUnsubscribe?.()
  crossTabUnsubscribe = null
}
