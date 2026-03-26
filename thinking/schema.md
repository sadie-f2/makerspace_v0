# Database Schema Reference

Source of truth: `app/prisma/schema.prisma`
Database: PostgreSQL 16 (DO Managed)
ORM: Prisma 7 with `@prisma/adapter-pg`

This document describes the schema as-built. Additions will be noted with a version marker.

---

## Enums

### `MemberRole`
| Value | Meaning |
|-------|---------|
| `MEMBER` | Standard member — portal access only |
| `STAFF` | Staff — admin access, limited destructive actions |
| `ADMIN` | Full admin access |

### `ReservationMode`
Controls how a resource handles double-booking.
| Value | Meaning |
|-------|---------|
| `NONE` | Not reservable |
| `ADVISORY` | Calendar display only — no enforcement |
| `EXCLUSIVE` | Blocks overlapping reservations |

### `LeaseAccessScope`
Who can access a leased space.
| Value | Meaning |
|-------|---------|
| `TENANT_ONLY` | Leaseholder only |
| `TENANT_PLUS_LIST` | Leaseholder + explicit allow-list |
| `ORG_WIDE` | Any member (e.g. shared shops) |

### `ActorType`
Who originated an audit log entry.
| Value | Meaning |
|-------|---------|
| `MEMBER` | A logged-in member or admin |
| `ADMIN` | An admin acting on behalf of the system |
| `SYSTEM` | Automated process, webhook, or cron |

---

## Identity & Auth

### `Member`
Core identity record. One row per person regardless of auth method.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `email` | String | Unique |
| `emailVerified` | DateTime? | Set by NextAuth on verification |
| `name` | String | Display name |
| `phone` | String? | |
| `emergencyContact` | String? | Free text |
| `passwordHash` | String? | bcrypt; null when Okta active |
| `oktaId` | String? | Unique; placeholder for OIDC migration |
| `webId` | String? | Solid/WebID — stored, not interpreted in v1 |
| `stripeCustomerId` | String? | Unique; set on first Stripe interaction |
| `tierId` | String? | FK → MemberTier; null = no tier assigned |
| `image` | String? | Avatar URL |
| `role` | MemberRole | Default: MEMBER |
| `deletedAt` | DateTime? | Soft delete |
| `deletedById` | String? | Who soft-deleted |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Relations: `tier`, `accounts`, `sessions`, `certifications`, `reservations`, `leases`, `dayPasses`, `auditLogs`

### `MemberTier`
Membership plan definitions. Drives access flags and billing rates.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `name` | String | Unique; human label e.g. "Community" |
| `slug` | String | Unique; e.g. "community" |
| `monthlyRate` | Decimal(10,2) | |
| `canBook` | Boolean | Can make equipment reservations |
| `canRentStudio` | Boolean | Can hold a studio lease |
| `canRentStorage` | Boolean | Can hold a storage lease |
| `buildingAccess` | Boolean | 24/7 building access |
| `active` | Boolean | Inactive tiers hidden from new assignments |
| `sortOrder` | Int | Display order |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Relations: `members`

### `Account`
NextAuth v5 OAuth account links. One per external provider per member.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `userId` | String | FK → Member |
| `type` | String | NextAuth provider type |
| `provider` | String | e.g. "okta", "credentials" |
| `providerAccountId` | String | |
| `refresh_token` | Text? | |
| `access_token` | Text? | |
| `expires_at` | Int? | |
| `token_type` | String? | |
| `scope` | String? | |
| `id_token` | Text? | |
| `session_state` | String? | |

Unique: `[provider, providerAccountId]`

### `Session`
NextAuth v5 database sessions (used with JWT strategy; kept for NextAuth compatibility).

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `sessionToken` | String | Unique |
| `userId` | String | FK → Member |
| `expires` | DateTime | |

### `VerificationToken`
NextAuth v5 email verification tokens.

| Column | Type | Notes |
|--------|------|-------|
| `identifier` | String | |
| `token` | String | Unique |
| `expires` | DateTime | |

Unique: `[identifier, token]`

---

## Equipment & Certifications

### `EquipmentClass`
A category of equipment requiring certification (e.g. "Laser Cutters", "CNC Routers").
Not a specific machine — a class of machines sharing one certification.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `name` | String | Unique |
| `description` | String? | |
| `deletedAt` | DateTime? | Soft delete |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Relations: `certifications`, `resources`

### `Certification`
Records that a member is certified on an equipment class. Trust-enforced — no hardware gating.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `memberId` | String | FK → Member |
| `equipmentClassId` | String | FK → EquipmentClass |
| `grantedAt` | DateTime | |
| `grantedById` | String | Member id of staff who granted |
| `revokedAt` | DateTime? | Null = currently active |
| `revokedById` | String? | Member id of staff who revoked |

Unique: `[memberId, equipmentClassId]` — one record per member/class pair, upserted on re-grant.

---

## Resource Tree

### `Resource`
Unified model for all physical spaces and equipment: tools, rooms, studios, storage units,
common areas. Hierarchy expressed via self-referential `parent`/`children`.

`typeTag` is descriptive only — application logic must never branch on it.
Behavior is expressed through boolean flags (`reservable`, `leasable`) and enums.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `name` | String | |
| `description` | String? | |
| `typeTag` | String | e.g. "tool", "studio_unit", "shop", "meeting_room" |
| `parentId` | String? | FK → Resource (self); null = root |
| `reservable` | Boolean | Can be time-booked |
| `leasable` | Boolean | Can be leased long-term |
| `reservationMode` | ReservationMode | Default: NONE |
| `leaseAccessScope` | LeaseAccessScope | Default: ORG_WIDE |
| `requiresCertClassId` | String? | FK → EquipmentClass; null = no cert required |
| `deletedAt` | DateTime? | Soft delete |
| `deletedById` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Relations: `parent`, `children`, `requiresCertClass`, `space`, `reservations`, `leases`

---

## Reservations

### `Reservation`
Time-bounded booking of a reservable resource.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `resourceId` | String | FK → Resource |
| `memberId` | String | FK → Member |
| `startAt` | DateTime | |
| `endAt` | DateTime | |
| `notes` | String? | |
| `deletedAt` | DateTime? | Soft cancel |
| `deletedById` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## Leases

### `Lease`
Long-term assignment of a leasable resource (studio unit, storage unit).
`endDate` null = ongoing lease.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `resourceId` | String | FK → Resource |
| `memberId` | String | FK → Member |
| `startDate` | DateTime | |
| `endDate` | DateTime? | Null = ongoing |
| `monthlyRate` | Decimal(10,2) | Rate at time of lease creation |
| `stripeSubscriptionItemId` | String? | Set when Stripe billing active |
| `deletedAt` | DateTime? | Soft delete |
| `deletedById` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## Day Passes

### `DayPass`
Single-day access pass. Physical fob model — no automated badge provisioning.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `memberId` | String? | FK → Member; null for walk-in (non-member) |
| `purchasedAt` | DateTime | |
| `validDate` | DateTime | The calendar day of access |
| `fobNumber` | String? | Physical fob identifier |
| `stripePaymentIntentId` | String? | |
| `returnedAt` | DateTime? | When fob was returned |
| `notes` | String? | |
| `createdAt` | DateTime | |

---

## Floor Plans & Spaces

### `FloorPlan`
Metadata record for a floor plan SVG. The SVG file itself lives in `public/floorplans/`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `building` | String | e.g. "A", "B" |
| `floor` | Int | |
| `svgPath` | String | Path under `/public/floorplans/` |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Unique: `[building, floor]`

Relations: `spaces`

**Planned addition**: `FloorPlanRevision` — tracks successive DXF import versions,
allows switching active revision and viewing history. See `todo.md`.

### `Space`
Bridge between floor plan geometry and the Resource tree.
`externalId` matches `data-space-id` in the SVG — permanent join key, never changed
once a space has been assigned in the application.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `externalId` | String | Unique; e.g. "studio-14", "wood_shop" |
| `name` | String | Human display name |
| `blockType` | String | e.g. "s50-l", "shop" |
| `floorPlanId` | String | FK → FloorPlan |
| `resourceId` | String? | Unique; FK → Resource; null for non-bookable areas |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

## Audit Log

### `AuditLog`
Append-only record of all state-changing actions. Application code never updates
or deletes rows. Finance actions are ineligible for undo but are flagged for
manual correction if needed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `timestamp` | DateTime | |
| `actorId` | String? | FK → Member; null for system/webhook |
| `actorType` | ActorType | Default: MEMBER |
| `action` | String | "create" \| "update" \| "delete" \| "restore" \| "undo" |
| `entityType` | String | e.g. "Member", "Lease", "Certification" |
| `entityId` | String | The affected record's id |
| `before` | Json? | Snapshot of record before change |
| `after` | Json? | Snapshot of record after change |
| `note` | String? | Optional human annotation |
| `ipAddress` | String? | |

---

## System Configuration

### `SystemConfig`
Single-row table. `systemFreeze = true` halts all write operations across the app —
used during incident investigation or data recovery. Application code checks this
before any mutation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | String (cuid) | PK |
| `systemFreeze` | Boolean | Default: false |
| `updatedById` | String? | Who last changed the config |
| `updatedAt` | DateTime | |

---

## Relationship Map

```
MemberTier ──< Member >──< Account
                  │         Session
                  │
                  ├──< Certification >── EquipmentClass
                  │                            │
                  ├──< Reservation >── Resource ┤
                  │                      │  │  │
                  ├──< Lease >───────────┘  │  └── Space ── FloorPlan
                  │                         │
                  └──< DayPass             children/parent (self)
                  │
                  └── AuditLog (as actor)

SystemConfig  (standalone)
```

---

## Pending Schema Additions

- [ ] `FloorPlanRevision` — revision-numbered imports, active pointer, import metadata
- [ ] Stripe webhook event log (idempotency, replay protection)
- [ ] Member waiver / agreement acceptance records
