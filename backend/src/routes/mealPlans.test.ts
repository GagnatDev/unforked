import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildTestApp, setupAdminToken, withAuth } from "../test/app.js";
import { useCleanDb } from "../test/db.js";

useCleanDb();
const app = buildTestApp();

let token: string;
beforeEach(async () => {
  token = await setupAdminToken(app);
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
    expect(res.body).toEqual({ weekIdentifier: currentWeekIdentifier(), assignments: [] });
  });

  it("returns an empty plan for a specified week", async () => {
    const res = await withAuth(request(app).get(`/api/meal-plans/current?week=${week}`), token);
    expect(res.body).toEqual({ weekIdentifier: week, assignments: [] });
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
