import { api } from '@/api'

/**
 * Web-push subscribe/unsubscribe for this device (design #104 D5).
 *
 * Everything here runs on an explicit user tap in the notification settings
 * card — never automatically: the permission prompt is the browser's one-shot
 * trust question, and burning it on page load dooms it (constraint 6).
 */

export type PushLocale = 'en' | 'nb'

/** Browser capability gate: no PushManager (or no SW) → the card hides entirely. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function isIos(): boolean {
  // iPadOS ≥ 13 masquerades as macOS; the touch-point check separates it.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS Safari only supports web push for Home-Screen-installed PWAs (16.4+,
 * constraint 6). In a plain Safari tab the permission prompt is doomed — the
 * card must show the install hint instead of a broken enable button.
 */
export function isIosSafariNotInstalled(): boolean {
  return isIos() && !isStandalone()
}

/** Decode a URL-safe base64 VAPID key into the applicationServerKey bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** The device's current push subscription, or null when not subscribed. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export type SubscribeResult = 'subscribed' | 'denied' | 'unavailable'

/**
 * The explicit-tap enable flow: permission prompt → PushManager.subscribe with
 * the server's VAPID key → register endpoint + keys + current i18n locale with
 * the backend (locale drives the server-composed notification copy, resolved
 * decision 7). 'unavailable' means the server has no VAPID keys provisioned.
 */
export async function subscribeToPush(locale: PushLocale): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  let publicKey: string
  try {
    publicKey = (await api.push.vapidKey()).publicKey
  } catch {
    return 'unavailable'
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    // A subscription the server can't push to is useless — roll it back.
    await subscription.unsubscribe()
    return 'unavailable'
  }
  await api.push.subscribe(
    { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    locale
  )
  return 'subscribed'
}

/**
 * Disable on this device: drop the browser subscription, then the server row.
 * Order matters — if the server call fails the endpoint is already dead and
 * the backend self-prunes it on the next send (D5).
 */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getPushSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await api.push.unsubscribe(endpoint)
}
