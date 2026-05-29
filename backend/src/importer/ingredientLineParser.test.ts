import { describe, expect, it } from "vitest";
import { parseLine } from "./ingredientLineParser.js";

describe("parseLine", () => {
  it("handles a Norwegian decimal comma and dl", () => {
    expect(parseLine("1,5 dl fin sammalt hvete")).toEqual({
      name: "fin sammalt hvete",
      quantity: "1,5",
      unit: "dl",
    });
  });

  it("handles the Norwegian tablespoon abbreviation", () => {
    expect(parseLine("1 ss margarin til steking")).toEqual({
      name: "margarin til steking",
      quantity: "1",
      unit: "ss",
    });
  });

  it("keeps an approximate qualifier on the name and normalizes a dotted count unit", () => {
    expect(parseLine("ca. 20 stk. maistortilla")).toEqual({
      name: "ca. maistortilla",
      quantity: "20",
      unit: "stk",
    });
  });

  it("parses an English-style line", () => {
    expect(parseLine("200 g carrots")).toEqual({ name: "carrots", quantity: "200", unit: "g" });
  });

  it("keeps the full line as name for an unrecognized unit", () => {
    expect(parseLine("a pinch of salt")).toEqual({
      name: "a pinch of salt",
      quantity: "",
      unit: "",
    });
  });

  it("falls back to the full line when there is no trailing name", () => {
    expect(parseLine("200 g")).toEqual({ name: "200 g", quantity: "", unit: "" });
  });

  it("returns an empty ingredient for blank input", () => {
    expect(parseLine("   ")).toEqual({ name: "", quantity: "", unit: "" });
  });
});
