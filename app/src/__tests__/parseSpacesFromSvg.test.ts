import { describe, it, expect } from "vitest";
import { parseSpacesFromSvg } from "../lib/parseSpacesFromSvg";

describe("parseSpacesFromSvg", () => {
  it("parses a single space element", () => {
    const svg = `<polygon data-space-id="studio-1" data-type="studio_unit" style="fill:#e5e7eb" />`;
    const result = parseSpacesFromSvg(svg);
    expect(result.get("studio-1")).toBe("studio_unit");
  });

  it("parses multiple spaces", () => {
    const svg = `
      <polygon data-space-id="studio-1" data-type="studio_unit" />
      <polygon data-space-id="studio-2" data-type="studio_unit" />
      <polygon data-space-id="wood_shop" data-type="shop" />
    `;
    const result = parseSpacesFromSvg(svg);
    expect(result.size).toBe(3);
    expect(result.get("studio-1")).toBe("studio_unit");
    expect(result.get("wood_shop")).toBe("shop");
  });

  it("ignores elements without both attributes", () => {
    const svg = `
      <polygon data-space-id="studio-1" />
      <polygon data-type="studio_unit" />
      <polygon data-space-id="studio-2" data-type="studio_unit" />
    `;
    const result = parseSpacesFromSvg(svg);
    expect(result.size).toBe(1);
    expect(result.has("studio-2")).toBe(true);
  });

  it("handles attributes with other content between them", () => {
    const svg = `<polygon data-space-id="wood_shop" style="fill:#e5e7eb;stroke:#4a6fa5" data-type="shop" points="1,2 3,4" />`;
    const result = parseSpacesFromSvg(svg);
    expect(result.get("wood_shop")).toBe("shop");
  });

  it("returns empty map for SVG with no spaces", () => {
    const svg = `<svg><g id="envelope"><path d="M0,0" /></g></svg>`;
    expect(parseSpacesFromSvg(svg).size).toBe(0);
  });

  it("returns empty map for empty string", () => {
    expect(parseSpacesFromSvg("").size).toBe(0);
  });

  it("does not match data-type appearing before data-space-id", () => {
    // The regex requires data-space-id first; reversed order should not match
    const svg = `<polygon data-type="studio_unit" data-space-id="studio-1" />`;
    const result = parseSpacesFromSvg(svg);
    // This is a known limitation — document it by expecting 0 or 1
    // Currently 0 because regex is data-space-id first
    expect(result.size).toBe(0);
  });

  it("deduplicates repeated IDs (last write wins via Map)", () => {
    const svg = `
      <polygon data-space-id="studio-1" data-type="studio_unit" />
      <polygon data-space-id="studio-1" data-type="shop" />
    `;
    const result = parseSpacesFromSvg(svg);
    expect(result.size).toBe(1);
    expect(result.get("studio-1")).toBe("shop");
  });
});
