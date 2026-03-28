# Makerspace Management Platform — Feature Spec v0.3

**Supersedes:** `feature-spec-v0.2.1.md` and `feature-spec-okta-v0.2.1.md`

**Status:** This spec reflects the application as built through the first build
sprint. Where a feature is designed but not yet implemented, its status is noted
inline. This spec merges the Auth0 and Okta variants into a single
provider-agnostic document — identity is an abstracted concern, not a spec fork.

---

## Overview

A web application to replace Nexudus as the management platform for a makerspace
with 500 members, growing toward 1,000. Nexudus is designed for co-working and
handles makerspace workflows poorly — specifically tool/equipment booking
visibility, certification management, and reporting flexibility.

### Goals
- Self-service member portal with clear booking availability
- Membership and billing management via Stripe
- Equipment certification tracking (trust-enforced, not hardware-gated)
- Lightweight day-pass flow using physical fobs
- Flexible reporting
- Maintainable by minimal technical staff after initial build
- Member lifecycle automation via configurable identity provider
- Provider-agnostic architecture — identity, payment, and access control
  are abstracted behind interfaces for portability and open-source reuse

### Non-Goals (Phase 2 — Classes Module)
- Eventbrite integration for class listings
- Auto-certification from class attendance
- Class scheduling and management

**Note:** The Eventbrite/Classes module may be built as a standalone application
ahead of the core platform and integrated once both exist. The integration seam
(certifications table) is defined in this spec. If the standalone module is ready
before Phase 2 begins, it may be pulled into core scope.

---

## Technology Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Built |
| Database | PostgreSQL 16 | Built |
| ORM | Prisma (with `@prisma/adapter-pg`) | Built |
| Auth | NextAuth v5 (JWT strategy, Credentials provider) | Built |
| Identity (future) | Okta or Auth0 via OIDC adapter | Designed, not built |
| Billing | Stripe | Schema fields present; integration not built |
| Email | smtp2go via Nodemailer | Built |
| UI | Tailwind CSS + shadcn/ui | Built |
| Hosting | Docker Compose on single server | Built |
| Database backup | Local `pg_dump` with 30-day rotation | Built |

---

## Budget

| Item | Cost |
|---|---|
| Initial development | $8,000 |
| Hosting (single VPS + domain) | ~$500–1,000/year |
| Identity provider (if Okta) | ~$14,000/year at full rollout |
| Identity provider (if Auth0 non-profit) | Free |
| Identity provider (if local credentials only) | $0 |
| Buffer (maintenance, surprises) | ~$1,500/year |

**Build phase cost:** Identity is local credentials during build and validation.
External provider cost deferred until a provider is selected and rolled out.

Programmer: 6 months dedicated, gifted to the organisation.

---

## Authentication & Identity

### Current Implementation

NextAuth v5 with JWT session strategy and a Credentials provider
(email/password, bcrypt-hashed). Session token carries `id`, `name`, `email`,
`role` (MemberRole enum), and `tierId`. Token is signed with `AUTH_SECRET` and
stored as an encrypted cookie.

Role and tier are frozen into the JWT at login. Changes by an admin take effect
on next login. This is acceptable at makerspace scale.

Self-registration is open at `/register` — no staff involvement for account
creation. Staff controls tier assignment, role promotion, and rental approval
after registration.

### Provider Abstraction

All auth interactions are isolated in `src/auth.ts`. The session shape is
consistent regardless of provider. Downstream pages and server actions consume
`session.user.{id, name, email, role, tierId}` — none need to know which
provider was used.

When an external identity provider is adopted:
1. Add an OIDC provider to `auth.ts`
2. In the `jwt` callback, look up the Member by `oktaId` (or equivalent) and
   populate `token.sub` with the DB Member id
3. No other file changes. The session shape remains identical.

### Planned Identity Providers

**Okta** — non-profit pricing; Okta Groups for tier mapping; Brivo Identity
Connector for building access; Okta Workflows for member lifecycle automation.
Cost: ~$14,000/year at 500+ members, free for first 50 during validation.

**Auth0** — near-identical OIDC flow; non-profit rate may be free; no Brivo
connector (requires custom API integration); no Workflows equivalent (lifecycle
automation stays in application code).

**Local credentials** — current default. Zero external dependency. Suitable for
development, self-hosted deployments, and organisations that do not need SSO.

The determining factor between Okta and Auth0 is the Brivo Identity Connector
(eliminates custom Brivo API work) and Okta Workflows (eliminates custom
lifecycle automation code). If neither is needed, Auth0 at non-profit free
is the lower-cost choice. If Solid Project integration (v1.1+) is pursued,
WebID-OIDC bridging viability with the chosen provider is also a factor.

### Route Protection

`proxy.ts` (Next.js proxy runtime, Node.js-based) checks auth on `/portal/*`
and `/admin/*` routes. Unauthenticated requests redirect to `/login` with a
callback URL.

### Security Notes

- `AUTH_SECRET` protects sessions — stored in `.env`, never committed
- `package-lock.json` committed; `npm ci` on deploy pins exact versions
- JWT is signed — role elevation by cookie manipulation is not possible
- bcryptjs (pure JS, intentionally slow) for password hashing; adequate at
  makerspace scale
- NextAuth v5 beta: monitor changelog for security releases; upgrade to stable
  when available
- See `trust-check.md` for full library trust assessment

---

## Roles & Permissions

### Four-Tier Role System

`MEMBER < VOLUNTEER < STAFF < ADMIN`

| Role | Description |
|---|---|
| MEMBER | Standard member. Self-service portal access. |
| VOLUNTEER | Member with extra operational permissions (shop lead, tool tester, etc.) |
| STAFF | Day-to-day ops: manage members, approve rental requests, grant certs |
| ADMIN | Full access including role promotion to STAFF/ADMIN and system settings |

**Promotion constraint:** Staff can assign MEMBER or VOLUNTEER. Only ADMIN can
promote to STAFF or ADMIN. Enforced in both server action and UI.

### Fine-Grained Permissions (MemberPermission)

Rather than adding enum values for volunteer sub-types, permissions are stored as
string keys in a `MemberPermission` table. Known keys are defined as constants
in `lib/permissions.ts` but free-form keys are also valid — no schema migration
needed for new permission types.

**Current permission keys:**

| Key | Description |
|---|---|
| `role.shop_lead` | Volunteer shop lead |
| `role.tool_tester` | Volunteer tool tester |
| `equipment.manage` | Full equipment CRUD |
| `equipment.mark_down` | Flag tool out of service |
| `equipment.mark_service` | Return tool to service |
| `certifications.grant` | Grant any certification |
| `certifications.grant.<classId>` | Grant a specific equipment class only |
| `rentals.manage` | Create/end rentals directly |

**Hierarchy:** A broader permission satisfies narrower checks.
`certifications.grant` satisfies any `certifications.grant.<classId>` check.

**Expiration:** Permissions have an optional `expiresAt` field. Expired
permissions are ignored by permission checks.

---

## Membership Tiers

Tiers are configurable — new tiers can be added and their permissions defined
without code changes. Tiers are stored in the `MemberTier` table with these
fields:

| Field | Description |
|---|---|
| name | Display name |
| slug | URL-safe identifier |
| monthlyRate | Decimal(10,2) |
| canBook | Can book equipment/rooms |
| canRentStudio | Eligible for studio rental |
| canRentStorage | Eligible for storage rental |
| buildingAccess | Has 24/7 fob access |
| active | Whether tier can be assigned to new members |
| sortOrder | Display ordering |

The facility operates 24/7. There is no hours-based access distinction between
tiers at this time, though the `buildingAccess` flag exists for deployments
that need it.

Tiers can be toggled active/inactive. Inactive tiers cannot be assigned to new
members but existing assignments are unaffected.

When an external identity provider is adopted, tiers may optionally map to
provider groups (e.g. Okta Groups). This mapping is an application configuration
concern, not embedded in the identity adapter.

---

## Unified Resource Model

All bookable and leasable entities are nodes in a single `Resource` tree. There
are no separate tables for studios, storage, rooms, or tools. Behavioral
variation is expressed through flags and mode fields, not through type-specific
tables.

### Resource Fields

| Field | Description |
|---|---|
| name | Display name |
| typeTag | Descriptive label (e.g. `studio_unit`, `storage_unit`, `room`, `laser_cutter`) |
| parentId | Parent node in tree (null = root) |
| reservable | Can be booked for time slots |
| leasable | Can be rented long-term |
| reservationMode | EXCLUSIVE / ADVISORY / NONE |
| rentalAccessScope | TENANT_ONLY / TENANT_PLUS_LIST / ORG_WIDE |
| requiresCertClassId | Equipment class certification required to book |
| outOfService | Boolean — tool currently unavailable |
| outOfServiceAt | When it was marked out of service |
| outOfServiceNote | Reason |
| deletedAt / deletedById | Soft delete |

### Space Type Configuration

`SpaceTypeConfig` is an admin-configurable table that defines the vocabulary of
type tags. Each type has:
- `slug` (permanent key, used as typeTag on resources)
- `label` (editable display name)
- `parentId` (types form a hierarchy, e.g. `storage` → `pallet`, `shelf`, `tool_cart`)
- `dxfLayer` (which DXF layer this type appears on)
- `color` (hex colour for floor plan rendering)
- `isBookable` / `isLeasable` (default flags for new resources of this type)

**Design rule:** Application code must not branch on type tag values. Any
temptation to write `if resource.typeTag === 'laser_cutter' then ...` signals
that a new flag or mode is needed, not a special case in the type system.

### Resource Tree Examples

```
Organization Root
├── Building A Floor 1
│   ├── Studio s10-1 (leasable)
│   │   ├── studio_unit s50-l:142:87
│   │   └── studio_unit s50-l:142:95
│   ├── Laser Shop (reservable, whole-space)
│   │   ├── Laser Cutter 1 (reservable, requires cert: Laser)
│   │   └── Laser Cutter 2 (reservable, requires cert: Laser)
│   └── Meeting Room A (reservable, no cert required)
├── Building A Floor 2
│   └── ...
└── Storage Area
    ├── Pallet P-01 (leasable)
    └── Shelf Bay S-01 L1 (leasable)
```

---

## Floor Plan System

### DXF → SVG Pipeline

AutoCAD drawings are the source of truth for physical geometry. A Python script
(`tools/dxf_to_svg.py`) converts DXF files to interactive SVG files.

**DXF conventions:**
- Export as R2000
- Building-aligned coordinate system (not true-north)
- Semantic layers: `studio` (block inserts), `shop` (closed polylines),
  `common` (common areas), `storage`, `shelf_l1/l2/l3`, `shop_label`,
  `common_label`
- Studio units: block inserts `s50-l` (landscape) and `s50-p` (portrait),
  each 48 actual SF (6'×8'), nominal 50 SF
- Shop identity: TEXT entities on `shop_label` layer, matched to polylines
  by point-in-polygon

**Stable ID contract:** `data-space-id` attributes in SVG are the join key to
`Space.externalId` in the database. IDs must never change once a space has been
assigned.

### Floor Plan Upload & Revision

Floor plans are uploaded as DXF files through the admin UI. The system:
1. Converts DXF → SVG with provenance markers
2. Shows a diff preview (new spaces, removed spaces, kept spaces)
3. Blocks upload if assigned spaces would be removed
4. Stores DXF and SVG as a `FloorPlanRevision`
5. Historical revisions are downloadable

### Space Model

`Space` is the bridge between the physical floor plan and the Resource tree.

| Field | Description |
|---|---|
| externalId | Matches `data-space-id` in SVG (unique) |
| name | Display name |
| blockType | Type string from SVG |
| floorPlanId | Which floor plan this space belongs to |
| resourceId | Link to Resource tree node (nullable — common areas have no Resource) |

Multiple Spaces can link to one Resource (studio grouping: several `studio_unit`
spaces form one studio).

### Browser Display

Floor plans are rendered as inline SVG (not `<img>`) to allow DOM manipulation:
- CSS classes for occupancy state (vacant, occupied, selected)
- Click/hover handlers for booking or assignment flows
- Shelf level toggles (show/hide `shelf_l1`, `shelf_l2`, `shelf_l3` groups)
- Tooltip overlays showing occupant names (member portal) or space details (admin)

**Colour states (studios):**

| State | Fill |
|---|---|
| Vacant | `#d4edda` (green) |
| Occupied | `#f8d7da` (red) |
| My studio | `#cce5ff` (blue) |
| Selected | `#fff3cd` (amber) |

---

## Studio Management

Studios are rented monthly. Average tenancy is 1+ year. A studio is a Resource
node whose children are `studio_unit` Space-linked resources.

### Studio Sizing

No square footage field in the schema. Size is calculated:
`studioSqFt = unitCount × 50`

All base units are a fixed 50 sq ft (nominal; 48 actual). Allowed studio sizes
(unit counts) are configurable via `StudioSize` records in admin settings.

### Studio Naming Convention

Format: `s{AREA}-{N}`
- `s` prefix, always lowercase
- `AREA` — uppercased if contains letters (e.g. `FIBER`, `NE`, `E&R`), digits
  unchanged (e.g. `10`)
- `N` — auto-incremented 1-based integer per area; deleted numbers never reused

Examples: `s10-1`, `sFIBER-1`, `sNE-3`, `sE&R-2`

### Admin Workflows

- **Create studio:** Select units on interactive floor plan → auto-generate name
  from area → validate against allowed sizes → create Resource with linked Spaces
- **Edit studio:** Rename (change area), reassign units, delete (soft, unlinks spaces)
- **Bulk import:** CSV upload with columns: `studio_name`, `unit_ids`,
  `assignee_email` (optional), `monthly_rate` (optional). Preview with
  validation before commit.
- **View:** Floor plan with occupancy overlay + table of all studios

### Member Portal

- Member sees their studio on the floor plan (highlighted in blue)
- Member sees occupancy of all studios (occupied/vacant, no tenant names for
  other studios)
- Total available square footage displayed on rental request page

---

## Storage Management

**Status: Deferred pending staff review.** Storage is more nuanced than studio
rental — pricing model, unit types (pallet, shelf, tool cart), and waitlist
mechanics are not yet pinned down.

**What exists:**
- `storage_unit` resources are in the schema and visible on the admin side
- Space types for storage subtypes (pallet, shelf, tool_cart) are configurable
- Shelf storage is multi-level (DXF layers `shelf_l1/l2/l3`; floor plan viewer
  can toggle levels independently)
- Portal rental page currently omits the storage selector

**What's needed before enabling:**
- Pricing model per storage subtype
- Unit inventory counts
- Waitlist mechanics (same as studio or different?)

---

## Rental System

### Language

**v0.3 terminology change:** "Lease" renamed to "Rental" throughout. "Lease"
implies a legal term with a defined duration. In practice, studios are
month-to-month with no formal lease document. "Rental" is more accurate.

### Rental Model

| Field | Description |
|---|---|
| resourceId | Which resource is rented |
| memberId | Who rents it |
| startDate | When the rental began |
| endDate | When the rental ended (null = ongoing) |
| monthlyRate | Decimal(10,2) |
| stripeSubscriptionItemId | Stripe add-on reference (when integrated) |
| deletedAt / deletedById | Soft delete |

### Member-Initiated Request Flow

Members cannot create rentals directly. They submit a `RentalRequest`:

1. **Member requests START:** Selects an available resource from the portal →
   creates a RentalRequest (type: START, status: PENDING)
2. **Staff reviews:** Admin dashboard queue at `/admin/rental-requests` →
   approve (creates Rental) or reject (with optional note)
3. **Member requests END:** Submits an END request for an active rental →
   staff approves (sets endDate on Rental)
4. **Member cancels:** Can cancel any PENDING request

**Request fields:** memberId, resourceId, requestType (START/END), status
(PENDING/APPROVED/REJECTED), requestedStartDate, requestedMonthlyRate,
reviewedById, reviewedAt, reviewNote.

### Direct Admin Path

Staff/admin can also create and end rentals directly from the member detail page
without a request. This is for operational convenience when the request flow is
not needed.

### Portal UI

- Active rentals with resource name, type, monthly rate, start date
- Pending requests with status badges
- Request-a-space section with studio size selector showing available sq ft
- Link to waitlist when nothing is available

---

## Waitlist

A generic waitlist by resource type tag (`studio_unit`, `storage_unit`, etc.),
not by specific resource. Staff offers a specific resource from the available
pool when one becomes available.

### Status Flow

```
WAITING ──offer──► OFFERED ──accept──► ACCEPTED (creates Rental)
   │                  │
   └──withdraw──►  WITHDRAWN
                     │
                  WITHDRAWN
```

### Waitlist Entry Fields

| Field | Description |
|---|---|
| memberId | Who is waiting |
| resourceTypeTag | What type of resource (e.g. `studio_unit`) |
| requestedAt | Queue position (FIFO) |
| status | WAITING / OFFERED / ACCEPTED / WITHDRAWN |
| note | Member's preference note (e.g. "200 sq ft, ground floor") |
| offeredResourceId | Which resource was offered (when status = OFFERED) |
| offeredAt | When the offer was made |

### Rules

- One active entry per member per resource type (prevents duplicate queueing)
- Queue is FIFO by `requestedAt`
- Offer links a specific available resource to the entry
- Acceptance creates a Rental and sets status to ACCEPTED
- Either member or admin can withdraw

### Portal UI

- Join waitlist for studio or storage (with optional note)
- View active entries with status badges
- Offered resources highlighted — "contact staff to accept"
- Withdraw button
- History of closed entries

### Open: Self-Service Acceptance

Currently, offer acceptance is staff-side only. Full self-service acceptance
(member clicks "Accept" in portal → Rental created automatically) is designed
but not built.

---

## Certification Management

Most tools require certification before a member may book them. Certification is
trust-enforced within the app — there is no hardware access gate on shop doors.

### Data Model

- **EquipmentClass**: categories (e.g. Laser, CNC, Woodshop, Metal Shop)
- **Certification**: member → equipment class, with `grantedAt`, `grantedById`,
  `revokedAt`, `revokedById`
- Unique constraint on [memberId, equipmentClassId] — one cert per class per
  member; revoked certs are restored (not duplicated) on re-grant

### Who Can Grant

| Actor | Rule |
|---|---|
| ADMIN or STAFF | Any equipment class |
| VOLUNTEER with `certifications.grant` | Any equipment class |
| VOLUNTEER with `certifications.grant.<classId>` | That specific class only |

### Admin Workflows

- Grant/revoke from member detail page (per member) or equipment class page
  (per class)
- View all certifications for a member
- View all certified members for an equipment class

### Member Portal

- View own certifications
- **Certification directory:** searchable list of all members and their
  certifications — this is an explicit openness policy decision, not a privacy
  concern. It supports coordination between members.

---

## Booking / Reservations

### Schema (Built)

The `Reservation` model exists:
- resourceId, memberId, startAt, endAt, notes
- Soft-cancelable (deletedAt/deletedById)

The Resource model carries `reservable` flag and `reservationMode`
(EXCLUSIVE / ADVISORY / NONE).

### UI (Not Yet Built)

The booking calendar UI is the next major build item. Design carries forward
from the booking-app in the nxds_reports project.

**Planned:**
- Browse availability calendar across all resource types
- Create a booking (with certification check where required)
- Cancel a booking
- View upcoming bookings
- Admin: view all bookings, cancel any booking, manage resource inventory

**Booking rules:**
- Member must hold the required certification to book a tool
- Double-booking prevented for EXCLUSIVE resources
- ADVISORY resources show contention but allow double-booking
- Bookings visible to all members, including who has booked
- Day-pass members: booking policy TBD (likely meeting rooms only)

The facility is 24/7. Availability is purely interval arithmetic on existing
bookings — no operating hours logic required for this deployment.

---

## Day Pass

Day passes use a pool of physical fobs (currently 12). A member purchasing a day
pass is given a fob at the facility for the duration of their visit and returns
it on departure.

### Current Implementation

- Member requests a day pass from the portal (selects a date)
- `DayPass` record created with memberId, validDate
- Staff assigns `fobNumber` when member arrives
- Staff records `returnedAt` when fob returned
- Portal shows pass history with fob status

### Not Yet Built

- Stripe one-time payment integration
- Walk-in day pass (memberId nullable in schema for guests without accounts)
- No identity provider provisioning required; no access control system
  interaction required

---

## Billing (Stripe)

**Status: Schema fields present; integration not built.**

### Schema Fields

- `Member.stripeCustomerId` — Stripe customer reference
- `Rental.stripeSubscriptionItemId` — Stripe subscription add-on reference
- `DayPass.stripePaymentIntentId` — one-time payment reference

### Planned Subscription Structure

Each active member has a Stripe subscription consisting of:
- **Base product**: membership tier (monthly recurring)
- **Studio add-on**: monthly, if a studio is assigned
- **Storage add-on**: monthly, if a storage unit is assigned

### Planned Billing Rules

- Studio and storage charges added when rentals are created
- Rental start: charge prorated from start date to end of month
- Rental end: always effective at end of current billing month
- Day passes: one-time Stripe payment

### Payment Abstraction

The abstraction layer (see `abstraction-layers.md`) defines a `Payment/Finance`
interface covering subscriptions, add-ons, one-time payments, and webhook
ingestion. Stripe is the default implementation. Known alternatives: Square,
PayPal, manual invoicing, no-payment (for grant-funded spaces).

---

## Member Portal

Self-service portal for authenticated members at `/portal`.

### Sections (Built)

| Section | Path | Description |
|---|---|---|
| Dashboard | `/portal` | Tier info, active rentals, waitlist status, recent certs |
| Profile | `/portal/profile` | Edit name, phone, emergency contact; change password |
| Rentals | `/portal/rentals` | Active rentals, request new space, request end, cancel pending |
| Waitlist | `/portal/waitlist` | Join queue, view status, withdraw |
| Certifications | `/portal/certifications` | Own certs; searchable member directory |
| Map | `/portal/map` | Interactive floor plan with occupancy overlay |
| Day Pass | `/portal/day-pass` | Request day pass, view history |

### Not Yet Built

| Section | Path | Description |
|---|---|---|
| Bookings | `/portal/bookings` | Calendar view, create/cancel bookings |
| Membership/billing | — | Billing summary, payment history (requires Stripe) |

### Staff/Admin Dual Access

Admin and staff users land at `/admin` but have a "Member portal" link in the
admin header. The portal layout shows an "Admin" link for staff/admin roles.
Both views are accessible without switching accounts.

---

## Admin Dashboard

Internal tool for staff at `/admin`.

### Sections (Built)

| Section | Path | Description |
|---|---|---|
| Dashboard | `/admin` | Session info (placeholder) |
| Members | `/admin/members` | List, search, create, edit, role/tier/cert management |
| Rental Requests | `/admin/rental-requests` | Approve/reject queue with notes |
| Waitlist | `/admin/waitlist` | Offer resources, accept, withdraw |
| Studios | `/admin/studios` | Floor plan view, create, edit, CSV import |
| Storage | `/admin/storage` | Placeholder |
| Equipment | `/admin/equipment` | Equipment class CRUD, per-class cert management |
| Resources | `/admin/resources` | Resource tree view, create, edit, soft delete |
| Floor Plans | `/admin/floorplans` | Upload DXF, sync spaces, view revisions |
| Bookings | `/admin/bookings` | Placeholder |
| Reports | `/admin/reports` | Placeholder |
| Audit | `/admin/audit` | Full audit log with filters, before/after diffs |
| Settings | `/admin/settings` | Tiers, studio sizes, space types |

### Settings Sub-Sections

- **Tiers:** Create, edit, toggle active; set rate, booking/rental/access flags
- **Studio Sizes:** Allowed unit counts (each ×50 sq ft); toggle active
- **Space Types:** Configurable type vocabulary with DXF layer mapping, colour,
  bookable/leasable defaults, parent-child hierarchy

---

## Email / Notifications

### Current Implementation

smtp2go via Nodemailer. Transport configured in `lib/email.ts`:
- Port 465 → implicit SSL
- All other ports → STARTTLS (enforced, no plaintext fallback)
- Stubs gracefully when env vars absent (logs warning, does not crash)

**Env vars:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_FROM`, `SMTP_FROM_NAME`

**Currently sends:** Welcome email (admin-triggered from member detail page).

### Planned (via Notification abstraction)

Message types: `booking.confirmed`, `booking.cancelled`, `booking.reminder`,
`payment.receipt`, `payment.failed`, `access.suspended`, `access.restored`,
`membership.expiring`.

Default channel: SMTP email. Known alternatives: SMS (Twilio), Slack/Discord
webhooks, push notifications (future mobile app), no-op (logging only for
dev/test).

---

## Audit & Data Integrity

### Principles

1. **Nothing is permanently gone.** Deletions are soft.
2. **Every mutation is recorded.** Append-only `AuditLog`.
3. **External side effects are flagged, not silently swallowed.**
4. **Recovery is possible without a DBA.** Admin UI audit viewer.
5. **When in doubt, freeze.** `SystemConfig.systemFreeze` halts all writes.

### Soft Deletes

All entities with meaningful state carry `deletedAt` and `deletedById`. All
application queries filter `WHERE deletedAt IS NULL` by default.

Implemented on: Member, Resource, Certification, Reservation.

### Audit Log

Append-only. Never updated or deleted by application code.

| Field | Description |
|---|---|
| actorId | Who (null = system/webhook) |
| actorType | MEMBER / ADMIN / SYSTEM |
| action | create / update / delete / restore / undo |
| entityType | Model name (e.g. "Member", "Rental", "Certification") |
| entityId | Record ID |
| before / after | Full record snapshot as JSON |
| note | Human context |

**Entities audited:** Member (create, update profile/role/tier/password),
Rental (create, end), Waitlist (create, status changes), Certification
(grant, revoke, restore), Permission (grant, revoke), Resource (create, update,
delete), Equipment Class (create), Space Type (create, update, delete).

### Admin Audit Viewer

Filterable by entity type and actor. Shows 200 most recent entries with
expandable before/after JSON diffs.

### Emergency Write Freeze

`SystemConfig.systemFreeze` flag. When set:
- All POST/PUT/DELETE routes return 503
- GET routes continue
- Admin UI shows prominent freeze banner
- Toggled by admin with `system:freeze` permission

### Undo

**Designed in data-integrity spec; not yet built in UI.** Planned: 1-hour
window undo for in-app state. Actions with external side effects (Stripe, Brivo)
flagged for manual reversal. See `data-integrity.md` for full design.

---

## External Integrations

### Brivo (Building Access)

Brivo controls building entry. Two integration paths under evaluation:

**Option A — Okta → Brivo Identity Connector** (~$1,500/year as part of Okta
plan): Group membership in Okta propagates automatically. No custom code.

**Option B — Custom Brivo API integration** (build cost only): Direct REST API
for provisioning/deprovisioning. Lower annual cost; custom maintenance.

Decision is tied to identity provider choice.

**What Brivo is used for:** Building access for active members; deprovisioning
on membership lapse.

**What Brivo is NOT used for:** Shop or tool physical access (trust-enforced);
day-pass access (physical fobs).

### Stripe

Not yet integrated. Schema fields are in place. See Billing section above.

---

## Deployment

### Stack (As Built)

| Component | Implementation |
|---|---|
| Application | Next.js in Docker container |
| Database | PostgreSQL 16 in Docker container (same compose stack) |
| Reverse proxy | nginx |
| Backup | Local `pg_dump` rotated at 30 days |
| Floor plan storage | Docker volume (container filesystem) |

**Change from spec:** Original spec called for DO Managed PostgreSQL +
Railway/Render hosting. Actual: Docker Compose on a single server. Simpler for
initial production. Managed DB can be added later by updating `DATABASE_URL`.

### Environments

| Environment | Infrastructure | Database |
|---|---|---|
| Development | Local / shared workstation | PostgreSQL 16 (local) |
| Production | Docker Compose on VPS | PostgreSQL 16 (container) |

Staging is the same host as development. Formal staging environment deferred.

### Next.js Note

`proxy.ts` replaces the deprecated `middleware.ts` pattern. The proxy runtime
is Node.js (not Edge), so Prisma and auth imports work without workarounds.

### Source Control

GitHub. `.env.local` (gitignored) for local secrets. Production secrets via
hosting platform or `.env` on the server (not in repo).

### No Offsite Backup Yet

Floor plan uploads and database are on the container filesystem/volume. No B2
or DO Spaces. Offsite backup is a known gap to address before production
rollout.

---

## Reporting

**Status: Not yet built.** Placeholder page at `/admin/reports`.

### Planned Reports

- Membership by tier: current count, trend over time
- Revenue summary: recurring MRR, add-ons, day pass income
- Studio occupancy: occupied vs vacant, revenue per studio
- Storage occupancy: occupied vs vacant, revenue
- Booking utilisation: bookings per resource, peak times
- Certifications: members certified per equipment class
- Day pass volume: passes sold per day/week/month

Reports exportable as CSV.

---

## Data Migration (Nexudus)

**Status: Not yet built.**

### Identity Migration

If Okta is adopted before cutover: near-zero, since Nexudus authenticates
against Okta. If local credentials: member accounts created via bulk import
or self-registration.

### Data Migration (One-Time at Cutover)

- Member profiles (name, contact, tier)
- Active studio and storage assignments
- Certifications
- Bookable resource inventory

Historical billing remains in Nexudus.

### Post-Cutover Safety Net

Nexudus kept accessible with all members set to inactive (~$150/month base
plan). Reactivation available if new system has a critical failure.

---

## Accessibility

Baseline approach:
- Semantic HTML throughout
- Keyboard navigability
- Sufficient colour contrast

Post-build review by an expert screen reader user before general rollout.
Findings expected to be surgical (labels, focus order, alt text) rather than
structural. No formal WCAG audit planned.

---

## Future: Solid Project / Data Sovereignty (v1.1–1.4)

The Solid Project enables member data sovereignty — profile data resides in the
member's own pod. This is not v1.0 scope. Design decisions in v1.0 that keep
this path open:

1. **Data abstraction layer:** Member profile access goes through an interface,
   not direct Prisma calls (designed, partially implemented via auth session shape)
2. **WebID field:** `Member.webId` exists in the schema
3. **RDF-friendly naming:** Field names align to established ontologies where
   practical

### Pod vs App DB

| Data | Pod | App DB |
|---|---|---|
| Member profile | ✅ | |
| Certifications | ✅ (portable) | |
| Membership tier / billing | | ✅ Stripe is source of truth |
| Bookings | | ✅ makerspace owns these |
| Rentals | | ✅ app-owned |

### Phased Implementation

- **v1.1**: Optional pod storage for profiles; WebID login alongside standard auth
- **v1.2**: Certifications as Solid verifiable credentials
- **v1.3**: Member-controlled data sharing preferences
- **v1.4**: Cross-makerspace certification portability

---

## Abstraction Layers

The application defines TypeScript interfaces for each external integration
point. v1.0 ships one implementation per layer. Plugin infrastructure is
deferred until a second real implementation is needed — the interface discipline
is what matters, not runtime provider swapping.

| Layer | Default Implementation | Status |
|---|---|---|
| Payment / Finance | Stripe | Interface designed; not integrated |
| Member Identity / Auth | Local credentials (NextAuth) | Built |
| Physical Access Control | Brivo | Interface designed; not integrated |
| Space & Equipment | Prisma / PostgreSQL (Resource tree) | Built |
| Notification / Messaging | SMTP email (Nodemailer) | Built (welcome email) |
| Reporting / Data Export | Built-in SQL + CSV | Interface designed; not built |
| External Calendar Sync | ICS feed | Interface designed; not built |
| Class / Event Management | Eventbrite | Phase 2 |

See `abstraction-layers.md` for full interface definitions.

---

## Open Questions & Decisions

### Resolved Since v0.2.1

- [x] Auth0 vs Okta vs local: local credentials built as default; external
  provider is an additive change via adapter
- [x] Lease vs Rental terminology: Rental adopted throughout
- [x] Role model: four-tier (MEMBER/VOLUNTEER/STAFF/ADMIN) + fine-grained
  permissions
- [x] Studio sq ft: calculated from unit count × 50, not stored
- [x] Hosting: Docker Compose on single server (not Railway/Render)
- [x] Database: PostgreSQL in container (not DO Managed)
- [x] Volunteer permissions: MemberPermission table with hierarchical checks

### Still Open

- [ ] Storage rental: pricing model, unit types, waitlist mechanics
- [ ] Day-pass Stripe flow: UI shell built, payment integration deferred
- [ ] Day-pass booking policy: meeting rooms only, or tools also?
- [ ] Waitlist self-service acceptance: currently staff-side only
- [ ] Booking calendar UI: next major build item
- [ ] Stripe integration: subscription management, webhooks, proration
- [ ] Brivo integration path: Okta connector vs custom API
- [ ] Identity provider selection: Okta vs Auth0 vs stay local
- [ ] Offsite backup strategy
- [ ] Reporting implementation
- [ ] Data migration tooling (Nexudus export format unknown)
- [ ] Membership tier names and exact monthly rates
- [ ] Equipment class list and which tools require which class
- [ ] Fob pool management: tracking, lost fob procedure
- [ ] Undo UI implementation (design complete in data-integrity spec)
- [ ] WebID-OIDC bridge viability for Solid roadmap
- [ ] CI/CD pipeline (GitHub Actions assumed)
- [ ] Audit log retention policy

---

## Effort Estimation (Remaining Work)

### Basis

Claude (AI) + human programmer pairing. Claude handles bulk code generation;
human handles review, decisions, real-environment validation.

### Remaining Phases

| Phase | Estimate | Notes |
|---|---|---|
| Booking calendar (UI + conflict engine) | 1.5–2.5 weeks | Largest remaining feature |
| Stripe billing + webhooks | 1–1.5 weeks | Subscriptions, add-ons, day pass payments |
| Storage rental (after staff review) | 3–5 days | Depends on pricing model decisions |
| Reporting | 2–4 days | SQL queries + CSV export |
| Waitlist self-service acceptance | 1–2 days | |
| Undo UI | 2–3 days | Design complete; implementation only |
| Notification expansion | 2–3 days | Beyond welcome email |
| Identity provider integration (if Okta/Auth0) | 2–4 days | Adapter layer exists |
| Brivo integration | 2–4 days | Depends on provider path |
| Migration tooling | 1–1.5 weeks | Depends on Nexudus export format |
| Testing, QA, deployment hardening | 2–3 weeks | |
| **Total remaining** | **8–14 weeks** | |

### What's Already Built

- Schema + core models
- Auth (local credentials, session shape, route protection)
- Role and permission system
- Member CRUD (create, edit, role/tier assignment, password reset)
- Studio management (floor plan integration, naming, CSV import)
- Floor plan pipeline (DXF → SVG → Space sync)
- Rental system (request flow + direct admin)
- Waitlist
- Certification management
- Day pass (request + history, no Stripe)
- Audit log (full coverage)
- Email (welcome email)
- Admin dashboard (13 sections, most functional)
- Member portal (7 sections, most functional)
- Settings (tiers, studio sizes, space types)
