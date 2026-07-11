import { sql } from "kysely";
import { DEV_AUTH } from "../auth/auth.js";
import type { Db } from "../db/kysely.js";

/**
 * Seed the fixed dev user + family so DISABLE_AUTH mode (no identity headers)
 * resolves to a real principal. Mirrors the Kotlin TestDatabase.seedDevPrincipalIfTest.
 */
export async function seedDevPrincipal(db: Db): Promise<void> {
  await sql`
    INSERT INTO families (id, default_meal_plan_persons)
    VALUES (${DEV_AUTH.FAMILY_ID}::uuid, 4)
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
  await sql`
    INSERT INTO users (id, email, password_hash, role, family_id)
    VALUES (${DEV_AUTH.USER_ID}::uuid, ${DEV_AUTH.EMAIL}, NULL, 'admin', ${DEV_AUTH.FAMILY_ID}::uuid)
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
}
