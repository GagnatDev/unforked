import type { PersistedShoppingListDoc, ShoppingTrip } from '@/types'

/**
 * Pure transforms of a week's shopping-list doc, shared by the optimistic
 * mutations (`mutations.ts`) and the pull-merge replay (`shoppingMerge.ts`) so
 * an op applies identically at both points — and mirrors what the server does
 * when the op drains.
 */

/** Strip every status field so the doc reads as open (absent = open, back-compat). */
export function clearShoppingStatus(doc: PersistedShoppingListDoc): PersistedShoppingListDoc {
  const {
    status: _s,
    approvedBy: _ab,
    approvedByEmail: _ae,
    approvedAt: _at,
    readyBy: _rb,
    readyByEmail: _re,
    readyAt: _rt,
    ...open
  } = doc
  return open
}

export function approveShoppingDoc(
  doc: PersistedShoppingListDoc,
  approver: { id: string; email: string },
  approvedAt: string,
): PersistedShoppingListDoc {
  return {
    ...clearShoppingStatus(doc),
    status: 'approved',
    approvedBy: approver.id,
    approvedByEmail: approver.email,
    approvedAt,
  }
}

export function markShoppingDocReady(
  doc: PersistedShoppingListDoc,
  marker: { id: string; email: string },
  readyAt: string,
): PersistedShoppingListDoc {
  // Someone already shopping outranks "ready" (the server treats it as a
  // satisfied intent too), so an approved doc is left alone.
  if (doc.status === 'approved') return doc
  return {
    ...clearShoppingStatus(doc),
    status: 'ready',
    readyBy: marker.id,
    readyByEmail: marker.email,
    readyAt,
  }
}

export interface TripMeta {
  id: string
  completedAt: string
  completedBy: string
  completedByEmail: string
}

/**
 * "Shopping done": archive the checked items as a trip and return the list to
 * open. With nothing checked only the status is cleared (no history entry),
 * exactly like the server. A trip id already in the history is a no-op.
 */
export function completeShoppingTripInDoc(
  doc: PersistedShoppingListDoc,
  meta: TripMeta,
): PersistedShoppingListDoc {
  if ((doc.trips ?? []).some((t) => t.id === meta.id)) return doc
  const checked = doc.items.filter((i) => i.checked)
  const open = clearShoppingStatus(doc)
  if (checked.length === 0) return open
  const trip: ShoppingTrip = { ...meta, items: checked }
  return { ...open, items: doc.items.filter((i) => !i.checked), trips: [...(doc.trips ?? []), trip] }
}

/** Undo a "Shopping done": the trip's items return to the open list, still checked. */
export function undoShoppingTripInDoc(
  doc: PersistedShoppingListDoc,
  tripId: string,
): PersistedShoppingListDoc {
  const trip = doc.trips?.find((t) => t.id === tripId)
  if (!trip) return doc
  const present = new Set(doc.items.map((i) => i.id))
  const restored = trip.items.filter((i) => !present.has(i.id)).map((i) => ({ ...i, checked: true }))
  const remaining = (doc.trips ?? []).filter((t) => t.id !== tripId)
  const { trips: _trips, ...rest } = doc
  return remaining.length > 0
    ? { ...rest, items: [...doc.items, ...restored], trips: remaining }
    : { ...rest, items: [...doc.items, ...restored] }
}
