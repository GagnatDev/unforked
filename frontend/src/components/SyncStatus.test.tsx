import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@/i18n'
import { SyncStatus } from './SyncStatus'
import { __resetLocalDbForTests, appendOutboxOp, deleteOutboxOp, listOutboxOps } from '@/local/db'
import { __resetSyncStatusForTests, trackSync } from '@/local/syncStatus'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ reauthPending: false }) }))
const syncNow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/local/outboxSync', () => ({ syncNow: () => syncNow() }))

beforeEach(async () => {
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
  __resetSyncStatusForTests()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  syncNow.mockClear()
})
afterEach(cleanup)

it('shows one control, reactive durable counts, parked error, and manual retry', async () => {
  render(<SyncStatus />)
  await screen.findByRole('button', { name: 'Synced' })
  fireEvent.click(screen.getByRole('button', { name: 'Synced' }))
  await screen.findByText('0 changes pending')
  await act(async () => {
    await appendOutboxOp({ opId: 'p', entity: 'recipe', type: 'delete', key: 'r', payload: {}, createdAt: 1, attempts: 1, parkedAt: 1 })
  })
  await screen.findByText('1 change pending')
  expect(screen.getByRole('button', { name: 'Sync paused' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  await waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
  expect((await listOutboxOps())[0].parkedAt).toBe(1)
  await act(async () => { await deleteOutboxOp((await listOutboxOps())[0].seq!) })
  await screen.findByText('0 changes pending')
  await screen.findByRole('button', { name: 'Synced' })
})

it('distinguishes true offline from an online timeout and retains a failed pull after an empty drain', async () => {
  render(<SyncStatus />)
  await screen.findByRole('button', { name: 'Synced' })
  await act(async () => {
    await trackSync('recipes', async () => { throw new TypeError('Failed to fetch') }).catch(() => {})
    await trackSync('outbox', async () => {})
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sync paused' }))
  await screen.findByText('The connection failed or timed out. Try syncing again.')
  act(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
  })
  expect(screen.getByRole('button', { name: 'Offline' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Sync now' }) as HTMLButtonElement).disabled).toBe(true)
})
