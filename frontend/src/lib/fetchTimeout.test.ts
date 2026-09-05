import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithTimeout,
  mergeAbortSignals,
} from './fetchTimeout'

describe('mergeAbortSignals', () => {
  it('returns undefined when no signals are provided', () => {
    expect(mergeAbortSignals()).toBeUndefined()
    expect(mergeAbortSignals(undefined, null)).toBeUndefined()
  })

  it('returns the sole signal unchanged', () => {
    const ac = new AbortController()
    expect(mergeAbortSignals(ac.signal)).toBe(ac.signal)
  })

  it('aborts when either input signal aborts', () => {
    const a = new AbortController()
    const b = new AbortController()
    const merged = mergeAbortSignals(a.signal, b.signal)!
    expect(merged.aborted).toBe(false)
    b.abort()
    expect(merged.aborted).toBe(true)
  })
})

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('resolves when fetch completes before the timeout', async () => {
    const response = new Response('{}', { status: 200 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10))
        return response
      }),
    )

    const pending = fetchWithTimeout('/api/auth/me', undefined, 1_000)
    await vi.advanceTimersByTimeAsync(10)
    await expect(pending).resolves.toBe(response)
  })

  it('rejects with Failed to fetch when the request stalls past the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'))
            })
          }),
      ),
    )

    const pending = fetchWithTimeout('/api/auth/me', undefined, 50)
    const expectation = expect(pending).rejects.toThrow('Failed to fetch')
    await vi.advanceTimersByTimeAsync(50)
    await expectation
  })

  it('propagates an intentional caller abort instead of remapping it', async () => {
    const caller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'))
            })
          }),
      ),
    )

    const pending = fetchWithTimeout('/api/x', { signal: caller.signal }, 5_000)
    const expectation = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    caller.abort()
    await expectation
  })
})
