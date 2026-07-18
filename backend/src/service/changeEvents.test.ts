import { describe, expect, it, vi } from "vitest";
import {
  familyListenerCount,
  publishShoppingListEvent,
  subscribeAllFamilies,
  subscribeFamily,
  type ShoppingListEvent,
  type ShoppingListEventContext,
  type ShoppingListEventInput,
} from "./changeEvents.js";

const CONTEXT: ShoppingListEventContext = { status: "open" };

function input(overrides: Partial<ShoppingListEventInput> = {}): ShoppingListEventInput {
  return {
    type: "shopping-list.changed",
    familyId: "fam-a",
    week: "2026-W10",
    version: 3,
    actor: { kind: "user", id: "user-1", label: "a@example.com" },
    ...overrides,
  };
}

describe("changeEvents bus", () => {
  it("delivers events to subscribers of the same family, with a minted id and ts", () => {
    const received: ShoppingListEvent[] = [];
    const unsubscribe = subscribeFamily("fam-a", (evt) => received.push(evt));
    try {
      publishShoppingListEvent(input(), CONTEXT);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        type: "shopping-list.changed",
        familyId: "fam-a",
        week: "2026-W10",
        version: 3,
        actor: { kind: "user", id: "user-1", label: "a@example.com" },
      });
      expect(received[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(received[0].ts).getTime()).not.toBeNaN();
    } finally {
      unsubscribe();
    }
  });

  it("scopes fan-out to the event's family", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeFamily("fam-a", a);
    const offB = subscribeFamily("fam-b", b);
    try {
      publishShoppingListEvent(input({ familyId: "fam-a" }), CONTEXT);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).not.toHaveBeenCalled();
    } finally {
      offA();
      offB();
    }
  });

  it("stops delivery after unsubscribe and drops the listener", () => {
    const fn = vi.fn();
    const unsubscribe = subscribeFamily("fam-a", fn);
    expect(familyListenerCount("fam-a")).toBe(1);
    unsubscribe();
    expect(familyListenerCount("fam-a")).toBe(0);
    publishShoppingListEvent(input(), CONTEXT);
    expect(fn).not.toHaveBeenCalled();
  });

  it("delivers every family's events with context to subscribeAllFamilies, but never to family subscribers", () => {
    const all: Array<{ evt: ShoppingListEvent; context: ShoppingListEventContext }> = [];
    const famA = vi.fn();
    const offAll = subscribeAllFamilies((evt, context) => all.push({ evt, context }));
    const offA = subscribeFamily("fam-a", famA);
    try {
      publishShoppingListEvent(input({ familyId: "fam-a" }), {
        status: "approved",
        approvedBy: "user-9",
        itemsAdded: 3,
      });
      publishShoppingListEvent(input({ familyId: "fam-b" }), CONTEXT);
      expect(all).toHaveLength(2);
      expect(all[0].evt.familyId).toBe("fam-a");
      expect(all[0].context).toEqual({ status: "approved", approvedBy: "user-9", itemsAdded: 3 });
      expect(all[1].evt.familyId).toBe("fam-b");
      // The family-scoped (SSE) channel saw only its own event — and the
      // context object is not part of that wire-facing callback at all.
      expect(famA).toHaveBeenCalledTimes(1);
      expect(famA.mock.calls[0]).toHaveLength(1);
    } finally {
      offAll();
      offA();
    }
  });

  it("stops cross-family delivery after unsubscribe and contains throwing global subscribers", () => {
    const received = vi.fn();
    const offBad = subscribeAllFamilies(() => {
      throw new Error("subscriber exploded");
    });
    const offGood = subscribeAllFamilies(received);
    try {
      expect(() => publishShoppingListEvent(input(), CONTEXT)).not.toThrow();
      expect(received).toHaveBeenCalledTimes(1);
    } finally {
      offBad();
      offGood();
    }
    publishShoppingListEvent(input(), CONTEXT);
    expect(received).toHaveBeenCalledTimes(1);
  });

  it("contains a throwing subscriber so publishing never fails and others still receive", () => {
    const good = vi.fn();
    const offBad = subscribeFamily("fam-a", () => {
      throw new Error("subscriber exploded");
    });
    const offGood = subscribeFamily("fam-a", good);
    try {
      expect(() => publishShoppingListEvent(input(), CONTEXT)).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    } finally {
      offBad();
      offGood();
    }
  });
});
