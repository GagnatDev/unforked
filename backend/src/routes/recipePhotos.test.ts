import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";
import { FakePhotoStorage } from "../test/photoStorage.js";
import type { RecipeDoc } from "../domain/types.js";

useCleanDb();

const MAX_BYTES = 1000;
let storage: FakePhotoStorage;
let app: ReturnType<typeof buildApp>;
let token: TestIdentity;

beforeEach(async () => {
  storage = new FakePhotoStorage();
  app = buildApp({ db: testDb(), photos: { storage, maxBytes: MAX_BYTES } });
  token = await setupAdmin(app);
});

async function createRecipe(name = "Pancakes"): Promise<string> {
  const res = await withAuth(request(app).post("/api/recipes"), token).send({ name });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Mint upload URLs, "upload" both objects into the fake, return the keys. */
async function uploadPhoto(
  recipeId: string,
  stat: { size?: number; contentType?: string } = {},
): Promise<{ key: string; thumbKey: string }> {
  const res = await withAuth(
    request(app).post(`/api/recipes/${recipeId}/photo/uploads`),
    token,
  ).send({ contentType: "image/jpeg" });
  expect(res.status).toBe(201);
  storage.put(res.body.key, stat);
  storage.put(res.body.thumbKey, stat);
  return { key: res.body.key, thumbKey: res.body.thumbKey };
}

async function attach(recipeId: string, keys: { key: string; thumbKey: string }) {
  return withAuth(request(app).put(`/api/recipes/${recipeId}/photo`), token).send(keys);
}

describe("photo availability", () => {
  it("reports available with storage configured", async () => {
    const res = await withAuth(request(app).get("/api/photos/availability"), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it("reports unavailable without storage", async () => {
    const bare = buildApp({ db: testDb(), photos: {} });
    const res = await withAuth(request(bare).get("/api/photos/availability"), token);
    expect(res.body).toEqual({ available: false });
  });
});

describe("upload URL minting", () => {
  it("mints presigned PUT URLs under the recipe's key prefix", async () => {
    const id = await createRecipe();
    const res = await withAuth(request(app).post(`/api/recipes/${id}/photo/uploads`), token).send({
      contentType: "image/webp",
    });
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(new RegExp(`^recipes/${id}/[0-9a-f-]+-full\\.webp$`));
    expect(res.body.thumbKey).toMatch(new RegExp(`^recipes/${id}/[0-9a-f-]+-thumb\\.webp$`));
    expect(res.body.uploadUrl).toContain(res.body.key);
    expect(res.body.thumbUploadUrl).toContain(res.body.thumbKey);
    expect(res.body.headers["Content-Type"]).toBe("image/webp");
    expect(res.body.maxBytes).toBe(MAX_BYTES);
  });

  it("rejects unsupported content types", async () => {
    const id = await createRecipe();
    const res = await withAuth(request(app).post(`/api/recipes/${id}/photo/uploads`), token).send({
      contentType: "image/gif",
    });
    expect(res.status).toBe(400);
  });

  it("404s for a missing recipe", async () => {
    const res = await withAuth(
      request(app).post("/api/recipes/00000000-0000-0000-0000-000000000000/photo/uploads"),
      token,
    ).send({ contentType: "image/jpeg" });
    expect(res.status).toBe(404);
  });

  it("404s when storage is not configured", async () => {
    const bare = buildApp({ db: testDb(), photos: {} });
    const id = await createRecipe();
    const res = await withAuth(request(bare).post(`/api/recipes/${id}/photo/uploads`), token).send({
      contentType: "image/jpeg",
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not configured/);
  });
});

describe("attach photo", () => {
  it("attaches verified uploads to the recipe doc and bumps the version", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    const res = await attach(id, keys);
    expect(res.status).toBe(200);
    expect(res.body.doc.photo).toEqual(keys);
    expect(res.body.version).toBeGreaterThanOrEqual(1);

    const fetched = await withAuth(request(app).get(`/api/recipes/${id}`), token);
    expect(fetched.body.doc.photo).toEqual(keys);
  });

  it("rejects keys outside the recipe's prefix", async () => {
    const a = await createRecipe("A");
    const b = await createRecipe("B");
    const keys = await uploadPhoto(a);
    const res = await attach(b, keys);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not belong/);
  });

  it("rejects an attach when the objects were never uploaded", async () => {
    const id = await createRecipe();
    const res = await attach(id, {
      key: `recipes/${id}/missing-full.jpg`,
      thumbKey: `recipes/${id}/missing-thumb.jpg`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not been uploaded/);
  });

  it("rejects oversized uploads and deletes the objects", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id, { size: MAX_BYTES + 1 });
    const res = await attach(id, keys);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/);
    expect(storage.deleted).toEqual(expect.arrayContaining([keys.key, keys.thumbKey]));
  });

  it("rejects non-image uploads", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id, { contentType: "text/html" });
    const res = await attach(id, keys);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an image/);
  });

  it("replacing a photo deletes the previous objects", async () => {
    const id = await createRecipe();
    const first = await uploadPhoto(id);
    await attach(id, first);
    const second = await uploadPhoto(id);
    const res = await attach(id, second);
    expect(res.status).toBe(200);
    expect(res.body.doc.photo).toEqual(second);
    expect(storage.deleted).toEqual(expect.arrayContaining([first.key, first.thumbKey]));
    expect(storage.objects.has(second.key)).toBe(true);
  });
});

describe("photo survives recipe updates", () => {
  it("a full-doc PUT without photo keeps the stored photo and echoes it", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    await attach(id, keys);

    const res = await withAuth(request(app).put(`/api/recipes/${id}`), token).send({
      name: "Renamed",
      ingredients: [],
      steps: [],
      servings: 2,
      tags: [],
    });
    expect(res.status).toBe(200);
    expect(res.body.doc.name).toBe("Renamed");
    expect(res.body.doc.photo).toEqual(keys);
  });

  it("a client cannot forge a photo through the recipe PUT", async () => {
    const id = await createRecipe();
    const doc: Partial<RecipeDoc> = {
      name: "Sneaky",
      photo: { key: "recipes/other/full.jpg", thumbKey: "recipes/other/thumb.jpg" },
    };
    const res = await withAuth(request(app).put(`/api/recipes/${id}`), token).send(doc);
    expect(res.status).toBe(200);
    expect(res.body.doc.photo).toBeUndefined();
  });
});

describe("remove photo", () => {
  it("detaches the photo and deletes the objects", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    await attach(id, keys);

    const res = await withAuth(request(app).delete(`/api/recipes/${id}/photo`), token);
    expect(res.status).toBe(200);
    expect(res.body.doc.photo).toBeUndefined();
    expect(storage.deleted).toEqual(expect.arrayContaining([keys.key, keys.thumbKey]));
  });

  it("deleting the recipe deletes its photo objects", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    await attach(id, keys);

    await withAuth(request(app).delete(`/api/recipes/${id}`), token).expect(204);
    expect(storage.deleted).toEqual(expect.arrayContaining([keys.key, keys.thumbKey]));
  });
});

describe("photo download redirect", () => {
  it("redirects full and thumb to presigned GET URLs", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    await attach(id, keys);

    const full = await withAuth(request(app).get(`/api/recipes/${id}/photo/full`), token);
    expect(full.status).toBe(302);
    expect(full.headers.location).toBe(`https://bucket.test/get/${keys.key}?sig=fake`);
    expect(full.headers["cache-control"]).toMatch(/private, max-age=\d+/);

    const thumb = await withAuth(request(app).get(`/api/recipes/${id}/photo/thumb`), token);
    expect(thumb.status).toBe(302);
    expect(thumb.headers.location).toContain(keys.thumbKey);
  });

  it("404s for a recipe without a photo", async () => {
    const id = await createRecipe();
    const res = await withAuth(request(app).get(`/api/recipes/${id}/photo/full`), token);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown variant", async () => {
    const id = await createRecipe();
    const keys = await uploadPhoto(id);
    await attach(id, keys);
    const res = await withAuth(request(app).get(`/api/recipes/${id}/photo/original`), token);
    expect(res.status).toBe(404);
  });
});
