import { describe, expect, it } from "vitest";
import type {
  PersistedShoppingListDoc,
  ShoppingCategory,
  ShoppingListEntry,
  ShoppingListItem,
} from "../domain/types.js";
import { createManualEntry, syncShoppingListDoc } from "./shoppingListSync.js";

const NO_OVERRIDES = new Map<string, ShoppingCategory>();

function aggregateItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return { name: "Milk", quantity: "2", unit: "l", recipeIds: ["r1"], ...overrides };
}

function entry(overrides: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
  return {
    id: "existing-id",
    name: "Milk",
    quantity: "1",
    unit: "l",
    recipeIds: ["r1"],
    category: "dairy",
    checked: true,
    manual: false,
    ...overrides,
  };
}

function doc(items: ShoppingListEntry[]): PersistedShoppingListDoc {
  return { weekIdentifier: "2026-W28", items };
}

describe("syncShoppingListDoc", () => {
  it("creates categorized unchecked entries from a fresh aggregate", () => {
    const result = syncShoppingListDoc(
      undefined,
      [aggregateItem({ name: "Chicken breast" }), aggregateItem({ name: "Mystery thing" })],
      NO_OVERRIDES,
      "2026-W28",
    );
    expect(result.weekIdentifier).toBe("2026-W28");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      name: "Chicken breast",
      category: "meat",
      checked: false,
      manual: false,
    });
    expect(result.items[0]!.id).toBeTruthy();
    expect(result.items[1]!.category).toBe("other");
  });

  it("prefers family overrides when categorizing new items", () => {
    const overrides = new Map<string, ShoppingCategory>([["milk", "beverages"]]);
    const result = syncShoppingListDoc(undefined, [aggregateItem()], overrides, "2026-W28");
    expect(result.items[0]!.category).toBe("beverages");
  });

  it("preserves id, checked and category across quantity changes", () => {
    const previous = doc([entry({ category: "beverages", checked: true })]);
    const result = syncShoppingListDoc(
      previous,
      [aggregateItem({ quantity: "3", recipeIds: ["r1", "r2"] })],
      NO_OVERRIDES,
      "2026-W28",
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "existing-id",
      quantity: "3",
      recipeIds: ["r1", "r2"],
      category: "beverages",
      checked: true,
    });
  });

  it("matches across a display-unit flip within the same unit family", () => {
    const previous = doc([entry({ name: "Minced beef", quantity: "700", unit: "g" })]);
    const result = syncShoppingListDoc(
      previous,
      [aggregateItem({ name: "Minced beef", quantity: "1.05", unit: "kg" })],
      NO_OVERRIDES,
      "2026-W28",
    );
    expect(result.items[0]).toMatchObject({ id: "existing-id", checked: true, unit: "kg" });
  });

  it("keeps same-name items in different unit groups distinct", () => {
    const previous = doc([
      entry({ id: "grams", name: "Garlic", unit: "g", checked: true }),
      entry({ id: "cloves", name: "Garlic", unit: "cloves", checked: false }),
    ]);
    const result = syncShoppingListDoc(
      previous,
      [
        aggregateItem({ name: "Garlic", unit: "g" }),
        aggregateItem({ name: "Garlic", unit: "cloves" }),
      ],
      NO_OVERRIDES,
      "2026-W28",
    );
    expect(result.items.map((i) => i.id)).toEqual(["grams", "cloves"]);
    expect(result.items.map((i) => i.checked)).toEqual([true, false]);
  });

  it("keeps a numeric and a non-numeric same-family item distinct (no shared id)", () => {
    // The aggregator emits "pepper 2.5 ml" (family volume) and a non-numeric
    // "pepper — ts" as two rows. Grouping by family alone collapsed both to
    // "pepper|volume" and handed them the same id, so toggling one toggled both.
    const previous = doc([
      entry({ id: "ml-id", name: "Pepper", quantity: "2.5", unit: "ml", checked: false }),
      entry({ id: "ts-id", name: "Pepper", quantity: "—", unit: "ts", checked: true }),
    ]);
    const result = syncShoppingListDoc(
      previous,
      [
        aggregateItem({ name: "Pepper", quantity: "2.5", unit: "ml" }),
        aggregateItem({ name: "Pepper", quantity: "—", unit: "ts" }),
      ],
      NO_OVERRIDES,
      "2026-W28",
    );
    expect(result.items.map((i) => i.id)).toEqual(["ml-id", "ts-id"]);
    expect(result.items.map((i) => i.checked)).toEqual([false, true]);
  });

  it("assigns fresh unique ids to same-family numeric/non-numeric items with no previous", () => {
    const result = syncShoppingListDoc(
      undefined,
      [
        aggregateItem({ name: "Pepper", quantity: "2.5", unit: "ml" }),
        aggregateItem({ name: "Pepper", quantity: "—", unit: "ts" }),
      ],
      NO_OVERRIDES,
      "2026-W28",
    );
    const [a, b] = result.items;
    expect(a!.id).toBeTruthy();
    expect(b!.id).toBeTruthy();
    expect(a!.id).not.toBe(b!.id);
  });

  it("drops recipe items that left the plan, even when checked", () => {
    const previous = doc([entry({ checked: true })]);
    const result = syncShoppingListDoc(previous, [], NO_OVERRIDES, "2026-W28");
    expect(result.items).toEqual([]);
  });

  it("always keeps manual items verbatim", () => {
    const manual = entry({ id: "manual-1", name: "Tannkrem", manual: true, recipeIds: [] });
    const previous = doc([entry({ checked: true }), manual]);
    const result = syncShoppingListDoc(previous, [], NO_OVERRIDES, "2026-W28");
    expect(result.items).toEqual([manual]);
  });

  it("preserves the approved status fields verbatim (design #104 D4)", () => {
    const previous: PersistedShoppingListDoc = {
      ...doc([entry({ checked: true })]),
      status: "approved",
      approvedBy: "user-1",
      approvedByEmail: "ann@example.com",
      approvedAt: "2026-07-06T17:12:00.000Z",
    };
    // Regenerating items (here: the recipe left the plan) must not touch the trip state.
    const result = syncShoppingListDoc(previous, [], NO_OVERRIDES, "2026-W28");
    expect(result).toEqual({
      weekIdentifier: "2026-W28",
      items: [],
      status: "approved",
      approvedBy: "user-1",
      approvedByEmail: "ann@example.com",
      approvedAt: "2026-07-06T17:12:00.000Z",
    });
  });

  it("adds no status fields when the previous doc has none (absent = open)", () => {
    const result = syncShoppingListDoc(doc([entry()]), [aggregateItem()], NO_OVERRIDES, "2026-W28");
    expect("status" in result).toBe(false);
    expect("approvedBy" in result).toBe(false);
    expect("approvedByEmail" in result).toBe(false);
    expect("approvedAt" in result).toBe(false);
  });
});

describe("createManualEntry", () => {
  it("auto-categorizes and marks the entry manual", () => {
    const created = createManualEntry({ name: "Kaffe", quantity: "1", unit: "pose" }, NO_OVERRIDES);
    expect(created).toMatchObject({
      name: "Kaffe",
      category: "beverages",
      checked: false,
      manual: true,
      recipeIds: [],
    });
    expect(created.id).toBeTruthy();
  });

  it("respects an explicit category", () => {
    const created = createManualEntry(
      { name: "Kaffe", quantity: "", unit: "", category: "household" },
      NO_OVERRIDES,
    );
    expect(created.category).toBe("household");
  });
});
