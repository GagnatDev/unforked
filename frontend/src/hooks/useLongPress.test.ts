import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLongPress } from './useLongPress'

function pointerEvent(x = 0, y = 0): ReactPointerEvent {
  return { clientX: x, clientY: y } as ReactPointerEvent
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useLongPress', () => {
  it('fires after the press is held for the delay', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))

    act(() => result.current.onPointerDown(pointerEvent()))
    expect(onLongPress).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(500))
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(result.current.consumeTriggered()).toBe(true)
    // consumeTriggered resets so a subsequent click isn't swallowed twice.
    expect(result.current.consumeTriggered()).toBe(false)
  })

  it('cancels when the pointer is released early', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))

    act(() => result.current.onPointerDown(pointerEvent()))
    act(() => result.current.onPointerUp())
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).not.toHaveBeenCalled()
    expect(result.current.consumeTriggered()).toBe(false)
  })

  it('cancels when the pointer moves past the threshold (a scroll)', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))

    act(() => result.current.onPointerDown(pointerEvent(0, 0)))
    act(() => result.current.onPointerMove(pointerEvent(0, 40)))
    act(() => vi.advanceTimersByTime(500))

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { enabled: false }))

    act(() => result.current.onPointerDown(pointerEvent()))
    act(() => vi.advanceTimersByTime(1000))

    expect(onLongPress).not.toHaveBeenCalled()
  })
})
