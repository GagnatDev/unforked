import type { Db } from "../db/kysely.js";
import type { ShoppingCategory, ShoppingListEntry } from "../domain/types.js";
import { IngredientCategoryRepository } from "../storage/ingredientCategoryRepository.js";
import { ShoppingListRepository } from "../storage/shoppingListRepository.js";
import { publishShoppingListEvent, type ChangeActor } from "./changeEvents.js";
import { createManualEntry } from "./shoppingListSync.js";

export interface ManualItemInput {
  /** Client-minted UUID (offline-first). Omitted for server-minted ids. */
  id?: string;
  name: string;
  quantity: string;
  unit: string;
  category?: ShoppingCategory;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * Append one or more manual (user-added) items to a week's persisted shopping
 * list, shared by the human API and the machine API. Items are auto-categorized
 * from the family's overrides unless a category is given. If the week has no
 * list row yet (no plan, never viewed), one is created on the fly; the unique
 * (family, week) index race with a concurrent first write is retried once.
 *
 * When an input carries a client-minted `id` that already exists in the row,
 * the existing item is returned unchanged rather than appended again, so
 * replaying an offline outbox create (e.g. after a reload mid-flush) is
 * idempotent.
 *
 * Emits one `shopping-list.changed` event after the commit when anything was
 * actually appended (a pure idempotent replay stays silent). Emission lives
 * here — the layer shared by the human POST and the machine batch-add — with
 * the actor passed in, so the two surfaces can't drift (design #104 D1).
 */
export async function addManualItems(
  db: Db,
  familyId: string,
  weekId: string,
  inputs: ManualItemInput[],
  actor: ChangeActor,
): Promise<ShoppingListEntry[]> {
  const shoppingLists = new ShoppingListRepository(db);
  const ingredientCategories = new IngredientCategoryRepository(db);
  const overrides = await ingredientCategories.findAllForFamily(familyId);

  const insertItems = () =>
    db.transaction().execute(async (trx) => {
      const row = await shoppingLists.findRowByWeekForUpdate(trx, familyId, weekId);
      const existingById = new Map(
        (row?.doc.items ?? []).map((item) => [item.id, item]),
      );
      const created: ShoppingListEntry[] = [];
      const appended: ShoppingListEntry[] = [];
      for (const input of inputs) {
        const existing = input.id ? existingById.get(input.id) : undefined;
        if (existing) {
          created.push(existing);
          continue;
        }
        const entry = createManualEntry(input, overrides);
        created.push(entry);
        appended.push(entry);
      }
      if (appended.length > 0) {
        if (row) {
          row.doc.items.push(...appended);
          await shoppingLists.updateDoc(trx, row.id, row.doc);
        } else {
          await shoppingLists.insert(trx, familyId, { weekIdentifier: weekId, items: appended });
        }
      }
      // Appends don't bump the version (adds are idempotent on the client id,
      // not baseVersion-guarded), so the post-write version is the row's
      // current one — 0 for a freshly inserted row (column default).
      return {
        created,
        appendedCount: appended.length,
        version: row?.version ?? 0,
        // Trip state at commit time, for the notification policy (D6). A
        // freshly created row is open by construction.
        status: row?.doc.status ?? ("open" as const),
        approvedBy: row?.doc.approvedBy,
      };
    });

  const outcome = await insertItems().catch((err) => {
    if (!isUniqueViolation(err)) throw err;
    return insertItems();
  });

  if (outcome.appendedCount > 0) {
    publishShoppingListEvent(
      {
        type: "shopping-list.changed",
        familyId,
        week: weekId,
        version: outcome.version,
        actor,
      },
      {
        status: outcome.status,
        approvedBy: outcome.approvedBy,
        itemsAdded: outcome.appendedCount,
      },
    );
  }
  return outcome.created;
}
