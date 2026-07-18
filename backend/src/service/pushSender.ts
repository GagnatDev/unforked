import webpush from "web-push";
import type { VapidConfig } from "../config/env.js";
import type { Db } from "../db/kysely.js";
import { logger } from "../logger.js";
import {
  PushSubscriptionRepository,
  type PushSubscriptionRow,
} from "../storage/pushSubscriptionRepository.js";

/**
 * The payload contract with public/push-sw.js: final, pre-localized strings
 * plus the deep link — the service worker composes nothing (design #104 D5/D6,
 * resolved decision 7).
 */
export interface PushPayload {
  title: string;
  body: string;
  /** In-app deep link opened (or focused) on notification click. */
  url: string;
  /** Coalescing key: notifications with the same tag replace each other. */
  tag?: string;
}

/** Delivery transport, injectable so tests never talk to a real push service. */
export type PushTransport = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<void>;

export interface SendReport {
  sent: number;
  /** Subscriptions deleted because the push service reported them gone (404/410). */
  pruned: number;
  failed: number;
}

export interface PushSender {
  /**
   * Send to every subscription of a user, composing the payload per
   * subscription (its stored locale). Dead endpoints (404/410) are pruned;
   * other failures are recorded and never thrown (a push failure must never
   * break the caller — design #104 constraint).
   */
  sendToUser(userId: string, payloadFor: (sub: PushSubscriptionRow) => PushPayload): Promise<SendReport>;
}

function statusCodeOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    if (typeof code === "number") return code;
  }
  return undefined;
}

/**
 * Web Push delivery (design #104 D5): the `web-push` package with VAPID keys
 * from env, provisioned by homectl-infra's `unforked-vapid-secrets`.
 */
export function createPushSender(
  db: Db,
  vapid: VapidConfig,
  transport?: PushTransport,
): PushSender {
  const subscriptions = new PushSubscriptionRepository(db);
  const send: PushTransport =
    transport ??
    (async (subscription, payload) => {
      await webpush.sendNotification(subscription, payload, {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: 60 * 60, // an hour-stale notification about a shopping list is noise
      });
    });

  return {
    async sendToUser(userId, payloadFor): Promise<SendReport> {
      const rows = await subscriptions.listByUser(userId);
      const report: SendReport = { sent: 0, pruned: 0, failed: 0 };
      await Promise.all(
        rows.map(async (row) => {
          try {
            await send(
              { endpoint: row.endpoint, keys: { p256dh: row.keys_p256dh, auth: row.keys_auth } },
              JSON.stringify(payloadFor(row)),
            );
            await subscriptions.touchLastUsed(row.id);
            report.sent += 1;
          } catch (err) {
            const status = statusCodeOf(err);
            // 404/410 mean the subscription no longer exists at the push
            // service (browser unsubscribed / uninstalled): self-prune.
            if (status === 404 || status === 410) {
              await subscriptions.deleteById(row.id);
              report.pruned += 1;
            } else {
              await subscriptions.markFailed(row.id);
              report.failed += 1;
            }
            logger.warn(
              { userId, subscriptionId: row.id, status, err },
              "web push delivery failed",
            );
          }
        }),
      );
      return report;
    },
  };
}
