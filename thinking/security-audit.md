# Security Audit — makerspace_v0

Date: 2026-03-30

---

## CWE-208 — Timing attacks (CLEAR)

Password verification uses `bcrypt.compare()` (12 rounds) — inherently constant-time.
Stripe webhook uses `stripe.webhooks.constructEvent()` (HMAC-SHA256, timing-safe).
No `===` comparisons on secrets found anywhere.

---

## CWE-444 — HTTP request smuggling / CVE-2026-29057 (VERIFY)

Active CVE in Next.js. We are on **16.2.1**. Check
https://github.com/vercel/next.js/security/advisories for whether 16.2.1 is patched.
If not, `npm install next@latest` + `npx tsc --noEmit`.
No application code change required — runtime fix only.

---

## CWE-284 — Access control 🔴 CRITICAL (NOT YET FIXED)

### 1. Admin layout — no role check

**File:** `src/app/admin/layout.tsx`

Only checks `if (!session)`. Any authenticated MEMBER can access all `/admin/*` pages.

**Fix — two-tier approach:**

Layout allows VOLUNTEER, STAFF, ADMIN (not MEMBER):
```typescript
if (!session?.user || session.user.role === "MEMBER") redirect("/portal");
```

Create `src/lib/requireStaff.ts` for sensitive-page guard:
```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";
export async function requireStaff() {
  const session = await auth();
  if (!["STAFF", "ADMIN"].includes(session?.user?.role ?? "")) redirect("/admin");
}
```

Call `await requireStaff()` at top of:
- `src/app/admin/members/page.tsx` + `[id]/page.tsx` + `new/page.tsx`
- `src/app/admin/rentals/page.tsx`
- `src/app/admin/rental-requests/page.tsx`
- `src/app/admin/settings/page.tsx`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/studios/page.tsx`
- `src/app/admin/storage/page.tsx`
- All `src/app/admin/floorplans/` pages

Volunteers can access: `/admin/resources`, `/admin/bookings`, `/admin/certifications`

---

### 2. Admin API routes — completely unauthenticated 🔴 CRITICAL

All routes under `src/app/api/admin/` have zero auth. Any HTTP client can:
- Create/modify/delete studios
- Upload DXF floor plan files (arbitrary file write to `/public/floorplans`)
- Import storage resources

**Fix:** Create `src/lib/requireAdminApi.ts`:
```typescript
import { auth } from "@/auth";
export async function requireAdminApi(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user || !["ADMIN", "STAFF"].includes(session.user.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
```

Add at top of every handler:
```typescript
const denied = await requireAdminApi();
if (denied) return denied;
```

Routes to patch:
- `api/admin/studios/route.ts` (POST)
- `api/admin/studios/[id]/route.ts` (PUT, DELETE)
- `api/admin/storage/import/route.ts` (POST)
- `api/admin/floorplans/upload/route.ts` (POST)
- `api/admin/floorplans/upload/preview/route.ts` (POST)
- `api/admin/floorplans/upload/commit/route.ts` (POST)
- `api/admin/floorplans/[id]/sync/route.ts` (POST)
- `api/admin/floorplans/[id]/route.ts` (GET)
- `api/admin/floorplans/[id]/svg/route.ts` (GET)
- `api/admin/floorplans/[id]/revisions/[revId]/dxf/route.ts` (GET)

---

### 3. memberId exposed in booking calendar (information disclosure)

**File:** `src/app/portal/book/[resourceId]/page.tsx`

`SerializedBooking` sends `memberId` to every member viewing a resource calendar.
Member **names** are intentional (coworking UX). Member **IDs** are not needed
client-side and should be removed.

`memberId` is confirmed unused in all consumer components
(BookingDayView, BookingMultiView, AdminBookingCalendar, BookingGridView).

**Fix:**
- Remove `memberId` from `SerializedBooking` interface in `src/lib/bookingTime.ts`
- Remove from the page serialization in `src/app/portal/book/[resourceId]/page.tsx`
- Remove from `src/app/portal/book/page.tsx` (calendar view)
- Remove from `src/app/admin/bookings/page.tsx`

---

## CWE-552 / CWE-349 — Deployment scope (ops todo)

- Ensure `.next/` is not web-accessible directly via nginx
- Ensure `.env` files are not served
- App Router in use (not Pages Router) — cache poisoning CVE less applicable

---

## Implementation order when doing this work

1. `requireAdminApi()` helper (unblocks all API fixes)
2. All `api/admin/` route handlers
3. Admin layout role check + `requireStaff()` helper
4. Sensitive admin page guards
5. Remove `memberId` from `SerializedBooking`
6. Check CVE-2026-29057, upgrade Next.js if needed
7. `npx tsc --noEmit` + `npx vitest run` (all 151 tests)
8. Manual verification: curl unauthed POST to `/api/admin/studios` → 403

---

## Deferred: Opus security audit at feature-complete

The mechanical fixes above (API auth, role check, memberId) should be done now.
The following is better addressed as a dedicated Opus session once the feature set is
stable and no new routes are being added:

- Volunteer access policy edge cases (e.g. volunteer who is also a rental member, cert
  grant workflows touching financial data)
- CVE-2026-29057 detailed analysis and verification against 16.2.1
- Full route-by-route authorization audit across the complete feature set
- Any gaps introduced by features added after this audit

Rationale: doing deep policy review while features are still in flux means re-auditing
new routes anyway. One thorough Opus pass when the app is feature-complete is more
productive than incremental partial reviews.

---

## Notes

- `proxy.ts` already handles auth redirect for `/portal/*` and `/admin/*` — but only checks
  authentication, not role. The layout-level role check is still needed because proxy.ts
  runs before route resolution and doesn't know the user's role at that point cleanly.
- The volunteer role policy: VOLUNTEER can access resource management, bookings, and
  certifications in admin. STAFF/ADMIN only for financials, members, settings, audit, floor plans.
