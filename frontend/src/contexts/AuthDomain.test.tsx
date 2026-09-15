import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { AuthProvider, useAuth } from './AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireLiveSession } from '@/components/RequireLiveSession'
import { __resetLocalDbForTests, getLocalRecipe, getLocalMealPlan, getLocalShoppingList, listOutboxOps, putLocalRecipe, getSyncMeta } from '@/local/db'
import { updateRecipe, saveMealPlan, addShoppingItem } from '@/local/mutations'
import { useLocal } from '@/local/useLocal'
import { __resetOutboxSyncForTests, syncNow, drainOutbox } from '@/local/outboxSync'
import { __resetSyncStatusForTests } from '@/local/syncStatus'
import { __resetCrossTabForTests } from '@/local/crossTab'
import { __resetLocalSessionForTests, getLocalSessionState } from '@/lib/localSession'
import { __resetReauthForTests } from '@/lib/reauth'
import { readCachedIdentity, writeCachedIdentity } from '@/lib/authIdentity'
import { navigateForLogin, reloadForLogin } from '@/lib/session'
import { pullRecipes } from '@/local/sync'

vi.mock('@/local/liveEvents', () => ({ setLiveEventsUser: vi.fn(), noteShoppingFlush: vi.fn() }))
vi.mock('@/lib/session', async () => ({
  ...await vi.importActual<typeof import('@/lib/session')>('@/lib/session'),
  navigateForLogin: vi.fn(async () => undefined), reloadForLogin: vi.fn(() => true),
}))
const owner = { id: 'u1', familyId: 'f1', email: 'one@example.com', role: 'admin' }
const doc = { name: 'Soup', description: '', sourceUrl: null, sourceName: null, ingredients: [], steps: [], servings: 4, tags: [] }
const week = '2026-W36'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function Workspace() {
  const auth = useAuth()
  const recipe = useLocal(() => getLocalRecipe('r1'), ['recipes'], [])
  const plan = useLocal(() => getLocalMealPlan(week), ['mealPlans'], [])
  const shopping = useLocal(() => getLocalShoppingList(week), ['shoppingLists'], [])
  return <>
    <span>{auth.user?.email}</span>
    <span>{auth.accountMismatch ? 'account mismatch' : auth.liveSession ? 'live' : 'local only'}</span>
    <button onClick={() => void auth.refreshUser()}>Verify</button>
    <button onClick={() => void auth.logout()}>Logout</button>
    <RequireAuth>
      <div>workspace</div>
      <span>{recipe.data?.doc.name}</span>
      <span>persons:{plan.data?.defaultPersons ?? 0}</span>
      <span>items:{shopping.data?.items.length ?? 0}</span>
      <button onClick={() => void updateRecipe('r1', { ...doc, name: 'Edited soup' })}>Edit recipe</button>
      <button onClick={() => void saveMealPlan(week, { weekIdentifier: week, defaultPersons: 3, assignments: [] })}>Edit plan</button>
      <button onClick={() => void addShoppingItem(week, 'Milk')}>Edit shopping</button>
      <RequireLiveSession><div>live settings</div></RequireLiveSession>
    </RequireAuth>
  </>
}
function mount(strict = false) {
  const tree = <MemoryRouter><AuthProvider><Workspace /></AuthProvider></MemoryRouter>
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}
beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  __resetOutboxSyncForTests(); __resetSyncStatusForTests(); __resetReauthForTests(); __resetCrossTabForTests()
  __resetLocalSessionForTests()
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  __resetOutboxSyncForTests(); __resetSyncStatusForTests(); __resetReauthForTests(); __resetCrossTabForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function seed() {
  writeCachedIdentity(owner)
  await putLocalRecipe({ id: 'r1', doc })
}
async function editAll() {
  fireEvent.click(screen.getByText('Edit recipe'))
  fireEvent.click(screen.getByText('Edit plan'))
  fireEvent.click(screen.getByText('Edit shopping'))
  await screen.findByText('Edited soup')
  await screen.findByText('persons:3')
  await screen.findByText('items:1')
  await waitFor(async () => expect(await listOutboxOps()).toHaveLength(3))
}

it.each(['hanging', 'offline', '401', '503'])('cached auth permits real local recipe/plan/shopping edits under %s /me', async mode => {
  await seed()
  const fetcher = vi.fn((_url: RequestInfo | URL) => {
    if (mode === 'hanging') return new Promise<Response>(() => {})
    if (mode === 'offline') return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(json({}, Number(mode)))
  })
  vi.stubGlobal('fetch', fetcher)
  mount()
  await screen.findByText('Soup')
  await editAll()
  expect(screen.queryByText('live settings')).toBeNull()
  expect(readCachedIdentity()).toEqual(owner)
  expect(navigateForLogin).not.toHaveBeenCalled()
  // A 401 is the one answer a silent re-auth load can fix, and with nothing
  // queued at the time it is taken straight away. The others have no session to
  // recover — navigating would only strand the workspace.
  expect(reloadForLogin).toHaveBeenCalledTimes(mode === '401' ? 1 : 0)
  expect(fetcher.mock.calls.every(([url]) => String(url).includes('/api/auth/me?probe='))).toBe(true)
})

it('empty-outbox background 401 re-auths silently, keeps the workspace mounted and resumes drain', async () => {
  await seed()
  let authorized = true
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/auth/me')) return authorized ? json(owner) : json({}, 401)
    if (!authorized) return json({}, 401)
    if (url.endsWith('/api/recipes')) return json([{ id: 'r1', doc: { ...doc, name: 'Edited soup' } }])
    if (url.includes('/api/meal-plans')) return json({ weekIdentifier: week, defaultPersons: 3, assignments: [] })
    if (url.includes('/api/shopping-lists')) return json({ weekIdentifier: week, items: [] })
    return json(init?.method ? {} : { id: 'r1', doc })
  })
  vi.stubGlobal('fetch', fetcher)
  mount()
  await screen.findByText('live settings')
  expect(await listOutboxOps()).toHaveLength(0)
  authorized = false
  await act(async () => { await pullRecipes().catch(() => {}) })
  expect(getLocalSessionState()).toBe('reauth')
  expect(screen.getByText('workspace')).toBeTruthy()
  await editAll()
  const before = fetcher.mock.calls.length
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(fetcher.mock.calls).toHaveLength(before) // queued edits do not storm auth
  authorized = true
  await act(async () => { await syncNow() })
  await waitFor(async () => expect(await listOutboxOps()).toHaveLength(0))
  expect(getLocalSessionState()).toBe('live')
  // One silent re-auth load, taken while the outbox was still empty; the edits
  // that followed never triggered another (queued work waits for a break).
  expect(reloadForLogin).toHaveBeenCalledTimes(1)
})

it('mismatched live owner retains original cached workspace and never sends pending work', async () => {
  await seed()
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...owner, familyId: 'other-family' })))
  mount()
  await screen.findByText('account mismatch')
  await editAll()
  expect(screen.getByText(owner.email)).toBeTruthy()
  expect(readCachedIdentity()).toEqual(owner)
  expect(await getSyncMeta('auth:owner')).toEqual({ id: owner.id, familyId: owner.familyId })
  await act(async () => { await syncNow() })
  expect(await listOutboxOps()).toHaveLength(3)
  expect(screen.queryByText('live settings')).toBeNull()
})

it('logout revokes immediately, ignores older /me, retains owner/outbox and refuses another account on next open', async () => {
  await seed()
  let finishMe!: (r: Response) => void
  vi.stubGlobal('fetch', vi.fn((url: RequestInfo | URL) => String(url).includes('/api/auth/me')
    ? new Promise<Response>(resolve => { finishMe = resolve }) : Promise.resolve(json({}))))
  const view = mount()
  await screen.findByText('Soup')
  await editAll()
  fireEvent.click(screen.getByText('Logout'))
  expect(screen.queryByText('workspace')).toBeNull()
  expect(readCachedIdentity()).toBeNull()
  await act(async () => { finishMe(json(owner)) })
  expect(screen.queryByText('workspace')).toBeNull()
  expect(readCachedIdentity()).toBeNull()
  expect(await listOutboxOps()).toHaveLength(3)
  view.unmount()
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...owner, id: 'u2' })))
  mount()
  await screen.findByText('account mismatch')
  expect(screen.queryByText('workspace')).toBeNull()
  expect(await listOutboxOps()).toHaveLength(3)
})

it('fails closed for legacy nonempty data without a trustworthy cached owner', async () => {
  await putLocalRecipe({ id: 'r1', doc })
  vi.stubGlobal('fetch', vi.fn(async () => json(owner)))
  mount()
  await screen.findByText('account mismatch')
  expect(screen.queryByText('workspace')).toBeNull()
  expect(await getLocalRecipe('r1')).toEqual({ id: 'r1', doc })
})

it('boots cached local data under StrictMode while auth hangs', async () => {
  await seed()
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  mount(true)
  await screen.findByText('Soup')
  await editAll()
})

it('does not let an older successful /me undo a newer background 401', async () => {
  await seed()
  let finishMe!: (r: Response) => void
  let checks = 0
  vi.stubGlobal('fetch', vi.fn((url: RequestInfo | URL) => {
    if (String(url).includes('/api/auth/me')) {
      checks++
      return checks === 1 ? Promise.resolve(json(owner)) : new Promise<Response>(resolve => { finishMe = resolve })
    }
    return Promise.resolve(json({}, 401))
  }))
  mount()
  await screen.findByText('live settings')
  fireEvent.click(screen.getByText('Verify'))
  await waitFor(() => expect(finishMe).toBeTypeOf('function'))
  await act(async () => { await pullRecipes().catch(() => {}) })
  expect(getLocalSessionState()).toBe('reauth')
  await act(async () => {
    finishMe(json(owner))
    await new Promise(resolve => setTimeout(resolve, 20))
  })
  expect(getLocalSessionState()).toBe('reauth')
  await editAll()
})

it('BroadcastChannel boundary pauses when localStorage writes fail, then same-owner verification recovers', async () => {
  await seed()
  let finishMe!: (r: Response) => void
  let checks = 0
  vi.stubGlobal('fetch', vi.fn(() => {
    checks++
    return checks === 2 ? new Promise<Response>(resolve => { finishMe = resolve }) : Promise.resolve(json(owner))
  }))
  mount()
  await screen.findByText('live settings')
  fireEvent.click(screen.getByText('Verify'))
  await waitFor(() => expect(finishMe).toBeTypeOf('function'))
  const failingStorage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  const peer = new BroadcastChannel('unforked-cross-tab')
  peer.postMessage({ kind: 'auth-boundary', boundary: 'mismatch', nonce: 'other-tab' })
  await screen.findByText('account mismatch')
  await act(async () => { finishMe(json(owner)); await new Promise(resolve => setTimeout(resolve, 20)) })
  fireEvent.click(screen.getByText('Verify'))
  await screen.findByText('live settings')
  expect(checks).toBe(3)
  peer.close()
  failingStorage.mockRestore()
})

it('broadcasts explicit logout even when localStorage writes fail and persists revocation', async () => {
  await seed()
  vi.stubGlobal('fetch', vi.fn(async () => json(owner)))
  mount()
  await screen.findByText('live settings')
  const peer = new BroadcastChannel('unforked-cross-tab')
  const received: unknown[] = []
  peer.onmessage = event => received.push(event.data)
  const failingStorage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  fireEvent.click(screen.getByText('Logout'))
  await waitFor(() => expect(received).toContainEqual(expect.objectContaining({ kind: 'auth-boundary', boundary: 'logout' })))
  expect(await getSyncMeta('auth:loggedOut')).toBe(true)
  expect(screen.queryByText('workspace')).toBeNull()
  peer.close()
  failingStorage.mockRestore()
})

it('durable logout prevents cached bootstrap when localStorage removal fails', async () => {
  await seed()
  vi.stubGlobal('fetch', vi.fn(async () => json(owner)))
  const view = mount()
  await screen.findByText('live settings')
  const blockedRemoval = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
  fireEvent.click(screen.getByText('Logout'))
  await waitFor(async () => expect(await getSyncMeta('auth:loggedOut')).toBe(true))
  expect(readCachedIdentity()).toEqual(owner)
  view.unmount()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  mount()
  await waitFor(() => expect(getLocalSessionState()).toBe('unavailable'))
  expect(screen.queryByText('workspace')).toBeNull()
  blockedRemoval.mockRestore()
})

it('fails closed for sync when both cross-tab boundary transports are blocked', async () => {
  await seed()
  vi.stubGlobal('BroadcastChannel', undefined)
  __resetCrossTabForTests()
  const blockedStorage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  vi.stubGlobal('fetch', vi.fn(async () => json(owner)))
  mount()
  await waitFor(() => expect(getLocalSessionState()).toBe('unavailable'))
  expect(screen.getByText('workspace')).toBeTruthy()
  expect(screen.queryByText('live settings')).toBeNull()
  await editAll()
  blockedStorage.mockRestore()
})

it('keeps a successful in-flight push queued across logout and does not send the next op', async () => {
  await seed()
  let finishPush!: (r: Response) => void
  let pushes = 0
  vi.stubGlobal('fetch', vi.fn((url: RequestInfo | URL) => {
    if (String(url).includes('/api/auth/me')) return Promise.resolve(json(owner))
    pushes++
    return new Promise<Response>(resolve => { finishPush = resolve })
  }))
  mount()
  await screen.findByText('live settings')
  fireEvent.click(screen.getByText('Edit recipe'))
  await waitFor(() => expect(finishPush).toBeTypeOf('function'))
  fireEvent.click(screen.getByText('Edit shopping'))
  await waitFor(async () => expect(await listOutboxOps()).toHaveLength(2))
  const drain = drainOutbox()
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth:boundary', newValue: JSON.stringify({ kind: 'logout' }) }))
    finishPush(json({}))
    await drain
  })
  expect(await listOutboxOps()).toHaveLength(2)
  expect(pushes).toBe(1)
})

it('cross-tab logout invalidates in-flight pull application and local mount without deleting work', async () => {
  await seed()
  let finishPull!: (r: Response) => void
  vi.stubGlobal('fetch', vi.fn((url: RequestInfo | URL) => String(url).includes('/api/auth/me')
    ? Promise.resolve(json(owner)) : new Promise<Response>(resolve => { finishPull = resolve })))
  mount()
  await screen.findByText('live settings')
  const pull = pullRecipes().catch(() => {})
  await waitFor(() => expect(finishPull).toBeTypeOf('function'))
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth:boundary', newValue: JSON.stringify({ kind: 'logout' }) }))
    finishPull(json([{ id: 'r1', doc: { ...doc, name: 'Wrong response' } }]))
    await pull
  })
  expect(screen.queryByText('workspace')).toBeNull()
  expect((await getLocalRecipe('r1'))?.doc.name).toBe('Soup')
})
