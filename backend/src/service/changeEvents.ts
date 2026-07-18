import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";

/** Who caused a shopping-list change: a family member or a machine API key. */
export interface ChangeActor {
  kind: "user" | "machine";
  /** User id for members, API-key id for machine callers. */
  id: string;
  /** Display attribution: the user's email or the API key's name ("Aivo"). */
  label?: string;
}

/**
 * A change event is a thin invalidation hint, not a data delta (design #104,
 * resolved decision 2): consumers react by re-pulling the week's list through
 * the existing sync/merge path. `shopping-list.status` is emitted by the
 * status route (phase 3); the union includes it now so the wire contract is
 * stable for phase-2 clients.
 */
export interface ShoppingListEvent {
  /** UUID; becomes the SSE event id. */
  id: string;
  type: "shopping-list.changed" | "shopping-list.status";
  familyId: string;
  /** weekIdentifier of the affected list. */
  week: string;
  /** Server version of the list row after the write. */
  version: number;
  actor: ChangeActor;
  /** ISO timestamp of emission. */
  ts: string;
}

/** Publish input: the bus mints `id` and `ts`. */
export type ShoppingListEventInput = Omit<ShoppingListEvent, "id" | "ts">;

/**
 * Server-side facts about the list at commit time, captured by the emitting
 * transaction for the notification policy engine (design #104 D6). Kept out of
 * the event itself so the SSE wire contract stays a thin invalidation hint
 * (resolved decision 2): only in-process subscribers via subscribeAllFamilies
 * receive it. Reading the doc later instead would race the next mutation and
 * lose the pre-reopen approver entirely.
 */
export interface ShoppingListEventContext {
  /** List status after the write ("open" when the doc carries no status). */
  status: "open" | "approved";
  /** doc.approvedBy while the list is approved (post-write). */
  approvedBy?: string;
  /** The approver whose trip a reopen transition ended (pre-write value). */
  previousApprovedBy?: string;
  /** How many items this change appended (manual adds; feeds batched copy). */
  itemsAdded?: number;
}

// In-process fan-out (resolved decision 3): at replicas: 1 every write happens
// in this process, so an EventEmitter reaches every subscriber. This module's
// publish/subscribe signature is the D7 seam — scaling to replicas > 1 swaps
// these internals for Postgres LISTEN/NOTIFY without touching any caller.
const bus = new EventEmitter();
// One listener per open SSE stream (plus the phase-5 notification engine);
// the per-user cap lives at the endpoint, so no emitter-level limit is wanted.
bus.setMaxListeners(0);

// Cross-family channel for the notification policy engine, which must see
// every family's events; family-scoped SSE subscribers never receive it.
const ALL_FAMILIES = Symbol("all-families");

/**
 * Fan an event out to this family's subscribers. Fire-and-forget: emission
 * runs after the DB commit and must never fail or slow the mutation response,
 * so subscriber errors are contained here (and in subscribeFamily) and logged.
 */
export function publishShoppingListEvent(
  input: ShoppingListEventInput,
  context: ShoppingListEventContext,
): void {
  const evt: ShoppingListEvent = { ...input, id: randomUUID(), ts: new Date().toISOString() };
  try {
    bus.emit(evt.familyId, evt);
    bus.emit(ALL_FAMILIES, evt, context);
  } catch (err) {
    logger.error({ err, familyId: evt.familyId, week: evt.week }, "change-event fan-out failed");
  }
}

/**
 * Subscribe to one family's events (tenant-scoped exactly like repository
 * queries). Returns the unsubscribe function; callers must invoke it when the
 * consumer goes away (SSE close) or the listener leaks.
 */
export function subscribeFamily(
  familyId: string,
  fn: (evt: ShoppingListEvent) => void,
): () => void {
  const safe = (evt: ShoppingListEvent): void => {
    try {
      fn(evt);
    } catch (err) {
      logger.error({ err, familyId }, "change-event subscriber failed");
    }
  };
  bus.on(familyId, safe);
  return () => {
    bus.off(familyId, safe);
  };
}

/**
 * Subscribe to every family's events, with the emitting transaction's context
 * — the notification policy engine's entry point (design #104 D6). Same error
 * containment as subscribeFamily: a throwing subscriber is logged, never
 * propagated into the mutation path. Returns the unsubscribe function.
 */
export function subscribeAllFamilies(
  fn: (evt: ShoppingListEvent, context: ShoppingListEventContext) => void,
): () => void {
  const safe = (evt: ShoppingListEvent, context: ShoppingListEventContext): void => {
    try {
      fn(evt, context);
    } catch (err) {
      logger.error({ err, familyId: evt.familyId }, "change-event subscriber failed");
    }
  };
  bus.on(ALL_FAMILIES, safe);
  return () => {
    bus.off(ALL_FAMILIES, safe);
  };
}

/** Current subscriber count for a family — the leak gauge (logs + tests). */
export function familyListenerCount(familyId: string): number {
  return bus.listenerCount(familyId);
}
