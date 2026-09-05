import { describe, expect, it } from "vitest";
import {
  composeShoppingListNotification,
  resolvePushLocale,
  type NotificationEntry,
} from "./notificationCopy.js";

const WEEK = "2026-W03";

describe("resolvePushLocale", () => {
  it("maps nb to nb and everything else to en", () => {
    expect(resolvePushLocale("nb")).toBe("nb");
    expect(resolvePushLocale("en")).toBe("en");
    expect(resolvePushLocale("de")).toBe("en");
  });
});

describe("composeShoppingListNotification", () => {
  it("renders an approval announcement in both locales, with a readable week", () => {
    const entries: NotificationEntry[] = [{ kind: "approved", actorLabel: "anna@example.com" }];
    expect(composeShoppingListNotification(entries, WEEK, "en")).toEqual({
      title: "🛒 anna@example.com is going shopping",
      body: "The shopping list for week 3 was approved.",
    });
    expect(composeShoppingListNotification(entries, WEEK, "nb")).toEqual({
      title: "🛒 anna@example.com skal handle nå",
      body: "Handlelisten for uke 3 ble godkjent.",
    });
  });

  it("renders a reopen notification in both locales", () => {
    const entries: NotificationEntry[] = [{ kind: "reopened", actorLabel: "bo@example.com" }];
    expect(composeShoppingListNotification(entries, WEEK, "en")).toEqual({
      title: "Shopping list reopened",
      body: "bo@example.com reopened the shopping list for week 3.",
    });
    expect(composeShoppingListNotification(entries, WEEK, "nb")).toEqual({
      title: "Handlelisten ble gjenåpnet",
      body: "bo@example.com gjenåpnet handlelisten for uke 3.",
    });
  });

  it("renders the ready and completed announcements in both locales", () => {
    const ready: NotificationEntry[] = [{ kind: "ready", actorLabel: "anna@example.com" }];
    expect(composeShoppingListNotification(ready, WEEK, "en")).toEqual({
      title: "Shopping list is ready (week 3)",
      body: "anna@example.com marked the shopping list ready — anyone can go shopping.",
    });
    expect(composeShoppingListNotification(ready, WEEK, "nb").title).toBe(
      "Handlelisten er klar (uke 3)",
    );

    const done: NotificationEntry[] = [{ kind: "completed", actorLabel: "bo@example.com", itemCount: 1 }];
    expect(composeShoppingListNotification(done, WEEK, "en")).toEqual({
      title: "✅ bo@example.com finished shopping",
      body: "1 item bought for week 3.",
    });
    expect(composeShoppingListNotification(done, WEEK, "nb")).toEqual({
      title: "✅ bo@example.com er ferdig med å handle",
      body: "1 vare handlet for uke 3.",
    });
  });

  it("batches item adds per actor with plural handling (the 'Aivo added 3 items' shape)", () => {
    const entries: NotificationEntry[] = [
      { kind: "items", actorLabel: "Aivo", itemsAdded: 2 },
      { kind: "items", actorLabel: "Aivo", itemsAdded: 1 },
    ];
    expect(composeShoppingListNotification(entries, WEEK, "en")).toEqual({
      title: "Shopping list updated (week 3)",
      body: "Aivo added 3 items to the shopping list.",
    });
    expect(composeShoppingListNotification(entries, WEEK, "nb").body).toBe(
      "Aivo la til 3 varer i handlelisten.",
    );

    const single: NotificationEntry[] = [{ kind: "items", actorLabel: "Aivo", itemsAdded: 1 }];
    expect(composeShoppingListNotification(single, WEEK, "en").body).toBe(
      "Aivo added 1 item to the shopping list.",
    );
    expect(composeShoppingListNotification(single, WEEK, "nb").body).toBe(
      "Aivo la til 1 vare i handlelisten.",
    );
  });

  it("counts non-add changes and mixes them with adds", () => {
    const edits: NotificationEntry[] = [
      { kind: "items", actorLabel: "bo@example.com" },
      { kind: "items", actorLabel: "bo@example.com" },
    ];
    expect(composeShoppingListNotification(edits, WEEK, "en").body).toBe(
      "bo@example.com made 2 changes to the shopping list.",
    );
    expect(composeShoppingListNotification(edits, WEEK, "nb").body).toBe(
      "bo@example.com gjorde 2 endringer i handlelisten.",
    );

    const mixed: NotificationEntry[] = [
      { kind: "items", actorLabel: "bo@example.com", itemsAdded: 2 },
      { kind: "items", actorLabel: "bo@example.com" },
    ];
    expect(composeShoppingListNotification(mixed, WEEK, "en").body).toBe(
      "bo@example.com added 2 items and made 1 other change to the shopping list.",
    );
    expect(composeShoppingListNotification(mixed, WEEK, "nb").body).toBe(
      "bo@example.com la til 2 varer og gjorde 1 annen endring i handlelisten.",
    );
  });

  it("keeps one body line per actor, in first-seen order", () => {
    const entries: NotificationEntry[] = [
      { kind: "items", actorLabel: "Aivo", itemsAdded: 3 },
      { kind: "items", actorLabel: "bo@example.com" },
    ];
    expect(composeShoppingListNotification(entries, WEEK, "en").body).toBe(
      "Aivo added 3 items to the shopping list.\nbo@example.com made 1 change to the shopping list.",
    );
  });

  it("lets a status transition take the title and prepends its line to pending item lines", () => {
    const entries: NotificationEntry[] = [
      { kind: "items", actorLabel: "bo@example.com", itemsAdded: 1 },
      { kind: "reopened", actorLabel: "bo@example.com" },
    ];
    const copy = composeShoppingListNotification(entries, WEEK, "en");
    expect(copy.title).toBe("Shopping list reopened");
    expect(copy.body).toBe(
      "bo@example.com reopened the shopping list for week 3.\nbo@example.com added 1 item to the shopping list.",
    );
  });

  it("falls back to an anonymous actor and a verbatim week when data is missing", () => {
    const entries: NotificationEntry[] = [{ kind: "approved" }];
    expect(composeShoppingListNotification(entries, "whenever", "en")).toEqual({
      title: "🛒 Someone is going shopping",
      body: "The shopping list for whenever was approved.",
    });
    expect(composeShoppingListNotification(entries, "whenever", "nb").title).toBe(
      "🛒 Noen skal handle nå",
    );
  });
});
