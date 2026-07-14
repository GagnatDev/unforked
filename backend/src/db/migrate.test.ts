import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { closeTestDb, testDb } from "../test/db.js";

afterAll(closeTestDb);

describe("migrations", () => {
  it("create all expected tables on the shared container", async () => {
    const result = await sql<{ table_name: string }>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `.execute(testDb());

    const names = result.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "recipes",
        "meal_plans",
        "users",
        "families",
        "family_invitations",
        "auth_migration",
        "shopping_lists",
        "ingredient_categories",
        "api_keys",
      ]),
    );
  });

  it("record applied migrations in the pgmigrations table", async () => {
    const result = await sql<{ name: string }>`
      SELECT name FROM pgmigrations ORDER BY id
    `.execute(testDb());

    const names = result.rows.map((r) => r.name);
    expect(names).toEqual([
      "001_create_initial_schema",
      "002_create_users",
      "003_families",
      "004_homectl_auth_sidecar",
      "005_shopping_lists",
      "006_api_keys",
      "007_add_version_columns",
    ]);
  });
});
