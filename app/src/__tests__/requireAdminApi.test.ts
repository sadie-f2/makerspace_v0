import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { requireAdminApi } from "../lib/requireAdminApi";
import { requireStaff }    from "../lib/requireStaff";

const mockAuth     = auth     as ReturnType<typeof vi.fn>;
const mockRedirect = redirect as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ── requireAdminApi ──────────────────────────────────────────────────────────

describe("requireAdminApi", () => {
  it("returns 403 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await requireAdminApi();
    expect(res?.status).toBe(403);
  });

  it("returns 403 for MEMBER role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "MEMBER" } });
    const res = await requireAdminApi();
    expect(res?.status).toBe(403);
  });

  it("returns 403 for VOLUNTEER role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "VOLUNTEER" } });
    const res = await requireAdminApi();
    expect(res?.status).toBe(403);
  });

  it("returns null for STAFF role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "STAFF" } });
    expect(await requireAdminApi()).toBeNull();
  });

  it("returns null for ADMIN role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    expect(await requireAdminApi()).toBeNull();
  });
});

// ── requireStaff ─────────────────────────────────────────────────────────────

describe("requireStaff", () => {
  it("redirects to /admin when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await requireStaff();
    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("redirects for MEMBER role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "MEMBER" } });
    await requireStaff();
    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("redirects for VOLUNTEER role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "VOLUNTEER" } });
    await requireStaff();
    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("does not redirect for STAFF role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "STAFF" } });
    await requireStaff();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does not redirect for ADMIN role", async () => {
    mockAuth.mockResolvedValue({ user: { role: "ADMIN" } });
    await requireStaff();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
