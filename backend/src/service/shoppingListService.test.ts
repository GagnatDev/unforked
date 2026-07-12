import { describe, expect, it } from "vitest";
import type { DayAssignment, MealPlanDoc, RecipeDoc } from "../domain/types.js";
import {
  buildAggregatedShoppingItems,
  scaleForAssignment,
  scaledIngredientQuantity,
  summarizeQuantities,
  type RecipeEntry,
} from "./shoppingListService.js";

function recipe(name: string, ingredients: RecipeDoc["ingredients"], servings = 4): RecipeDoc {
  return { name, description: "", ingredients, steps: [], servings, tags: [] };
}

function planWith(assignments: DayAssignment[], defaultPersons?: number | null): MealPlanDoc {
  return { weekIdentifier: "2026-W01", defaultPersons, assignments };
}

function twoRecipePlan(
  r1: RecipeDoc,
  r2: RecipeDoc,
): { plan: MealPlanDoc; map: Map<string, RecipeEntry> } {
  const id1 = "00000000-0000-4000-8000-000000000001";
  const id2 = "00000000-0000-4000-8000-000000000002";
  const plan = planWith([
    { day: "monday", recipeId: id1, recipeName: r1.name },
    { day: "tuesday", recipeId: id2, recipeName: r2.name },
  ]);
  const map = new Map<string, RecipeEntry>([
    [id1, { id: id1, doc: r1 }],
    [id2, { id: id2, doc: r2 }],
  ]);
  return { plan, map };
}

describe("summarizeQuantities", () => {
  it("sums numeric quantities", () => {
    expect(summarizeQuantities(["200", "300"])).toBe("500");
    expect(summarizeQuantities(["1", "1", "1"])).toBe("3");
  });
  it("sums decimals and comma decimals", () => {
    expect(summarizeQuantities(["1", "1.5"])).toBe("2.5");
    expect(summarizeQuantities(["1,5", "1"])).toBe("2.5");
    expect(summarizeQuantities(["1.5", "1.5"])).toBe("3");
  });
  it("joins non-numeric and mixed quantities", () => {
    expect(summarizeQuantities(["pinch", "handful"])).toBe("pinch, handful");
    expect(summarizeQuantities(["some", "some"])).toBe("some");
    expect(summarizeQuantities(["200", "some"])).toBe("200, some");
  });
  it("returns a dash for an empty list", () => {
    expect(summarizeQuantities([])).toBe("—");
  });
});

describe("scaledIngredientQuantity", () => {
  it("multiplies numeric quantities", () => {
    expect(scaledIngredientQuantity("200", 0.5)).toBe("100");
    expect(scaledIngredientQuantity("200", 2.5)).toBe("500");
    expect(scaledIngredientQuantity("1,5", 2 / 3)).toBe("1");
  });
  it("uses a ceil-scale prefix for non-numeric quantities", () => {
    expect(scaledIngredientQuantity("pinch", 0.5)).toBe("pinch");
    expect(scaledIngredientQuantity("pinch", 1.1)).toBe("2× pinch");
    expect(scaledIngredientQuantity("pinch", 2.5)).toBe("3× pinch");
  });
  it("keeps blank quantities blank", () => {
    expect(scaledIngredientQuantity("   ", 2)).toBe("");
  });
});

describe("scaleForAssignment", () => {
  const doc = recipe("R", [], 4);
  it("is 1 when no persons are set", () => {
    expect(scaleForAssignment(planWith([], null), { day: "m", recipeId: "id", recipeName: "R" }, doc)).toBe(1);
  });
  it("uses defaultPersons and the assignment override", () => {
    expect(scaleForAssignment(planWith([], 2), { day: "m", recipeId: "id", recipeName: "R" }, doc)).toBe(0.5);
    expect(
      scaleForAssignment(planWith([], 4), { day: "m", recipeId: "id", recipeName: "R", persons: 2 }, doc),
    ).toBe(0.5);
  });
  it("coerces zero servings to 1", () => {
    expect(
      scaleForAssignment(planWith([], 4), { day: "m", recipeId: "id", recipeName: "R" }, recipe("R", [], 0)),
    ).toBe(4);
  });
  it("falls back to 1 when persons or servings is non-finite", () => {
    expect(
      scaleForAssignment(planWith([], Number.NaN), { day: "m", recipeId: "id", recipeName: "R" }, doc),
    ).toBe(1);
    expect(
      scaleForAssignment(
        planWith([], 4),
        { day: "m", recipeId: "id", recipeName: "R", persons: Number.NaN },
        doc,
      ),
    ).toBe(1);
    expect(
      scaleForAssignment(
        planWith([], 4),
        { day: "m", recipeId: "id", recipeName: "R" },
        recipe("R", [], Number.NaN),
      ),
    ).toBe(4);
  });
});

describe("buildAggregatedShoppingItems", () => {
  function find(items: { name: string }[], name: string) {
    return items.filter((i) => i.name.toLowerCase() === name);
  }

  it("merges g and kg for the same ingredient", () => {
    const { plan, map } = twoRecipePlan(
      recipe("A", [{ name: "flour", quantity: "200", unit: "g" }]),
      recipe("B", [{ name: "flour", quantity: "0.5", unit: "kg" }]),
    );
    const [flour] = find(buildAggregatedShoppingItems(plan, map), "flour");
    expect(flour).toMatchObject({ quantity: "700", unit: "g" });
  });

  it("merges dl and l into l", () => {
    const { plan, map } = twoRecipePlan(
      recipe("A", [{ name: "milk", quantity: "2", unit: "dl" }]),
      recipe("B", [{ name: "milk", quantity: "1", unit: "l" }]),
    );
    const [milk] = find(buildAggregatedShoppingItems(plan, map), "milk");
    expect(milk).toMatchObject({ quantity: "1.2", unit: "l" });
  });

  it("merges tsp and tbsp (and Norwegian ts/ss) into ml", () => {
    const { plan, map } = twoRecipePlan(
      recipe("A", [{ name: "vanilla", quantity: "1", unit: "tsp" }]),
      recipe("B", [{ name: "vanilla", quantity: "1", unit: "tbsp" }]),
    );
    const [vanilla] = find(buildAggregatedShoppingItems(plan, map), "vanilla");
    expect(vanilla).toMatchObject({ quantity: "20", unit: "ml" });
  });

  it("does not split a family into a NaN row when persons is non-finite", () => {
    // A non-finite defaultPersons previously scaled "1 ts" to "NaN", turning it
    // non-numeric so it split off as a second "NaN ts" row instead of merging.
    const { plan, map } = twoRecipePlan(
      recipe("A", [{ name: "pepper", quantity: "2.5", unit: "ml" }]),
      recipe("B", [{ name: "pepper", quantity: "1", unit: "ts" }]),
    );
    plan.defaultPersons = Number.NaN;
    const pepper = find(buildAggregatedShoppingItems(plan, map), "pepper");
    expect(pepper).toHaveLength(1);
    expect(pepper[0]).toMatchObject({ quantity: "7.5", unit: "ml" });
  });

  it("keeps an unknown unit separate from a weight unit", () => {
    const { plan, map } = twoRecipePlan(
      recipe("A", [{ name: "basil", quantity: "100", unit: "g" }]),
      recipe("B", [{ name: "basil", quantity: "1", unit: "handful" }]),
    );
    expect(find(buildAggregatedShoppingItems(plan, map), "basil")).toHaveLength(2);
  });

  it("skips assignments whose recipe is missing", () => {
    const plan = planWith([{ day: "monday", recipeId: "missing", recipeName: "X" }]);
    expect(buildAggregatedShoppingItems(plan, new Map())).toEqual([]);
  });
});
