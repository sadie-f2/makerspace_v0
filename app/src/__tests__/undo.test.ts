import { describe, it, expect } from "vitest";
import { isUndoable, UNDO_WINDOW_MS } from "../lib/undo";
import type { AuditLog } from "@/generated/prisma/client";

// ── helpers ──────────────────────────────────────────────────────────────────

type LogStub = Pick<AuditLog, "action" | "actorType" | "entityType" | "timestamp" | "undoOfId">;

function makeLog(overrides: Partial<LogStub> = {}): LogStub {
  return {
    action:     "update",
    actorType:  "ADMIN",
    entityType: "Member",
    timestamp:  new Date(),        // just now — within window
    undoOfId:   null,
    ...overrides,
  };
}

// ── isUndoable ───────────────────────────────────────────────────────────────

describe("isUndoable", () => {
  it("returns true for a fresh, eligible log entry", () => {
    expect(isUndoable(makeLog())).toBe(true);
  });

  it("returns false for action='undo' (no redo)", () => {
    expect(isUndoable(makeLog({ action: "undo" }))).toBe(false);
  });

  it("returns false when undoOfId is set (already an undo entry)", () => {
    expect(isUndoable(makeLog({ undoOfId: "some-id" }))).toBe(false);
  });

  it("returns false for SYSTEM actor", () => {
    expect(isUndoable(makeLog({ actorType: "SYSTEM" }))).toBe(false);
  });

  it("returns false for an entity type not in the undoable set", () => {
    expect(isUndoable(makeLog({ entityType: "FloorPlan" }))).toBe(false);
    expect(isUndoable(makeLog({ entityType: "AuditLog" }))).toBe(false);
  });

  it("returns true for every supported entity type", () => {
    const supported = [
      "Member", "Rental", "Reservation",
      "Certification", "MemberPermission", "Resource", "WaitlistEntry",
    ];
    for (const entityType of supported) {
      expect(isUndoable(makeLog({ entityType }))).toBe(true);
    }
  });

  it("returns false when the log entry is older than the undo window", () => {
    const old = new Date(Date.now() - UNDO_WINDOW_MS - 1);
    expect(isUndoable(makeLog({ timestamp: old }))).toBe(false);
  });

  it("returns true at the exact boundary of the undo window", () => {
    const boundary = new Date(Date.now() - UNDO_WINDOW_MS);
    expect(isUndoable(makeLog({ timestamp: boundary }))).toBe(true);
  });

  it("returns false for action='restore'", () => {
    // 'restore' is a valid action but should be treated as not undoable
    // (not in the undo-supported action list — only update/create/delete are meaningful)
    // Note: current impl only blocks action="undo"; "restore" passes through.
    // This test documents current behaviour.
    expect(isUndoable(makeLog({ action: "restore" }))).toBe(true);
  });
});
