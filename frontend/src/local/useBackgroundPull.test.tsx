import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBackgroundPull } from './useBackgroundPull'

describe('useBackgroundPull — hanging network', () => {
  it('clears pulling and surfaces an error when the pull eventually rejects', async () => {
    let rejectPull!: (e: unknown) => void
    const pull = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPull = reject
        }),
    )

    const { result } = renderHook(() => useBackgroundPull(pull, []))
    expect(result.current.pulling).toBe(true)
    expect(result.current.error).toBeNull()

    rejectPull(new TypeError('Failed to fetch'))
    await waitFor(() => expect(result.current.pulling).toBe(false))
    expect(result.current.error).toBe('errors.couldNotReachServer')
  })
})
