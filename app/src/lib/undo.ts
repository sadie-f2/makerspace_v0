import { prisma } from "./prisma";
import type { AuditLog } from "@/generated/prisma/client";

export const UNDO_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Entity types where one-click undo / force-revert is supported
const UNDOABLE_ENTITIES = new Set([
  "Member",
  "Rental",
  "Reservation",
  "Certification",
  "MemberPermission",
  "Resource",
  "WaitlistEntry",
]);

// Fields that must never be written back (they are set by the DB or are immutable)
const IMMUTABLE = new Set(["id", "createdAt"]);

function cleanSnapshot(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([k]) => !IMMUTABLE.has(k)),
  );
}

/**
 * Returns true if the log entry can be reverted at all (entity type eligible,
 * not already an undo row, not a SYSTEM action). Does NOT check the time window.
 * Use isUndoable() for the full time-windowed check.
 */
export function isForceRevertEligible(
  log: Pick<AuditLog, "action" | "actorType" | "entityType" | "undoOfId">,
): boolean {
  if (log.action === "undo") return false;
  if (log.undoOfId) return false;
  if (log.actorType === "SYSTEM") return false;
  return UNDOABLE_ENTITIES.has(log.entityType);
}

export function isUndoable(log: Pick<AuditLog, "action" | "actorType" | "entityType" | "timestamp" | "undoOfId">): boolean {
  if (!isForceRevertEligible(log)) return false;
  const age = Date.now() - new Date(log.timestamp).getTime();
  return age <= UNDO_WINDOW_MS;
}

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Apply the inverse of an audit log entry.
 * Writes a new AuditLog row with action="undo" referencing the original.
 * Does NOT handle external side effects (Stripe, Brivo) — callers must note these.
 *
 * @param options.force  If true, bypasses the 1-hour time window (ADMIN only).
 */
export async function applyUndo(
  originalId: string,
  actorId: string,
  options?: { force?: boolean },
): Promise<UndoResult> {
  const original = await prisma.auditLog.findUnique({ where: { id: originalId } });
  if (!original) return { ok: false, reason: "Audit entry not found" };
  if (options?.force) {
    if (!isForceRevertEligible(original)) {
      return { ok: false, reason: "This action is not eligible for revert" };
    }
  } else {
    if (!isUndoable(original)) return { ok: false, reason: "This action is not eligible for undo" };
  }

  // Check not already undone
  const alreadyUndone = await prisma.auditLog.findFirst({ where: { undoOfId: originalId } });
  if (alreadyUndone) return { ok: false, reason: "This action has already been undone" };

  const { action, entityType, entityId, before, after } = original;
  const verb = options?.force ? "Force-reverted" : "Undid";

  try {
    await prisma.$transaction(async (tx) => {
      switch (entityType) {
        case "Member": {
          if (action === "delete") {
            await tx.member.update({ where: { id: entityId }, data: { deletedAt: null, deletedById: null } });
          } else if (action === "create") {
            await tx.member.update({ where: { id: entityId }, data: { deletedAt: new Date() } });
          } else {
            await tx.member.update({ where: { id: entityId }, data: cleanSnapshot(before) });
          }
          break;
        }
        case "Rental": {
          if (action === "delete") {
            await tx.rental.update({ where: { id: entityId }, data: { deletedAt: null, deletedById: null } });
          } else if (action === "create") {
            await tx.rental.update({ where: { id: entityId }, data: { deletedAt: new Date() } });
          } else {
            await tx.rental.update({ where: { id: entityId }, data: cleanSnapshot(before) });
          }
          break;
        }
        case "Certification": {
          // Certifications use revokedAt instead of deletedAt
          if (action === "update") {
            await tx.certification.update({ where: { id: entityId }, data: cleanSnapshot(before) });
          }
          break;
        }
        case "MemberPermission": {
          if (action === "create") {
            // Undo a grant = delete the permission
            await tx.memberPermission.delete({ where: { id: entityId } });
          } else if (action === "delete" && before && typeof before === "object") {
            // Undo a revoke = re-create the permission
            const snap = before as Record<string, unknown>;
            await tx.memberPermission.create({
              data: {
                id:          snap.id as string,
                memberId:    snap.memberId as string,
                permission:  snap.permission as string,
                grantedById: snap.grantedById as string,
                grantedAt:   new Date(snap.grantedAt as string),
                expiresAt:   snap.expiresAt ? new Date(snap.expiresAt as string) : null,
              },
            });
          }
          break;
        }
        case "Resource": {
          if (action === "delete") {
            await tx.resource.update({ where: { id: entityId }, data: { deletedAt: null, deletedById: null } });
          } else if (action === "create") {
            await tx.resource.update({ where: { id: entityId }, data: { deletedAt: new Date() } });
          } else {
            await tx.resource.update({ where: { id: entityId }, data: cleanSnapshot(before) });
          }
          break;
        }
        case "Reservation": {
          if (action === "delete") {
            await tx.reservation.update({ where: { id: entityId }, data: { deletedAt: null, deletedById: null } });
          }
          // Undo of create is not supported (no hard-delete)
          break;
        }
        case "WaitlistEntry": {
          if (action === "update") {
            await tx.waitlistEntry.update({ where: { id: entityId }, data: cleanSnapshot(before) });
          }
          break;
        }
      }

      // Record the undo in the audit log
      await tx.auditLog.create({
        data: {
          actorId,
          actorType: "ADMIN",
          action:    "undo",
          entityType,
          entityId,
          before:    after  ?? undefined,  // the state we're replacing
          after:     before ?? undefined,  // the state we're restoring
          note:      `${verb} ${action} on ${entityType} ${entityId}`,
          undoOfId:  originalId,
        },
      });
    });

    return { ok: true };
  } catch (err) {
    console.error("[undo] failed:", err);
    return { ok: false, reason: "An error occurred applying the undo. Check server logs." };
  }
}
