import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import type { ActorType } from "@/generated/prisma/client";

export interface AuditEntry {
  actorId: string | null;
  actorType?: ActorType;
  action: "create" | "update" | "delete" | "restore" | "undo";
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}

/**
 * Write one append-only audit log row.
 * Call after every successful mutation — never inside a transaction that might roll back,
 * or the audit row will vanish with the failed transaction.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId:    entry.actorId,
      actorType:  entry.actorType ?? "ADMIN",
      action:     entry.action,
      entityType: entry.entityType,
      entityId:   entry.entityId,
      before:     entry.before as unknown as Prisma.InputJsonValue | undefined,
      after:      entry.after as unknown as Prisma.InputJsonValue | undefined,
      note:       entry.note ?? null,
    },
  });
}
