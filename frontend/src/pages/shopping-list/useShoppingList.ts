import { useCallback, useState } from 'react'
import { api } from '@/api'
import { getLocalShoppingList, mutateLocalShoppingList } from '@/local/db'
import { pullShoppingList } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import type { PersistedShoppingListDoc, ShoppingCategory, ShoppingListEntry } from '@/types'

export type UseShoppingListResult = {
  items: ShoppingListEntry[] | null
  loading: boolean
  error: string | null
  /** True when the last mutation failed (and was rolled back). */
  mutationFailed: boolean
  adding: boolean
  toggleChecked: (id: string) => void
  changeCategory: (id: string, category: ShoppingCategory) => void
  editItem: (id: string, patch: { name?: string; quantity?: string; unit?: string }) => void
  addItem: (name: string) => Promise<boolean>
  deleteItem: (id: string) => void
}

function replaceEntry(
  doc: PersistedShoppingListDoc | null,
  entry: ShoppingListEntry,
): PersistedShoppingListDoc | null {
  if (!doc) return doc
  return { ...doc, items: doc.items.map((i) => (i.id === entry.id ? entry : i)) }
}

/**
 * Reads one week's shopping list from the local store (populated from the
 * network in the background) and mutates it optimistically: item changes are
 * applied to the store first, confirmed with the server's entry, and rolled
 * back on API failure.
 */
export function useShoppingList(weekId: string): UseShoppingListResult {
  const { data: doc, loading: localLoading } = useLocal(
    () => getLocalShoppingList(weekId),
    ['shoppingLists'],
    [weekId],
  )
  const { error: pullError } = useBackgroundPull(() => pullShoppingList(weekId), [weekId])
  const [mutationFailed, setMutationFailed] = useState(false)
  const [adding, setAdding] = useState(false)

  const items = doc?.items ?? null
  // With nothing local yet, stay in loading until the pull lands in the
  // store (or fails); with local data, pull errors are irrelevant offline noise.
  const loading = localLoading || (doc == null && pullError == null)
  const error = doc == null ? pullError : null

  const applyEntry = useCallback(
    (entry: ShoppingListEntry) => mutateLocalShoppingList(weekId, (d) => replaceEntry(d, entry)),
    [weekId],
  )

  const patchItem = useCallback(
    (
      id: string,
      patch: { checked?: boolean; category?: ShoppingCategory; name?: string; quantity?: string; unit?: string },
    ) => {
      setMutationFailed(false)
      void (async () => {
        let previous: ShoppingListEntry | undefined
        await mutateLocalShoppingList(weekId, (d) => {
          if (!d) return d
          previous = d.items.find((i) => i.id === id)
          return { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
        })
        try {
          const entry = await api.shoppingList.patchItem(id, patch, weekId)
          await applyEntry(entry)
        } catch {
          setMutationFailed(true)
          if (previous) await applyEntry(previous)
        }
      })()
    },
    [weekId, applyEntry],
  )

  const toggleChecked = useCallback(
    (id: string) => {
      const item = items?.find((i) => i.id === id)
      if (item) patchItem(id, { checked: !item.checked })
    },
    [items, patchItem],
  )

  const changeCategory = useCallback(
    (id: string, category: ShoppingCategory) => patchItem(id, { category }),
    [patchItem],
  )

  const editItem = useCallback(
    (id: string, patch: { name?: string; quantity?: string; unit?: string }) => patchItem(id, patch),
    [patchItem],
  )

  const addItem = useCallback(
    async (name: string): Promise<boolean> => {
      setMutationFailed(false)
      setAdding(true)
      try {
        // POST first: the entry's id and auto-assigned category come from the server.
        const entry = await api.shoppingList.addItem({ name }, weekId)
        await mutateLocalShoppingList(weekId, (d) =>
          d
            ? { ...d, items: [...d.items, entry] }
            : { weekIdentifier: weekId, items: [entry] },
        )
        return true
      } catch {
        setMutationFailed(true)
        return false
      } finally {
        setAdding(false)
      }
    },
    [weekId],
  )

  const deleteItem = useCallback(
    (id: string) => {
      setMutationFailed(false)
      void (async () => {
        let removed: ShoppingListEntry | undefined
        let removedIndex = -1
        await mutateLocalShoppingList(weekId, (d) => {
          if (!d) return d
          removedIndex = d.items.findIndex((i) => i.id === id)
          if (removedIndex === -1) return d
          removed = d.items[removedIndex]
          return { ...d, items: d.items.filter((i) => i.id !== id) }
        })
        try {
          await api.shoppingList.deleteItem(id, weekId)
        } catch {
          setMutationFailed(true)
          if (!removed) return
          const entry = removed
          const index = removedIndex
          await mutateLocalShoppingList(weekId, (d) => {
            if (!d) return d
            const next = d.items.slice()
            next.splice(Math.min(index, next.length), 0, entry)
            return { ...d, items: next }
          })
        }
      })()
    },
    [weekId],
  )

  return {
    items,
    loading,
    error,
    mutationFailed,
    adding,
    toggleChecked,
    changeCategory,
    editItem,
    addItem,
    deleteItem,
  }
}
