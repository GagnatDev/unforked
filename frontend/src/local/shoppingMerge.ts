import type { PersistedShoppingListDoc } from '@/types'

import type {
  OutboxOp,
  ShoppingItemCreatePayload,
  ShoppingItemDeletePayload,
  ShoppingItemUpdatePayload,
  ShoppingStatusPayload,
} from './db'

/**
 * Client-side shopping-list merge (offline-first spec A5 / resolved decision 3).
 *
 * A background pull returns the server's authoritative list — but it does not
 * yet reflect our unsynced offline changes still sitting in the outbox. Blindly
 * overwriting the local store with the server doc would drop an offline-added
 * item or lose a checked toggle until the outbox drains. So on pull we replay
 * the pending shopping-item ops on top of the server doc, reconstructing "server
 * truth + our not-yet-pushed intent". `getSyncedShoppingList` already preserves
 * checked state, categories and manual items across meal-plan syncs server-side;
 * this handles the client's own in-flight edits.
 *
 * Ops must be passed in FIFO (seq) order and should exclude parked ones.
 */
export function applyShoppingOps(
  server: PersistedShoppingListDoc | null,
  ops: readonly OutboxOp[],
  weekId: string,
): PersistedShoppingListDoc | null {
  let doc: PersistedShoppingListDoc | null = server
    ? { ...server, items: [...server.items] }
    : null

  for (const op of ops) {
    if (op.entity !== 'shoppingItem' && op.entity !== 'shoppingStatus') continue
    const forWeek = (op.payload as { weekId?: string } | undefined)?.weekId
    if (forWeek !== weekId) continue

    if (op.entity === 'shoppingStatus') {
      if (!doc) continue
      // Re-apply our pending approve/reopen intent on top of the server's doc
      // (design #104 D4), exactly like item ops: an offline approval must not
      // be blinked away by a background pull before the op drains.
      const { status, approvedBy, approvedByEmail, approvedAt } = op.payload as ShoppingStatusPayload
      if (status === 'approved') {
        doc = { ...doc, status, approvedBy, approvedByEmail, approvedAt }
      } else {
        const { status: _s, approvedBy: _b, approvedByEmail: _e, approvedAt: _a, ...open } = doc
        doc = open
      }
      continue
    }

    if (op.type === 'create') {
      const { item } = op.payload as ShoppingItemCreatePayload
      if (!doc) doc = { weekIdentifier: weekId, items: [] }
      // The server may already have it (create synced but not yet re-pulled);
      // keep the server's copy in that case — it carries the re-categorization.
      if (!doc.items.some((i) => i.id === op.key)) {
        doc = { ...doc, items: [...doc.items, item] }
      }
    } else if (op.type === 'update') {
      if (!doc) continue
      const { patch } = op.payload as ShoppingItemUpdatePayload
      doc = { ...doc, items: doc.items.map((i) => (i.id === op.key ? { ...i, ...patch } : i)) }
    } else if (op.type === 'delete') {
      if (!doc) continue
      // Payload is a ShoppingItemDeletePayload; we only need the item key.
      void (op.payload as ShoppingItemDeletePayload)
      doc = { ...doc, items: doc.items.filter((i) => i.id !== op.key) }
    }
  }

  return doc
}
