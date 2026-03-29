import { describe, it, expect } from "vitest";
import { studioSqFt, parsePolygonPoints } from "../lib/studioGeometry";

// ── parsePolygonPoints ────────────────────────────────────────────────────────

describe("parsePolygonPoints", () => {
  it("parses standard 'x,y x,y' format", () => {
    expect(parsePolygonPoints("0,0 10,0 10,10 0,10")).toEqual([
      [0, 0], [10, 0], [10, 10], [0, 10],
    ]);
  });

  it("handles extra whitespace", () => {
    const pts = parsePolygonPoints("  0,0  10,0  10,10  0,10  ");
    expect(pts).toHaveLength(4);
  });

  it("returns [] for fewer than 3 vertices", () => {
    expect(parsePolygonPoints("0,0 10,0")).toEqual([]);
    expect(parsePolygonPoints("")).toEqual([]);
    expect(parsePolygonPoints("  ")).toEqual([]);
  });

  it("returns [] for an odd number of coordinate values", () => {
    expect(parsePolygonPoints("0 10 20")).toEqual([]);
  });
});

// ── studioSqFt ────────────────────────────────────────────────────────────────

describe("studioSqFt", () => {
  // ── axis-aligned rectangles ─────────────────────────────────────────────────

  it("computes a 100px × 100px square at 10 px/ft → 100 sq ft", () => {
    const pts = "0,0 100,0 100,100 0,100";
    expect(studioSqFt(pts, 10)).toBe(100);
  });

  it("computes a 200px × 100px rectangle at 10 px/ft → 200 sq ft", () => {
    const pts = "0,0 200,0 200,100 0,100";
    expect(studioSqFt(pts, 10)).toBe(200);
  });

  it("scales correctly with different px/ft values", () => {
    // Same polygon — higher px/ft means each pixel represents less real space
    const pts = "0,0 100,0 100,100 0,100"; // 10000 px²
    expect(studioSqFt(pts, 10)).toBe(100);   // 10000 / 100
    expect(studioSqFt(pts, 20)).toBe(25);    // 10000 / 400
    expect(studioSqFt(pts, 5)).toBe(400);    // 10000 / 25
  });

  // ── non-axis-aligned polygon ─────────────────────────────────────────────────

  it("computes a right triangle (half of 100×100 square) → 50 sq ft at 10 px/ft", () => {
    // Triangle with vertices (0,0) (100,0) (0,100): area = 0.5 × base × height = 5000 px²
    const pts = "0,0 100,0 0,100";
    expect(studioSqFt(pts, 10)).toBe(50);
  });

  it("computes an L-shaped studio correctly", () => {
    // L-shape: 20×20 square with 10×10 notch removed from top-right corner
    // Vertices (clockwise): (0,0) (20,0) (20,10) (10,10) (10,20) (0,20)
    // Expected area = 400 - 100 = 300 px²
    const pts = "0,0 20,0 20,10 10,10 10,20 0,20";
    // At 1 px/ft → 300 sq ft
    expect(studioSqFt(pts, 1)).toBe(300);
  });

  // ── winding order ─────────────────────────────────────────────────────────────

  it("gives the same result regardless of winding order (CW vs CCW)", () => {
    const ccw = "0,0 100,0 100,100 0,100";
    const cw  = "0,0 0,100 100,100 100,0";
    expect(studioSqFt(ccw, 10)).toBe(studioSqFt(cw, 10));
  });

  // ── real-world approximation ──────────────────────────────────────────────────

  it("approximates 250 sq ft for a typical small studio at AA scale", () => {
    // Artisans Asylum building is roughly 300 ft wide.
    // SVG default width = 1000 px → pxPerFoot ≈ 3.33
    // A 250 sq ft studio would be ~28.9 ft × 8.66 ft.
    // In px: ~96.3 × 28.9 → area ≈ 2781 px²; at (10/3)² ≈ 11.11 px²/ft² → ~250 ft²
    const pxPerFoot = 1000 / 300; // ≈ 3.333
    // 28 ft × 8.9 ft studio
    const wPx = 28 * pxPerFoot;
    const hPx = 8.9 * pxPerFoot;
    const pts = `0,0 ${wPx},0 ${wPx},${hPx} 0,${hPx}`;
    const result = studioSqFt(pts, pxPerFoot);
    expect(result).toBeCloseTo(28 * 8.9, 0); // 249.2 sq ft
  });

  // ── edge cases ────────────────────────────────────────────────────────────────

  it("returns 0 for a degenerate polygon (< 3 vertices)", () => {
    expect(studioSqFt("0,0 10,0", 10)).toBe(0);
    expect(studioSqFt("", 10)).toBe(0);
  });

  it("throws RangeError for non-positive pxPerFoot", () => {
    expect(() => studioSqFt("0,0 10,0 10,10", 0)).toThrow(RangeError);
    expect(() => studioSqFt("0,0 10,0 10,10", -5)).toThrow(RangeError);
  });
});
