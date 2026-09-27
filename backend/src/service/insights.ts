import { sql } from "kysely";
import type { Db } from "../db/kysely.js";
import type { DayAssignment, MealPlanDoc, PersistedShoppingListDoc } from "../domain/types.js";

/** A completed trip as the spending summary needs it: who, when, how much — not what. */
export interface InsightsTrip {
  id: string;
  completedAt: string;
  completedByEmail: string;
  itemCount: number;
  /** Kroner paid at the till; absent when the shopper did not record it. */
  totalCost?: number;
}

/** One planned dinner of the week. */
export type InsightsMeal = Pick<DayAssignment, "day" | "recipeId" | "recipeName" | "persons">;

export interface InsightsWeek {
  weekId: string;
  meals: InsightsMeal[];
  trips: InsightsTrip[];
}

export interface InsightsResponse {
  from: string;
  to: string;
  /** Weeks with at least one meal or trip, oldest first. */
  weeks: InsightsWeek[];
}

/**
 * The family's record over a span of weeks — what was planned and what was
 * bought — read straight from the stored docs. Deliberately not the
 * sync-on-read path: the open list is irrelevant here, and regenerating it
 * for fifty weeks on every visit would be wasted work. Trips stay attached to
 * the week whose list they came from; the client regroups them by the date
 * they were paid when it shows months.
 */
export async function readInsights(
  db: Db,
  familyId: string,
  from: string,
  to: string,
): Promise<InsightsResponse> {
  const [plans, lists] = await Promise.all([
    db
      .selectFrom("meal_plans")
      .select("doc")
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' >= ${from}`)
      .where(sql<boolean>`doc->>'weekIdentifier' <= ${to}`)
      .execute(),
    db
      .selectFrom("shopping_lists")
      .select("doc")
      .where("family_id", "=", familyId)
      .where(sql<boolean>`doc->>'weekIdentifier' >= ${from}`)
      .where(sql<boolean>`doc->>'weekIdentifier' <= ${to}`)
      .execute(),
  ]);

  const weeks = new Map<string, InsightsWeek>();
  const weekFor = (weekId: string): InsightsWeek => {
    let week = weeks.get(weekId);
    if (!week) {
      week = { weekId, meals: [], trips: [] };
      weeks.set(weekId, week);
    }
    return week;
  };

  for (const { doc } of plans as { doc: MealPlanDoc }[]) {
    const meals = doc.assignments.map(({ day, recipeId, recipeName, persons }) => ({
      day,
      recipeId,
      recipeName,
      ...(persons != null ? { persons } : {}),
    }));
    if (meals.length > 0) weekFor(doc.weekIdentifier).meals.push(...meals);
  }

  for (const { doc } of lists as { doc: PersistedShoppingListDoc }[]) {
    const trips = (doc.trips ?? []).map((trip) => ({
      id: trip.id,
      completedAt: trip.completedAt,
      completedByEmail: trip.completedByEmail,
      itemCount: trip.items.length,
      ...(trip.totalCost !== undefined ? { totalCost: trip.totalCost } : {}),
    }));
    if (trips.length > 0) weekFor(doc.weekIdentifier).trips.push(...trips);
  }

  return {
    from,
    to,
    weeks: [...weeks.values()].sort((a, b) => a.weekId.localeCompare(b.weekId)),
  };
}
