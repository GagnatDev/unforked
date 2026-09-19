import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Background check for clients that are simply left open (a desktop tab). */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Resume, focus and pageshow often fire together; one check covers them all. */
const UPDATE_CHECK_THROTTLE_MS = 60 * 1000
/**
 * `updateServiceWorker` reloads from the service worker's `controlling` event.
 * iOS does not always deliver it, and a tap that visibly does nothing reads as
 * a broken app, so reload ourselves if the event hasn't arrived by then.
 */
const RELOAD_FALLBACK_MS = 5000

/**
 * Run `handler` when the app comes back to the foreground, optionally only
 * after it has been away for `minHiddenMs`.
 *
 * An installed iOS app is resumed, not reloaded: tapping the Home Screen icon
 * brings the same page back for days on end, and while it is in the background
 * the JS context is frozen. So "since page load" is not a useful window for
 * anything time-based, and a timer is not a reliable way to do periodic work —
 * returning to the app is the event that matters.
 */
export function useForegroundResume(handler: () => void, minHiddenMs = 0): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    let hiddenSince = document.visibilityState === 'hidden' ? Date.now() : 0

    const resume = () => {
      if (document.visibilityState !== 'visible') return
      const hiddenFor = hiddenSince ? Date.now() - hiddenSince : 0
      hiddenSince = 0
      if (hiddenFor < minHiddenMs) return
      handlerRef.current()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!hiddenSince) hiddenSince = Date.now()
        return
      }
      resume()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    // Safari restores a standalone app from the page cache without a
    // visibilitychange; `focus` covers desktop tab switches.
    window.addEventListener('pageshow', resume)
    window.addEventListener('focus', resume)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('focus', resume)
    }
  }, [minHiddenMs])
}

export function usePWA() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const lastCheckRef = useRef(0)

  /** Ask the browser to re-fetch sw.js. A no-op while offline or unregistered. */
  const checkForUpdate = useCallback(() => {
    const registration = registrationRef.current
    if (!registration) return
    const now = Date.now()
    if (now - lastCheckRef.current < UPDATE_CHECK_THROTTLE_MS) return
    lastCheckRef.current = now
    registration.update().catch(() => {})
  }, [])

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null
      // Registering already fetched sw.js; don't immediately fetch it again.
      lastCheckRef.current = Date.now()
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration error', error)
    },
  })

  // Check whenever the app is opened. This is what keeps an installed iPhone
  // app current: its page can live for weeks, so an interval alone (frozen
  // while backgrounded) leaves it pinned to the build it was launched with.
  useForegroundResume(checkForUpdate)

  useEffect(() => {
    const interval = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
    // A client that spent the release offline has a check to make on reconnect.
    window.addEventListener('online', checkForUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', checkForUpdate)
    }
  }, [checkForUpdate])

  const applyUpdate = useCallback(() => {
    void updateServiceWorker(true)
    window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS)
  }, [updateServiceWorker])

  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPromptEvent(e as BeforeInstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setInstallPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!installPromptEvent) return
    await installPromptEvent.prompt()
    const choice = await installPromptEvent.userChoice
    if (choice.outcome === 'accepted') {
      setInstallPromptEvent(null)
    }
  }

  return {
    needRefresh,
    applyUpdate,
    canInstall: !!installPromptEvent && !isInstalled,
    promptInstall,
    isInstalled,
  }
}
