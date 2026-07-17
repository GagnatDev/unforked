import { describe, expect, it, vi } from "vitest";
import {
  familyListenerCount,
  publishShoppingListEvent,
  subscribeFamily,
  type ShoppingListEvent,
  type ShoppingListEventInput,
} from "./changeEvents.js";

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
      publishShoppingListEvent(input());
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
      publishShoppingListEvent(input({ familyId: "fam-a" }));
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
    publishShoppingListEvent(input());
    expect(fn).not.toHaveBeenCalled();
  });

  it("contains a throwing subscriber so publishing never fails and others still receive", () => {
    const good = vi.fn();
    const offBad = subscribeFamily("fam-a", () => {
      throw new Error("subscriber exploded");
    });
    const offGood = subscribeFamily("fam-a", good);
    try {
      expect(() => publishShoppingListEvent(input())).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    } finally {
      offBad();
      offGood();
    }
  });
});
