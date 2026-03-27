import { describe, it, expect } from "vitest";
import { computeFloorPlanDiff } from "../lib/computeFloorPlanDiff";

function makeDb(entries: Array<[string, string | null]>) {
  return entries.map(([externalId, resourceId]) => ({ externalId, resourceId }));
}

function makeIncoming(ids: string[], type = "studio_unit"): Map<string, string> {
  return new Map(ids.map(id => [id, type]));
}

describe("computeFloorPlanDiff", () => {
  it("all new spaces when DB is empty", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1", "studio-2"]),
      [],
    );
    expect(diff.newSpaces).toEqual(expect.arrayContaining(["studio-1", "studio-2"]));
    expect(diff.existingKept).toBe(0);
    expect(diff.removedAssigned).toHaveLength(0);
    expect(diff.removedUnassigned).toHaveLength(0);
  });

  it("all existing when incoming matches DB exactly", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1", "studio-2"]),
      makeDb([["studio-1", null], ["studio-2", null]]),
    );
    expect(diff.newSpaces).toHaveLength(0);
    expect(diff.existingKept).toBe(2);
    expect(diff.removedAssigned).toHaveLength(0);
    expect(diff.removedUnassigned).toHaveLength(0);
  });

  it("correctly identifies new spaces", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1", "studio-2", "studio-3"]),
      makeDb([["studio-1", null], ["studio-2", null]]),
    );
    expect(diff.newSpaces).toEqual(["studio-3"]);
    expect(diff.existingKept).toBe(2);
  });

  it("categorises removed unassigned spaces", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1"]),
      makeDb([["studio-1", null], ["studio-2", null]]),
    );
    expect(diff.removedUnassigned).toEqual(["studio-2"]);
    expect(diff.removedAssigned).toHaveLength(0);
  });

  it("categorises removed assigned spaces (blocks upload)", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1"]),
      makeDb([["studio-1", null], ["studio-2", "resource-abc"]]),
    );
    expect(diff.removedAssigned).toEqual(["studio-2"]);
    expect(diff.removedUnassigned).toHaveLength(0);
  });

  it("handles mix of new, kept, removed-unassigned, removed-assigned", () => {
    const diff = computeFloorPlanDiff(
      makeIncoming(["studio-1", "studio-3", "studio-4"]),
      makeDb([
        ["studio-1", null],         // kept
        ["studio-2", null],         // removed unassigned
        ["studio-3", "res-x"],      // kept (assigned)
        // studio-4 is new
      ]),
    );
    expect(diff.existingKept).toBe(2);            // studio-1 + studio-3
    expect(diff.newSpaces).toEqual(["studio-4"]);
    expect(diff.removedUnassigned).toEqual(["studio-2"]);
    expect(diff.removedAssigned).toHaveLength(0);
  });

  it("returns empty diff for empty inputs", () => {
    const diff = computeFloorPlanDiff(new Map(), []);
    expect(diff.newSpaces).toHaveLength(0);
    expect(diff.existingKept).toBe(0);
    expect(diff.removedAssigned).toHaveLength(0);
    expect(diff.removedUnassigned).toHaveLength(0);
  });
});
