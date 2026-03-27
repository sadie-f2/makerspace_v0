import { prisma } from "@/lib/prisma";

// Known permission keys — extend as features are added
export const PERMISSIONS = {
  // Volunteer sub-roles
  ROLE_SHOP_LEAD:    "role.shop_lead",
  ROLE_TOOL_TESTER:  "role.tool_tester",

  // Equipment / tools
  EQUIPMENT_MANAGE:       "equipment.manage",       // full CRUD
  EQUIPMENT_MARK_DOWN:    "equipment.mark_down",    // flag out of service
  EQUIPMENT_MARK_SERVICE: "equipment.mark_service", // return to service

  // Certifications
  CERTS_GRANT_ANY: "certifications.grant",                            // any class
  certsGrantClass: (classId: string) => `certifications.grant.${classId}`, // one class

  // Lease / space management
  LEASES_MANAGE: "leases.manage",
} as const;

// Display labels for the permission picker UI
export const PERMISSION_LABELS: Record<string, string> = {
  "role.shop_lead":        "Volunteer — Shop Lead",
  "role.tool_tester":      "Volunteer — Tool Tester",
  "equipment.manage":      "Equipment — full CRUD",
  "equipment.mark_down":   "Equipment — mark out of service",
  "equipment.mark_service":"Equipment — return to service",
  "certifications.grant":  "Certifications — approve any class",
  "leases.manage":         "Leases — create / end",
};

/**
 * Returns true if memberId holds the given permission (not expired).
 * For class-specific cert approval: pass `certifications.grant.<classId>`.
 * A holder of `certifications.grant` (any) also passes a class-specific check.
 */
export async function hasPermission(memberId: string, permission: string): Promise<boolean> {
  const now = new Date();
  // "certifications.grant" (any) also satisfies a class-specific check
  const keys = [permission];
  if (permission.startsWith("certifications.grant.")) keys.push("certifications.grant");

  const count = await prisma.memberPermission.count({
    where: {
      memberId,
      permission: { in: keys },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  return count > 0;
}

/**
 * Returns all active (non-expired) permission strings for a member.
 */
export async function getMemberPermissions(memberId: string): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.memberPermission.findMany({
    where: {
      memberId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { grantedAt: "asc" },
  });
  return rows.map(r => r.permission);
}
