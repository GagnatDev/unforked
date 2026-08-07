/**
 * `localStorage` access that never throws.
 *
 * Every read and write can raise: Safari in private mode denies access, the
 * quota can be full, and embedding contexts can block storage entirely. All
 * app persistence goes through these helpers so a failing store degrades to
 * "no saved preference" instead of breaking the page.
 */

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readStored(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    store()?.setItem(key, value)
  } catch {
    // Best-effort: private mode / quota failures are not worth surfacing.
  }
}

export function removeStored(key: string): void {
  try {
    store()?.removeItem(key)
  } catch {
    // Best-effort, as above.
  }
}
