import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

const week = "2026-W10";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    weekIdentifier: week,
    assignments: [{ day: "monday", recipeId: "r1", recipeName: "Pasta" }],
    ...overrides,
  };
}

describe("GET /api/meal-plans/current", () => {
  it("returns an empty plan for the current week when none exists", async () => {
    const res = await withAuth(request(app).get("/api/meal-plans/current"), token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      weekIdentifier: currentWeekIdentifier(),
      assignments: [],
      version: 0,
    });
  });

  it("returns an empty plan for a specified week", async () => {
    const res = await withAuth(request(app).get(`/api/meal-plans/current?week=${week}`), token);
    expect(res.body).toEqual({ weekIdentifier: week, assignments: [], version: 0 });
  });
});

describe("PUT /api/meal-plans/current", () => {
  it("upserts and reads back the plan for a week", async () => {
    const put = await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send(
      plan(),
    );
    expect(put.status).toBe(200);
    expect(put.body.assignments).toHaveLength(1);

    const get = await withAuth(request(app).get(`/api/meal-plans/current?week=${week}`), token);
    expect(get.body.assignments[0].recipeName).toBe("Pasta");
  });

  it("replaces an existing plan on a second PUT", async () => {
    await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send(plan());
    await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send(
      plan({ assignments: [] }),
    );
    const get = await withAuth(request(app).get(`/api/meal-plans/current?week=${week}`), token);
    expect(get.body.assignments).toHaveLength(0);
  });

  it("bumps the version on each accepted write and 409s a stale baseVersion", async () => {
    const first = await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token)
      .send(plan())
      .expect(200);
    // A brand-new week inserts at version 0.
    expect(first.body.version).toBe(0);

    const second = await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token)
      .send(plan({ baseVersion: 0, assignments: [] }))
      .expect(200);
    expect(second.body.version).toBe(1);

    // Stale writer still thinks the base is 0 → conflict with the current plan.
    const stale = await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send(
      plan({ baseVersion: 0 }),
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: "conflict", version: 1 });
    expect(stale.body.assignments).toEqual([]);
  });

  it("400s when the body weekIdentifier does not match the query week", async () => {
    const res = await withAuth(request(app).put(`/api/meal-plans/current?week=${week}`), token).send(
      plan({ weekIdentifier: "2026-W11" }),
    );
    expect(res.status).toBe(400);
  });

  it("401s without a token", async () => {
    const res = await request(app).get("/api/meal-plans/current");
    expect(res.status).toBe(401);
  });
});
