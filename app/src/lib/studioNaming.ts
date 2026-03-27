/**
 * Naming convention for studio assemblies.
 *
 * Format:  s{AREA}-{N}
 *   s       — literal, always lowercase
 *   AREA    — area token: uppercased if it contains any letter, else digits unchanged
 *   N       — auto-incremented integer (1-based); deleted numbers are never reused
 *
 * Examples: s10-1, sFIBER-1, sNE-3, sE&R-2
 */

export function normalizeArea(raw: string): string {
  const t = raw.trim();
  return /[a-zA-Z]/.test(t) ? t.toUpperCase() : t;
}

export function buildStudioName(area: string, n: number): string {
  return `s${normalizeArea(area)}-${n}`;
}

/** Returns { area, n } if the name matches the convention, else null. */
export function parseStudioName(name: string): { area: string; n: number } | null {
  const m = name.match(/^s([^-]+)-(\d+)$/);
  if (!m) return null;
  return { area: m[1], n: parseInt(m[2], 10) };
}

/**
 * From a list of existing resource names, build Map<areaToken, maxN>.
 * Non-matching names are ignored.
 */
export function buildAreaMap(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const name of names) {
    const p = parseStudioName(name);
    if (!p) continue;
    map.set(p.area, Math.max(map.get(p.area) ?? 0, p.n));
  }
  return map;
}

/**
 * Next N for an area (max existing + 1). Returns 1 for a new area.
 * Deleted numbers are skipped (never reused).
 */
export function nextStudioN(area: string, existingNames: string[]): number {
  const map = buildAreaMap(existingNames);
  return (map.get(normalizeArea(area)) ?? 0) + 1;
}
