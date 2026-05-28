import { describe, expect, it } from "vitest";
import { currentWeekIdentifier } from "./weekIdentifier.js";

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
