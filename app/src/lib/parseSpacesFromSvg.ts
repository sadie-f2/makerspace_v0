/**
 * Space metadata extracted from an SVG floor plan element.
 */
export interface ParsedSpace {
  externalId: string;
  blockType:  string;
  bayCode:    string | null; // shelf/storage bays — data-bay attribute
  shelfLevel: number | null; // shelf bays only — data-level attribute
}

/**
 * Extract space metadata from an SVG floor plan string.
 * Returns a Map from externalId → ParsedSpace.
 *
 * Matches elements with data-space-id and data-type attributes (in either order).
 * Also captures optional data-bay and data-level attributes for storage spaces.
 */
export function parseSpacesFromSvg(svgText: string): Map<string, ParsedSpace> {
  // Match any opening tag that contains data-space-id and data-type
  const tagRegex = /<[a-zA-Z][^>]*data-space-id="([^"]*)"[^>]*>/g;
  const found = new Map<string, ParsedSpace>();

  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(svgText)) !== null) {
    const tag        = m[0];
    const externalId = m[1];

    const typeMatch  = /data-type="([^"]*)"/.exec(tag);
    if (!typeMatch) continue;
    const blockType = typeMatch[1];

    const bayMatch   = /data-bay="([^"]*)"/.exec(tag);
    const levelMatch = /data-level="(\d+)"/.exec(tag);

    found.set(externalId, {
      externalId,
      blockType,
      bayCode:    bayMatch  ? bayMatch[1]       : null,
      shelfLevel: levelMatch ? parseInt(levelMatch[1]) : null,
    });
  }

  return found;
}
