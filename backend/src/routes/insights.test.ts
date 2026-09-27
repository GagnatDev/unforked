import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { ShoppingListEntry } from "../domain/types.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

async function createRecipe(name: string): Promise<string> {
  const res = await withAuth(request(app).post("/api/recipes"), token).send({
    name,
    ingredients: [{ name: "onion", quantity: "1", unit: "" }],
    servings: 4,
  });
  return res.body.id as string;
}

async function setPlan(weekId: string, assignments: unknown[]): Promise<void> {
  await withAuth(request(app).put(`/api/meal-plans/current?week=${weekId}`), token)
    .send({ weekIdentifier: weekId, assignments })
    .expect(200);
}

/** Add one manual item, tick it and press "Shopping done" for the week. */
async function shop(weekId: string, body: { totalCost?: number; completedAt?: string } = {}) {
  const added = await withAuth(request(app).post(`/api/shopping-lists/items?week=${weekId}`), token)
    .send({ name: "Coffee" })
    .expect(201);
  const item = added.body as ShoppingListEntry;
  await withAuth(request(app).patch(`/api/shopping-lists/items/${item.id}?week=${weekId}`), token)
    .send({ checked: true })
    .expect(200);
  const done = await withAuth(request(app).post(`/api/shopping-lists/trips?week=${weekId}`), token)
    .send(body)
    .expect(201);
  return done.body.trips.at(-1) as { id: string; completedAt: string };
}

function getInsights(query = "", identity = token): Promise<request.Response> {
  return withAuth(request(app).get(`/api/insights${query}`), identity);
}

describe("GET /api/insights", () => {
  it("returns the family's meals and trips per week, oldest first, with what each trip cost", async () => {
    const tacos = await createRecipe("Tacos");
    const soup = await createRecipe("Soup");
    await setPlan("2026-W10", [
      { day: "monday", recipeId: tacos, recipeName: "Tacos", persons: 3 },
      { day: "friday", recipeId: soup, recipeName: "Soup" },
    ]);
    await setPlan("2026-W09", [{ day: "sunday", recipeId: soup, recipeName: "Soup" }]);
    const paid = await shop("2026-W10", {
      totalCost: 1249.9,
      completedAt: "2026-03-01T15:04:00.000Z",
    });
    const skipped = await shop("2026-W10");
    // A week with a plan but no trips still shows its meals; W11 has neither.
    await withAuth(request(app).get(`/api/shopping-lists?week=2026-W11`), token).expect(200);

    const res = await getInsights("?from=2026-W09&to=2026-W12");
    expect(res.status).toBe(200);
    expect(res.body.from).toBe("2026-W09");
    expect(res.body.to).toBe("2026-W12");
    expect(res.body.weeks.map((w: { weekId: string }) => w.weekId)).toEqual(["2026-W09", "2026-W10"]);

    const w10 = res.body.weeks[1];
    expect(w10.meals).toEqual([
      { day: "monday", recipeId: tacos, recipeName: "Tacos", persons: 3 },
      { day: "friday", recipeId: soup, recipeName: "Soup" },
    ]);
    expect(w10.trips).toEqual([
      {
        id: paid.id,
        completedAt: "2026-03-01T15:04:00.000Z",
        completedByEmail: token.email,
        itemCount: 1,
        totalCost: 1249.9,
      },
      {
        id: skipped.id,
        completedAt: skipped.completedAt,
        completedByEmail: token.email,
        itemCount: 1,
      },
    ]);
    // Only the summary travels: never the archived items themselves.
    expect(w10.trips[0]).not.toHaveProperty("items");
  });

  it("stays inside the requested range and defaults to the past year", async () => {
    const soup = await createRecipe("Soup");
    await setPlan("2020-W05", [{ day: "monday", recipeId: soup, recipeName: "Soup" }]);
    const thisWeek = currentWeekIdentifier();
    await setPlan(thisWeek, [{ day: "monday", recipeId: soup, recipeName: "Soup" }]);

    const ranged = await getInsights("?from=2020-W01&to=2020-W10");
    expect(ranged.body.weeks.map((w: { weekId: string }) => w.weekId)).toEqual(["2020-W05"]);

    const defaulted = await getInsights();
    expect(defaulted.status).toBe(200);
    expect(defaulted.body.to).toBe(thisWeek);
    expect(defaulted.body.weeks.map((w: { weekId: string }) => w.weekId)).toEqual([thisWeek]);
  });

  it("rejects malformed, inverted and over-long ranges", async () => {
    expect((await getInsights("?from=2026-03-01")).status).toBe(400);
    expect((await getInsights("?from=2026-W10&to=2026-W09")).status).toBe(400);
    expect((await getInsights("?from=2020-W01&to=2026-W01")).status).toBe(400);
    expect((await getInsights("?from=2025-W01&to=2026-W52")).status).toBe(200);
  });

  it("is scoped to the caller's family", async () => {
    const soup = await createRecipe("Soup");
    await setPlan("2026-W10", [{ day: "monday", recipeId: soup, recipeName: "Soup" }]);
    await shop("2026-W10", { totalCost: 500 });
    const stranger = await setupAdmin(app, {
      id: "hs-stranger",
      email: "stranger@example.com",
      role: "user",
    });

    const res = await getInsights("?from=2026-W09&to=2026-W12", stranger);
    expect(res.status).toBe(200);
    expect(res.body.weeks).toEqual([]);
  });
});
