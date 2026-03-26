# Todo

## App — next features

- [ ] `/api/health` endpoint — `{ ok: true }`, needed before first production deploy
- [ ] `FloorPlanRevision` model in Prisma schema
- [ ] Admin floor plan import page — upload DXF → run dxf_to_svg.py → store revision
- [ ] Admin floor plan revision viewer — list revisions, activate, compare

## Data Integrity

- [ ] Wire up AuditLog writes in application code (currently schema only, nothing writes to it)
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
