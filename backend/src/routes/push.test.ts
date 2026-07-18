import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { PushTransport } from "../service/pushSender.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";

useCleanDb();

const VAPID = {
  publicKey: "test-public-key",
  privateKey: "test-private-key",
  subject: "mailto:test@example.com",
};

interface SentPush {
  endpoint: string;
  payload: { title: string; body: string; url: string; tag?: string };
}

/**
 * A recording transport; endpoints listed in `failWith` reject with the given
 * push-service status code (the web-push WebPushError shape).
 */
function fakeTransport(sent: SentPush[], failWith: Record<string, number> = {}): PushTransport {
  return (subscription, payload) => {
    const status = failWith[subscription.endpoint];
    if (status !== undefined) {
      return Promise.reject(Object.assign(new Error(`push failed ${status}`), { statusCode: status }));
    }
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) as SentPush["payload"] });
    return Promise.resolve();
  };
}

function buildPushApp(sent: SentPush[], failWith: Record<string, number> = {}) {
  return buildApp({ db: testDb(), push: { vapid: VAPID, transport: fakeTransport(sent, failWith) } });
}

function subscription(endpoint: string, locale = "en") {
  return {
    endpoint,
    keys: { p256dh: `p256dh-for-${endpoint}`, auth: `auth-for-${endpoint}` },
    locale,
  };
}

async function allRows() {
  return testDb()
    .selectFrom("push_subscriptions")
    .selectAll()
    .orderBy("created_at", "asc")
    .execute();
}

const unconfiguredApp = buildTestApp();

let admin: TestIdentity;
beforeEach(async () => {
  admin = await setupAdmin(unconfiguredApp);
});

describe("GET /api/push/vapid-key", () => {
  it("returns the public key when VAPID is configured", async () => {
    const app = buildPushApp([]);
    const res = await withAuth(request(app).get("/api/push/vapid-key"), admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicKey: VAPID.publicKey });
  });

  it("404s when push is not configured (dev/test without keys)", async () => {
    const res = await withAuth(request(unconfiguredApp).get("/api/push/vapid-key"), admin);
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(buildPushApp([])).get("/api/push/vapid-key");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/push/subscriptions", () => {
  it("creates a subscription owned by the caller and scoped to their family", async () => {
    const app = buildPushApp([]);
    const res = await withAuth(request(app).post("/api/push/subscriptions"), admin)
      .set("User-Agent", "test-browser/1.0")
      .send(subscription("https://push.example/sub-1", "nb"));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      endpoint: "https://push.example/sub-1",
      locale: "nb",
      lastUsedAt: null,
    });
    expect(res.body).not.toHaveProperty("keys_p256dh");

    const me = await withAuth(request(app).get("/api/auth/me"), admin);
    const [row] = await allRows();
    expect(row.user_id).toBe(me.body.id);
    expect(row.family_id).toBe(me.body.familyId);
    expect(row.keys_p256dh).toBe("p256dh-for-https://push.example/sub-1");
    expect(row.user_agent).toBe("test-browser/1.0");
  });

  it("upserts on the endpoint: re-subscribing refreshes keys/locale without duplicating", async () => {
    const app = buildPushApp([]);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/sub-1", "en"),
    );
    const res = await withAuth(request(app).post("/api/push/subscriptions"), admin).send({
      endpoint: "https://push.example/sub-1",
      keys: { p256dh: "rotated-p256dh", auth: "rotated-auth" },
      locale: "nb",
    });
    expect(res.status).toBe(201);

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].keys_p256dh).toBe("rotated-p256dh");
    expect(rows[0].locale).toBe("nb");
  });

  it("400s on an unsupported locale, a malformed endpoint, or missing keys", async () => {
    const app = buildPushApp([]);
    for (const body of [
      subscription("https://push.example/sub-1", "de"),
      subscription("not-a-url"),
      { endpoint: "https://push.example/sub-1", keys: { p256dh: "x" }, locale: "en" },
    ]) {
      const res = await withAuth(request(app).post("/api/push/subscriptions"), admin).send(body);
      expect(res.status).toBe(400);
    }
    expect(await allRows()).toHaveLength(0);
  });
});

describe("DELETE /api/push/subscriptions", () => {
  it("removes the caller's subscription and is idempotent", async () => {
    const app = buildPushApp([]);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/sub-1"),
    );
    const first = await withAuth(request(app).delete("/api/push/subscriptions"), admin).send({
      endpoint: "https://push.example/sub-1",
    });
    expect(first.status).toBe(204);
    expect(await allRows()).toHaveLength(0);

    const again = await withAuth(request(app).delete("/api/push/subscriptions"), admin).send({
      endpoint: "https://push.example/sub-1",
    });
    expect(again.status).toBe(204);
  });

  it("never deletes another user's subscription for the same endpoint", async () => {
    const app = buildPushApp([]);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/sub-1"),
    );
    const other = await setupAdmin(app, { id: "hs-other", email: "other@example.com" });
    const res = await withAuth(request(app).delete("/api/push/subscriptions"), other).send({
      endpoint: "https://push.example/sub-1",
    });
    expect(res.status).toBe(204);
    expect(await allRows()).toHaveLength(1);
  });
});

describe("POST /api/push/subscriptions/test", () => {
  it("503s when push is not configured", async () => {
    const res = await withAuth(
      request(unconfiguredApp).post("/api/push/subscriptions/test"),
      admin,
    );
    expect(res.status).toBe(503);
  });

  it("sends localized copy to each of the caller's subscriptions only", async () => {
    const sent: SentPush[] = [];
    const app = buildPushApp(sent);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/en-device", "en"),
    );
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/nb-device", "nb"),
    );
    const other = await setupAdmin(app, { id: "hs-other", email: "other@example.com" });
    await withAuth(request(app).post("/api/push/subscriptions"), other).send(
      subscription("https://push.example/other-device", "en"),
    );

    const res = await withAuth(request(app).post("/api/push/subscriptions/test"), admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 2, pruned: 0, failed: 0 });

    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      "https://push.example/en-device",
      "https://push.example/nb-device",
    ]);
    const en = sent.find((s) => s.endpoint.endsWith("en-device"))!;
    const nb = sent.find((s) => s.endpoint.endsWith("nb-device"))!;
    expect(en.payload.title).toBe("Test notification");
    expect(nb.payload.title).toBe("Testvarsel");
    // The SW contract: pre-localized strings plus the deep link (D5).
    expect(en.payload.url).toBe("/shopping-list");
  });

  it("marks a successful delivery on the subscription", async () => {
    const app = buildPushApp([]);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/sub-1"),
    );
    await withAuth(request(app).post("/api/push/subscriptions/test"), admin).expect(200);
    const [row] = await allRows();
    expect(row.last_used_at).not.toBeNull();
    expect(row.failed_at).toBeNull();
  });

  it("prunes subscriptions the push service reports gone (404/410)", async () => {
    const sent: SentPush[] = [];
    const app = buildPushApp(sent, {
      "https://push.example/gone": 410,
      "https://push.example/missing": 404,
    });
    for (const endpoint of [
      "https://push.example/gone",
      "https://push.example/missing",
      "https://push.example/alive",
    ]) {
      await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
        subscription(endpoint),
      );
    }

    const res = await withAuth(request(app).post("/api/push/subscriptions/test"), admin);
    expect(res.body).toEqual({ sent: 1, pruned: 2, failed: 0 });

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe("https://push.example/alive");
  });

  it("keeps (but marks) subscriptions on transient delivery failures", async () => {
    const app = buildPushApp([], { "https://push.example/flaky": 500 });
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/flaky"),
    );

    const res = await withAuth(request(app).post("/api/push/subscriptions/test"), admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 0, pruned: 0, failed: 1 });

    const rows = await allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].failed_at).not.toBeNull();
  });

  it("a later successful re-subscribe forgives an earlier failure", async () => {
    const app = buildPushApp([], { "https://push.example/flaky": 500 });
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/flaky"),
    );
    await withAuth(request(app).post("/api/push/subscriptions/test"), admin).expect(200);
    await withAuth(request(app).post("/api/push/subscriptions"), admin).send(
      subscription("https://push.example/flaky"),
    );
    const [row] = await allRows();
    expect(row.failed_at).toBeNull();
  });
});
