/**
 * Shoelace (Gauss's area) formula for a simple polygon.
 * Returns the signed area in whatever units the coordinates are in.
 * The absolute value is used so winding order doesn't matter.
 */
function shoelaceArea(vertices: Array<[number, number]>): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Parse an SVG `points` attribute into an array of [x, y] vertices.
 * Handles both space-separated "x,y x,y" and comma-separated "x,y,x,y" formats.
 * Returns [] for blank or unparseable input.
 */
export function parsePolygonPoints(svgPoints: string): Array<[number, number]> {
  const nums = svgPoints
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n));
  if (nums.length < 6 || nums.length % 2 !== 0) return [];
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < nums.length; i += 2) {
    vertices.push([nums[i], nums[i + 1]]);
  }
  return vertices;
}

/**
 * Compute the area of a studio polygon in square feet.
 *
 * @param svgPoints  - the SVG `points` attribute, e.g. "10,20 50,20 50,80 10,80"
 * @param pxPerFoot  - SVG pixels per real-world foot.
 *                     Derive this from the SVG viewBox and the known building width:
 *                       pxPerFoot = svgViewBoxWidth / buildingWidthFeet
 *                     For a DXF drawn in inches with default target_width=1000:
 *                       pxPerFoot = 1000 / (buildingWidthInches / 12)
 *
 * @returns Area in square feet, rounded to one decimal place.
 *          Returns 0 for degenerate polygons (< 3 vertices).
 */
export function studioSqFt(svgPoints: string, pxPerFoot: number): number {
  if (pxPerFoot <= 0) throw new RangeError("pxPerFoot must be positive");
  const vertices = parsePolygonPoints(svgPoints);
  const pxSquared = shoelaceArea(vertices);
  const sqFt = pxSquared / (pxPerFoot * pxPerFoot);
  return Math.round(sqFt * 10) / 10;
}
