import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, setupAdmin } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";
import { RecipeRepository } from "../storage/recipeRepository.js";
import { TEST_RECIPES, seedTestRecipesIfEmpty } from "./seedData.js";

useCleanDb();
const app = buildTestApp();

describe("seedTestRecipesIfEmpty", () => {
  beforeEach(async () => {
    // Creating the first admin also creates the family the seed targets.
    await setupAdmin(app);
  });

  it("inserts the full set of test recipes when the table is empty", async () => {
    await seedTestRecipesIfEmpty(testDb());
    const count = await new RecipeRepository(testDb()).count();
    expect(count).toBe(TEST_RECIPES.length);
  });

  it("is a no-op when recipes already exist", async () => {
    await seedTestRecipesIfEmpty(testDb());
    await seedTestRecipesIfEmpty(testDb());
    const count = await new RecipeRepository(testDb()).count();
    expect(count).toBe(TEST_RECIPES.length);
  });

  it("does nothing when there is no family", async () => {
    // Fresh DB with no family (reset ran in beforeEach via useCleanDb, but the
    // admin setup created one) — exercise the no-family guard directly.
    await testDb().deleteFrom("users").execute();
    await testDb().deleteFrom("families").execute();
    await seedTestRecipesIfEmpty(testDb());
    const count = await new RecipeRepository(testDb()).count();
    expect(count).toBe(0);
  });
});

describe("test recipe data", () => {
  it("is well-formed", () => {
    expect(TEST_RECIPES.length).toBeGreaterThanOrEqual(20);
    for (const recipe of TEST_RECIPES) {
      expect(recipe.name).toBeTruthy();
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
    }
  });
});
