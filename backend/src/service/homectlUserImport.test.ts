import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRepository } from "../storage/userRepository.js";
import { testDb, useCleanDb } from "../test/db.js";
import { IMPORT_FLAG_ID, importUsersToHomectlOnce } from "./homectlUserImport.js";

useCleanDb();

const config = {
  internalAuthUrl: "http://homectl-auth.homectl",
  clientId: "unforked",
  clientSecret: "s3cret",
};

// A syntactically valid bcrypt (bcryptjs, cost 12) hash, as stored by the old auth.
const HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7B5vN0aeIN6h5F5FQOqOsWZKQGiGoqm";

const fetchMock = vi.fn();

function okResponse(results: { email: string; status: string; reason?: string }[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => "",
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function flagRow() {
  return testDb()
    .selectFrom("auth_migration")
    .selectAll()
    .where("id", "=", IMPORT_FLAG_ID)
    .executeTakeFirst();
}

describe("importUsersToHomectlOnce", () => {
  it("sends existing users (pre-hashed) and records completion", async () => {
    const users = new UserRepository(testDb());
    await users.createWithNewFamily("alice@example.com", HASH, "admin");
    await users.createWithNewFamily("bob@example.com", HASH, "user");
    // Sidecar-provisioned user without a password: not importable.
    await users.createWithNewFamily("jit@example.com", null, "user");

    fetchMock.mockResolvedValue(
      okResponse([
        { email: "alice@example.com", status: "created" },
        { email: "bob@example.com", status: "created" },
      ]),
    );

    const summary = await importUsersToHomectlOnce(testDb(), config);
    expect(summary).toMatchObject({ total: 3, created: 2, withoutPassword: 1, invalid: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://homectl-auth.homectl/internal/users/import");
    const body = JSON.parse(init.body as string);
    expect(body.client_id).toBe("unforked");
    expect(body.client_secret).toBe("s3cret");
    expect(body.users).toEqual([
      { email: "alice@example.com", username: "alice", passwordHash: HASH, role: "admin" },
      { email: "bob@example.com", username: "bob", passwordHash: HASH, role: "user" },
    ]);

    expect(await flagRow()).toBeDefined();
  });

  it("runs exactly once: a second call is a no-op", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await importUsersToHomectlOnce(testDb(), config);
    fetchMock.mockClear();

    const second = await importUsersToHomectlOnce(testDb(), config);
    expect(second).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts invalid entries from the per-entry results", async () => {
    const users = new UserRepository(testDb());
    await users.createWithNewFamily("bad@example.com", "not-a-bcrypt-hash", "user");
    fetchMock.mockResolvedValue(
      okResponse([{ email: "bad@example.com", status: "invalid", reason: "bad hash" }]),
    );

    const summary = await importUsersToHomectlOnce(testDb(), config);
    expect(summary).toMatchObject({ invalid: 1, created: 0 });
  });

  it("throws on an HTTP error and leaves the flag unset so boot retries", async () => {
    const users = new UserRepository(testDb());
    await users.createWithNewFamily("alice@example.com", HASH, "user");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "invalid_client",
    });

    await expect(importUsersToHomectlOnce(testDb(), config)).rejects.toThrow(/HTTP 401/);
    expect(await flagRow()).toBeUndefined();

    // A later boot retries and can succeed.
    fetchMock.mockResolvedValue(okResponse([{ email: "alice@example.com", status: "created" }]));
    const retry = await importUsersToHomectlOnce(testDb(), config);
    expect(retry).toMatchObject({ created: 1 });
    expect(await flagRow()).toBeDefined();
  });
});
