import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetCrossTabForTests } from './crossTab'
import {
  __resetLocalDbForTests,
  putLocalRecipe,
  startCrossTabSync,
  subscribeLocal,
} from './db'
import type { Recipe } from '@/types'

const CHANNEL_NAME = 'unforked-cross-tab'
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Yield to the event loop until `predicate` holds. Cross-tab delivery goes
 * through a `BroadcastChannel`, which hands messages off asynchronously with no
 * guarantee they land within a single macrotask — polling for the expected
 * effect is deterministic where a fixed `setTimeout(0)` races the assertion.
 */
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(predicate(), 'waitFor: condition not met in time').toBe(true)
}

function recipe(id: string, name: string): Recipe {
  return {
    id,
    doc: {
      name,
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    },
  }
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  __resetCrossTabForTests()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(async () => {
  await __resetLocalDbForTests()
  __resetCrossTabForTests()
})

describe('cross-tab reactive reads (phase 6)', () => {
  it('re-fires a local subscriber when another tab commits a matching write', async () => {
    startCrossTabSync()
    const callback = vi.fn()
    const unsubscribe = subscribeLocal(['recipes'], callback)

    // Simulate a recipe write committed in another tab.
    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'local-write', stores: ['recipes'] })
    await waitFor(() => callback.mock.calls.length > 0)
    otherTab.close()

    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('ignores a cross-tab write to a store the subscriber does not watch', async () => {
    startCrossTabSync()
    const callback = vi.fn()
    const unsubscribe = subscribeLocal(['mealPlans'], callback)

    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.postMessage({ kind: 'local-write', stores: ['recipes'] })
    await flush()
    otherTab.close()

    expect(callback).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('broadcasts a committed local write to other tabs', async () => {
    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    const seen: unknown[] = []
    otherTab.onmessage = (event: MessageEvent) => seen.push(event.data)

    await putLocalRecipe(recipe('r1', 'Soup'))
    await waitFor(() => seen.length > 0)
    otherTab.close()

    expect(seen).toContainEqual({ kind: 'local-write', stores: ['recipes'] })
  })

  it('still notifies the writing tab exactly once (no self-echo)', async () => {
    startCrossTabSync()
    const callback = vi.fn()
    const unsubscribe = subscribeLocal(['recipes'], callback)

    await putLocalRecipe(recipe('r1', 'Soup'))
    await flush()

    // The in-tab listener fires synchronously on commit; the broadcast is never
    // delivered back to the sender, so there is no second (echoed) call.
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
