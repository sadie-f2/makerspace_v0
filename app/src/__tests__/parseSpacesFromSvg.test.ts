import { describe, it, expect } from "vitest";
import { parseSpacesFromSvg } from "../lib/parseSpacesFromSvg";

describe("parseSpacesFromSvg", () => {
  it("parses a single space element", () => {
    const svg = `<polygon data-space-id="studio-1" data-type="studio_unit" style="fill:#e5e7eb" />`;
    const result = parseSpacesFromSvg(svg);
    expect(result.get("studio-1")?.blockType).toBe("studio_unit");
  });

  it("parses multiple spaces", () => {
    const svg = `
      <polygon data-space-id="studio-1" data-type="studio_unit" />
      <polygon data-space-id="studio-2" data-type="studio_unit" />
      <polygon data-space-id="wood_shop" data-type="shop" />
    `;
    const result = parseSpacesFromSvg(svg);
    expect(result.size).toBe(3);
    expect(result.get("studio-1")?.blockType).toBe("studio_unit");
    expect(result.get("wood_shop")?.blockType).toBe("shop");
  });

  it("ignores elements without data-type", () => {
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
    expect(result.get("wood_shop")?.blockType).toBe("shop");
  });

  it("returns empty map for SVG with no spaces", () => {
    expect(parseSpacesFromSvg(`<svg><g id="envelope"><path d="M0,0" /></g></svg>`).size).toBe(0);
  });

  it("returns empty map for empty string", () => {
    expect(parseSpacesFromSvg("").size).toBe(0);
  });

  it("handles data-type before data-space-id", () => {
    const svg = `<polygon data-type="studio_unit" data-space-id="studio-1" />`;
    // New regex matches the full tag regardless of attribute order
    const result = parseSpacesFromSvg(svg);
    expect(result.get("studio-1")?.blockType).toBe("studio_unit");
  });

  it("deduplicates repeated IDs (last write wins via Map)", () => {
    const svg = `
      <polygon data-space-id="studio-1" data-type="studio_unit" />
      <polygon data-space-id="studio-1" data-type="shop" />
    `;
    const result = parseSpacesFromSvg(svg);
    expect(result.size).toBe(1);
    expect(result.get("studio-1")?.blockType).toBe("shop");
  });

  it("captures bay code and shelf level for shelf spaces", () => {
    const svg = `<polygon data-space-id="shelf-A1-l2" data-type="shelf" data-bay="A1" data-level="2" />`;
    const result = parseSpacesFromSvg(svg);
    const space = result.get("shelf-A1-l2");
    expect(space?.bayCode).toBe("A1");
    expect(space?.shelfLevel).toBe(2);
  });

  it("returns null bayCode and shelfLevel for non-shelf spaces", () => {
    const svg = `<polygon data-space-id="studio-1" data-type="studio_unit" />`;
    const space = parseSpacesFromSvg(svg).get("studio-1");
    expect(space?.bayCode).toBeNull();
    expect(space?.shelfLevel).toBeNull();
  });

  it("captures bay code without level for pallet/cart spaces", () => {
    const svg = `<polygon data-space-id="pallet-B3" data-type="pallet" data-bay="B3" />`;
    const space = parseSpacesFromSvg(svg).get("pallet-B3");
    expect(space?.bayCode).toBe("B3");
    expect(space?.shelfLevel).toBeNull();
  });
});
