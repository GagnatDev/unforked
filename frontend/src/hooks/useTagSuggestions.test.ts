import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/api'

import { useTagSuggestions } from './useTagSuggestions'

vi.mock('@/api', () => ({
  api: {
    recipes: {
      tagSuggestions: vi.fn(),
    },
  },
}))

describe('useTagSuggestions', () => {
  const tagSuggestions = vi.mocked(api.recipes.tagSuggestions)

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not fetch when query is empty or whitespace', () => {
    const { rerender } = renderHook(({ q }: { q: string }) => useTagSuggestions(q), {
      initialProps: { q: '' },
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(tagSuggestions).not.toHaveBeenCalled()

    rerender({ q: '   ' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(tagSuggestions).not.toHaveBeenCalled()
  })

  it('debounces then fetches and exposes suggestions', async () => {
    tagSuggestions.mockResolvedValue(['breakfast', 'brunch'])

    const { result, rerender } = renderHook(({ q }: { q: string }) => useTagSuggestions(q), {
      initialProps: { q: 'br' },
    })

    expect(result.current.loading).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(tagSuggestions).toHaveBeenCalledWith('br', {
      excludeRecipeId: undefined,
      signal: expect.any(AbortSignal),
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.suggestions).toEqual(['breakfast', 'brunch'])
    expect(result.current.error).toBeNull()

    rerender({ q: '' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.suggestions).toEqual([])
  })

  it('passes excludeRecipeId to the API', async () => {
    tagSuggestions.mockResolvedValue([])

    renderHook(() => useTagSuggestions('x', { excludeRecipeId: 'recipe-1' }))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(tagSuggestions).toHaveBeenCalledWith('x', {
      excludeRecipeId: 'recipe-1',
      signal: expect.any(AbortSignal),
    })
  })

  it('clears suggestions and sets error on failure', async () => {
    const err = new Error('network')
    tagSuggestions.mockRejectedValue(err)

    const { result } = renderHook(() => useTagSuggestions('q'))

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(result.current.suggestions).toEqual([])
    expect(result.current.error).toBe(err)
    expect(result.current.loading).toBe(false)
  })

  it('aborts the previous in-flight request when the debounced query changes', async () => {
    let firstSignal: AbortSignal | undefined
    let secondSignal: AbortSignal | undefined

    tagSuggestions.mockImplementation((q, opts) => {
      if (q === 'a') {
        firstSignal = opts?.signal
        return new Promise<string[]>(() => {})
      }
      secondSignal = opts?.signal
      return Promise.resolve(['match'])
    })

    const { result, rerender } = renderHook(({ q }: { q: string }) => useTagSuggestions(q), {
      initialProps: { q: 'a' },
    })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(firstSignal).toBeDefined()
    expect(firstSignal?.aborted).toBe(false)

    rerender({ q: 'ab' })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(firstSignal?.aborted).toBe(true)
    expect(secondSignal).toBeDefined()
    expect(secondSignal?.aborted).toBe(false)

    expect(result.current.suggestions).toEqual(['match'])
  })
})
