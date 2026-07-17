import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { familyListenerCount, type ShoppingListEvent } from "../service/changeEvents.js";
import { setupAdmin, withAuth, type TestIdentity } from "../test/app.js";
import { testDb, useCleanDb } from "../test/db.js";

useCleanDb();

// A real listening server: SSE tests exercise the long-lived response stream
// (headers, heartbeats, disconnect cleanup), which supertest's one-shot
// request/response model can't hold open. Heartbeat and cap are shrunk so
// tests observe both within milliseconds.
const app = buildApp({ db: testDb(), events: { heartbeatMs: 50, maxStreamsPerUser: 2 } });
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  const closed = new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  server.closeAllConnections();
  await closed;
});

const week = "2026-W10";
let token: TestIdentity;
beforeEach(async () => {
  token = await setupAdmin(app);
});

/** Streaming SSE client over fetch; aborting the controller simulates a client disconnect. */
class SseClient {
  buffer = "";
  status = 0;
  headers = new Headers();
  private readonly controller = new AbortController();
  private reading: Promise<void> = Promise.resolve();

  static async connect(identity: TestIdentity): Promise<SseClient> {
    const client = new SseClient();
    const res = await fetch(`${baseUrl}/api/events`, {
      headers: {
        "X-Homectl-User": identity.id,
        "X-Homectl-Email": identity.email,
        "X-Homectl-Role": identity.role ?? "user",
      },
      signal: client.controller.signal,
    });
    client.status = res.status;
    client.headers = res.headers;
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      client.reading = (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            client.buffer += decoder.decode(value, { stream: true });
          }
        } catch {
          // Aborted by close() — the disconnect under test.
        }
      })();
    }
    clients.push(client);
    return client;
  }

  async waitFor(needle: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.buffer.includes(needle)) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${JSON.stringify(needle)} in:\n${this.buffer}`);
      }
      await sleep(10);
    }
  }

  events(): ShoppingListEvent[] {
    return [...this.buffer.matchAll(/^data: (.+)$/gm)].map(
      (m) => JSON.parse(m[1]) as ShoppingListEvent,
    );
  }

  async close(): Promise<void> {
    this.controller.abort();
    await this.reading;
  }
}

let clients: SseClient[] = [];
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  clients = [];
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

async function myFamilyId(identity: TestIdentity = token): Promise<string> {
  const res = await withAuth(request(app).get("/api/auth/me"), identity);
  return res.body.familyId as string;
}

/** Provision a second user and pull them into the admin's family. */
async function joinFamily(identity: TestIdentity): Promise<void> {
  await setupAdmin(app, identity);
  const invite = await withAuth(request(app).post("/api/family/invites"), token).send({
    email: identity.email,
  });
  await withAuth(request(app).post("/api/family/invites/accept"), identity)
    .send({ token: invite.body.token })
    .expect(200);
}

async function addItem(name: string, identity: TestIdentity = token): Promise<void> {
  await withAuth(request(app).post(`/api/shopping-lists/items?week=${week}`), identity)
    .send({ name })
    .expect(201);
}

describe("GET /api/events", () => {
  it("401s without identity headers", async () => {
    const res = await request(app).get("/api/events");
    expect(res.status).toBe(401);
  });

  it("streams SSE headers and an initial retry hint", async () => {
    const client = await SseClient.connect(token);
    expect(client.status).toBe(200);
    expect(client.headers.get("content-type")).toContain("text/event-stream");
    expect(client.headers.get("cache-control")).toBe("no-cache");
    expect(client.headers.get("x-accel-buffering")).toBe("no");
    await client.waitFor("retry: 5000");
  });

  it("delivers a family member's change to another member's open stream", async () => {
    const partner: TestIdentity = { id: "hs-partner", email: "partner@example.com", role: "user" };
    await joinFamily(partner);
    const familyId = await myFamilyId();

    const stream = await SseClient.connect(partner);
    await stream.waitFor("retry:");
    await addItem("Kaffe");

    await stream.waitFor("event: shopping-list.changed");
    const [evt] = stream.events();
    expect(evt).toMatchObject({
      type: "shopping-list.changed",
      familyId,
      week,
      actor: { kind: "user", label: token.email },
    });
    expect(stream.buffer).toContain(`id: ${evt.id}`);
    expect(evt.version).toBeTypeOf("number");
    expect(new Date(evt.ts).getTime()).not.toBeNaN();
  });

  it("never delivers another family's events (tenant scoping)", async () => {
    const stranger: TestIdentity = { id: "hs-other", email: "other@example.com", role: "user" };
    await setupAdmin(app, stranger); // provisions their own separate family

    const own = await SseClient.connect(token);
    const foreign = await SseClient.connect(stranger);
    await Promise.all([own.waitFor("retry:"), foreign.waitFor("retry:")]);

    await addItem("Melk");
    // The emitter's own stream proves delivery happened before we assert absence.
    await own.waitFor("event: shopping-list.changed");
    await sleep(100);
    expect(foreign.buffer).not.toContain("shopping-list.changed");
    expect(foreign.events()).toEqual([]);
  });

  it("heartbeats to keep proxies from idling the stream out", async () => {
    const client = await SseClient.connect(token);
    await client.waitFor(":hb");
  });

  it("caps concurrent streams per user and frees the slot on disconnect", async () => {
    const first = await SseClient.connect(token);
    await SseClient.connect(token);
    await first.waitFor("retry:");

    const rejected = await SseClient.connect(token);
    expect(rejected.status).toBe(429);

    // Cleanup runs on the server's close event; the slot frees shortly after.
    await first.close();
    const deadline = Date.now() + 3000;
    let replacement = await SseClient.connect(token);
    while (replacement.status !== 200 && Date.now() < deadline) {
      await sleep(25);
      replacement = await SseClient.connect(token);
    }
    expect(replacement.status).toBe(200);
  });

  it("unsubscribes the bus listener when the client disconnects", async () => {
    const familyId = await myFamilyId();
    expect(familyListenerCount(familyId)).toBe(0);

    const client = await SseClient.connect(token);
    await client.waitFor("retry:");
    expect(familyListenerCount(familyId)).toBe(1);

    await client.close();
    await poll(() => familyListenerCount(familyId) === 0, "bus listener cleanup");
  });
});
