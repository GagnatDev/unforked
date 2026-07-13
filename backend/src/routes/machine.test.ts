import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildMachineApp } from "../machineApp.js";
import { currentWeekIdentifier, nextWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";

useCleanDb();

// The human app provisions users/data; the machine app under test shares its db.
const humanApp = buildTestApp();
const machineApp = buildMachineApp({ db: testDb() });

let token: TestIdentity;
let apiKey: string;

beforeEach(async () => {
  token = await setupAdmin(humanApp);
  const res = await withAuth(request(humanApp).post("/api/api-keys"), token).send({
    name: "Aivo",
  });
  apiKey = res.body.key;
});

function machineGet(path: string, key: string = apiKey) {
  return request(machineApp).get(path).set("Authorization", `Bearer ${key}`);
}

async function createWriteKey(identity: TestIdentity = token): Promise<string> {
  const res = await withAuth(request(humanApp).post("/api/api-keys"), identity).send({
    name: "Aivo rw",
    scopes: ["write"],
  });
  expect(res.status).toBe(201);
  return res.body.key as string;
}

function machinePost(path: string, body: object, key: string = apiKey) {
  return request(machineApp).post(path).set("Authorization", `Bearer ${key}`).send(body);
}

async function createRecipe(identity: TestIdentity, doc: Record<string, unknown>) {
  const res = await withAuth(request(humanApp).post("/api/recipes"), identity).send(doc);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("machine API auth", () => {
  it("401s without a key", async () => {
    const res = await request(machineApp).get("/machine/v1/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  it("401s with an unknown key — same body as every other failure (no oracle)", async () => {
    const res = await machineGet("/machine/v1/me", "ufk_definitely-not-a-real-key");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  it("rejects requests carrying only X-Homectl-* identity headers (impersonation regression)", async () => {
    // The machine listener must never trust the human API's identity headers:
    // an in-cluster caller presenting them without a valid key gets a uniform 401.
    const res = await request(machineApp)
      .get("/machine/v1/me")
      .set("X-Homectl-User", token.id)
      .set("X-Homectl-Email", token.email)
      .set("X-Homectl-Role", "admin");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  it("revocation takes effect on the next request", async () => {
    const list = await withAuth(request(humanApp).get("/api/api-keys"), token);
    const keyId = list.body[0].id;

    expect((await machineGet("/machine/v1/me")).status).toBe(200);
    await withAuth(request(humanApp).delete(`/api/api-keys/${keyId}`), token).expect(204);
    const res = await machineGet("/machine/v1/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid API key" });
  });

  it("does not serve the human API routes (S2: no route exists on both listeners)", async () => {
    const res = await machineGet("/api/recipes");
    expect(res.status).toBe(404);
  });

  it("tracks last_used_at on successful auth (S6)", async () => {
    await machineGet("/machine/v1/me").expect(200);
    const list = await withAuth(request(humanApp).get("/api/api-keys"), token);
    expect(list.body[0].lastUsedAt).not.toBeNull();
  });
});

describe("GET /machine/v1/meal-plans/:week", () => {
  it("resolves recipe details inline and accepts the current alias", async () => {
    const recipeId = await createRecipe(token, {
      name: "Kikertsalat",
      tags: ["vegetar"],
      ingredients: [{ name: "kikerter", quantity: "1", unit: "boks" }],
    });
    const week = currentWeekIdentifier();
    await withAuth(request(humanApp).put(`/api/meal-plans/current?week=${week}`), token).send({
      weekIdentifier: week,
      assignments: [{ day: "MONDAY", recipeId, recipeName: "Kikertsalat", persons: 4 }],
    });

    const res = await machineGet("/machine/v1/meal-plans/current");
    expect(res.status).toBe(200);
    expect(res.body.weekIdentifier).toBe(week);
    expect(res.body.assignments).toEqual([
      {
        day: "MONDAY",
        persons: 4,
        recipe: { id: recipeId, name: "Kikertsalat", tags: ["vegetar"] },
      },
    ]);
  });

  it("resolves the next alias to the following ISO week", async () => {
    const res = await machineGet("/machine/v1/meal-plans/next");
    expect(res.status).toBe(200);
    expect(res.body.weekIdentifier).toBe(nextWeekIdentifier());
    expect(res.body.assignments).toEqual([]);
  });

  it("accepts a literal YYYY-Wnn week and 400s anything else", async () => {
    expect((await machineGet("/machine/v1/meal-plans/2026-W29")).status).toBe(200);
    expect((await machineGet("/machine/v1/meal-plans/tomorrow")).status).toBe(400);
  });

  it("scopes to the key owner's family", async () => {
    const other = await setupAdmin(humanApp, { id: "hs-other", email: "other@example.com" });
    const otherRecipe = await createRecipe(other, { name: "Hemmelig suppe" });
    const week = currentWeekIdentifier();
    await withAuth(request(humanApp).put(`/api/meal-plans/current?week=${week}`), other).send({
      weekIdentifier: week,
      assignments: [{ day: "TUESDAY", recipeId: otherRecipe, recipeName: "Hemmelig suppe" }],
    });

    const res = await machineGet("/machine/v1/meal-plans/current");
    expect(res.body.assignments).toEqual([]);
  });
});

describe("GET /machine/v1/shopping-lists/:week", () => {
  it("returns the synced persisted list, preserving checked state", async () => {
    const recipeId = await createRecipe(token, {
      name: "Pasta",
      ingredients: [{ name: "spaghetti", quantity: "500", unit: "g" }],
    });
    const week = currentWeekIdentifier();
    await withAuth(request(humanApp).put(`/api/meal-plans/current?week=${week}`), token).send({
      weekIdentifier: week,
      assignments: [{ day: "MONDAY", recipeId, recipeName: "Pasta" }],
    });

    // The family checks an item off in the UI…
    const humanList = await withAuth(request(humanApp).get("/api/shopping-lists"), token);
    const itemId = humanList.body.items[0].id;
    await withAuth(
      request(humanApp).patch(`/api/shopping-lists/items/${itemId}`),
      token,
    ).send({ checked: true });

    // …and the machine API sees the same persisted state.
    const res = await machineGet("/machine/v1/shopping-lists/current");
    expect(res.status).toBe(200);
    expect(res.body.weekIdentifier).toBe(week);
    expect(res.body.items).toHaveLength(1);
    // The aggregate capitalizes display names ("spaghetti" → "Spaghetti").
    expect(res.body.items[0]).toMatchObject({ id: itemId, name: "Spaghetti", checked: true });
  });

  it("returns an empty list for a week without a plan", async () => {
    const res = await machineGet("/machine/v1/shopping-lists/next");
    expect(res.body).toEqual({ weekIdentifier: nextWeekIdentifier(), items: [] });
  });
});

describe("POST /machine/v1/shopping-lists/:week/items", () => {
  const items = { items: [{ name: "melk", quantity: "1", unit: "l" }] };

  it("403s for a read-only key, naming the missing scope (F4)", async () => {
    const res = await machinePost("/machine/v1/shopping-lists/current/items", items);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "This API key does not have the 'write' scope" });
  });

  it("adds items to the current week and the family sees them in the UI", async () => {
    const writeKey = await createWriteKey();
    const res = await machinePost("/machine/v1/shopping-lists/current/items", items, writeKey);
    expect(res.status).toBe(201);
    expect(res.body.weekIdentifier).toBe(currentWeekIdentifier());
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      name: "melk",
      quantity: "1",
      unit: "l",
      checked: false,
      manual: true,
      recipeIds: [],
    });
    expect(res.body.items[0].category).toBe("dairy");

    // The human API's synced read keeps the manual item.
    const humanList = await withAuth(request(humanApp).get("/api/shopping-lists"), token);
    expect(humanList.body.items).toHaveLength(1);
    expect(humanList.body.items[0].id).toBe(res.body.items[0].id);
  });

  it("batch-adds several items to next week's list, creating it on the fly", async () => {
    const writeKey = await createWriteKey();
    const res = await machinePost(
      "/machine/v1/shopping-lists/next/items",
      { items: [{ name: "batterier" }, { name: "tannkrem", quantity: "2", unit: "stk" }] },
      writeKey,
    );
    expect(res.status).toBe(201);
    expect(res.body.weekIdentifier).toBe(nextWeekIdentifier());
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
      "batterier",
      "tannkrem",
    ]);

    const read = await machineGet("/machine/v1/shopping-lists/next", writeKey);
    expect(read.body.items).toHaveLength(2);
  });

  it("respects an explicit category over auto-categorization", async () => {
    const writeKey = await createWriteKey();
    const res = await machinePost(
      "/machine/v1/shopping-lists/current/items",
      { items: [{ name: "melk", category: "beverages" }] },
      writeKey,
    );
    expect(res.status).toBe(201);
    expect(res.body.items[0].category).toBe("beverages");
  });

  it("400s on an empty items array, a blank name and a bad week", async () => {
    const writeKey = await createWriteKey();
    const empty = await machinePost(
      "/machine/v1/shopping-lists/current/items",
      { items: [] },
      writeKey,
    );
    expect(empty.status).toBe(400);
    const blank = await machinePost(
      "/machine/v1/shopping-lists/current/items",
      { items: [{ name: "  " }] },
      writeKey,
    );
    expect(blank.status).toBe(400);
    const badWeek = await machinePost("/machine/v1/shopping-lists/tomorrow/items", items, writeKey);
    expect(badWeek.status).toBe(400);
  });

  it("writes into the key owner's family only", async () => {
    const other = await setupAdmin(humanApp, { id: "hs-other", email: "other@example.com" });
    const otherWriteKey = await createWriteKey(other);
    await machinePost("/machine/v1/shopping-lists/current/items", items, otherWriteKey).expect(
      201,
    );

    // The first family's list is untouched.
    const res = await machineGet("/machine/v1/shopping-lists/current");
    expect(res.body.items).toEqual([]);
  });
});

describe("GET /machine/v1/recipes/compact", () => {
  it("returns the family's corpus with ingredient names only", async () => {
    const id = await createRecipe(token, {
      name: "Kyllinggryte",
      tags: ["middag"],
      ingredients: [
        { name: "kyllinglår", quantity: "6", unit: "stk" },
        { name: "purre", quantity: "1", unit: "" },
      ],
      steps: ["Brun kyllingen."],
    });
    const other = await setupAdmin(humanApp, { id: "hs-other", email: "other@example.com" });
    await createRecipe(other, { name: "Hemmelig suppe" });

    const res = await machineGet("/machine/v1/recipes/compact");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id, name: "Kyllinggryte", tags: ["middag"], ingredients: ["kyllinglår", "purre"] },
    ]);
  });
});

describe("GET /machine/v1/recipes/:id", () => {
  it("returns the full recipe in the human API's wire shape", async () => {
    const id = await createRecipe(token, {
      name: "Pannekaker",
      ingredients: [{ name: "mel", quantity: "3", unit: "dl" }],
      steps: ["Visp sammen.", "Stek."],
    });
    const res = await machineGet(`/machine/v1/recipes/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.doc.name).toBe("Pannekaker");
    expect(res.body.doc.steps).toHaveLength(2);
  });

  it("404s on another family's recipe", async () => {
    const other = await setupAdmin(humanApp, { id: "hs-other", email: "other@example.com" });
    const otherId = await createRecipe(other, { name: "Hemmelig suppe" });
    const res = await machineGet(`/machine/v1/recipes/${otherId}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /machine/v1/me", () => {
  it("echoes the key owner and key metadata for credential self-checks", async () => {
    const res = await machineGet("/machine/v1/me");
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(token.email);
    expect(res.body.familyId).toBeTruthy();
    expect(res.body.key.name).toBe("Aivo");
    expect(res.body.key.scopes).toEqual(["read"]);
    expect(res.body.key.expiresAt).toBeNull();
  });
});
