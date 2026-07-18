/**
 * Server-composed push-notification copy (design #104 D6, resolved decision 7):
 * final en/nb strings are rendered here from each subscription's stored
 * locale, so public/push-sw.js composes nothing. Templates mirror the
 * frontend's i18n tone; actor attribution is the member's email or the API
 * key's label ("Aivo") as carried on the change event.
 */

export type PushLocale = "en" | "nb";

/** Collapse a stored subscription locale onto a supported template language. */
export function resolvePushLocale(raw: string): PushLocale {
  return raw === "nb" ? "nb" : "en";
}

export interface NotificationCopy {
  title: string;
  body: string;
}

/**
 * One coalesced change inside a notification batch (D6 coalescing). `items`
 * entries carry what a single change event told us: how many items it added
 * (manual adds), or nothing countable (an edit/check/delete — one "change").
 */
export type NotificationEntry =
  | { kind: "approved"; actorLabel?: string }
  | { kind: "reopened"; actorLabel?: string }
  | { kind: "items"; actorLabel?: string; itemsAdded?: number };

/** Test-button copy (settings card), shared with routes/push.ts. */
export const TEST_NOTIFICATION_COPY: Record<PushLocale, NotificationCopy> = {
  en: {
    title: "Test notification",
    body: "Push notifications are working on this device.",
  },
  nb: {
    title: "Testvarsel",
    body: "Push-varsler fungerer på denne enheten.",
  },
};

/** "2026-W03" → "week 3" / "uke 3"; anything unparseable stays verbatim. */
function formatWeek(weekIdentifier: string, locale: PushLocale): string {
  const match = /^\d{4}-W(\d{2})$/.exec(weekIdentifier);
  if (!match) return weekIdentifier;
  const num = Number(match[1]);
  return locale === "nb" ? `uke ${num}` : `week ${num}`;
}

function actorName(label: string | undefined, locale: PushLocale): string {
  return label ?? (locale === "nb" ? "Noen" : "Someone");
}

function itemsLine(actor: string, added: number, changes: number, locale: PushLocale): string {
  if (locale === "nb") {
    const items = `${added} ${added === 1 ? "vare" : "varer"}`;
    const other = `${changes} ${changes === 1 ? "annen endring" : "andre endringer"}`;
    const plain = `${changes} ${changes === 1 ? "endring" : "endringer"}`;
    if (added > 0 && changes > 0) return `${actor} la til ${items} og gjorde ${other} i handlelisten.`;
    if (added > 0) return `${actor} la til ${items} i handlelisten.`;
    return `${actor} gjorde ${plain} i handlelisten.`;
  }
  const items = `${added} ${added === 1 ? "item" : "items"}`;
  const other = `${changes} ${changes === 1 ? "other change" : "other changes"}`;
  const plain = `${changes} ${changes === 1 ? "change" : "changes"}`;
  if (added > 0 && changes > 0) return `${actor} added ${items} and made ${other} to the shopping list.`;
  if (added > 0) return `${actor} added ${items} to the shopping list.`;
  return `${actor} made ${plain} to the shopping list.`;
}

/**
 * Render one coalesced batch as final notification strings ("Aivo added 3
 * items…"). Item entries are aggregated per actor in first-seen order; a
 * status transition in the batch (approval announcement / reopen) takes the
 * title, with any accumulated item lines appended to the body.
 */
export function composeShoppingListNotification(
  entries: NotificationEntry[],
  weekIdentifier: string,
  locale: PushLocale,
): NotificationCopy {
  const week = formatWeek(weekIdentifier, locale);
  const status = entries.filter((e) => e.kind !== "items").at(-1);

  const perActor = new Map<string, { added: number; changes: number }>();
  for (const entry of entries) {
    if (entry.kind !== "items") continue;
    const actor = actorName(entry.actorLabel, locale);
    const agg = perActor.get(actor) ?? { added: 0, changes: 0 };
    if (entry.itemsAdded !== undefined) agg.added += entry.itemsAdded;
    else agg.changes += 1;
    perActor.set(actor, agg);
  }
  const itemLines = [...perActor.entries()].map(([actor, { added, changes }]) =>
    itemsLine(actor, added, changes, locale),
  );

  if (status?.kind === "approved") {
    const actor = actorName(status.actorLabel, locale);
    const title = locale === "nb" ? `🛒 ${actor} skal handle nå` : `🛒 ${actor} is going shopping`;
    const announcement =
      locale === "nb"
        ? `Handlelisten for ${week} ble godkjent.`
        : `The shopping list for ${week} was approved.`;
    return { title, body: [announcement, ...itemLines].join("\n") };
  }
  if (status?.kind === "reopened") {
    const actor = actorName(status.actorLabel, locale);
    const title = locale === "nb" ? "Handlelisten ble gjenåpnet" : "Shopping list reopened";
    const announcement =
      locale === "nb"
        ? `${actor} gjenåpnet handlelisten for ${week}.`
        : `${actor} reopened the shopping list for ${week}.`;
    return { title, body: [announcement, ...itemLines].join("\n") };
  }

  const title =
    locale === "nb" ? `Handlelisten ble oppdatert (${week})` : `Shopping list updated (${week})`;
  return { title, body: itemLines.join("\n") };
}
