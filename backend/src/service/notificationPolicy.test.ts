import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMachineApp } from "../machineApp.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { buildTestApp, setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";
import { startNotificationPolicy } from "./notificationPolicy.js";
import { createPushSender, type PushTransport } from "./pushSender.js";

useCleanDb();

// End-to-end policy tests (design #104 D6): real routes drive real change
// events through the engine; only web-push delivery is a recording fake.
const app = buildTestApp();
const machineApp = buildMachineApp({ db: testDb() });
const week = currentWeekIdentifier();

const VAPID = {
  publicKey: "test-public-key",
  privateKey: "test-private-key",
  subject: "mailto:test@example.com",
};

// Fast coalescing for tests; QUIET is comfortably past it for "nothing
// arrives" assertions without slowing the suite too much.
const DEBOUNCE_MS = 60;
const QUIET_MS = DEBOUNCE_MS * 4;

interface SentPush {
  endpoint: string;
  payload: { title: string; body: string; url: string; tag?: string };
}

let sent: SentPush[];
let failWith: Record<string, number>;
let stopPolicy: (() => void) | undefined;

const transport: PushTransport = (subscription, payload) => {
  const status = failWith[subscription.endpoint];
  if (status !== undefined) {
    return Promise.reject(
      Object.assign(new Error(`push failed ${status}`), { statusCode: status }),
    );
  }
  sent.push({
    endpoint: subscription.endpoint,
    payload: JSON.parse(payload) as SentPush["payload"],
  });
  return Promise.resolve();
};

const admin: TestIdentity = { id: "hs-admin", email: "admin@example.com", role: "admin" };
const partner: TestIdentity = { id: "hs-partner", email: "partner@example.com", role: "user" };
const third: TestIdentity = { id: "hs-third", email: "third@example.com", role: "user" };

beforeEach(async () => {
  sent = [];
  failWith = {};
  stopPolicy = startNotificationPolicy({
    db: testDb(),
    sender: createPushSender(testDb(), VAPID, transport),
    debounceMs: DEBOUNCE_MS,
  });
  await setupAdmin(app, admin);
  await joinFamily(partner);
  await joinFamily(third);
});

afterEach(() => {
  stopPolicy?.();
  stopPolicy = undefined;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(check: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

/** Provision a user and pull them into the admin's family. */
async function joinFamily(identity: TestIdentity): Promise<void> {
  await setupAdmin(app, identity);
  const invite = await withAuth(request(app).post("/api/family/invites"), admin).send({
    email: identity.email,
  });
  await withAuth(request(app).post("/api/family/invites/accept"), identity)
    .send({ token: invite.body.token })
    .expect(200);
}

/** One push endpoint per (user, locale) device; endpoint doubles as its name. */
async function subscribe(identity: TestIdentity, endpoint: string, locale = "en"): Promise<void> {
  await withAuth(request(app).post("/api/push/subscriptions"), identity)
    .send({
      endpoint: `https://push.example/${endpoint}`,
      keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
      locale,
    })
    .expect(201);
}

function sentTo(endpoint: string): SentPush[] {
  return sent.filter((s) => s.endpoint === `https://push.example/${endpoint}`);
}

async function addItem(identity: TestIdentity, name: string): Promise<string> {
  const res = await withAuth(request(app).post(`/api/shopping-lists/items?week=${week}`), identity)
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

async function toggleItem(identity: TestIdentity, itemId: string): Promise<void> {
  await withAuth(request(app).patch(`/api/shopping-lists/items/${itemId}?week=${week}`), identity)
    .send({ checked: true })
    .expect(200);
}

async function setStatus(identity: TestIdentity, status: "approved" | "open"): Promise<void> {
  await withAuth(request(app).post(`/api/shopping-lists/status?week=${week}`), identity)
    .send({ status })
    .expect(200);
}

async function machineAdd(names: string[]): Promise<void> {
  const key = await withAuth(request(app).post("/api/api-keys"), admin).send({
    name: "Aivo",
    scopes: ["write"],
  });
  await request(machineApp)
    .post(`/machine/v1/shopping-lists/${week}/items`)
    .set("Authorization", `Bearer ${key.body.key as string}`)
    .send({ items: names.map((name) => ({ name })) })
    .expect(201);
}

describe("notification policy engine (D6 matrix)", () => {
  it("never pushes while the list is open — human or machine changes", async () => {
    await subscribe(admin, "admin-en");
    await subscribe(partner, "partner-en");
    const itemId = await addItem(partner, "Milk");
    await toggleItem(partner, itemId);
    await machineAdd(["Batteries"]);
    await withAuth(request(app).delete(`/api/shopping-lists/items/${itemId}?week=${week}`), partner)
      .expect(204);
    await sleep(QUIET_MS);
    expect(sent).toHaveLength(0);
  });

  it("approval announces immediately to every other member, never the approver", async () => {
    await subscribe(admin, "admin-en");
    await subscribe(partner, "partner-en");
    await subscribe(third, "third-en");
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");

    await poll(() => sent.length >= 2, "approval announcements");
    await sleep(QUIET_MS);
    expect(sentTo("admin-en")).toHaveLength(0);
    expect(sentTo("partner-en")).toHaveLength(1);
    expect(sentTo("third-en")).toHaveLength(1);
    const push = sentTo("partner-en")[0].payload;
    expect(push.title).toBe("🛒 admin@example.com is going shopping");
    expect(push.url).toBe(`/shopping-list?week=${week}`);
    expect(push.tag).toContain(week);
  });

  it("while approved, another member's burst coalesces into one push to the approver", async () => {
    await subscribe(admin, "admin-en");
    const itemId = await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS); // drain the (unsubscribed) approval announcements

    await addItem(partner, "Bread");
    await addItem(partner, "Eggs");
    await toggleItem(partner, itemId);

    await poll(() => sentTo("admin-en").length >= 1, "coalesced push to approver");
    await sleep(QUIET_MS);
    expect(sentTo("admin-en")).toHaveLength(1);
    const push = sentTo("admin-en")[0].payload;
    expect(push.title).toBe(`Shopping list updated (week ${Number(week.slice(-2))})`);
    expect(push.body).toBe(
      "partner@example.com added 2 items and made 1 other change to the shopping list.",
    );
  });

  it("machine (Aivo) changes while approved notify the approver, attributed to the key", async () => {
    await subscribe(admin, "admin-en");
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS);

    await machineAdd(["Batteries", "Toothpaste", "Coffee"]);

    await poll(() => sentTo("admin-en").length >= 1, "machine-actor push to approver");
    expect(sentTo("admin-en")[0].payload.body).toBe("Aivo added 3 items to the shopping list.");
  });

  it("the approver's own changes while shopping stay silent", async () => {
    await subscribe(admin, "admin-en");
    const itemId = await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS);

    await toggleItem(admin, itemId);
    await addItem(admin, "Forgot this");
    await sleep(QUIET_MS);
    expect(sentTo("admin-en")).toHaveLength(0);
  });

  it("a reopen by another member notifies the approver at once, folding in pending changes", async () => {
    await subscribe(admin, "admin-en");
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS);

    // An add whose debounce is still pending when the reopen lands: one
    // combined push, not two.
    await addItem(partner, "Bread");
    await setStatus(partner, "open");

    await poll(() => sentTo("admin-en").length >= 1, "reopen push to approver");
    await sleep(QUIET_MS);
    expect(sentTo("admin-en")).toHaveLength(1);
    const push = sentTo("admin-en")[0].payload;
    expect(push.title).toBe("Shopping list reopened");
    expect(push.body).toBe(
      `partner@example.com reopened the shopping list for week ${Number(week.slice(-2))}.\n` +
        "partner@example.com added 1 item to the shopping list.",
    );
  });

  it("the approver's own reopen is silent for everyone", async () => {
    await subscribe(admin, "admin-en");
    await subscribe(partner, "partner-en");
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await poll(() => sentTo("partner-en").length === 1, "approval announcement");

    await setStatus(admin, "open");
    await sleep(QUIET_MS);
    expect(sentTo("partner-en")).toHaveLength(1); // still just the approval
    expect(sentTo("admin-en")).toHaveLength(0);
  });

  it("composes copy per subscription locale (en + nb devices of one recipient)", async () => {
    await subscribe(admin, "admin-en", "en");
    await subscribe(admin, "admin-nb", "nb");
    await addItem(partner, "Milk");
    await setStatus(partner, "approved");

    await poll(() => sent.length >= 2, "localized announcements");
    expect(sentTo("admin-en")[0].payload.title).toBe(
      "🛒 partner@example.com is going shopping",
    );
    expect(sentTo("admin-nb")[0].payload.title).toBe("🛒 partner@example.com skal handle nå");
  });

  it("a change after a flushed batch starts a new coalescing window", async () => {
    await subscribe(admin, "admin-en");
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS);

    await addItem(partner, "Bread");
    await poll(() => sentTo("admin-en").length === 1, "first batch");
    await addItem(partner, "Eggs");
    await poll(() => sentTo("admin-en").length === 2, "second batch");
    expect(sentTo("admin-en")[1].payload.body).toBe(
      "partner@example.com added 1 item to the shopping list.",
    );
  });

  it("push failures are isolated: mutations succeed and the engine keeps going", async () => {
    await subscribe(admin, "admin-en");
    failWith["https://push.example/admin-en"] = 500;
    await addItem(admin, "Milk");
    await setStatus(admin, "approved");
    await sleep(QUIET_MS);

    // The delivery for this add fails at the push service…
    await addItem(partner, "Bread");
    await sleep(QUIET_MS);
    expect(sentTo("admin-en")).toHaveLength(0);
    const [row] = await testDb().selectFrom("push_subscriptions").selectAll().execute();
    expect(row.failed_at).not.toBeNull();

    // …the mutations above still returned 2xx (helpers assert that), and the
    // engine still delivers once the endpoint recovers.
    delete failWith["https://push.example/admin-en"];
    await addItem(partner, "Eggs");
    await poll(() => sentTo("admin-en").length === 1, "delivery after recovery");
  });
});
