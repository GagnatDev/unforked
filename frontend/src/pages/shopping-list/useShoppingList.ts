import { useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getLocalShoppingList } from '@/local/db'
import {
  addShoppingItem,
  approveShoppingList,
  completeShoppingTrip,
  deleteShoppingItem,
  markShoppingListReady,
  patchShoppingItem,
  reopenShoppingList,
  undoShoppingTrip,
} from '@/local/mutations'
import { pullShoppingList } from '@/local/sync'
import { useBackgroundPull } from '@/local/useBackgroundPull'
import { useLocal } from '@/local/useLocal'
import type { ShoppingCategory, ShoppingListEntry, ShoppingListStatus, ShoppingTrip } from '@/types'

export type UseShoppingListResult = {
  /** The open list: what is still to buy this week. */
  items: ShoppingListEntry[] | null
  /** Completed trips this week, oldest first. */
  trips: ShoppingTrip[]
  loading: boolean
  error: string | null
  adding: boolean
  /** Trip state (design #104 D4); 'open' when the doc carries no status. */
  status: ShoppingListStatus
  approvedBy: string | null
  approvedByEmail: string | null
  approvedAt: string | null
  readyByEmail: string | null
  readyAt: string | null
  toggleChecked: (id: string) => void
  changeCategory: (id: string, category: ShoppingCategory) => void
  editItem: (id: string, patch: { name?: string; quantity?: string; unit?: string }) => void
  addItem: (name: string) => Promise<boolean>
  deleteItem: (id: string) => void
  /** Mark the week as being shopped ("I'm going shopping"). */
  approve: () => void
  /** Say the list is complete and can be shopped by anyone ("Ready to shop"). */
  markReady: () => void
  /** Clear the approved / ready state (cancel the trip, back to editing) — allowed to any member. */
  reopen: () => void
  /** "Shopping done": archive the checked items as a trip; the rest stays open. */
  completeTrip: () => void
  /** Put a completed trip's items back on the open list. */
  undoTrip: (tripId: string) => void
}

/**
 * Reads one week's shopping list from the local store (populated from the
 * network in the background) and mutates it offline-first: every item change is
 * applied to the store immediately and queued in the durable outbox, which
 * drains to the server when the network allows (offline-first spec A3/A5). The
 * server re-categorizes synced items and the merge preserves manual items and
 * checked state — reflected locally on the next background pull.
 *
 * The approved / "shopping now" state (design #104 D4) rides the same path:
 * `approve`/`reopen` apply optimistically and queue a status op, and the
 * status fields flow back through pull → IndexedDB → `useLocal` like any
 * other doc field.
 */
export function useShoppingList(weekId: string): UseShoppingListResult {
  const { user } = useAuth()
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

  const approve = useCallback(() => {
    // The approver metadata is minted client-side so the banner is instant and
    // offline-correct; the server records its own authoritative copy on drain.
    if (user) void approveShoppingList(weekId, { id: user.id, email: user.email })
  }, [user, weekId])

  const markReady = useCallback(() => {
    if (user) void markShoppingListReady(weekId, { id: user.id, email: user.email })
  }, [user, weekId])

  const reopen = useCallback(() => {
    void reopenShoppingList(weekId)
  }, [weekId])

  const completeTrip = useCallback(() => {
    if (user) void completeShoppingTrip(weekId, { id: user.id, email: user.email })
  }, [user, weekId])

  const undoTrip = useCallback(
    (tripId: string) => {
      void undoShoppingTrip(weekId, tripId)
    },
    [weekId],
  )

  return {
    items,
    trips: doc?.trips ?? EMPTY_TRIPS,
    loading,
    error,
    adding,
    status: doc?.status ?? 'open',
    approvedBy: doc?.approvedBy ?? null,
    approvedByEmail: doc?.approvedByEmail ?? null,
    approvedAt: doc?.approvedAt ?? null,
    readyByEmail: doc?.readyByEmail ?? null,
    readyAt: doc?.readyAt ?? null,
    toggleChecked,
    changeCategory,
    editItem,
    addItem,
    deleteItem,
    approve,
    markReady,
    reopen,
    completeTrip,
    undoTrip,
  }
}

const EMPTY_TRIPS: ShoppingTrip[] = []
