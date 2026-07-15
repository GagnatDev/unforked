import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";
import type { RecipeDoc } from "../domain/types.js";

useCleanDb();
const app = buildTestApp();

let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

function sampleRecipe(overrides: Partial<RecipeDoc> = {}): Partial<RecipeDoc> {
  return {
    name: "Pancakes",
    ingredients: [{ name: "flour", quantity: "200", unit: "g" }],
    steps: ["Mix", "Fry"],
    servings: 2,
    tags: ["breakfast"],
    ...overrides,
  };
}

async function createRecipe(
  doc: Partial<RecipeDoc>,
): Promise<{ id: string; doc: RecipeDoc; version: number }> {
  const res = await withAuth(request(app).post("/api/recipes"), token).send(doc);
  return res.body;
}

describe("recipe CRUD", () => {
  it("creates a recipe and applies RecipeDoc defaults", async () => {
    const res = await withAuth(request(app).post("/api/recipes"), token).send({ name: "Minimal" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body.doc).toMatchObject({
      name: "Minimal",
      description: "",
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    });
  });

  it("fetches a recipe by id", async () => {
    const created = await createRecipe(sampleRecipe());
    const res = await withAuth(request(app).get(`/api/recipes/${created.id}`), token);
    expect(res.status).toBe(200);
    expect(res.body.doc.name).toBe("Pancakes");
  });

  it("updates a recipe", async () => {
    const created = await createRecipe(sampleRecipe());
    const res = await withAuth(request(app).put(`/api/recipes/${created.id}`), token).send(
      sampleRecipe({ name: "Waffles" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.doc.name).toBe("Waffles");

    const get = await withAuth(request(app).get(`/api/recipes/${created.id}`), token);
    expect(get.body.doc.name).toBe("Waffles");
  });

  it("deletes a recipe", async () => {
    const created = await createRecipe(sampleRecipe());
    const del = await withAuth(request(app).delete(`/api/recipes/${created.id}`), token);
    expect(del.status).toBe(204);
    const get = await withAuth(request(app).get(`/api/recipes/${created.id}`), token);
    expect(get.status).toBe(404);
  });
});

describe("client-provided recipe id (offline-first create)", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";

  it("creates a recipe with a client-minted id", async () => {
    const res = await withAuth(request(app).post("/api/recipes"), token).send(
      sampleRecipe({ id: clientId } as Partial<RecipeDoc>),
    );
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(clientId);
    // The id is not persisted into the stored doc.
    expect(res.body.doc.id).toBeUndefined();

    const get = await withAuth(request(app).get(`/api/recipes/${clientId}`), token);
    expect(get.status).toBe(200);
    expect(get.body.doc.name).toBe("Pancakes");
  });

  it("is idempotent: replaying the same create keeps the original row", async () => {
    const first = await withAuth(request(app).post("/api/recipes"), token).send(
      sampleRecipe({ id: clientId, name: "Original" } as Partial<RecipeDoc>),
    );
    expect(first.status).toBe(201);

    // A replayed create (same id, different doc) must not overwrite.
    const replay = await withAuth(request(app).post("/api/recipes"), token).send(
      sampleRecipe({ id: clientId, name: "Replayed" } as Partial<RecipeDoc>),
    );
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(clientId);

    const get = await withAuth(request(app).get(`/api/recipes/${clientId}`), token);
    expect(get.body.doc.name).toBe("Original");
  });

  it("400s a malformed client id", async () => {
    const res = await withAuth(request(app).post("/api/recipes"), token).send(
      sampleRecipe({ id: "not-a-uuid" } as Partial<RecipeDoc>),
    );
    expect(res.status).toBe(400);
  });
});

describe("optimistic concurrency (baseVersion / 409)", () => {
  it("exposes a version on create, get and list", async () => {
    const created = await createRecipe(sampleRecipe());
    expect(created.version).toBe(0);
    const get = await withAuth(request(app).get(`/api/recipes/${created.id}`), token);
    expect(get.body.version).toBe(0);
    const list = await withAuth(request(app).get("/api/recipes"), token);
    expect(list.body[0].version).toBe(0);
  });

  it("bumps the version on a matching update", async () => {
    const created = await createRecipe(sampleRecipe());
    const res = await withAuth(request(app).put(`/api/recipes/${created.id}`), token).send(
      sampleRecipe({ name: "Waffles", baseVersion: 0 } as Partial<RecipeDoc>),
    );
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
  });

  it("rejects a stale update with 409 and the current server doc", async () => {
    const created = await createRecipe(sampleRecipe());
    // First writer advances the version to 1.
    await withAuth(request(app).put(`/api/recipes/${created.id}`), token)
      .send(sampleRecipe({ name: "Waffles", baseVersion: 0 } as Partial<RecipeDoc>))
      .expect(200);

    // Second writer still thinks the base is 0 → conflict.
    const stale = await withAuth(request(app).put(`/api/recipes/${created.id}`), token).send(
      sampleRecipe({ name: "Crepes", baseVersion: 0 } as Partial<RecipeDoc>),
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "conflict", id: created.id, version: 1 });
    expect(stale.body.doc.name).toBe("Waffles");
  });

  it("still updates unconditionally when no baseVersion is sent (legacy client)", async () => {
    const created = await createRecipe(sampleRecipe());
    await withAuth(request(app).put(`/api/recipes/${created.id}`), token)
      .send(sampleRecipe({ name: "Waffles", baseVersion: 0 } as Partial<RecipeDoc>))
      .expect(200);
    const res = await withAuth(request(app).put(`/api/recipes/${created.id}`), token).send(
      sampleRecipe({ name: "Pancakes" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
  });
});

describe("recipe listing & filters", () => {
  beforeEach(async () => {
    await createRecipe(sampleRecipe({ name: "Apple Pie", tags: ["dessert"] }));
    await createRecipe(sampleRecipe({ name: "Banana Bread", tags: ["breakfast", "baking"] }));
  });

  it("lists recipes ordered by name", async () => {
    const res = await withAuth(request(app).get("/api/recipes"), token);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { doc: RecipeDoc }) => r.doc.name)).toEqual(["Apple Pie", "Banana Bread"]);
  });

  it("filters by name (ILIKE)", async () => {
    const res = await withAuth(request(app).get("/api/recipes?name=banana"), token);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].doc.name).toBe("Banana Bread");
  });

  it("filters by tag (jsonb containment)", async () => {
    const res = await withAuth(request(app).get("/api/recipes?tag=dessert"), token);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].doc.name).toBe("Apple Pie");
  });
});

describe("GET /api/recipes/tags", () => {
  beforeEach(async () => {
    await createRecipe(sampleRecipe({ name: "A", tags: ["baking", "breakfast"] }));
    await createRecipe(sampleRecipe({ name: "B", tags: ["barbecue"] }));
  });

  it("suggests distinct tags by prefix", async () => {
    const res = await withAuth(request(app).get("/api/recipes/tags?q=ba"), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(["baking", "barbecue"]);
  });

  it("returns [] for a blank query", async () => {
    const res = await withAuth(request(app).get("/api/recipes/tags?q="), token);
    expect(res.body).toEqual([]);
  });
});

describe("recipe error cases", () => {
  it("404s an unknown recipe", async () => {
    const res = await withAuth(
      request(app).get("/api/recipes/00000000-0000-4000-8000-000000000abc"),
      token,
    );
    expect(res.status).toBe(404);
  });

  it("400s a malformed UUID", async () => {
    const res = await withAuth(request(app).get("/api/recipes/not-a-uuid"), token);
    expect(res.status).toBe(400);
  });

  it("400s a recipe with no name", async () => {
    const res = await withAuth(request(app).post("/api/recipes"), token).send({ description: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/);
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/recipes");
    expect(res.status).toBe(401);
  });
});
