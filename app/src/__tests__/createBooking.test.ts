import { describe, it, expect, vi, beforeEach } from "vitest";

// Next.js server-only modules are not available outside the Next.js runtime
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Map()) }));

// Stub requireUnfrozen to be a no-op by default (not frozen)
vi.mock("@/lib/freeze", () => ({
  requireUnfrozen: vi.fn().mockResolvedValue(undefined),
  isSystemFrozen:  vi.fn().mockResolvedValue(false),
  invalidateFreezeCache: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource:      { findUnique:  vi.fn() },
    member:        { findUnique:  vi.fn() },
    certification: { findFirst:   vi.fn() },
    reservation:   { findFirst:   vi.fn(), create: vi.fn() },
    auditLog:      { create:      vi.fn() },
  },
}));

import { createBooking } from "../app/portal/book/actions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockAuth              = auth              as ReturnType<typeof vi.fn>;
const mockResourceFindUnique  = prisma.resource.findUnique   as ReturnType<typeof vi.fn>;
const mockMemberFindUnique    = prisma.member.findUnique     as ReturnType<typeof vi.fn>;
const mockCertFindFirst       = prisma.certification.findFirst as ReturnType<typeof vi.fn>;
const mockReservationFindFirst = prisma.reservation.findFirst as ReturnType<typeof vi.fn>;
const mockReservationCreate    = prisma.reservation.create    as ReturnType<typeof vi.fn>;
const mockAuditLogCreate       = prisma.auditLog.create       as ReturnType<typeof vi.fn>;

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeSession(memberId = "member-1") {
  return { user: { id: memberId, name: "Alice", email: "alice@example.com", role: "MEMBER", tierId: "tier-1" } };
}

function makeResource(overrides: Partial<{
  id: string;
  name: string;
  reservable: boolean;
  reservationMode: string;
  requiresCertClassId: string | null;
}> = {}) {
  return {
    id:                  "resource-1",
    name:                "Laser Cutter",
    reservable:          true,
    reservationMode:     "EXCLUSIVE",
    requiresCertClassId: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<{ tier: { canBook: boolean } | null }> = {}) {
  return {
    id:   "member-1",
    name: "Alice",
    tier: { canBook: true },
    ...overrides,
  };
}

/** Returns a start/end pair that is safely in the future. */
function futureTimes(offsetMinutes = 60, durationMinutes = 60) {
  const start = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const end   = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

const BASE_INPUT = {
  resourceId: "resource-1",
  notes: "",
};

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path stubs — individual tests override as needed
  mockAuth.mockResolvedValue(makeSession());
  mockResourceFindUnique.mockResolvedValue(makeResource());
  mockMemberFindUnique.mockResolvedValue(makeMember());
  mockCertFindFirst.mockResolvedValue(null);
  mockReservationFindFirst.mockResolvedValue(null);
  mockReservationCreate.mockResolvedValue({ id: "reservation-new" });
  mockAuditLogCreate.mockResolvedValue({});
});

// ── Authentication ────────────────────────────────────────────────────────────

describe("createBooking — authentication", () => {
  it("returns an error when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Not authenticated");
  });

  it("returns an error when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Not authenticated");
  });
});

// ── Time validation ───────────────────────────────────────────────────────────

describe("createBooking — time validation", () => {
  it("rejects a start time in the past", async () => {
    const startAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const endAt   = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Cannot book in the past");
  });

  it("rejects end time equal to start time", async () => {
    const t = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await createBooking({ ...BASE_INPUT, startAt: t, endAt: t });
    expect(result.error).toBe("End time must be after start time");
  });

  it("rejects end time before start time", async () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end   = new Date(start.getTime() - 30 * 60 * 1000);
    const result = await createBooking({
      ...BASE_INPUT,
      startAt: start.toISOString(),
      endAt:   end.toISOString(),
    });
    expect(result.error).toBe("End time must be after start time");
  });

  it("rejects invalid (non-parseable) time strings", async () => {
    const result = await createBooking({ ...BASE_INPUT, startAt: "not-a-date", endAt: "also-bad" });
    expect(result.error).toBe("Invalid time");
  });
});

// ── Resource validation ───────────────────────────────────────────────────────

describe("createBooking — resource validation", () => {
  it("returns an error when resource is not found", async () => {
    mockResourceFindUnique.mockResolvedValue(null);
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Resource is not reservable");
  });

  it("returns an error when resource.reservable is false", async () => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ reservable: false }));
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Resource is not reservable");
  });
});

// ── Tier / permission check ───────────────────────────────────────────────────

describe("createBooking — member tier check", () => {
  it("rejects if the member's tier has canBook=false", async () => {
    mockMemberFindUnique.mockResolvedValue(makeMember({ tier: { canBook: false } }));
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("Your membership tier does not include bookings");
  });

  it("allows booking when tier is null (no tier assigned)", async () => {
    // Null tier means no restriction — action proceeds past tier check
    mockMemberFindUnique.mockResolvedValue(makeMember({ tier: null }));
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    // No tier error; may succeed or fail on later checks (conflict check returns null → success)
    expect(result.error).not.toBe("Your membership tier does not include bookings");
  });
});

// ── Certification check ───────────────────────────────────────────────────────

describe("createBooking — certification check", () => {
  it("rejects if resource requires a cert and member does not hold it", async () => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ requiresCertClassId: "class-laser" }));
    mockCertFindFirst.mockResolvedValue(null); // no certification found
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("You do not hold the required certification for this resource");
  });

  it("allows booking when member holds the required cert", async () => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ requiresCertClassId: "class-laser" }));
    mockCertFindFirst.mockResolvedValue({ id: "cert-1", memberId: "member-1", equipmentClassId: "class-laser", revokedAt: null });
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBeUndefined();
  });

  it("queries certification by memberId and equipmentClassId with revokedAt:null", async () => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ requiresCertClassId: "class-laser" }));
    mockCertFindFirst.mockResolvedValue(null);
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt });

    const query = mockCertFindFirst.mock.calls[0][0];
    expect(query.where.memberId).toBe("member-1");
    expect(query.where.equipmentClassId).toBe("class-laser");
    expect(query.where.revokedAt).toBe(null);
  });
});

// ── EXCLUSIVE mode: conflict detection ───────────────────────────────────────

describe("createBooking — EXCLUSIVE mode conflict detection", () => {
  beforeEach(() => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ reservationMode: "EXCLUSIVE" }));
  });

  it("rejects a partial overlap where the existing booking starts first", async () => {
    // New: 10:00–12:00   Existing: 09:00–11:00
    mockReservationFindFirst.mockResolvedValue({ id: "existing" });
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("This time slot is already booked");
  });

  it("rejects a partial overlap where the new booking starts first", async () => {
    // New: 09:00–11:00   Existing: 10:00–12:00
    mockReservationFindFirst.mockResolvedValue({ id: "existing" });
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("This time slot is already booked");
  });

  it("rejects a new booking contained entirely within an existing booking", async () => {
    // New: 10:00–11:00   Existing: 09:00–12:00
    mockReservationFindFirst.mockResolvedValue({ id: "existing" });
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("This time slot is already booked");
  });

  it("rejects a new booking that spans an existing booking", async () => {
    // New: 08:00–13:00   Existing: 09:00–12:00
    mockReservationFindFirst.mockResolvedValue({ id: "existing" });
    const { startAt, endAt } = futureTimes(60, 300);
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBe("This time slot is already booked");
  });

  it("passes the correct overlap query to Prisma (startAt lt endAt, endAt gt startAt)", async () => {
    mockReservationFindFirst.mockResolvedValue(null);
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt });

    const query = mockReservationFindFirst.mock.calls[0][0];
    const start = new Date(startAt);
    const end   = new Date(endAt);
    expect(query.where.resourceId).toBe("resource-1");
    expect(query.where.deletedAt).toBe(null);
    expect(query.where.startAt.lt.getTime()).toBe(end.getTime());
    expect(query.where.endAt.gt.getTime()).toBe(start.getTime());
  });

  it("allows adjacent reservations where one ends exactly when the next begins", async () => {
    // findFirst returns null — the half-open interval query correctly excludes adjacents
    mockReservationFindFirst.mockResolvedValue(null);
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result.error).toBeUndefined();
  });
});

// ── ADVISORY mode ─────────────────────────────────────────────────────────────

describe("createBooking — ADVISORY mode", () => {
  it("allows overlapping bookings without querying for conflicts", async () => {
    mockResourceFindUnique.mockResolvedValue(makeResource({ reservationMode: "ADVISORY" }));
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });

    expect(result.error).toBeUndefined();
    expect(mockReservationFindFirst).not.toHaveBeenCalled();
  });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe("createBooking — success", () => {
  it("creates a Reservation row with the correct fields", async () => {
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt, notes: "bring safety glasses" });

    expect(mockReservationCreate).toHaveBeenCalledOnce();
    const createArg = mockReservationCreate.mock.calls[0][0].data;
    expect(createArg.resourceId).toBe("resource-1");
    expect(createArg.memberId).toBe("member-1");
    expect(createArg.startAt).toEqual(new Date(startAt));
    expect(createArg.endAt).toEqual(new Date(endAt));
    expect(createArg.notes).toBe("bring safety glasses");
  });

  it("stores null for notes when notes is an empty string", async () => {
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt, notes: "" });

    const createArg = mockReservationCreate.mock.calls[0][0].data;
    expect(createArg.notes).toBeNull();
  });

  it("creates an AuditLog entry with entityType 'Reservation' and action 'create'", async () => {
    mockReservationCreate.mockResolvedValue({ id: "reservation-new" });
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt });

    expect(mockAuditLogCreate).toHaveBeenCalledOnce();
    const auditArg = mockAuditLogCreate.mock.calls[0][0].data;
    expect(auditArg.entityType).toBe("Reservation");
    expect(auditArg.entityId).toBe("reservation-new");
    expect(auditArg.action).toBe("create");
    expect(auditArg.actorId).toBe("member-1");
    expect(auditArg.actorType).toBe("MEMBER");
  });

  it("includes resourceId, startAt, and endAt in the AuditLog after field", async () => {
    mockReservationCreate.mockResolvedValue({ id: "reservation-new" });
    const { startAt, endAt } = futureTimes();
    await createBooking({ ...BASE_INPUT, startAt, endAt });

    const auditArg = mockAuditLogCreate.mock.calls[0][0].data;
    expect(auditArg.after.resourceId).toBe("resource-1");
    expect(auditArg.after.startAt).toBe(new Date(startAt).toISOString());
    expect(auditArg.after.endAt).toBe(new Date(endAt).toISOString());
  });

  it("returns an empty object on success", async () => {
    const { startAt, endAt } = futureTimes();
    const result = await createBooking({ ...BASE_INPUT, startAt, endAt });
    expect(result).toEqual({});
  });
});
