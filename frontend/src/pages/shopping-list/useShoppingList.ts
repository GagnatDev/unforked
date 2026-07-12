import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import type { ShoppingCategory, ShoppingListEntry } from '@/types'

export type UseShoppingListResult = {
  items: ShoppingListEntry[] | null
  loading: boolean
  error: string | null
  /** True when the last mutation failed (and was rolled back). */
  mutationFailed: boolean
  adding: boolean
  toggleChecked: (id: string) => void
  changeCategory: (id: string, category: ShoppingCategory) => void
  addItem: (name: string) => Promise<boolean>
  deleteItem: (id: string) => void
}

/**
 * Loads the persisted shopping list for a week and owns its local item state.
 * useAsync has no refetch, so mutations update the local list optimistically
 * and roll back on API failure; the server confirms via each call's response.
 */
export function useShoppingList(weekId: string): UseShoppingListResult {
  const { data, loading, error } = useAsync((_signal) => api.shoppingList.get(weekId), [weekId], {
    keepPreviousData: true,
  })
  const [items, setItems] = useState<ShoppingListEntry[] | null>(null)
  const [mutationFailed, setMutationFailed] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (data) setItems(data.items)
  }, [data])

  const applyEntry = useCallback((entry: ShoppingListEntry) => {
    setItems((prev) => prev?.map((i) => (i.id === entry.id ? entry : i)) ?? prev)
  }, [])

  const patchItem = useCallback(
    (id: string, patch: { checked?: boolean; category?: ShoppingCategory }) => {
      setMutationFailed(false)
      let previous: ShoppingListEntry | undefined
      setItems((prev) => {
        previous = prev?.find((i) => i.id === id)
        return prev?.map((i) => (i.id === id ? { ...i, ...patch } : i)) ?? prev
      })
      api.shoppingList
        .patchItem(id, patch, weekId)
        .then(applyEntry)
        .catch(() => {
          setMutationFailed(true)
          if (previous) applyEntry(previous)
        })
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

  const addItem = useCallback(
    async (name: string): Promise<boolean> => {
      setMutationFailed(false)
      setAdding(true)
      try {
        // POST first: the entry's id and auto-assigned category come from the server.
        const entry = await api.shoppingList.addItem({ name }, weekId)
        setItems((prev) => (prev ? [...prev, entry] : [entry]))
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
      let removed: ShoppingListEntry | undefined
      let removedIndex = -1
      setItems((prev) => {
        removedIndex = prev?.findIndex((i) => i.id === id) ?? -1
        if (!prev || removedIndex === -1) return prev
        removed = prev[removedIndex]
        return prev.filter((i) => i.id !== id)
      })
      api.shoppingList.deleteItem(id, weekId).catch(() => {
        setMutationFailed(true)
        setItems((prev) => {
          if (!prev || !removed) return prev
          const next = prev.slice()
          next.splice(Math.min(removedIndex, next.length), 0, removed)
          return next
        })
      })
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
    addItem,
    deleteItem,
  }
}
