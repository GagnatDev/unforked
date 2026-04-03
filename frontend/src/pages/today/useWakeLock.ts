import { useEffect, useState } from 'react'

type WakeLockSentinelLike = { release: () => Promise<void> }

/**
 * Screen wake lock while `keepAwake` is true (when the browser supports it).
 * Mirrors the previous inline effects in Today: no release on unmount if still awake.
 */
export function useWakeLock(keepAwake: boolean): { wakeLockSupported: boolean } {
  const [wakeLockSupported, setWakeLockSupported] = useState(false)
  const [wakeLock, setWakeLock] = useState<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    setWakeLockSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  }, [])

  useEffect(() => {
    if (!keepAwake) return
    if (!wakeLockSupported) return
    let released = false
    const request = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wl = await (navigator as any).wakeLock.request('screen')
        if (!released) setWakeLock(wl as WakeLockSentinelLike)
        wl.addEventListener?.('release', () => setWakeLock(null))
      } catch {
        setWakeLock(null)
      }
    }
    void request()
    return () => {
      released = true
    }
  }, [keepAwake, wakeLockSupported])

  useEffect(() => {
    if (keepAwake) return
    if (!wakeLock) return
    void wakeLock.release().finally(() => setWakeLock(null))
  }, [keepAwake, wakeLock])

  return { wakeLockSupported }
}
