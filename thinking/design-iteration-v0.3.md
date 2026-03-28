# Design Iteration Notes — v0.3

Capturing decisions made and patterns established during the build sprint
following the floor plan / studio assembly work. Intended as a durable record
of what changed from the spec and why.

---

## Language / Domain Model

### Lease → Rental
**Decision:** Rename `Lease` / `LeaseRequest` to `Rental` / `RentalRequest`
throughout schema, code, and UI.

**Reason:** "Lease" implies a legal term with a defined term/duration. In practice
studios are month-to-month with no formal lease document. "Rental" is more accurate
to the actual relationship and less intimidating to members.

**Scope:** Full rename — Prisma models, enums, relation fields, audit entity types,
URL paths (`/admin/lease-requests` → `/admin/rental-requests`), UI labels.

---

## Roles & Permissions

### Four-tier role system
`MEMBER < VOLUNTEER < STAFF < ADMIN`

- **MEMBER** — standard member, self-service portal access
- **VOLUNTEER** — member with extra operational permissions (shop lead, tool tester, etc.)
- **STAFF** — can manage members, approve rental requests, run day-to-day ops
- **ADMIN** — full access including role promotion and system settings

**Constraint:** Staff can assign MEMBER or VOLUNTEER; only admin can promote to STAFF
or ADMIN. Enforced in both server action and UI.

### Fine-grained MemberPermission table
Rather than adding more enum values for volunteer sub-types, permissions are stored
as string keys in a separate table (`MemberPermission`). Known keys are defined as
constants (`PERMISSIONS` in `lib/permissions.ts`) but free-form keys are also valid.

**Examples of permission keys:**
- `role.shop_lead`, `role.tool_tester`
- `equipment.manage` — mark tools in/out of service
- `certifications.grant` — grant any certification
- `certifications.grant.<classId>` — grant a specific class only

**Hierarchy:** `certifications.grant` satisfies any `certifications.grant.<classId>`
check. This means a volunteer with the broad grant permission doesn't need per-class
entries.

**Design rationale:** Avoids migrations every time a new volunteer role type is needed.
New permission types just require a new constant in `permissions.ts` — no schema change.

---

## Rental Requests & Waitlist

### Member-initiated rental requests
Members can request a space (START) or request to end their current rental (END).
Both require staff/admin approval before any Rental record is created or ended.
Admin review queue at `/admin/rental-requests`.

**Design note:** If no studios of the desired size are available, the portal
rental page links directly to the waitlist rather than dead-ending.

### Waitlist
Generic waitlist by resource type tag (`studio_unit`, `storage_unit`, etc.),
not by specific resource. Staff offers a specific resource from the available
pool; member accepts via staff (portal shows the offer and says "contact staff
to accept"). Full self-service acceptance is deferred.

**Status flow:** WAITING → OFFERED → ACCEPTED / WITHDRAWN

---

## Studio Square Footage

**Decision:** No sq ft field in the schema. Calculate from unit count × 50 sq ft/unit.

**Reason:** All base units are a fixed 50 sq ft. Storing sq ft would be redundant
and create a maintenance burden (two things to keep in sync). The unit count is
already derivable from the Resource tree (count `studio_unit` children of a studio).

**Implementation:** `studioSqFt(r) = r.children.length || 1 * 50` — the fallback
of 1 handles bare `studio_unit` resources not yet grouped under a parent.

Total available sq ft shown as a summary line above the studio selector on the
rental request page.

---

## Storage Rentals

**Decision:** Deferred pending staff review. Storage is more nuanced than studio
rental — pricing model, unit types (shelf, pallet, full unit), and waitlist
mechanics are not yet pinned down.

**What exists:** `storage_unit` resources are in the schema and visible on the
admin side. The portal rental page currently omits the storage selector.

---

## Member Portal

### Self-registration
Members register at `/register` — no staff involvement required for account creation.
Staff still controls tier assignment, rental approval, and role promotion.

Password requirements: minimum 8 characters, confirmed on registration.

### Portal structure
```
/portal                  — dashboard (rentals, waitlist status, recent certs)
/portal/profile          — edit contact info + change password
/portal/rentals          — active rentals, request new space, cancel pending
/portal/waitlist         — join queue, see status, withdraw
/portal/certifications   — own certs + searchable member directory (all certs public)
/portal/map              — floor plan with tenant names visible to all members
/portal/day-pass         — request day pass, history (Stripe TBD)
```

### Certification transparency
All members can see what any other member is certified for. This is an explicit
openness policy decision — the cert directory is a feature, not a privacy concern.

### Staff/admin dual access
Admin and staff users land at `/admin` from the root URL but have a "Member portal"
link in the admin header. The portal layout shows an "Admin" link for staff/admin.
Both roles are also members and should have frictionless access to either view.

---

## Email

smtp2go via nodemailer. Transport configured in `lib/email.ts` with TLS-aware setup:
- Port 465 → implicit SSL (`secure: true`)
- All other ports → STARTTLS (`requireTLS: true`)

Stubs gracefully when env vars are absent (logs warning, does not crash).
Required env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM`, `SMTP_FROM_NAME`.

Currently used for: welcome email (admin-triggered from member detail page).

---

## Deployment

### Stack change from spec
Original spec called for DO Managed PostgreSQL + Railway/Render hosting.
Actual deployment: Docker Compose on a single server with PostgreSQL as a
container in the same stack.

**Reason:** Simpler for initial production. Managed DB and DO Spaces can be
added later without code changes — just update `DATABASE_URL` and add an S3
adapter for file storage.

### No B2 / no DO Spaces
Backup is local `pg_dump` rotated at 30 days. No offsite backup yet.
Floor plan uploads stored on the container filesystem (Docker volume).

### Next.js 16 note
`middleware.ts` is deprecated in Next.js 16 in favour of `proxy.ts`.
The proxy runtime is Node.js (not Edge), which means Prisma/auth imports
are safe there — no need for the cookie-check workaround required in Edge.

---

## Open Design Questions

- **Storage rental** — pricing model, unit types, waitlist mechanics (staff review needed)
- **Day pass Stripe flow** — UI shell built, payment integration deferred
- **Waitlist offer acceptance** — currently "contact staff"; self-service acceptance not built
- **Member-facing waitlist for offered resources** — portal shows the offer but acceptance
  creates the Rental; currently staff-side only
- **Booking/reservations** — equipment and room booking deferred to next session
