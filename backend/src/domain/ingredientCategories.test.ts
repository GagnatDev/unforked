import { describe, expect, it } from "vitest";
import { TEST_RECIPES } from "../seed/seedData.js";
import {
  SHOPPING_CATEGORIES,
  categorizeIngredient,
  normalizeIngredientName,
} from "./ingredientCategories.js";
import type { ShoppingCategory } from "./types.js";

describe("normalizeIngredientName", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientName("  Cherry Tomatoes ")).toBe("cherry tomatoes");
  });
});

describe("categorizeIngredient", () => {
  it("matches English keywords", () => {
    expect(categorizeIngredient("chicken breast")).toBe("meat");
    expect(categorizeIngredient("salmon fillets")).toBe("fish");
    expect(categorizeIngredient("grated cheese")).toBe("dairy");
    expect(categorizeIngredient("cucumber")).toBe("produce");
    expect(categorizeIngredient("bread slices")).toBe("bakery");
    expect(categorizeIngredient("toilet paper")).toBe("household");
  });

  it("matches Norwegian keywords", () => {
    expect(categorizeIngredient("Kyllingfilet")).toBe("meat");
    expect(categorizeIngredient("laks")).toBe("fish");
    expect(categorizeIngredient("melk")).toBe("dairy");
    expect(categorizeIngredient("gulrøtter")).toBe("produce");
    expect(categorizeIngredient("grovbrød")).toBe("bakery");
    expect(categorizeIngredient("tørkerull")).toBe("household");
    expect(categorizeIngredient("kaffe")).toBe("beverages");
  });

  it("matches plural and compound word forms", () => {
    expect(categorizeIngredient("cherry tomatoes")).toBe("produce");
    expect(categorizeIngredient("tomater")).toBe("produce");
    expect(categorizeIngredient("eggs")).toBe("dairy");
    expect(categorizeIngredient("parmesanost")).toBe("dairy");
    expect(categorizeIngredient("long-grain rice")).toBe("pantry");
  });

  it("lets the longest keyword win over generic parts", () => {
    expect(categorizeIngredient("coconut milk")).toBe("pantry");
    expect(categorizeIngredient("peanut butter")).toBe("pantry");
    expect(categorizeIngredient("frozen peas")).toBe("frozen");
    expect(categorizeIngredient("tinned tomatoes")).toBe("pantry");
    expect(categorizeIngredient("tomato paste")).toBe("pantry");
    expect(categorizeIngredient("soy sauce")).toBe("pantry");
    expect(categorizeIngredient("bell pepper")).toBe("produce");
  });

  it("keeps short keywords on word boundaries", () => {
    // "te" (tea) must not fire inside other words.
    expect(categorizeIngredient("te")).toBe("beverages");
    expect(categorizeIngredient("tomatoes")).toBe("produce");
    expect(categorizeIngredient("terninger av squash")).toBe("produce");
    // "egg" must not fire in "eggplant" via a non-plural continuation.
    expect(categorizeIngredient("eggplant")).toBe("other");
    // "ris" must not fire inside "risotto".
    expect(categorizeIngredient("risotto")).toBe("other");
  });

  it("falls back to other for unknown ingredients", () => {
    expect(categorizeIngredient("tannkrem")).toBe("other");
    expect(categorizeIngredient("")).toBe("other");
  });

  it("prefers a family override over keywords", () => {
    const overrides = new Map<string, ShoppingCategory>([["melk", "beverages"]]);
    expect(categorizeIngredient("Melk", overrides)).toBe("beverages");
    expect(categorizeIngredient("melk")).toBe("dairy");
  });

  it("categorizes every seed ingredient to a real category", () => {
    for (const recipe of TEST_RECIPES) {
      for (const ingredient of recipe.ingredients) {
        const category = categorizeIngredient(ingredient.name);
        expect(SHOPPING_CATEGORIES).toContain(category);
        expect(category, `"${ingredient.name}" fell back to other`).not.toBe("other");
      }
    }
  });
});
