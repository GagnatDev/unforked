import type { Db } from "../db/kysely.js";
import type { UserInfo } from "../domain/types.js";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: string;
  family_id: string;
}

const USER_COLUMNS = ["id", "email", "password_hash", "role", "family_id"] as const;

export class UserRepository {
  constructor(private readonly db: Db) {}

  /** All users, for the one-time homectl-auth import. */
  listAll(): Promise<UserRow[]> {
    return this.db.selectFrom("users").select(USER_COLUMNS).orderBy("email").execute();
  }

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .select(USER_COLUMNS)
      .where("email", "=", email)
      .executeTakeFirst();
  }

  findById(id: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .select(USER_COLUMNS)
      .where("id", "=", id)
      .executeTakeFirst();
  }

  listByFamily(familyId: string): Promise<UserRow[]> {
    return this.db
      .selectFrom("users")
      .select(USER_COLUMNS)
      .where("family_id", "=", familyId)
      .orderBy("email")
      .execute();
  }

  async countInFamily(familyId: string): Promise<number> {
    const row = await this.db
      .selectFrom("users")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("family_id", "=", familyId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async updateFamilyId(userId: string, familyId: string): Promise<void> {
    await this.db
      .updateTable("users")
      .set({ family_id: familyId })
      .where("id", "=", userId)
      .execute();
  }

  /** Create a new solo family and a user belonging to it (single transaction). */
  createWithNewFamily(email: string, passwordHash: string | null, role: string): Promise<UserRow> {
    return this.db.transaction().execute(async (trx) => {
      const family = await trx
        .insertInto("families")
        .defaultValues()
        .returning("id")
        .executeTakeFirstOrThrow();
      return trx
        .insertInto("users")
        .values({ email, password_hash: passwordHash, role, family_id: family.id })
        .returning(USER_COLUMNS)
        .executeTakeFirstOrThrow();
    });
  }
}

export function toUserInfo(row: UserRow): UserInfo {
  return { id: row.id, email: row.email, role: row.role, familyId: row.family_id };
}
