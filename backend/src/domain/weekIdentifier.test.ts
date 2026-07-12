import { describe, expect, it } from "vitest";
import {
  currentWeekIdentifier,
  nextWeekIdentifier,
  resolveWeekAlias,
} from "./weekIdentifier.js";

describe("currentWeekIdentifier", () => {
  it.each([
    [new Date(2026, 0, 5), "2026-W02"],
    [new Date(2026, 0, 1), "2026-W01"],
    [new Date(2027, 0, 1), "2026-W53"], // belongs to the ISO week of the prior year
    [new Date(2026, 5, 15), "2026-W25"],
  ])("formats %s as %s", (date, expected) => {
    expect(currentWeekIdentifier(date)).toBe(expected);
  });

  it("zero-pads single-digit week numbers", () => {
    expect(currentWeekIdentifier(new Date(2026, 0, 5))).toMatch(/-W0\d$/);
  });
});

describe("nextWeekIdentifier", () => {
  it.each([
    [new Date(2026, 0, 5), "2026-W03"],
    [new Date(2026, 11, 21), "2026-W53"], // 2026 has 53 ISO weeks
    [new Date(2026, 11, 28), "2027-W01"], // year rollover
  ])("advances %s to %s", (date, expected) => {
    expect(nextWeekIdentifier(date)).toBe(expected);
  });
});

describe("resolveWeekAlias", () => {
  const now = new Date(2026, 5, 15); // 2026-W25

  it("resolves the aliases server-side", () => {
    expect(resolveWeekAlias("current", now)).toBe("2026-W25");
    expect(resolveWeekAlias("next", now)).toBe("2026-W26");
  });

  it("passes literal identifiers through", () => {
    expect(resolveWeekAlias("2026-W02", now)).toBe("2026-W02");
  });

  it.each(["tomorrow", "2026-w02", "2026-W2", "26-W02", ""])("rejects %j", (raw) => {
    expect(resolveWeekAlias(raw, now)).toBeNull();
  });
});
