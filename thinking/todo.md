# Todo

## App — next features

- [ ] `/api/health` endpoint — `{ ok: true }`, needed before first production deploy
- [x] `FloorPlanRevision` model in Prisma schema
- [x] Admin floor plan import page — upload DXF → run dxf_to_svg.py → store revision
- [x] Admin floor plan revision viewer — list revisions, activate, compare
- [x] DXF provenance marker — embed `fpid.revid` in exported DXF, validate on re-upload
- [x] DXF stored in DB (`FloorPlanRevision.dxfData Bytes`) — filesystem copy is convenience only
- [x] Upload wizard — intent (new/revision), preview diff, commit, download labeled DXF
- [x] Bootstrap escape hatch — "Re-upload (skip marker)" for pre-marker DXFs
- [x] Auto-sync spaces on upload commit
- [x] Server-side SVG rendering (`/api/admin/floorplans/[id]/svg`) — fills + tooltip data baked in, no browser caching issues
- [x] Multi-unit studio group highlight on hover
- [x] Studios page — floor plan always visible, click highlights row in list
- [x] CSV studio import with preview table

## Floor plan / studio — known issues & next work

- [x] After upload commit, call `revalidatePath('/admin/studios')` so studios page reflects new data without manual refresh
- [ ] Investigate "Sync spaces from SVG" still required on floor plan detail page after auto-sync
- [x] Studio assembly edit — map-based unit picker in `/admin/studios/[id]`; unit count validated against allowed sizes
- [x] Studio rate: removed from CSV import; not in create form — rates are staff knowledge, not app-calculated
- [x] Studio naming convention — `s{AREA}-{N}` (area auto-uppercased if text); sizes config in admin settings
- [ ] Studios floor plan toggle — should default collapsed, expand to full height (currently always expanded — short-term intentional)
- [ ] Floor plan viewer click-to-detail on studios page — deferred (scroll-to-row done; inline panel pending)
- [x] Unit tests — pytest for dxf_to_svg.py geometry + marker logic; Vitest for CSV parser, upload diff validation

## Data Integrity

- [x] Wire up AuditLog writes in application code
- [ ] Design DB query logging — enable PG statement logging on DO, review log access
- [ ] Manual rollback design — admin UI for applying before-state snapshots from audit log
- [ ] Runtime validation of JWT role claim (replace `as MemberRole` cast with checked parse)

## DevOps

- [ ] Dockerfile for Next.js app
- [ ] `docker-compose.yml` (production)
- [ ] Backblaze B2 account setup — bucket `makerspace-backups`, write key (cron), read key (DR)
- [ ] Provision DO Droplet — Ubuntu 24.04, NYC3, 4GB
- [ ] Provision DO Managed PostgreSQL — NYC3, same private network
- [ ] nginx config + certbot SSL
- [ ] Deploy script `/srv/makerspace/deploy.sh`
- [ ] Backup cron `/srv/backup/pg_backup.sh` + B2 credentials on server
- [ ] UptimeRobot monitor on `/api/health`
- [ ] Update `thinking/deploy.md` with final Dockerfile/compose details
