/**
 * Session handling with the homectl-auth-proxy sidecar: the browser holds only
 * the sidecar's opaque `hs_session` cookie, and the SPA never sees a token. The
 * sidecar refreshes the upstream OAuth token in-cluster while that cookie is
 * valid, so an API `401` means the *session itself* is gone and the only fix is
 * a top-level navigation that reaches the sidecar (letting it silently
 * re-authenticate against the central login when the IdP session is still
 * alive, or redirect to login when it is not).
 *
 * The goal is for that re-authentication to be invisible: a `401` triggers one
 * place-preserving full load, the sidecar re-establishes the session, and the
 * user lands back where they were. The session-expired screen only appears when
 * repeated attempts fail (no sidecar in front / IdP session also gone), and a
 * hard attempt cap guarantees we never reload-loop.
 */
const GUARD_KEY = 'auth_reload_at'
const ATTEMPT_KEY = 'auth_reload_attempts'
const GUARD_WINDOW_MS = 15_000
/** Silent re-auth loads to attempt before surrendering to the manual screen. */
const MAX_ATTEMPTS = 2

/** Fired when silent re-auth is exhausted so the UI can show the manual screen. */
const SESSION_LOST_EVENT = 'homectl:session-lost'

/** Guards against firing more than one navigation within a single page load. */
let navigating = false

/**
 * Navigate to a full page load that is guaranteed to reach the auth sidecar.
 *
 * The PWA service worker answers navigations from its precache
 * (`navigateFallback: index.html`), so a plain `location.href = …` or
 * `location.reload()` never produces a network request and the sidecar never
 * gets the chance to redirect to central login — an installed PWA would sit on
 * the cached app forever. Unregistering the service worker first makes the next
 * top-level navigation go to the network; the worker re-registers (and
 * re-precaches the current build) on the first load after login.
 *
 * The navigation targets the *current* location rather than `/` so that a
 * silent sidecar re-auth returns the user to the page they were on.
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
  const { pathname, search, hash } = window.location
  window.location.href = `${pathname}${search}${hash}`
}

/**
 * Bounce to a full page load so the sidecar can silently re-authenticate (or
 * redirect to login). Coordinated so a burst of concurrent 401s triggers a
 * single navigation, and capped at {@link MAX_ATTEMPTS} loads within
 * {@link GUARD_WINDOW_MS} so a session that cannot be re-established (missing
 * sidecar, expired IdP session) surfaces the manual screen instead of
 * reload-looping. Returns whether a navigation was triggered.
 */
export function reloadForLogin(): boolean {
  if (navigating) return true
  try {
    const now = Date.now()
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? '0')
    const withinWindow = now - last < GUARD_WINDOW_MS
    const attempts = withinWindow ? Number(sessionStorage.getItem(ATTEMPT_KEY) ?? '0') : 0
    if (attempts >= MAX_ATTEMPTS) {
      notifySessionLost()
      return false
    }
    sessionStorage.setItem(GUARD_KEY, String(now))
    sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1))
  } catch {
    // sessionStorage unavailable — navigate anyway (best effort, no loop guard).
  }
  navigating = true
  void navigateForLogin()
  return true
}

/**
 * Clear the re-auth loop counters after a confirmed authenticated load. This
 * resets the attempt budget so a later, unrelated expiry gets a fresh set of
 * silent re-auth attempts rather than immediately hitting the cap.
 */
export function markAuthenticated(): void {
  try {
    sessionStorage.removeItem(GUARD_KEY)
    sessionStorage.removeItem(ATTEMPT_KEY)
  } catch {
    // sessionStorage unavailable — nothing to reset.
  }
}

/** Notify listeners that silent re-auth failed and the session is truly gone. */
export function notifySessionLost(): void {
  try {
    window.dispatchEvent(new Event(SESSION_LOST_EVENT))
  } catch {
    // No window (SSR/test) — nothing to notify.
  }
}

/** Subscribe to session-lost notifications. Returns an unsubscribe function. */
export function onSessionLost(handler: () => void): () => void {
  window.addEventListener(SESSION_LOST_EVENT, handler)
  return () => window.removeEventListener(SESSION_LOST_EVENT, handler)
}
