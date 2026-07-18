import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/kysely.js";
import type { VapidConfig } from "../config/env.js";
import { validateBody } from "../middleware/validate.js";
import { createPushSender, type PushSender, type PushTransport } from "../service/pushSender.js";
import {
  PushSubscriptionRepository,
  type PushSubscriptionRow,
} from "../storage/pushSubscriptionRepository.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

/** Subscription locales (design #104 constraint 7); mirrors the frontend's i18n languages. */
const PUSH_LOCALES = ["en", "nb"] as const;

// The browser's PushSubscription.toJSON() shape, plus the captured locale.
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1, "keys.p256dh is required"),
    auth: z.string().min(1, "keys.auth is required"),
  }),
  locale: z.enum(PUSH_LOCALES),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

// Test-notification copy, pre-localized per subscription (resolved decision 7:
// the SW shows final strings and composes nothing). Phase 5's real templates
// live with the policy engine; only the test button sends until then.
const TEST_COPY: Record<(typeof PUSH_LOCALES)[number], { title: string; body: string }> = {
  en: {
    title: "Test notification",
    body: "Push notifications are working on this device.",
  },
  nb: {
    title: "Testvarsel",
    body: "Push-varsler fungerer på denne enheten.",
  },
};

function toSubscriptionDto(row: PushSubscriptionRow) {
  return {
    id: row.id,
    endpoint: row.endpoint,
    locale: row.locale,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

export interface PushRouteOptions {
  /** VAPID material; undefined/null disables the push endpoints (dev/test without keys). */
  vapid?: VapidConfig | null;
  /** Test seam: replaces the real web-push delivery. */
  transport?: PushTransport;
}

/**
 * Web-push subscription management (design #104 D5), mounted under /api behind
 * requireAuth. Subscriptions are per browser endpoint, owned by the calling
 * user and scoped to their family. Without VAPID keys in the environment the
 * routes stay mounted but report push as unavailable, so the frontend can gate
 * its UI off one probe of /push/vapid-key.
 */
export function pushRoutes(db: Db, options: PushRouteOptions = {}): Router {
  const users = new UserRepository(db);
  const subscriptions = new PushSubscriptionRepository(db);
  const vapid = options.vapid ?? null;
  const sender: PushSender | null = vapid ? createPushSender(db, vapid, options.transport) : null;
  const router = Router();

  // The applicationServerKey for PushManager.subscribe(). 404 (not 500) when
  // unconfigured: dev and test environments legitimately run without keys.
  router.get("/push/vapid-key", async (req, res) => {
    await requireUserAndFamily(users, req);
    if (!vapid) {
      res.status(404).json({ error: "Push notifications are not configured" });
      return;
    }
    res.json({ publicKey: vapid.publicKey });
  });

  router.post("/push/subscriptions", validateBody(subscribeSchema), async (req, res) => {
    const { user, familyId } = await requireUserAndFamily(users, req);
    const body = req.body as z.infer<typeof subscribeSchema>;
    const row = await subscriptions.upsertByEndpoint({
      userId: user.id,
      familyId,
      endpoint: body.endpoint,
      keysP256dh: body.keys.p256dh,
      keysAuth: body.keys.auth,
      locale: body.locale,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.status(201).json(toSubscriptionDto(row));
  });

  // Unsubscribe by endpoint (the browser knows its endpoint; rows have no
  // client-visible identity beyond it). Idempotent: deleting an already-gone
  // subscription is a satisfied intent.
  router.delete("/push/subscriptions", validateBody(unsubscribeSchema), async (req, res) => {
    const { user } = await requireUserAndFamily(users, req);
    const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;
    await subscriptions.deleteByEndpoint(user.id, endpoint);
    res.status(204).end();
  });

  // Send a test push to every subscription of the caller — the end-to-end
  // check behind the settings card's test button. Copy is composed here, per
  // subscription locale, exactly as phase 5's engine will.
  router.post("/push/subscriptions/test", async (req, res) => {
    const { user } = await requireUserAndFamily(users, req);
    if (!sender) {
      res.status(503).json({ error: "Push notifications are not configured" });
      return;
    }
    const report = await sender.sendToUser(user.id, (sub) => {
      const copy = TEST_COPY[sub.locale === "nb" ? "nb" : "en"];
      return { ...copy, url: "/shopping-list", tag: "test" };
    });
    res.json(report);
  });

  return router;
}
