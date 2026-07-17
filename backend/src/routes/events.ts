import { Router } from "express";
import type { Db } from "../db/kysely.js";
import { logger } from "../logger.js";
import { subscribeFamily, type ShoppingListEvent } from "../service/changeEvents.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

export interface EventStreamOptions {
  /** Milliseconds between heartbeat comments. Tests shrink it. */
  heartbeatMs?: number;
  /** Concurrent streams allowed per user before new ones are rejected. */
  maxStreamsPerUser?: number;
}

// Under ingress-nginx's default 60s read timeout: a comment every ~25s keeps
// the proxy chain from idling the stream out.
const DEFAULT_HEARTBEAT_MS = 25_000;
// A device holds one stream (leader tab, decision 8); a handful covers a
// user's devices while guarding against reconnect-loop runaways.
const DEFAULT_MAX_STREAMS_PER_USER = 5;

/**
 * GET /api/events — the realtime change feed (design #104 D2). Server-Sent
 * Events on the human listener only, behind requireAuth, streaming the
 * caller's family's events. Events are invalidation hints with no replay or
 * Last-Event-ID handling (resolved decision 2): the client contract is "pull
 * fresh on every open", so the server keeps zero event history.
 */
export function eventRoutes(db: Db, options: EventStreamOptions = {}): Router {
  const users = new UserRepository(db);
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const maxStreamsPerUser = options.maxStreamsPerUser ?? DEFAULT_MAX_STREAMS_PER_USER;
  const streamsPerUser = new Map<string, number>();
  let openStreams = 0;
  const router = Router();

  router.get("/events", async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);

    const current = streamsPerUser.get(user.id) ?? 0;
    if (current >= maxStreamsPerUser) {
      res.status(429).json({ error: "Too many concurrent event streams" });
      return;
    }
    streamsPerUser.set(user.id, current + 1);
    openStreams += 1;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    // nginx honours this per-response and disables proxy buffering, so events
    // flush through the sidecar chain immediately instead of pooling.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    // EventSource reconnect hint. Correctness never depends on stream
    // longevity: on every (re)open the client re-pulls (D3).
    res.write("retry: 5000\n\n");

    const send = (evt: ShoppingListEvent): void => {
      res.write(`id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
    };
    const unsubscribe = subscribeFamily(familyId, send);
    const heartbeat = setInterval(() => {
      res.write(":hb\n\n");
    }, heartbeatMs);

    // The stream gauge: open/close pairs in the logs surface listener leaks.
    logger.info({ userId: user.id, familyId, openStreams }, "event stream opened");

    let closed = false;
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      const count = streamsPerUser.get(user.id) ?? 1;
      if (count <= 1) streamsPerUser.delete(user.id);
      else streamsPerUser.set(user.id, count - 1);
      openStreams -= 1;
      logger.info({ userId: user.id, familyId, openStreams }, "event stream closed");
      res.end();
    };
    res.on("close", cleanup);
    res.on("error", cleanup);
  });

  return router;
}
