import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import JoinFamily from './JoinFamily'
import { AuthProvider } from '@/contexts/AuthContext'
import {
  __resetLocalDbForTests,
  getLocalMealPlan,
  getLocalRecipe,
  getSyncMeta,
  listOutboxOps,
  putLocalMealPlan,
  putLocalRecipe,
} from '@/local/db'
import { saveMealPlan, updateRecipe } from '@/local/mutations'
import { __resetOutboxSyncForTests } from '@/local/outboxSync'
import { __resetSyncStatusForTests } from '@/local/syncStatus'
import { __resetCrossTabForTests } from '@/local/crossTab'
import { __resetLocalSessionForTests, getLocalSessionState } from '@/lib/localSession'
import { __resetReauthForTests } from '@/lib/reauth'
import { readCachedIdentity, writeCachedIdentity } from '@/lib/authIdentity'
import { api } from '@/api'

vi.mock('@/local/liveEvents', () => ({ setLiveEventsUser: vi.fn(), noteShoppingFlush: vi.fn() }))
vi.mock('@/lib/session', async () => ({
  ...await vi.importActual<typeof import('@/lib/session')>('@/lib/session'),
  navigateForLogin: vi.fn(async () => undefined), reloadForLogin: vi.fn(() => true),
}))
vi.mock('@/api', () => ({ api: { family: { acceptInvite: vi.fn() } } }))

const owner = { id: 'u1', familyId: 'f1', email: 'one@example.com', role: 'admin' }
const doc = { name: 'Soup', description: '', sourceUrl: null, sourceName: null, ingredients: [], steps: [], servings: 4, tags: [] }
const week = '2026-W36'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

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

async function accept() {
  fireEvent.change(screen.getByLabelText('Invitation token'), { target: { value: 'tok' } })
  fireEvent.click(screen.getByRole('button', { name: 'Join family' }))
}

it('keeps the workspace live after joining another family and migrates what the server migrates', async () => {
  writeCachedIdentity(owner)
  await putLocalRecipe({ id: 'r1', doc })
  await putLocalMealPlan(week, { weekIdentifier: week, defaultPersons: 3, assignments: [] })
  let familyId = 'f1'
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...owner, familyId })))
  vi.mocked(api.family.acceptInvite).mockImplementation(async () => {
    familyId = 'f2'
    return { familyId }
  })
  render(<MemoryRouter><AuthProvider><JoinFamily /></AuthProvider></MemoryRouter>)
  await waitFor(() => expect(getLocalSessionState()).toBe('live'))

  await accept()

  await waitFor(() => expect(readCachedIdentity()?.familyId).toBe('f2'))
  expect(await getSyncMeta('auth:owner')).toEqual({ id: 'u1', familyId: 'f2' })
  expect(getLocalSessionState()).toBe('live')
  // Recipes travel with the user server-side; meal plans do not.
  expect(await getLocalRecipe('r1')).toEqual({ id: 'r1', doc })
  expect(await getLocalMealPlan(week)).toBeNull()
})

it('keeps queued recipe work across the move and drops queued work for the family left behind', async () => {
  writeCachedIdentity(owner)
  await putLocalRecipe({ id: 'r1', doc })
  let familyId = 'f1'
  // Only identity is reachable, so the queued work stays queued across the move.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/api/auth/me')
    ? json({ ...owner, familyId })
    : Promise.reject(new TypeError('Failed to fetch'))))
  vi.mocked(api.family.acceptInvite).mockImplementation(async () => {
    familyId = 'f2'
    return { familyId }
  })
  render(<MemoryRouter><AuthProvider><JoinFamily /></AuthProvider></MemoryRouter>)
  await waitFor(() => expect(getLocalSessionState()).toBe('live'))
  await updateRecipe('r1', { ...doc, name: 'Edited soup' })
  await saveMealPlan(week, { weekIdentifier: week, defaultPersons: 3, assignments: [] })
  expect(await listOutboxOps()).toHaveLength(2)

  await accept()

  await waitFor(async () => expect(await listOutboxOps()).toEqual([expect.objectContaining({ entity: 'recipe' })]))
  expect(getLocalSessionState()).toBe('live')
})

it('still refuses a different account on the same device', async () => {
  writeCachedIdentity(owner)
  await putLocalRecipe({ id: 'r1', doc })
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...owner, id: 'u2', familyId: 'f2' })))
  render(<MemoryRouter><AuthProvider><JoinFamily /></AuthProvider></MemoryRouter>)
  await waitFor(() => expect(getLocalSessionState()).toBe('mismatch'))
  expect(await getSyncMeta('auth:owner')).toEqual({ id: 'u1', familyId: 'f1' })
})
