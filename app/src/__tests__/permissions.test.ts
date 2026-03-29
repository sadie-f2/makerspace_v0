import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberPermission: {
      count:    vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { hasPermission } from "../lib/permissions";
import { prisma } from "@/lib/prisma";

const mockCount = prisma.memberPermission.count as ReturnType<typeof vi.fn>;

describe("hasPermission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when the permission exists", async () => {
    mockCount.mockResolvedValue(1);
    expect(await hasPermission("m1", "equipment.manage")).toBe(true);
  });

  it("returns false when the permission is absent", async () => {
    mockCount.mockResolvedValue(0);
    expect(await hasPermission("m1", "equipment.manage")).toBe(false);
  });

  it("class-specific cert check also queries the catch-all certifications.grant", async () => {
    mockCount.mockResolvedValue(0);
    await hasPermission("m1", "certifications.grant.cls-abc");

    const where = mockCount.mock.calls[0][0].where;
    expect(where.permission.in).toContain("certifications.grant.cls-abc");
    expect(where.permission.in).toContain("certifications.grant");
  });

  it("non-cert permission check queries only the exact key", async () => {
    mockCount.mockResolvedValue(0);
    await hasPermission("m1", "equipment.manage");

    const where = mockCount.mock.calls[0][0].where;
    expect(where.permission.in).toEqual(["equipment.manage"]);
  });

  it("certifications.grant (any) satisfies a class-specific check", async () => {
    // count returns 1 because certifications.grant (any) is matched
    mockCount.mockResolvedValue(1);
    expect(await hasPermission("m1", "certifications.grant.cls-xyz")).toBe(true);
  });

  it("expired permissions are excluded (expiresAt filter is present in query)", async () => {
    mockCount.mockResolvedValue(0);
    await hasPermission("m1", "rentals.manage");

    const where = mockCount.mock.calls[0][0].where;
    // The OR clause ensures only non-expired rows are counted
    expect(where).toHaveProperty("OR");
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or.some((clause) => "expiresAt" in clause && clause.expiresAt === null)).toBe(true);
    expect(or.some((clause) => "expiresAt" in clause && typeof clause.expiresAt === "object" && clause.expiresAt !== null)).toBe(true);
  });
});
