/**
 * Extract space metadata from an SVG floor plan string.
 * Returns a Map from externalId → blockType.
 *
 * Looks for elements with both data-space-id and data-type attributes,
 * in either attribute order.
 */
export function parseSpacesFromSvg(svgText: string): Map<string, string> {
  const spaceRegex = /data-space-id="([^"]+)"[^>]*data-type="([^"]+)"/g;
  const found = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = spaceRegex.exec(svgText)) !== null) {
    found.set(m[1], m[2]);
  }
  return found;
}
