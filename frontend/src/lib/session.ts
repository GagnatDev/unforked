/**
 * Session handling with the homectl-auth-proxy sidecar: the browser holds only
 * the sidecar's opaque `hs_session` cookie, and the SPA never sees a token.
 * When an API call returns 401 the session is gone — the fix is a full page
 * load, which lets the sidecar run its top-level login redirect.
 */
const GUARD_KEY = 'auth_reload_at'
const GUARD_WINDOW_MS = 15_000

/**
 * Navigate to a full page load that is guaranteed to reach the auth sidecar.
 *
 * The PWA service worker answers navigations from its precache
 * (`navigateFallback: index.html`), so a plain `location.href = '/'` never
 * produces a network request and the sidecar never gets the chance to redirect
 * to central login — an installed PWA would sit on the cached app forever.
 * Unregistering the service worker first makes the next top-level navigation
 * go to the network; the worker re-registers (and re-precaches the current
 * build) on the first load after login.
 */
export async function navigateForLogin(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    } catch {
      // Best effort — navigate regardless.
    }
  }
  window.location.href = '/'
}

/**
 * Bounce to a full page load so the sidecar can redirect to login. Rate-limited
 * so an environment without a sidecar (e.g. local dev misconfiguration) shows
 * the session-expired screen instead of reload-looping. Returns whether the
 * navigation was triggered.
 */
export function reloadForLogin(): boolean {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? '0')
    if (Date.now() - last < GUARD_WINDOW_MS) return false
    sessionStorage.setItem(GUARD_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable — navigate anyway.
  }
  void navigateForLogin()
  return true
}
