import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemConfig: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { isSystemFrozen, requireUnfrozen, invalidateFreezeCache } from "../lib/freeze";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const mockFindFirst = prisma.systemConfig.findFirst as ReturnType<typeof vi.fn>;
const mockRedirect  = redirect as ReturnType<typeof vi.fn>;

beforeEach(() => {
  invalidateFreezeCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── isSystemFrozen ───────────────────────────────────────────────────────────

describe("isSystemFrozen", () => {
  it("returns true when systemFreeze is true", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: true });
    expect(await isSystemFrozen()).toBe(true);
  });

  it("returns false when systemFreeze is false", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: false });
    expect(await isSystemFrozen()).toBe(false);
  });

  it("returns false when no config row exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await isSystemFrozen()).toBe(false);
  });

  it("uses cached value on second call within TTL", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: false });
    await isSystemFrozen();
    await isSystemFrozen();
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires", async () => {
    vi.useFakeTimers();
    mockFindFirst.mockResolvedValue({ systemFreeze: false });
    await isSystemFrozen();
    vi.advanceTimersByTime(6_000); // past 5s TTL
    await isSystemFrozen();
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });
});

// ── invalidateFreezeCache ────────────────────────────────────────────────────

describe("invalidateFreezeCache", () => {
  it("forces a fresh DB read after invalidation", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: false });
    await isSystemFrozen();
    invalidateFreezeCache();
    await isSystemFrozen();
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });
});

// ── requireUnfrozen ──────────────────────────────────────────────────────────

describe("requireUnfrozen", () => {
  it("does not redirect when system is not frozen", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: false });
    await requireUnfrozen("/admin/members");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects with ?frozen=1 when system is frozen", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: true });
    await requireUnfrozen("/admin/members");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/members?frozen=1");
  });

  it("appends ?frozen=1 to different redirect paths", async () => {
    mockFindFirst.mockResolvedValue({ systemFreeze: true });
    await requireUnfrozen("/admin/rentals");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/rentals?frozen=1");
  });
});
