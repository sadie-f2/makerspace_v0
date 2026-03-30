# Version History

## v0.3.2 — 2026-03-30 (commit `5b43e21`)

### Storage Management
- New `/admin/storage` page with DXF import pipeline for bay/level assignment
- `SpaceTypeConfig` extended with storage-specific fields
- `Space` model gains `bay` and `level` fields
- `/api/admin/storage/import` route for processing uploaded DXF files

### Floor Plan Viewer
- Pan and zoom with mouse and touch support
- SVG rendered from parsed DXF data
- Revision history with per-revision DXF download

### Bookings / Reservations
- Full booking system: per-resource day view, multi-resource horizontal calendar, vertical grid view
- Admin cancel/manage view
- `SerializedBooking` type shared between portal and admin views
- Booking utility layer with 60+ unit tests covering time math and conflict detection

### Security Hardening
- Nonce-based Content Security Policy on all pages
- `requireStaff()` guard on sensitive admin pages (members, rentals, rental requests, settings, audit, studios, storage, floorplans)
- `requireAdminApi()` guard on all `/api/admin/*` routes (previously completely unauthenticated)
- Role-based access: VOLUNTEER gets read-only admin subset; MEMBER redirected to portal
- `memberId` removed from `SerializedBooking` — was being sent to all members viewing shared resource calendars

### Public Map Page
- Unauthenticated `/map` page showing floor plan
- Occupancy data stripped from public view

### Dev Infrastructure
- nginx reverse proxy config for remote dev access (LAN and firewall/external IP)
- WebSocket proxying for Next.js HMR (`/_next/webpack-hmr`)
- `allowedDevOrigins` and `experimental.serverActions.allowedOrigins` for cross-origin dev
- `AUTH_TRUST_HOST=true` replacing hardcoded `AUTH_URL` for multi-origin auth redirects

---

## v0.3.0 — 2026-03-28 (commit `a2ba4d3`)

Initial coded implementation. Feature specs v0.1–v0.2.1 were written Feb–Mar 2026; code
was built Mar 26–27 against those specs, with the v0.3 spec written retroactively to
capture design decisions made during construction.

### Core Data Model
- `SpaceTypeConfig`: org-configurable space type definitions (name, color, area per unit)
- Studio assembly: studios composed from spaces, naming convention enforced, floor plan revisions tracked
- Member tiers with configurable rental rates
- Rental schema (originally "lease", renamed before first deploy)

### Admin Panel
- `/admin/settings/space-types` — CRUD for space type configuration
- `/admin/studios` — studio assembly, editing, floor plan assignment
- `/admin/members` — member management, role assignment
- `/admin/rental-requests` — review and approve incoming rental applications
- `/admin/waitlist` — waitlist management
- `/admin/floorplans` — floor plan upload, revision history, interactive SVG viewer (pan/zoom)
- `/admin/resources` and `/admin/equipment` — resource/equipment catalog
- Append-only audit log on all admin server actions

### Member Portal
- Registration with email + password (Auth.js credentials provider)
- Profile page
- Rentals: view active rentals, submit rental requests
- Waitlist: join/leave waitlist for studio types
- Certifications: view certification status
- Map: floor plan viewer (member-facing)
- Day pass: request a day pass

### Auth & Permissions
- Role system: MEMBER, VOLUNTEER, STAFF, ADMIN
- Route protection via `proxy.ts` (Next.js 16 — `middleware.ts` no longer intercepts)
- Welcome email on registration

### Deployment
- Docker: `Dockerfile`, `docker-compose.yml`, `.env.example`, `deploy.sh`
- Server provisioning: `provision.sh`, `nginx.conf.example`
- `/api/health` endpoint
- Local `pg_dump` rotation for backups
