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
- [x] Map page — floor plan with tenant names
- [x] Day pass page — request + history (Stripe TBD)
- [x] Admin/staff portal link in admin header
- [ ] Booking/reservations — deferred to next session

## Email

- [x] lib/email.ts — smtp2go via nodemailer, TLS-aware (port 465 SSL / else STARTTLS)
- [x] Welcome email (admin-triggered from member detail page)
- [x] Staff can set/reset member password from admin member detail
- [ ] Wire up SMTP env vars on production server

## Floor plan / studio — known issues

- [ ] Investigate "Sync spaces from SVG" still required after auto-sync on upload
- [ ] Studios floor plan toggle — should default collapsed
- [ ] Floor plan viewer click-to-detail on studios page — scroll-to-row done; inline panel pending

## Data Integrity

- [x] AuditLog writes in all admin server actions
- [ ] DB query logging design
- [ ] Manual rollback UI (admin — apply before-state from audit log)
- [ ] Runtime validation of JWT role claim (replace `as MemberRole` cast)

## Tests

- [x] pytest — dxf_to_svg.py geometry + marker logic
- [x] Vitest — CSV parser, upload diff validation, studio naming
- [ ] Vitest — lib/permissions.ts hasPermission() cert hierarchy
- [ ] Vitest — studioSqFt calculation
- [ ] Vitest — lib/email.ts stub-when-unconfigured behavior
- [ ] Integration — registration validation (pw mismatch, short, taken)
- [ ] Integration — proxy route protection

## DevOps

- [x] Dockerfile (multi-stage, standalone output)
- [x] docker-compose.yml (app + postgres container)
- [x] provision.sh (Ubuntu 24.04 — Docker official repo, nginx, certbot, backup cron)
- [x] nginx.conf.example
- [x] deploy.sh
- [x] .env.example
- [x] Simplified deploy.md (local postgres, no B2/DO Spaces)
- [ ] Set SMTP env vars on production server
- [ ] UptimeRobot monitor on /api/health
- [ ] GitHub deploy key on server
- [ ] Confirm production domain/subdomain
- [ ] Stripe webhook endpoint URL (before payment integration)
