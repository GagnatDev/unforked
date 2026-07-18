/**
 * Web Push handlers (design #104 D5), pulled into the Workbox-generated
 * service worker via `importScripts` (vite.config.ts) so the precaching setup
 * stays untouched (resolved decision 5).
 *
 * This file is deliberately dumb (resolved decision 7): payloads arrive with
 * final, pre-localized strings and a deep link, composed server-side per
 * subscription locale — no i18n and no policy lives here.
 *
 * Payload contract (backend/src/service/pushSender.ts PushPayload):
 *   { title: string, body: string, url: string, tag?: string }
 *
 * NOTE: generateSW inlines only the *reference* to this file. Its content is
 * not hashed into the SW revision, so changes here reach installed clients on
 * the browser's own imported-script update checks rather than instantly.
 * Keep the payload contract additive.
 */

/** True when some window client of this app is focused — the user is
 * "currently using the app" (resolved decision 6d), so a system notification
 * would be noise; the page gets an in-page message instead. */
async function findFocusedClient() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  return clients.find((client) => client.focused) ?? null
}

self.addEventListener('push', (event) => {
  let payload = null
  try {
    payload = event.data ? event.data.json() : null
  } catch {
    // Not JSON — ignore rather than crash the handler.
  }
  if (!payload || !payload.title) return

  event.waitUntil(
    (async () => {
      const focused = await findFocusedClient()
      if (focused) {
        // Focused-client suppression lives here in the SW (resolved decision
        // 6d): the page decides how to surface it inline.
        focused.postMessage({ type: 'push', payload })
        return
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/static/pwa-192x192.png',
        badge: '/static/pwa-64x64.png',
        tag: payload.tag || undefined,
        data: { url: payload.url || '/' },
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Prefer an existing window: focus it and send it to the deep link.
      const existing = clients[0]
      if (existing) {
        await existing.focus()
        // SPA navigation via message first — Client.navigate() would reload the
        // app; the page listens and routes client-side (lib/pushMessages.ts).
        existing.postMessage({ type: 'push-navigate', url })
        return
      }
      await self.clients.openWindow(url)
    })()
  )
})
