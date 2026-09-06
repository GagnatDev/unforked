import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { AuthProvider } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireLiveSession } from '@/components/RequireLiveSession'
import { writeCachedIdentity, readCachedIdentity } from '@/lib/authIdentity'
import { __resetLocalDbForTests, getLocalRecipe, putLocalRecipe } from '@/local/db'
import { __resetReauthForTests } from '@/lib/reauth'
import { __resetLocalSessionForTests } from '@/lib/localSession'
import { __resetOutboxSyncForTests } from '@/local/outboxSync'
import { __resetCrossTabForTests } from '@/local/crossTab'
import Family from './Family'
import Profile from './Profile'
import { ThemeProvider } from '@/contexts/ThemeContext'
import ApiKeys from './ApiKeys'

vi.mock('@/local/liveEvents', () => ({ setLiveEventsUser: vi.fn() }))
const owner = { id: 'u1', familyId: 'f1', email: 'one@example.com', role: 'admin' }
const doc = { name: 'Local soup', description: '', sourceUrl: null, sourceName: null, ingredients: [], steps: [], servings: 4, tags: [] }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
beforeEach(async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  localStorage.clear(); sessionStorage.clear()
  __resetOutboxSyncForTests(); __resetCrossTabForTests(); __resetReauthForTests(); __resetLocalSessionForTests()
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
  writeCachedIdentity(owner)
  await putLocalRecipe({ id: 'r1', doc })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => {
  cleanup(); __resetOutboxSyncForTests(); __resetCrossTabForTests()
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})
function mount(path: string) {
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><RequireAuth>
    <nav><Link to="/recipes">Recipes</Link></nav>
    <Routes>
      <Route path="/family" element={<RequireLiveSession titleKey="family.title"><Family /></RequireLiveSession>} />
      <Route path="/api-keys" element={<RequireLiveSession titleKey="apiKeys.title"><ApiKeys /></RequireLiveSession>} />
      <Route path="/profile" element={<ThemeProvider><Profile /></ThemeProvider>} />
      <Route path="/recipes" element={<h1>Local recipes</h1>} />
    </Routes>
  </RequireAuth></AuthProvider></MemoryRouter>)
}
it.each(['/family', '/api-keys'])('offline %s retains local data and shell navigation', async path => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  mount(path)
  await screen.findByText('Connection needed')
  expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Recipes' }))
  await screen.findByRole('heading', { name: 'Local recipes' })
  expect((await getLocalRecipe('r1'))?.doc).toEqual(doc)
  expect(readCachedIdentity()).toEqual(owner)
})
it.each(['/family', '/api-keys'])('online timeout on %s has bounded retry and recovers', async path => {
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), Math.min(ms, 100))
    return controller.signal
  })
  let healthy = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/auth/me')) return json(owner)
    if (!healthy) return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
    return json(path === '/family' ? { id: 'f1', defaultMealPlanPersons: 4, members: [], pendingInvites: [] } : [])
  }))
  mount(path)
  await screen.findByRole('button', { name: 'Loading settings…' })
  expect(screen.getByRole('button', { name: 'Loading settings…' }).hasAttribute('disabled')).toBe(true)
  await screen.findByText('Connection needed')
  healthy = true
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText(path === '/family' ? 'Members' : 'No API keys yet.')
  expect((await getLocalRecipe('r1'))?.doc).toEqual(doc)
})
it.each([403, 503])('HTTP %s is not presented as offline', async status => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/api/auth/me') ? json(owner) : json({}, status)))
  mount('/api-keys')
  await screen.findByText(status === 403 ? 'Permission needed' : 'Settings unavailable')
  expect(screen.queryByText('Connection needed')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull()
})

it.each(['expired', 'mismatch', 'permission', 'server'])('auth proof %s has distinct recovery guidance', async mode => {
  vi.stubGlobal('fetch', vi.fn(async () => mode === 'mismatch' ? json({ ...owner, familyId: 'other' }) : json({}, mode === 'expired' ? 401 : mode === 'permission' ? 403 : 503)))
  mount('/family')
  await screen.findByText(mode === 'expired' ? 'Sign in to manage settings' : mode === 'mismatch' ? 'Account does not match' : mode === 'permission' ? 'Permission needed' : 'Settings unavailable')
  expect(screen.queryByRole('button', { name: 'Sign in again' }) !== null).toBe(mode === 'expired' || mode === 'mismatch')
  expect((await getLocalRecipe('r1'))?.doc).toEqual(doc)
})

it('initial hanging auth is busy only in settings, then offers recovery', async () => {
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 100)
    return controller.signal
  })
  vi.stubGlobal('fetch', vi.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  })))
  mount('/family')
  expect((await screen.findByRole('button', { name: 'Loading settings…' })).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByText('Connection needed')).toBeNull()
  expect(screen.getByRole('link', { name: 'Recipes' })).toBeTruthy()
  await screen.findByRole('button', { name: 'Try again' })
  expect(screen.getByText('Connection needed')).toBeTruthy()
})
it('offline Profile preserves preferences and navigation while notifications fail softly', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
  mount('/profile')
  await screen.findByText('Connection needed')
  expect(screen.getByText('Preferences')).toBeTruthy()
  expect(screen.getByRole('link', { name: /API keys/ })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Recipes' })).toBeTruthy()
})
