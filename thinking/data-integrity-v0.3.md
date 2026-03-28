# Data Integrity, Audit & Recovery — Spec v0.3

**Supersedes:** `data-integrity.md` (v1.0)

**Status:** This spec reflects the data integrity posture as designed and
partially built. Each section is annotated with build status.

---

## Motivation

Nexudus has no audit trail and no rollback capability. Deleting a "team" silently
cascades to delete all associated contracts — with no recovery option. This
document defines the data integrity posture for the makerspace platform so that
no accidental or erroneous action is unrecoverable.

---

## Principles

1. **Nothing is permanently gone.** Deletions are soft. Data is never hard-deleted
   in normal operation.
2. **Every action is recorded.** All mutations write an audit log entry.
3. **External side effects are flagged, not silently swallowed.**
4. **Recovery is possible without a DBA.** Staff should be able to reverse most
   mistakes through the admin UI.
5. **When in doubt, freeze.** A write-lock mechanism lets staff halt all mutations.

---

## Soft Deletes

**Status: Built.**

All entities that carry meaningful state are soft-deleted:

- Members
- Resources (tools, rooms, shops, studios)
- Certifications (via `revokedAt` rather than `deletedAt`)
- Reservations
- Equipment classes

**Implementation:** Tables carry `deletedAt TIMESTAMP` and `deletedById UUID`.
All application queries filter `WHERE deletedAt IS NULL` by default. Deleted
records remain fully queryable via audit tools and direct database access.

Hard deletes are never issued by application code. A hard delete requires direct
database access.

### Cascade Guard

**Status: Partially built.** Resource deletion checks for children and blocks if
any exist. The general-purpose "count affected records and require acknowledgment"
pattern described in v1.0 is not yet implemented as a reusable component — it is
enforced case-by-case in server actions.

---

## Audit Log

**Status: Built.**

A single append-only table records every state-changing action.

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  actorId     String?                        // null = system/webhook
  actorType   ActorType                      // MEMBER, ADMIN, SYSTEM
  action      String                         // create, update, delete, restore, undo
  entityType  String                         // "Member", "Rental", "Certification", etc.
  entityId    String
  before      Json?                          // record snapshot before change
  after       Json?                          // record snapshot after change
  note        String?                        // optional human note
  ipAddress   String?                        // schema field exists; not yet populated
}
```

### Scope

All actors, all entities. Includes:
- Member self-service actions (registration, profile updates, rental requests,
  waitlist joins)
- Admin/staff actions (certification grants, role changes, rental approvals,
  resource management)
- System actions (floor plan sync, bulk imports)

### Entities Audited

| Entity | Actions logged |
|---|---|
| Member | create, update (profile, role, tier, password) |
| Rental | create, update (end) |
| Waitlist Entry | create, update (status changes) |
| Certification | create, restore (re-grant), update (revoke) |
| Member Permission | create, delete |
| Resource | create, update, delete |
| Equipment Class | create |
| Space Type Config | create, update, delete |

### Design Decision: Intentional Over Automatic

Audit entries are written explicitly at the business logic layer, not via ORM
interception. Prisma extensions can intercept all queries, but automatic
interception is indiscriminate — it captures reads, session lookups, seed runs,
and health checks alongside meaningful mutations. Signal-to-noise is poor.

Intentional audit writes with context (before/after state, notes) are more
useful for the "fix a mistake" use case. The tradeoff: discipline is required
to write entries. This is accepted.

### Known Gap: IP Address

The `ipAddress` field exists in the schema but is not populated by any audit
call. This is a future enhancement — requires extracting client IP from the
request context and threading it through to the audit function.

---

## Audit Log Viewer

**Status: Built.**

Admin UI at `/admin/audit` provides:

- Filterable by entity type and actor
- 200 most recent entries displayed
- Colour-coded action badges (create=green, update=blue, delete=red,
  restore=yellow, undo=purple)
- Expandable before/after JSON diff per entry
- Links to actor profile
- Timestamp and entity ID display
- Optional note display

### Not Yet Built

- Entity history view (full change history of a single record)
- Flagged actions viewer (entries marked as erroneous)
- Undo queue

---

## Undo

**Status: Designed, not built.**

Undo is planned for a limited time window (default: 1 hour) covering in-app
state only. Actions with external side effects (Stripe, Brivo) are not
automatically reversed — they are flagged.

### Undo Eligibility

| Action | Undoable? | Notes |
|---|---|---|
| Soft delete (member, resource) | Yes | Restore: clear `deletedAt` |
| Certification grant/revoke | Yes | Revert to prior state |
| Studio/storage rental | Yes (in-app) | Stripe add-on flagged for manual reversal |
| Tier change | Yes (in-app) | Stripe subscription change flagged |
| Booking created/cancelled | Yes | No external effect |
| Stripe payment recorded | No | Flag as erroneous; manual fix |
| Identity provider event | No | Handled via provider admin console |

### Planned Undo UI Behaviour

1. Show action, timestamp, actor, and before/after diff
2. List external side effects explicitly if any
3. Admin confirms → before-state snapshot re-applied
4. New audit entry written: `action = "undo"`, referencing original entry

Actions outside the 1-hour window remain visible but not eligible for one-click
undo. Manual rollback via audit log inspection remains possible.

### Planned: Flagging Mistakes

For undo-ineligible actions (billing events, identity events), admins can attach
a `note` to the audit log entry flagging it as an error and recording manual
correction steps. The `note` field exists; the UI for attaching notes
post-creation is not built.

---

## Emergency Write Freeze

**Status: Schema built, enforcement not built.**

The `SystemConfig` table exists with a `systemFreeze` boolean field, seeded to
`false`. No application code currently checks this field.

### Planned Behaviour

When `systemFreeze` is set:
- All POST / PUT / DELETE routes return `503 Service Unavailable`
- GET routes continue normally
- Admin UI displays a prominent freeze banner

**Who can toggle:** Admin users with `system:freeze` permission.

**Use case:** Admin suspects a data problem (runaway cascade, erroneous bulk
action, misfired webhook). Freeze halts writes while assessment proceeds.

**Implementation plan:** Middleware check on every mutating request. Single DB
read per request, cached with short TTL.

---

## Recovery Playbook

### Built

- **Audit log viewer:** Filterable, with before/after diffs
- **Soft deletes:** Records are never lost; can be restored via direct DB access

### Not Yet Built

- **Entity history:** Full change history of any single record
- **Undo queue:** Pending undoable actions within the 1-hour window
- **Flagged actions:** Audit entries marked as erroneous, with resolution notes
- **Freeze toggle:** Admin UI for set/clear with confirmation and reason
- **Restore UI:** Browse and undelete soft-deleted records

---

## Out-of-Band (Direct DB) Fixes

Sometimes a problem requires direct `psql` access. This is legitimate and
expected. The convention:

**Any direct DB fix must be accompanied by a manual `AuditLog` row.**

```sql
INSERT INTO "AuditLog" (
  id, timestamp, "actorId", "actorType", action,
  "entityType", "entityId", before, after, note, "ipAddress"
) VALUES (
  gen_random_uuid(),
  NOW(),
  NULL,
  'SYSTEM',
  'update',
  'Member',
  'cjld2cy...',
  '{"tierId": "old-id"}',
  '{"tierId": "new-id"}',
  'Manual fix: wrong tier assigned at import. Corrected by [name] on [date].',
  NULL
);
```

The `note` field is the most important part — explain what happened, why,
and who made the fix.

---

## Database Backup

**Change from v1.0 spec:** Original spec assumed DigitalOcean Managed PostgreSQL
with automated daily backups. Actual deployment uses Docker Compose with
PostgreSQL in a container.

**Current:** Local `pg_dump` rotated at 30 days. No offsite backup.

**Gap:** Offsite backup is a known requirement before production rollout. Options:
rsync to a second host, S3-compatible object storage, or migration to managed
PostgreSQL.

---

## What This Does Not Cover

- **Stripe billing corrections:** Must be performed in the Stripe dashboard. The
  audit log flags what needs fixing.
- **Identity provider state:** Managed via provider admin console. The audit log
  records what the application requested.
- **Point-in-time database recovery:** Requires managed PostgreSQL or a more
  sophisticated backup strategy than the current `pg_dump` rotation.

---

## Open Questions

- [ ] 1-hour undo window: is this the right default? Configurable?
- [ ] Should `system_freeze` be triggerable via CLI for emergency use without UI?
- [ ] Audit log retention policy (keep forever, or archive after N years)?
- [ ] Should member self-service actions be visible in their own portal history?
- [ ] Offsite backup strategy — must be resolved before production rollout
- [ ] IP address population in audit log — implementation approach
