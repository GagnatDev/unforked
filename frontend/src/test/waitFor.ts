import { expect } from 'vitest'

/**
 * Yield to the event loop until `predicate` holds, then return.
 *
 * Use this wherever a test waits on something the browser (or its test double)
 * delivers asynchronously with no guarantee it lands within a single macrotask
 * — `BroadcastChannel` messages are the main case here. A fixed
 * `setTimeout(0)` flush races the assertion and fails intermittently on a
 * loaded CI runner; polling for the expected effect is deterministic.
 */
export async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(predicate(), 'waitFor: condition not met in time').toBe(true)
}
