import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { RecipeDoc, ShoppingListEntry } from "../domain/types.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

const week = "2026-W10";
const otherWeek = "2026-W11";
let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

async function createRecipe(doc: Partial<RecipeDoc>): Promise<string> {
  const res = await withAuth(request(app).post("/api/recipes"), token).send(doc);
  return res.body.id as string;
}

async function setPlan(assignments: unknown[], weekId = week): Promise<void> {
  await withAuth(request(app).put(`/api/meal-plans/current?week=${weekId}`), token).send({
    weekIdentifier: weekId,
    assignments,
  });
}

async function getList(weekId = week, identity = token): Promise<request.Response> {
  return withAuth(request(app).get(`/api/shopping-lists?week=${weekId}`), identity);
}

function findItem(res: request.Response, name: string): ShoppingListEntry {
  const item = (res.body.items as ShoppingListEntry[]).find(
    (i) => i.name.toLowerCase() === name.toLowerCase(),
  );
  expect(item, `item "${name}" missing from list`).toBeDefined();
  return item!;
}

describe("GET /api/shopping-lists", () => {
  it("returns an empty list when there is no meal plan", async () => {
    const res = await getList();
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

    const res = await getList();
    expect(res.status).toBe(200);
    const flour = findItem(res, "flour");
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

    const res = await getList();
    const rice = findItem(res, "rice");
    expect(rice).toMatchObject({ quantity: "100", unit: "g" });
  });

  it("returns persisted entries with stable ids and auto-assigned categories", async () => {
    const id = await createRecipe({
      name: "Stir-fry",
      ingredients: [{ name: "chicken breast", quantity: "400", unit: "g" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "Stir-fry" }]);

    const first = await getList();
    const chicken = findItem(first, "chicken breast");
    expect(chicken).toMatchObject({ category: "meat", checked: false, manual: false });
    expect(chicken.id).toBeTypeOf("string");

    const second = await getList();
    expect(findItem(second, "chicken breast").id).toBe(chicken.id);
  });

  it("keeps id and checked state when a plan edit changes quantities", async () => {
    const id = await createRecipe({
      name: "Bolognese",
      ingredients: [{ name: "minced beef", quantity: "500", unit: "g" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "Bolognese" }]);
    const beef = findItem(await getList(), "minced beef");
    await withAuth(request(app).patch(`/api/shopping-lists/items/${beef.id}?week=${week}`), token)
      .send({ checked: true })
      .expect(200);

    // Second assignment doubles the quantity and flips the display unit to kg.
    await setPlan([
      { day: "monday", recipeId: id, recipeName: "Bolognese" },
      { day: "tuesday", recipeId: id, recipeName: "Bolognese" },
    ]);

    const updated = findItem(await getList(), "minced beef");
    expect(updated).toMatchObject({ id: beef.id, checked: true, quantity: "1", unit: "kg" });
  });

  it("drops recipe items that leave the plan", async () => {
    const id = await createRecipe({
      name: "Soup",
      ingredients: [{ name: "carrot", quantity: "2", unit: "" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "Soup" }]);
    await getList();

    await setPlan([]);
    const res = await getList();
    expect(res.body.items).toEqual([]);
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/shopping-lists");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/shopping-lists/items/:id", () => {
  async function itemFromPlan(name = "milk"): Promise<ShoppingListEntry> {
    const id = await createRecipe({
      name: "R",
      ingredients: [{ name, quantity: "1", unit: "l" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "R" }]);
    return findItem(await getList(), name);
  }

  it("persists check-off across GETs", async () => {
    const milk = await itemFromPlan();
    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${milk.id}?week=${week}`),
      token,
    ).send({ checked: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: milk.id, checked: true });

    expect(findItem(await getList(), "milk").checked).toBe(true);
  });

  it("remembers a category override for other weeks' lists", async () => {
    const milk = await itemFromPlan();
    expect(milk.category).toBe("dairy");
    await withAuth(request(app).patch(`/api/shopping-lists/items/${milk.id}?week=${week}`), token)
      .send({ category: "beverages" })
      .expect(200);

    expect(findItem(await getList(), "milk").category).toBe("beverages");

    // A different week's list picks up the family override on first build.
    const id = await createRecipe({
      name: "R2",
      ingredients: [{ name: "milk", quantity: "2", unit: "l" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "R2" }], otherWeek);
    expect(findItem(await getList(otherWeek), "milk").category).toBe("beverages");
  });

  it("lets two family members check off different items concurrently", async () => {
    const recipeId = await createRecipe({
      name: "Dinner",
      ingredients: [
        { name: "salmon", quantity: "400", unit: "g" },
        { name: "potatoes", quantity: "800", unit: "g" },
      ],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId, recipeName: "Dinner" }]);
    const list = await getList();
    const salmon = findItem(list, "salmon");
    const potatoes = findItem(list, "potatoes");

    // Second member joins the family via the invite flow.
    const partner: TestIdentity = { id: "hs-partner", email: "partner@example.com", role: "user" };
    await setupAdmin(app, partner);
    const invite = await withAuth(request(app).post("/api/family/invites"), token).send({
      email: partner.email,
    });
    await withAuth(request(app).post("/api/family/invites/accept"), partner)
      .send({ token: invite.body.token })
      .expect(200);

    const [a, b] = await Promise.all([
      withAuth(
        request(app).patch(`/api/shopping-lists/items/${salmon.id}?week=${week}`),
        token,
      ).send({ checked: true }),
      withAuth(
        request(app).patch(`/api/shopping-lists/items/${potatoes.id}?week=${week}`),
        partner,
      ).send({ checked: true }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const after = await getList();
    expect(findItem(after, "salmon").checked).toBe(true);
    expect(findItem(after, "potatoes").checked).toBe(true);
  });

  it("404s for an unknown item id", async () => {
    await itemFromPlan();
    const res = await withAuth(
      request(app).patch(
        `/api/shopping-lists/items/00000000-0000-4000-8000-000000000000?week=${week}`,
      ),
      token,
    ).send({ checked: true });
    expect(res.status).toBe(404);
  });

  it("400s on an empty body", async () => {
    const milk = await itemFromPlan();
    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${milk.id}?week=${week}`),
      token,
    ).send({});
    expect(res.status).toBe(400);
  });

  it("edits name, quantity and unit of a manual item", async () => {
    const created = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "Kaffe" });

    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${created.body.id}?week=${week}`),
      token,
    ).send({ name: "Filterkaffe", quantity: "2", unit: "poser" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Filterkaffe", quantity: "2", unit: "poser" });

    const stored = findItem(await getList(), "Filterkaffe");
    expect(stored).toMatchObject({ id: created.body.id, quantity: "2", unit: "poser" });
  });

  it("rejects editing name/quantity/unit on a recipe-derived item", async () => {
    const milk = await itemFromPlan();
    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${milk.id}?week=${week}`),
      token,
    ).send({ name: "Skummet melk" });
    expect(res.status).toBe(400);

    // The recipe item is untouched.
    expect(findItem(await getList(), "milk").name.toLowerCase()).toBe("milk");
  });

  it("still lets a recipe item change category", async () => {
    const milk = await itemFromPlan();
    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${milk.id}?week=${week}`),
      token,
    ).send({ category: "beverages" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ category: "beverages" });
  });

  it("400s when editing a manual item to a blank name", async () => {
    const created = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "Kaffe" });
    const res = await withAuth(
      request(app).patch(`/api/shopping-lists/items/${created.body.id}?week=${week}`),
      token,
    ).send({ name: "   " });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/shopping-lists/items", () => {
  it("adds a manual item that survives plan changes", async () => {
    const id = await createRecipe({
      name: "R",
      ingredients: [{ name: "bread", quantity: "1", unit: "" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "R" }]);
    await getList();

    const created = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "Kaffe" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Kaffe",
      category: "beverages",
      manual: true,
      checked: false,
      recipeIds: [],
    });

    // Plan emptied: recipe items go, the manual item stays.
    await setPlan([]);
    const res = await getList();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: created.body.id, name: "Kaffe" });
  });

  it("creates the week's list on the fly when none exists yet", async () => {
    const created = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "Kaffe" });
    expect(created.status).toBe(201);

    const res = await getList();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: "Kaffe", manual: true });
  });

  it("400s on a blank name", async () => {
    const res = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "   " });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/shopping-lists/items/:id", () => {
  it("deletes manual items but rejects recipe items", async () => {
    const id = await createRecipe({
      name: "R",
      ingredients: [{ name: "bread", quantity: "1", unit: "" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "R" }]);
    const bread = findItem(await getList(), "bread");
    const manual = await withAuth(
      request(app).post(`/api/shopping-lists/items?week=${week}`),
      token,
    ).send({ name: "Kaffe" });

    await withAuth(
      request(app).delete(`/api/shopping-lists/items/${manual.body.id}?week=${week}`),
      token,
    ).expect(204);
    await withAuth(
      request(app).delete(`/api/shopping-lists/items/${bread.id}?week=${week}`),
      token,
    ).expect(400);

    const res = await getList();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name.toLowerCase()).toBe("bread");
  });

  it("404s for an unknown item id", async () => {
    const id = await createRecipe({
      name: "R",
      ingredients: [{ name: "bread", quantity: "1", unit: "" }],
      servings: 4,
    });
    await setPlan([{ day: "monday", recipeId: id, recipeName: "R" }]);
    await getList();
    const res = await withAuth(
      request(app).delete(
        `/api/shopping-lists/items/00000000-0000-4000-8000-000000000000?week=${week}`,
      ),
      token,
    );
    expect(res.status).toBe(404);
  });
});
