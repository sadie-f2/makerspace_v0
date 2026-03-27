export interface ParsedStudioRow {
  studioName:    string;
  unitIds:       string[];
  assigneeEmail: string;
  monthlyRate:   string;
  warnings:      string[];
  errors:        string[];
}

/**
 * Parse a CSV string into studio import rows.
 * Columns (positional): studio_name, unit_ids, assignee_email, monthly_rate
 * - unit_ids may be space- or comma-separated; quote the field for multi-unit
 * - Lines starting with # and blank lines are ignored
 * - First line is skipped if it looks like a header
 * - knownUnits: set of unit externalIds already in the DB (unlinked)
 */
export function parseStudioCSV(text: string, knownUnits: Set<string>): ParsedStudioRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
  if (lines.length === 0) return [];

  // Detect header row — only skip if it looks like column labels (contains no space-id pattern)
  const first = lines[0].toLowerCase();
  const hasHeader = (first.includes("studio_name") || first.includes("unit_id") || first.includes("assignee"))
    && !first.match(/studio-\d+/);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(line => {
    // Handle quoted fields
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());

    const [studioName = "", rawUnits = "", assigneeEmail = "", monthlyRate = ""] = cols;
    const unitIds = rawUnits.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    const warnings: string[] = [];
    const errors:   string[] = [];

    if (!studioName) errors.push("Missing studio name");
    if (unitIds.length === 0) errors.push("No unit IDs");

    for (const uid of unitIds) {
      if (!knownUnits.has(uid)) warnings.push(`Unit "${uid}" not found in unconfigured units`);
    }

    if (assigneeEmail && !assigneeEmail.includes("@")) {
      warnings.push(`"${assigneeEmail}" doesn't look like an email`);
    }

    if (monthlyRate && isNaN(parseFloat(monthlyRate))) {
      warnings.push(`Monthly rate "${monthlyRate}" is not a number`);
    }

    return { studioName, unitIds, assigneeEmail, monthlyRate, warnings, errors };
  });
}
