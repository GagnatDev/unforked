import { describe, expect, it } from "vitest";
import { bestDisplayUnit, normalizeUnit } from "./unitConversion.js";

describe("normalizeUnit", () => {
  it("resolves known aliases case-insensitively", () => {
    expect(normalizeUnit("kg")?.toBase).toBe(1000);
    expect(normalizeUnit("DL")?.canonical).toBe("dl");
    expect(normalizeUnit(" tbsp ")?.canonical).toBe("tbsp");
    expect(normalizeUnit("teskje")?.family).toBe("volume");
  });

  it("returns null for unknown or compound units", () => {
    expect(normalizeUnit("g can")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("handful")).toBeNull();
  });
});

describe("bestDisplayUnit", () => {
  it("scales weight to kg above 1000g", () => {
    expect(bestDisplayUnit(1500, "weight")).toEqual([1.5, "kg"]);
    expect(bestDisplayUnit(500, "weight")).toEqual([500, "g"]);
  });

  it("scales volume to l/dl/ml", () => {
    expect(bestDisplayUnit(1500, "volume")).toEqual([1.5, "l"]);
    expect(bestDisplayUnit(150, "volume")).toEqual([1.5, "dl"]);
    expect(bestDisplayUnit(50, "volume")).toEqual([50, "ml"]);
  });
});
