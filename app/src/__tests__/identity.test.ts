import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      update:     vi.fn().mockResolvedValue({}),
    },
  },
}));

import { localIdentity } from "../lib/identity/local";
import { prisma } from "@/lib/prisma";

const mockFindUnique = prisma.member.findUnique as ReturnType<typeof vi.fn>;

// Using low bcrypt rounds (4) for test speed.
const ROUNDS = 4;

describe("localIdentity.verifyCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when member is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await localIdentity.verifyCredentials("nobody@example.com", "password")).toBe(false);
  });

  it("returns false when member has no passwordHash", async () => {
    mockFindUnique.mockResolvedValue({ passwordHash: null });
    expect(await localIdentity.verifyCredentials("user@example.com", "password")).toBe(false);
  });

  it("returns false for a wrong password", async () => {
    const hash = await bcrypt.hash("correct-password", ROUNDS);
    mockFindUnique.mockResolvedValue({ passwordHash: hash });
    expect(await localIdentity.verifyCredentials("user@example.com", "wrong-password")).toBe(false);
  });

  it("returns true for the correct password", async () => {
    const hash = await bcrypt.hash("correct-password", ROUNDS);
    mockFindUnique.mockResolvedValue({ passwordHash: hash });
    expect(await localIdentity.verifyCredentials("user@example.com", "correct-password")).toBe(true);
  });
});
