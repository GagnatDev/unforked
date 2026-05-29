import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { RecipeDoc } from "../domain/types.js";
import { buildTestApp, setupAdminToken, withAuth } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

const week = "2026-W10";
let token: string;
beforeEach(async () => {
  token = await setupAdminToken(app);
});

async function createRecipe(doc: Partial<RecipeDoc>): Promise<string> {
  const res = await withAuth(request(app).post("/api/recipes"), token).send(doc);
  return res.body.id as string;
}

async function setPlan(assignments: unknown[]): Promise<void> {
  await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send({
    weekIdentifier: week,
    assignments,
  });
}

describe("GET /api/shopping-lists", () => {
  it("returns an empty list when there is no meal plan", async () => {
    const res = await withAuth(request(app).get(`/api/shopping-lists?week=${week}`), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weekIdentifier: week, items: [] });
  });

  it("aggregates ingredients across the week's recipes", async () => {
    const id1 = await createRecipe({
      name: "A",
      ingredients: [{ name: "flour", quantity: "200", unit: "g" }],
      servings: 4,
    });
    const id2 = await createRecipe({
      name: "B",
      ingredients: [{ name: "flour", quantity: "0.5", unit: "kg" }],
      servings: 4,
    });
    await setPlan([
      { day: "monday", recipeId: id1, recipeName: "A" },
      { day: "tuesday", recipeId: id2, recipeName: "B" },
    ]);

    const res = await withAuth(request(app).get(`/api/shopping-lists?week=${week}`), token);
    expect(res.status).toBe(200);
    const flour = res.body.items.find((i: { name: string }) => i.name.toLowerCase() === "flour");
    expect(flour).toMatchObject({ quantity: "700", unit: "g" });
    expect(flour.recipeIds).toHaveLength(2);
  });

  it("scales quantities by persons / servings", async () => {
    const id = await createRecipe({
      name: "Scaled",
      ingredients: [{ name: "rice", quantity: "200", unit: "g" }],
      servings: 4,
    });
    // 2 persons / 4 servings = 0.5 → 100 g
    await setPlan([{ day: "monday", recipeId: id, recipeName: "Scaled", persons: 2 }]);

    const res = await withAuth(request(app).get(`/api/shopping-lists?week=${week}`), token);
    const rice = res.body.items.find((i: { name: string }) => i.name.toLowerCase() === "rice");
    expect(rice).toMatchObject({ quantity: "100", unit: "g" });
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/shopping-lists");
    expect(res.status).toBe(401);
  });
});
