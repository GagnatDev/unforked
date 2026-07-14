import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type LongPressOptions = {
  /** Skip wiring up the gesture entirely (e.g. for non-editable rows). */
  enabled?: boolean
  /** Press duration before the gesture fires, in milliseconds. */
  delay?: number
}

type LongPressHandlers = {
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onPointerLeave: () => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerCancel: () => void
}

export type LongPress = LongPressHandlers & {
  /**
   * True immediately after the gesture fired. A tap handler on the same element
   * can read (and reset) this to swallow the click that follows the press.
   */
  consumeTriggered: () => boolean
}

/**
 * Fire `onLongPress` after the pointer is held still for `delay` ms — the
 * touch-friendly way to reach a row's edit affordance. Movement beyond a small
 * threshold cancels it so scrolling the list never triggers an edit. Keyboard
 * and mouse users get an explicit control instead; this is a convenience only.
 */
export function useLongPress(
  onLongPress: () => void,
  { enabled = true, delay = 500 }: LongPressOptions = {},
): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const triggered = useRef(false)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    start.current = null
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (!enabled) return
      triggered.current = false
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        triggered.current = true
        clear()
        onLongPress()
      }, delay)
    },
    [enabled, delay, clear, onLongPress],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!start.current) return
      const dx = Math.abs(event.clientX - start.current.x)
      const dy = Math.abs(event.clientY - start.current.y)
      if (dx > 10 || dy > 10) clear()
    },
    [clear],
  )

  const consumeTriggered = useCallback(() => {
    const fired = triggered.current
    triggered.current = false
    return fired
  }, [])

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove,
    onPointerCancel: clear,
    consumeTriggered,
  }
}
