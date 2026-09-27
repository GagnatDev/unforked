import { Router } from "express";
import { addWeeks } from "date-fns";
import type { Db } from "../db/kysely.js";
import { currentWeekIdentifier } from "../domain/weekIdentifier.js";
import { readInsights } from "../service/insights.js";
import { UserRepository } from "../storage/userRepository.js";
import { requireUserAndFamily } from "./context.js";

const WEEK_ID = /^\d{4}-W\d{2}$/;

/** Without an explicit range the summary covers the past year. */
const DEFAULT_SPAN_WEEKS = 52;
/** Longest span one request may ask for; the client pages by moving `from`/`to`. */
const MAX_SPAN_WEEKS = 106;

/** Zero-padded ISO week ids sort as strings, so a span is a string range. */
function spanWeeks(from: string, to: string): number {
  const [fy, fw] = from.split("-W").map(Number);
  const [ty, tw] = to.split("-W").map(Number);
  // A year has 52 or 53 weeks; 53 over-counts by at most one per year, which
  // only ever makes the bound slightly more permissive.
  return (ty - fy) * 53 + (tw - fw) + 1;
}

/**
 * Authenticated read of the family's planning and spending record, for the
 * Insights page. `from`/`to` are inclusive ISO week ids; both optional.
 */
export function insightsRoutes(db: Db): Router {
  const users = new UserRepository(db);
  const router = Router();

  router.get("/insights", async (req, res) => {
    const { familyId } = await requireUserAndFamily(users, req);
    const now = new Date();
    const to = typeof req.query.to === "string" ? req.query.to : currentWeekIdentifier(now);
    const from =
      typeof req.query.from === "string"
        ? req.query.from
        : currentWeekIdentifier(addWeeks(now, -(DEFAULT_SPAN_WEEKS - 1)));
    if (!WEEK_ID.test(from) || !WEEK_ID.test(to)) {
      res.status(400).json({ error: "from/to must be ISO week ids (YYYY-Www)" });
      return;
    }
    if (from > to) {
      res.status(400).json({ error: "from must not be after to" });
      return;
    }
    if (spanWeeks(from, to) > MAX_SPAN_WEEKS) {
      res.status(400).json({ error: `range must not exceed ${MAX_SPAN_WEEKS} weeks` });
      return;
    }
    res.json(await readInsights(db, familyId, from, to));
  });

  return router;
}
