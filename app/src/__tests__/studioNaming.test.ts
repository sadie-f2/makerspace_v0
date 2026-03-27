import { describe, it, expect } from "vitest";
import {
  normalizeArea,
  buildStudioName,
  parseStudioName,
  buildAreaMap,
  nextStudioN,
} from "../lib/studioNaming";

describe("normalizeArea", () => {
  it("uppercases tokens containing letters", () => {
    expect(normalizeArea("fiber")).toBe("FIBER");
    expect(normalizeArea("ne")).toBe("NE");
    expect(normalizeArea("e&r")).toBe("E&R");
    expect(normalizeArea("10a")).toBe("10A");
  });

  it("leaves digit-only tokens unchanged", () => {
    expect(normalizeArea("10")).toBe("10");
    expect(normalizeArea("00")).toBe("00");
  });

  it("trims whitespace", () => {
    expect(normalizeArea("  fiber  ")).toBe("FIBER");
    expect(normalizeArea(" 10 ")).toBe("10");
  });
});

describe("buildStudioName", () => {
  it("constructs the name", () => {
    expect(buildStudioName("10", 1)).toBe("s10-1");
    expect(buildStudioName("fiber", 3)).toBe("sFIBER-3");
    expect(buildStudioName("NE", 2)).toBe("sNE-2");
    expect(buildStudioName("e&r", 1)).toBe("sE&R-1");
  });
});

describe("parseStudioName", () => {
  it("parses valid names", () => {
    expect(parseStudioName("s10-1")).toEqual({ area: "10", n: 1 });
    expect(parseStudioName("sFIBER-3")).toEqual({ area: "FIBER", n: 3 });
    expect(parseStudioName("sNE-12")).toEqual({ area: "NE", n: 12 });
  });

  it("returns null for non-matching names", () => {
    expect(parseStudioName("Studio 101")).toBeNull();
    expect(parseStudioName("s10")).toBeNull();
    expect(parseStudioName("")).toBeNull();
    expect(parseStudioName("s-1")).toBeNull();
  });
});

describe("buildAreaMap", () => {
  it("returns max N per area", () => {
    const map = buildAreaMap(["s10-1", "s10-3", "s10-2", "sFIBER-1"]);
    expect(map.get("10")).toBe(3);
    expect(map.get("FIBER")).toBe(1);
  });

  it("ignores non-matching names", () => {
    const map = buildAreaMap(["Studio 101", "s10-1", "old-name"]);
    expect(map.size).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(buildAreaMap([]).size).toBe(0);
  });
});

describe("nextStudioN", () => {
  it("returns 1 for a new area", () => {
    expect(nextStudioN("20", ["s10-1", "s10-2"])).toBe(1);
    expect(nextStudioN("FIBER", [])).toBe(1);
  });

  it("returns max+1 for an existing area", () => {
    expect(nextStudioN("10", ["s10-1", "s10-3", "s10-2"])).toBe(4);
  });

  it("normalizes the area before lookup", () => {
    // "fiber" normalizes to "FIBER" which exists
    expect(nextStudioN("fiber", ["sFIBER-2"])).toBe(3);
  });

  it("skips deleted numbers (always max+1, never fills gaps)", () => {
    // gap at s10-2, existing are 1 and 3 — next is 4, not 2
    expect(nextStudioN("10", ["s10-1", "s10-3"])).toBe(4);
  });
});
