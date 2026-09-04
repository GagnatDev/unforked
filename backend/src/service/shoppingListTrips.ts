import { randomUUID } from "node:crypto";
import type { Db } from "../db/kysely.js";
import type { PersistedShoppingListDoc, ShoppingListStatus, ShoppingTrip } from "../domain/types.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";
import { clearStatusFields } from "./shoppingListSync.js";

export interface CompleteTripInput {
  /**
   * Client-minted UUID (offline-first): the client completes the trip locally
   * and replays the create later; a replay of an id already in `trips` is a
   * no-op so a reload mid-flush cannot archive twice.
   */
  id?: string;
  /** Client clock at completion, so an offline "Shopping done" keeps its real time. */
  completedAt?: string;
  /** Optimistic-concurrency precondition, same contract as item writes. */
  baseVersion?: number;
}

export type CompleteTripOutcome =
  | { status: "notFound" }
  | { status: "conflict"; doc: PersistedShoppingListDoc; version: number }
  /** Nothing to do (replayed id, or nothing checked on an open list): no write, no event. */
  | { status: "noop"; doc: PersistedShoppingListDoc; version: number }
  | {
      status: "ok";
      doc: PersistedShoppingListDoc;
      version: number;
      /** The archived trip, absent when only the trip state was cleared. */
      trip?: ShoppingTrip;
      /** Trip state before the write, for the notification policy. */
      previousStatus: ShoppingListStatus;
      previousApprovedBy?: string;
    };

/**
 * "Shopping done": move every checked item of the week's open list into a
 * completed trip and return the list to open. What stays behind — unchecked
 * recipe items and unchecked manual items — remains the open list, still
 * regenerated live from the plan, so a family can shop one week in several
 * rounds: plan two days, shop, plan two more, shop again, top up ad hoc.
 *
 * Recipe-derived items keep their `sources` on the archived copy; the sync
 * uses those to leave the bought (item, day, recipe) contributions out of
 * later aggregates while still surfacing anything newly planned.
 */
export async function completeShoppingTrip(
  db: Db,
  familyId: string,
  weekId: string,
  input: CompleteTripInput,
  user: { id: string; email: string },
): Promise<CompleteTripOutcome> {
  const shoppingLists = new ShoppingListRepository(db);
  return db.transaction().execute(async (trx) => {
    const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
    if (!row) return { status: "notFound" as const };
    if (input.id && (row.doc.trips ?? []).some((t) => t.id === input.id)) {
      return { status: "noop" as const, doc: row.doc, version: row.version };
    }
    if (input.baseVersion !== undefined && row.version !== input.baseVersion) {
      return { status: "conflict" as const, doc: row.doc, version: row.version };
    }

    const previousStatus = row.doc.status ?? "open";
    const previousApprovedBy = row.doc.approvedBy;
    const checked = row.doc.items.filter((item) => item.checked);
    if (checked.length === 0 && previousStatus === "open") {
      return { status: "noop" as const, doc: row.doc, version: row.version };
    }

    let trip: ShoppingTrip | undefined;
    if (checked.length > 0) {
      trip = {
        id: input.id ?? randomUUID(),
        completedAt: input.completedAt ?? new Date().toISOString(),
        completedBy: user.id,
        completedByEmail: user.email,
        items: checked,
      };
      row.doc.trips = [...(row.doc.trips ?? []), trip];
      row.doc.items = row.doc.items.filter((item) => !item.checked);
    }
    clearStatusFields(row.doc);

    await shoppingLists.updateDoc(trx, row.id, row.doc, { bumpVersion: true });
    return {
      status: "ok" as const,
      doc: row.doc,
      version: row.version + 1,
      trip,
      previousStatus,
      previousApprovedBy,
    };
  });
}

export type UndoTripOutcome =
  | { status: "notFound" }
  | { status: "ok"; doc: PersistedShoppingListDoc; version: number };

/**
 * Undo a "Shopping done" pressed by mistake: the trip's items return to the
 * open list, still checked (they are in the cart after all), and the trip
 * leaves the history so the next sync regenerates their plan contributions.
 * Items the open list already re-acquired by id are not duplicated.
 */
export async function undoShoppingTrip(
  db: Db,
  familyId: string,
  weekId: string,
  tripId: string,
): Promise<UndoTripOutcome> {
  const shoppingLists = new ShoppingListRepository(db);
  return db.transaction().execute(async (trx) => {
    const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
    const trip = row?.doc.trips?.find((t) => t.id === tripId);
    if (!row || !trip) return { status: "notFound" as const };

    const present = new Set(row.doc.items.map((item) => item.id));
    const restored = trip.items
      .filter((item) => !present.has(item.id))
      .map((item) => ({ ...item, checked: true }));
    row.doc.items = [...row.doc.items, ...restored];
    const remaining = (row.doc.trips ?? []).filter((t) => t.id !== tripId);
    if (remaining.length > 0) row.doc.trips = remaining;
    else delete row.doc.trips;

    await shoppingLists.updateDoc(trx, row.id, row.doc, { bumpVersion: true });
    return { status: "ok" as const, doc: row.doc, version: row.version + 1 };
  });
}
