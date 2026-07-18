/**
 * Receiver for messages posted by public/push-sw.js (design #104 D5):
 *
 * - `push` — a push arrived while a window of the app was focused; the SW
 *   suppressed the system notification (resolved decision 6d) and forwards the
 *   payload for in-page display. Interested UI subscribes via onPushMessage.
 * - `push-navigate` — a notification was clicked while a window already
 *   existed; the SW focused it and asks us to route to the deep link
 *   client-side (Client.navigate() would reload the SPA).
 */

export interface InPagePushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

type PushListener = (payload: InPagePushPayload) => void

const listeners = new Set<PushListener>()

/** Subscribe to focused-window pushes. Returns the unsubscribe function. */
export function onPushMessage(listener: PushListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function isPayload(value: unknown): value is InPagePushPayload {
  const p = value as InPagePushPayload | null
  return typeof p === 'object' && p !== null && typeof p.title === 'string'
}

function handleMessage(event: MessageEvent): void {
  const data = event.data as { type?: string; payload?: unknown; url?: string } | null
  if (!data || typeof data !== 'object') return
  if (data.type === 'push' && isPayload(data.payload)) {
    const payload = data.payload
    listeners.forEach((listener) => listener(payload))
    return
  }
  if (data.type === 'push-navigate' && typeof data.url === 'string') {
    // React Router (BrowserRouter) listens to popstate, so a pushState +
    // synthetic popstate performs an in-app navigation without a reload.
    window.history.pushState(null, '', data.url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

/** Wire the service-worker message channel. Called once from main.tsx. */
export function startPushMessages(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', handleMessage)
}
