import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetUnsavedWorkForTests,
  hasUnsavedWork,
  holdUnsavedWork,
  onUnsavedWorkCleared,
} from './unsavedWork'

afterEach(() => __resetUnsavedWorkForTests())

describe('unsavedWork', () => {
  it('reports work while any hold is outstanding', () => {
    expect(hasUnsavedWork()).toBe(false)
    const release = holdUnsavedWork()
    expect(hasUnsavedWork()).toBe(true)
    release()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('waits for the last of several holds', () => {
    const cleared = vi.fn()
    onUnsavedWorkCleared(cleared)
    const first = holdUnsavedWork()
    const second = holdUnsavedWork()

    first()
    expect(hasUnsavedWork()).toBe(true)
    expect(cleared).not.toHaveBeenCalled()

    second()
    expect(hasUnsavedWork()).toBe(false)
    expect(cleared).toHaveBeenCalledTimes(1)
  })

  it('ignores a release called twice, so one screen cannot drop another claim', () => {
    const cleared = vi.fn()
    onUnsavedWorkCleared(cleared)
    const first = holdUnsavedWork()
    const second = holdUnsavedWork()

    first()
    first()
    expect(hasUnsavedWork()).toBe(true)
    expect(cleared).not.toHaveBeenCalled()

    second()
    expect(cleared).toHaveBeenCalledTimes(1)
  })

  it('stops notifying an unsubscribed listener', () => {
    const cleared = vi.fn()
    const unsubscribe = onUnsavedWorkCleared(cleared)
    unsubscribe()

    holdUnsavedWork()()
    expect(cleared).not.toHaveBeenCalled()
  })
})
