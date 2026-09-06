import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { __resetLocalDbForTests } from '@/local/db'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { writeCachedIdentity } from '@/lib/authIdentity'
import { __resetReauthForTests } from '@/lib/reauth'

vi.mock('@/local/liveEvents', () => ({
  setLiveEventsUser: vi.fn(),
}))

vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>('@/lib/session')
  return {
    ...actual,
    navigateForLogin: vi.fn(async () => undefined),
  }
})

function Probe() {
  const { user, loading } = useAuth()
  if (loading) return <div>loading</div>
  if (!user) return <div>no-user</div>
  return <div>{`user:${user.email}`}</div>
}

describe('AuthProvider — poor / missing connectivity', () => {
  const store = new Map<string, string>()

  beforeEach(async () => {
    await __resetLocalDbForTests()
    globalThis.indexedDB = new IDBFactory()
    store.clear()
    __resetReauthForTests()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    __resetReauthForTests()
  })

  it('mounts immediately from a cached identity while /me is still hanging', async () => {
    writeCachedIdentity({
      id: 'u1',
      email: 'cached@example.com',
      role: 'admin',
      familyId: 'f1',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(() => {
            /* never settles — hanging cellular */
          }),
      ),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // Cached identity must unblock RequireAuth without waiting on the network.
    await waitFor(() => expect(screen.getByText('user:cached@example.com')).toBeTruthy())
    expect(screen.queryByText('loading')).toBeNull()
  })

  it(
    'leaves the loading gate after a hanging /me times out with no cache',
    async () => {
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

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(screen.getByText('loading')).toBeTruthy()

      // AUTH_FETCH_TIMEOUT_MS is 5s; wait for the budget to convert the stall
      // into a transport failure and clear the RequireAuth gate.
      await waitFor(() => expect(screen.getByText('no-user')).toBeTruthy(), {
        timeout: 7_000,
      })
    },
    10_000,
  )

  it('persists identity after a successful /me and restores it after a network failure', async () => {
    const user = {
      id: 'u1',
      email: 'online@example.com',
      role: 'admin',
      familyId: 'f1',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(user), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user:online@example.com')).toBeTruthy())
    unmount()

    // Simulate a cold start offline: hanging/failing /me, but cache is warm.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('user:online@example.com')).toBeTruthy())
  })
})
