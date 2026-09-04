import { describe, expect, it } from "vitest";
import { boughtSourceKey, boughtSourceKeys, shoppingItemKey } from "./shoppingItemKey.js";
import type { ShoppingListEntry, ShoppingTrip } from "./types.js";

function entry(overrides: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
  return {
    id: "id",
    name: "Onion",
    quantity: "2",
    unit: "",
    recipeIds: ["rA"],
    sources: [{ day: "monday", recipeId: "rA" }],
    category: "produce",
    checked: true,
    manual: false,
    ...overrides,
  };
}

function trip(items: ShoppingListEntry[]): ShoppingTrip {
  return {
    id: "trip",
    completedAt: "2026-07-06T17:12:00.000Z",
    completedBy: "u1",
    completedByEmail: "ann@example.com",
    items,
  };
}

describe("shoppingItemKey", () => {
  it("collapses known units to their family for numeric quantities", () => {
    expect(shoppingItemKey({ name: "Flour", quantity: "700", unit: "g" })).toBe(
      shoppingItemKey({ name: "flour ", quantity: "1.05", unit: "kg" }),
    );
  });

  it("keeps the raw unit for non-numeric quantities and unknown units", () => {
    expect(shoppingItemKey({ name: "Pepper", quantity: "—", unit: "ts" })).toBe("pepper|ts");
    expect(shoppingItemKey({ name: "Egg", quantity: "6", unit: "Stk" })).toBe("egg|stk");
  });
});

describe("boughtSourceKeys", () => {
  it("lists one key per (item, day, recipe) contribution across all trips", () => {
    const keys = boughtSourceKeys([
      trip([
        entry({
          sources: [
            { day: "monday", recipeId: "rA" },
            { day: "saturday", recipeId: "rA" },
          ],
        }),
      ]),
      trip([entry({ name: "Milk", quantity: "1", unit: "l", sources: [{ day: "tuesday", recipeId: "rB" }] })]),
    ]);
    expect(keys).toEqual(
      new Set([
        boughtSourceKey("onion|", { day: "monday", recipeId: "rA" }),
        boughtSourceKey("onion|", { day: "saturday", recipeId: "rA" }),
        boughtSourceKey("milk|volume", { day: "tuesday", recipeId: "rB" }),
      ]),
    );
  });

  it("ignores manual items and legacy entries without sources", () => {
    const keys = boughtSourceKeys([
      trip([entry({ manual: true, recipeIds: [], sources: undefined }), entry({ sources: undefined })]),
    ]);
    expect(keys.size).toBe(0);
  });

  it("is empty for no trips", () => {
    expect(boughtSourceKeys(undefined).size).toBe(0);
  });
});
