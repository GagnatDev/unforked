import type { MealPlanDoc, PersistedShoppingListDoc, Recipe } from '@/types'

/**
 * Persistent local store (IndexedDB) for domain data — the read source of
 * truth for the UI (offline-first spec A1). The network populates it in the
 * background via `sync.ts`; components read it reactively via `useLocal`.
 *
 * `mealPlans` and `shoppingLists` are keyed by the *requested* week
 * identifier (out-of-line keys), not by the doc's own `weekIdentifier`
 * field, so lookups always match what the page asked the API for.
 */

const DB_NAME = 'unforked-local'
const DB_VERSION = 1

export type LocalStoreName = 'recipes' | 'mealPlans' | 'shoppingLists' | 'syncMeta'

/** syncMeta key set when the full recipe list was last pulled from the server. */
const RECIPES_PULLED_AT_KEY = 'recipes:pulledAt'

type SyncMetaRecord = { key: string; value: unknown }

let dbPromise: Promise<IDBDatabase> | null = null

function openLocalDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('recipes')) {
          db.createObjectStore('recipes', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('mealPlans')) {
          db.createObjectStore('mealPlans')
        }
        if (!db.objectStoreNames.contains('shoppingLists')) {
          db.createObjectStore('shoppingLists')
        }
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

async function readTx<T>(
  stores: LocalStoreName[],
  read: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openLocalDb()
  const tx = db.transaction(stores, 'readonly')
  return read(tx)
}

/** Runs `write` in one readwrite transaction and notifies subscribers on completion. */
async function writeTx(
  stores: LocalStoreName[],
  write: (tx: IDBTransaction) => Promise<void> | void,
): Promise<void> {
  const db = await openLocalDb()
  const tx = db.transaction(stores, 'readwrite')
  await write(tx)
  await transactionDone(tx)
  notifyLocalWrite(stores)
}

// --- change notifications (single-tab pub/sub; cross-tab arrives in phase 6) ---

type Listener = { stores: ReadonlySet<LocalStoreName>; callback: () => void }
const listeners = new Set<Listener>()

/**
 * Subscribes to local writes touching any of `stores`. The callback fires
 * after the write transaction has committed, so re-reads observe the new data.
 */
export function subscribeLocal(
  stores: readonly LocalStoreName[],
  callback: () => void,
): () => void {
  const listener: Listener = { stores: new Set(stores), callback }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyLocalWrite(stores: readonly LocalStoreName[]): void {
  for (const listener of listeners) {
    if (stores.some((s) => listener.stores.has(s))) listener.callback()
  }
}

// --- recipes ---

export async function getLocalRecipe(id: string): Promise<Recipe | null> {
  return readTx(['recipes'], async (tx) => {
    const recipe = await promisifyRequest<Recipe | undefined>(tx.objectStore('recipes').get(id))
    return recipe ?? null
  })
}

/**
 * All locally known recipes, sorted by name like the server list endpoint.
 * Returns `null` when the full list has never been pulled and nothing is
 * stored — "unknown", as opposed to a known-empty list.
 */
export async function listLocalRecipes(): Promise<Recipe[] | null> {
  return readTx(['recipes', 'syncMeta'], async (tx) => {
    const [recipes, pulledMeta] = await Promise.all([
      promisifyRequest<Recipe[]>(tx.objectStore('recipes').getAll()),
      promisifyRequest<SyncMetaRecord | undefined>(
        tx.objectStore('syncMeta').get(RECIPES_PULLED_AT_KEY),
      ),
    ])
    if (pulledMeta == null && recipes.length === 0) return null
    return recipes.sort((a, b) => a.doc.name.localeCompare(b.doc.name))
  })
}

/** Replaces the whole recipe collection with the server's list (full pull). */
export async function replaceLocalRecipes(recipes: Recipe[]): Promise<void> {
  await writeTx(['recipes', 'syncMeta'], (tx) => {
    const store = tx.objectStore('recipes')
    store.clear()
    for (const recipe of recipes) store.put(recipe)
    tx.objectStore('syncMeta').put({ key: RECIPES_PULLED_AT_KEY, value: Date.now() })
  })
}

export async function putLocalRecipe(recipe: Recipe): Promise<void> {
  await writeTx(['recipes'], (tx) => {
    tx.objectStore('recipes').put(recipe)
  })
}

export async function deleteLocalRecipe(id: string): Promise<void> {
  await writeTx(['recipes'], (tx) => {
    tx.objectStore('recipes').delete(id)
  })
}

// --- meal plans (keyed by requested weekIdentifier) ---

export async function getLocalMealPlan(weekId: string): Promise<MealPlanDoc | null> {
  return readTx(['mealPlans'], async (tx) => {
    const doc = await promisifyRequest<MealPlanDoc | undefined>(
      tx.objectStore('mealPlans').get(weekId),
    )
    return doc ?? null
  })
}

export async function putLocalMealPlan(weekId: string, doc: MealPlanDoc): Promise<void> {
  await writeTx(['mealPlans'], (tx) => {
    tx.objectStore('mealPlans').put(doc, weekId)
  })
}

// --- shopping lists (keyed by requested weekIdentifier) ---

export async function getLocalShoppingList(
  weekId: string,
): Promise<PersistedShoppingListDoc | null> {
  return readTx(['shoppingLists'], async (tx) => {
    const doc = await promisifyRequest<PersistedShoppingListDoc | undefined>(
      tx.objectStore('shoppingLists').get(weekId),
    )
    return doc ?? null
  })
}

export async function putLocalShoppingList(
  weekId: string,
  doc: PersistedShoppingListDoc,
): Promise<void> {
  await writeTx(['shoppingLists'], (tx) => {
    tx.objectStore('shoppingLists').put(doc, weekId)
  })
}

/**
 * Read-modify-write of one week's shopping list in a single transaction, for
 * optimistic item mutations. Returning the input doc unchanged (or `null` for
 * a missing doc) still notifies subscribers; that's harmless.
 */
export async function mutateLocalShoppingList(
  weekId: string,
  mutate: (doc: PersistedShoppingListDoc | null) => PersistedShoppingListDoc | null,
): Promise<void> {
  await writeTx(['shoppingLists'], async (tx) => {
    const store = tx.objectStore('shoppingLists')
    const current = await promisifyRequest<PersistedShoppingListDoc | undefined>(
      store.get(weekId),
    )
    const next = mutate(current ?? null)
    if (next != null) store.put(next, weekId)
  })
}

// --- sync metadata ---

export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  return readTx(['syncMeta'], async (tx) => {
    const record = await promisifyRequest<SyncMetaRecord | undefined>(
      tx.objectStore('syncMeta').get(key),
    )
    return record?.value as T | undefined
  })
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await writeTx(['syncMeta'], (tx) => {
    tx.objectStore('syncMeta').put({ key, value })
  })
}

// --- test support ---

/** Closes the cached connection so tests can swap in a fresh IndexedDB. */
export async function __resetLocalDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null)
    db?.close()
    dbPromise = null
  }
  listeners.clear()
}
