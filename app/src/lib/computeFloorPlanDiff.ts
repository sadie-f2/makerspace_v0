export interface FloorPlanDiff {
  newSpaces:         string[];
  removedUnassigned: string[];
  removedAssigned:   string[];   // non-empty → upload should be blocked
  existingKept:      number;
}

/**
 * Compute what changes a new set of spaces would make relative to the DB.
 *
 * @param incomingSpaces - Map<externalId, any> parsed from the incoming SVG (only keys are used)
 * @param dbSpaces       - Current spaces in the DB for this floor plan
 */
export function computeFloorPlanDiff(
  incomingSpaces: Map<string, unknown>,
  dbSpaces: Array<{ externalId: string; resourceId: string | null }>,
): FloorPlanDiff {
  const diff: FloorPlanDiff = {
    newSpaces:         [],
    removedUnassigned: [],
    removedAssigned:   [],
    existingKept:      0,
  };

  const dbMap = new Map(dbSpaces.map(s => [s.externalId, s.resourceId]));

  for (const [externalId] of incomingSpaces) {
    if (!dbMap.has(externalId)) {
      diff.newSpaces.push(externalId);
    } else {
      diff.existingKept++;
    }
  }

  for (const [externalId, resourceId] of dbMap) {
    if (!incomingSpaces.has(externalId)) {
      if (resourceId) {
        diff.removedAssigned.push(externalId);
      } else {
        diff.removedUnassigned.push(externalId);
      }
    }
  }

  return diff;
}
