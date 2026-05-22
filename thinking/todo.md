# Todo

## App — next features

- [x] `/api/health` endpoint — `{ ok: true, db: "ok" }`
- [x] `FloorPlanRevision` model in Prisma schema
- [x] Admin floor plan import page — upload DXF → run dxf_to_svg.py → store revision
- [x] Admin floor plan revision viewer — list revisions, activate, compare
- [x] DXF provenance marker — embed `fpid.revid` in exported DXF, validate on re-upload
- [x] DXF stored in DB (`FloorPlanRevision.dxfData Bytes`) — filesystem copy is convenience only
- [x] Upload wizard — intent (new/revision), preview diff, commit, download labeled DXF
- [x] Bootstrap escape hatch — "Re-upload (skip marker)" for pre-marker DXFs
- [x] Auto-sync spaces on upload commit
- [x] Server-side SVG rendering (`/api/admin/floorplans/[id]/svg`) — fills + tooltip data baked in
- [x] Multi-unit studio group highlight on hover
- [x] Studios page — floor plan always visible, click highlights row in list
- [x] CSV studio import with preview table

## Certifications & Equipment Classes

- [ ] Audit: confirm cert-check in booking eligibility uses `requiresCertClassId` on resource (class-level, not per-tool)
- [ ] Cert propagation: if a parent resource (shop) has `requiresCertClassId`, children (tools) should inherit the gate — currently unclear if booking check traverses parent
- [ ] Admin UI: warning dialog when granting cert via a shop-level class ("This grants access to all tools in this shop")
- [ ] Admin equipment class page: show which resources are linked to each class
- [ ] Booking: display cert class name in "certification required" message, not just boolean
- [ ] Public map: consider whether to show tenant names to unauthenticated users long-term (currently yes — intentional per current design)

## Roles & Permissions

- [x] VOLUNTEER role added to MemberRole enum
- [x] MemberPermission table (string-key fine-grained permissions)
- [x] lib/permissions.ts — hasPermission() with cert-grant hierarchy
- [x] Staff can assign MEMBER/VOLUNTEER; admin can assign any role
- [x] Cert grant: volunteers with certifications.grant permission can also grant

## Rentals & Waitlist

- [x] Lease → Rental rename throughout schema and codebase
- [x] RentalRequest model (member-initiated START/END, staff/admin approval)
- [x] Admin rental request queue — approve (creates/ends rental) or reject
- [x] WaitlistEntry model (studio/storage queue)
- [x] Admin waitlist queue — offer resource, accept (creates rental), withdraw
- [ ] Portal: self-service waitlist offer acceptance (currently "contact staff")
- [ ] Storage rental — design discussion with staff needed before building

## Member Portal

- [x] Self-registration (/register)
- [x] Route protection (proxy.ts — Next.js 16)
- [x] Portal dashboard — rentals, waitlist status, recent certs
- [x] Profile page — edit contact info + change own password
- [x] Rentals page — active rentals, request new space (→ waitlist if none), cancel pending
- [x] Waitlist page — join, view status, withdraw
- [x] Certifications page — own certs + searchable member directory
- [x] Map page — floor plan with tenant names (portal, members only)
- [x] Public map page — `/map` route, no auth required, "Member login →" link
- [x] Day pass page — request + history (Stripe TBD)
- [x] Admin/staff portal link in admin header
- [x] Booking/reservations — portal book page + admin bookings page

## Abstraction Layers

- [x] Notifications layer — `src/lib/notifications/` (types, provider interface, SMTP impl, index)
  - All 13 notification types with typed payload map
  - Graceful stub when SMTP unconfigured
  - Call sites: admin member page (welcome email), rental-requests (approve/reject/end)
  - lib/email.ts superseded (dead code, can delete)
- [x] Payment layer — `src/lib/payment/` (types, provider interface, Stripe impl, index)
  - Stripe v21, stubs gracefully when STRIPE_SECRET_KEY unset
  - createCustomer wired into member creation (admin + register)
  - createSubscription / cancelSubscription wired into rental approval
  - Webhook route: `/api/webhooks/stripe` — subscription sync + invoice notifications + day-pass
  - Schema: `Rental.stripeSubscriptionId`, `Rental.stripeSubscriptionStatus` (migration applied)
- [x] Identity layer — `src/lib/identity/` (types, provider interface, local bcrypt impl, index)
  - All direct bcrypt calls removed from app code
  - Call sites: auth.ts, admin/members/new, admin/members/[id], register, portal/profile
- [x] Access Control layer — `src/lib/access/` (types, provider interface, noop impl, index)
  - Schema: `Member.accessSuspended`, `Member.accessSuspendedAt` (migration applied)
  - Admin member page: Building Access section — suspend/restore with reason, notifications, audit log
  - access.syncMember() called on profile update
  - Noop logs; swap to oktaAccess when Okta/Brivo credentials available

## Email (superseded by Notifications layer)

- [x] lib/email.ts — smtp2go via nodemailer, TLS-aware (port 465 SSL / else STARTTLS)
- [x] Welcome email (admin-triggered from member detail page)
- [x] Staff can set/reset member password from admin member detail
- [x] Delete lib/email.ts (now dead code)
- [ ] Wire up SMTP env vars on production server

## Floor plan / studio — known issues

- [ ] Investigate "Sync spaces from SVG" still required after auto-sync on upload
- [ ] Studios floor plan toggle — should default collapsed
- [ ] Floor plan viewer click-to-detail on studios page — scroll-to-row done; inline panel pending

## Data Integrity

- [x] AuditLog writes in all admin server actions
- [x] DB query logging design — intentional writes at business layer (see data-integrity-v0.3.md); no ORM interception by design
- [x] Runtime validation of JWT role claim — `assertRole()` in auth.ts, degrades to MEMBER on invalid value
- [x] System freeze — `lib/freeze.ts` with 5s cached check; `requireUnfrozen()` called in all 13 admin page files
- [x] Freeze toggle UI — `/admin/settings` with reason field, admin-only, audit logged
- [x] Freeze banner — red banner in admin layout when frozen, links to settings
- [x] Undo system — `lib/undo.ts`; 1-hour window; per-entity applicators for Member/Rental/Certification/MemberPermission/Resource/WaitlistEntry; writes `action="undo"` audit entry with `undoOfId` reference
- [x] Audit log enhancements — entity history filter (entityId param), flagged-only filter, flag/unflag entries (`flagNote` field), undo buttons with countdown, undo chain links
- [x] AuditLog schema — `undoOfId` (self-ref FK), `flagNote` (post-hoc annotation) added
- [x] Manual rollback UI for actions outside 1-hour window — "Force revert" button (ADMIN only, confirm dialog) in audit log
- [x] Restore UI for soft-deleted records — `/admin/restore` page (ADMIN only, audit-logged)
- [x] IP address population in audit entries — `getClientIp()` in `lib/audit.ts`, reads `x-forwarded-for` / `x-real-ip`, degrades to null outside request context

## Accessibility (quick wins)

- [x] `aria-label` on icon-only buttons — zoom ±/reset in FloorPlanViewer, ← Prev / Next → in booking views
- [x] `aria-expanded` + `aria-controls` on toggle buttons — floor plan expand/collapse in StorageFloorPlan / StudioFloorPlan
- [x] `role="tablist"` / `role="tab"` + `aria-selected` on floor plan selector buttons (building/floor tabs)
- [x] `role="alert"` on inline error messages; `aria-describedby` linking error text to the relevant input
- [x] `aria-live="polite"` on dynamic status text — booking pending-start instructions, unit-count feedback
- [x] `role="alert"` + `aria-live="assertive"` on the system-frozen banner in admin layout
- [x] `aria-label` on `<nav>` landmarks in admin and portal layouts
- [x] `aria-current="page"` on active nav links in admin and portal layouts

## Tests

- [x] pytest — dxf_to_svg.py geometry + marker logic
- [x] Vitest — CSV parser, upload diff validation, studio naming
- [x] Vitest — lib/permissions.ts hasPermission() cert hierarchy
- [x] Vitest — studioSqFt calculation
- [x] Vitest — notifications smtp stub-when-unconfigured behavior
- [x] Vitest — payment stripe stub-when-unconfigured behavior
- [x] Vitest — identity.verifyCredentials returns false for bad password
- [x] Vitest — bookingTime utilities (computeBlocks, roundUpTo15, slotsInRange, windowForDate, fmtDuration)
- [x] Vitest — createBooking action
- [x] Vitest — bookingTime gaps: parseLocalDate, addDays, minutesFromMidnight, fmtTime, fmtDate, fmtDateShort
- [x] Vitest — freeze.ts: cache TTL behavior, requireUnfrozen() redirect guard, invalidateFreezeCache()
- [x] Vitest — undo.ts: isUndoable() predicate (age window, action="undo", undoOfId set, SYSTEM actor, unknown entity)
- [ ] Vitest — audit.ts: getClientIp() header parsing (single IP, comma-separated forwarded-for, x-real-ip fallback, null outside request context)
- [x] Vitest — requireStaff / requireAdminApi: redirect/403 on missing session and MEMBER role; pass-through for STAFF/ADMIN
- [ ] Integration — registration validation (pw mismatch, short, taken)
- [ ] Integration — proxy route protection

## Security

- [ ] Explicit cookie policy in auth.ts (`sameSite: "lax"`, `secure: true` in prod, `httpOnly: true`) — currently correct by NextAuth default, but undeclared
- [ ] Login rate limiting — nothing currently stops brute-force on `/login` or `/register`
- [ ] Review open ports / firewall rules on production server
- [ ] Confirm postgres is localhost-only (not internet-exposed)
- [ ] Verify no raw SQL queries that bypass Prisma ORM (spot-check for `$queryRaw` / `$executeRaw`)

## License Compliance

- [x] NOTICE file at repo root — third-party attributions (LGPL, MPL-2.0, CC-BY-4.0, unlicensed)
- [x] tools/check-licenses.py — audits package-lock.json against allowlist; exits 1 on unexpected license; run after any pnpm install / dep bump
- [ ] GitHub Actions CI — wire up check-licenses.py (+ lint, tsc, vitest, pytest) to run on push/PR automatically

## DevOps

- [x] Dockerfile (multi-stage, standalone output)
- [x] docker-compose.yml (app + postgres container)
- [x] provision.sh (Ubuntu 24.04 — Docker official repo, nginx, certbot, backup cron)
- [x] nginx.conf.example
- [x] deploy.sh
- [x] .env.example
- [x] Simplified deploy.md (local postgres, no B2/DO Spaces)
- [ ] Slim Docker image: identify minimum node_modules subset needed at runtime (currently copying full node_modules to work around prisma migrate deploy dependencies)
- [ ] Set SMTP env vars on production server
- [ ] UptimeRobot monitor on /api/health
- [ ] GitHub deploy key on server
- [ ] Confirm production domain/subdomain
- [ ] Stripe webhook endpoint URL configured in Stripe dashboard → `/api/webhooks/stripe`
- [ ] STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET on production server
