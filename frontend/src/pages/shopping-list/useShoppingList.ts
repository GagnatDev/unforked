import { useCallback, useState } from 'react'
import { getLocalShoppingList } from '@/local/db'
import { addShoppingItem, deleteShoppingItem, patchShoppingItem } from '@/local/mutations'
import { pullShoppingList } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import type { ShoppingCategory, ShoppingListEntry } from '@/types'

export type UseShoppingListResult = {
  items: ShoppingListEntry[] | null
  loading: boolean
  error: string | null
  adding: boolean
  toggleChecked: (id: string) => void
  changeCategory: (id: string, category: ShoppingCategory) => void
  editItem: (id: string, patch: { name?: string; quantity?: string; unit?: string }) => void
  addItem: (name: string) => Promise<boolean>
  deleteItem: (id: string) => void
}

/**
 * Reads one week's shopping list from the local store (populated from the
 * network in the background) and mutates it offline-first: every item change is
 * applied to the store immediately and queued in the durable outbox, which
 * drains to the server when the network allows (offline-first spec A3/A5). The
 * server re-categorizes synced items and the merge preserves manual items and
 * checked state — reflected locally on the next background pull.
 */
export function useShoppingList(weekId: string): UseShoppingListResult {
  const { data: doc, loading: localLoading } = useLocal(
    () => getLocalShoppingList(weekId),
    ['shoppingLists'],
    [weekId],
  )
  const { error: pullError } = useBackgroundPull(() => pullShoppingList(weekId), [weekId])
  const [adding, setAdding] = useState(false)

  const items = doc?.items ?? null
  // With nothing local yet, stay in loading until the pull lands in the
  // store (or fails); with local data, pull errors are irrelevant offline noise.
  const loading = localLoading || (doc == null && pullError == null)
  const error = doc == null ? pullError : null

  const toggleChecked = useCallback(
    (id: string) => {
      const item = items?.find((i) => i.id === id)
      if (item) void patchShoppingItem(weekId, id, { checked: !item.checked })
    },
    [items, weekId],
  )

  const changeCategory = useCallback(
    (id: string, category: ShoppingCategory) => {
      void patchShoppingItem(weekId, id, { category })
    },
    [weekId],
  )

  const editItem = useCallback(
    (id: string, patch: { name?: string; quantity?: string; unit?: string }) => {
      void patchShoppingItem(weekId, id, patch)
    },
    [weekId],
  )

  const addItem = useCallback(
    async (name: string): Promise<boolean> => {
      setAdding(true)
      try {
        await addShoppingItem(weekId, name)
        return true
      } finally {
        setAdding(false)
      }
    },
    [weekId],
  )

  const deleteItem = useCallback(
    (id: string) => {
      void deleteShoppingItem(weekId, id)
    },
    [weekId],
  )

  return {
    items,
    loading,
    error,
    adding,
    toggleChecked,
    changeCategory,
    editItem,
    addItem,
    deleteItem,
  }
}
