import { describe, expect, it } from "vitest";
import { normalizeRole } from "./auth.js";

describe("normalizeRole", () => {
  it("recognizes admin case-insensitively", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("Admin")).toBe("admin");
  });

  it("collapses everything else to user", () => {
    expect(normalizeRole("user")).toBe("user");
    expect(normalizeRole("superuser")).toBe("user");
    expect(normalizeRole("")).toBe("user");
    expect(normalizeRole(undefined)).toBe("user");
    expect(normalizeRole(null)).toBe("user");
  });
});
