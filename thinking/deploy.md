# Deployment Architecture

## Philosophy

Ease and stability of deploy over cost of infrastructure. The app serves ~500 members
and handles memberships, leases, and eventually payments — data integrity and operational
simplicity matter more than squeezing margin out of the hosting bill.

---

## Infrastructure

### Application server — DigitalOcean Droplet

**Recommended**: Basic Premium Intel, 2 vCPU, 4GB RAM, 80GB SSD (~$24/mo)

- Ubuntu 24.04 LTS
- Docker + Docker Compose (app stack)
- nginx (reverse proxy, SSL termination)
- Let's Encrypt / certbot (TLS)

4GB gives comfortable headroom over the 2GB minimum. Next.js in production mode is lean
but build-time (`docker compose up --build`) spikes RAM briefly; 4GB avoids OOM during
deploys. If traffic stays light, downgrade to 2GB later — easier than chasing an OOM.

### Database — DigitalOcean Managed PostgreSQL

**Recommended**: Basic plan, 1GB RAM, 1 vCPU, 10GB storage (~$15/mo to start)

- Automated daily backups retained 7 days (DO-managed)
- Point-in-time recovery available
- Automatic minor version upgrades
- Connection pooling via PgBouncer (built in)
- Private networking between droplet and DB cluster (same datacenter)

Use the **private network connection string** in production — keeps DB traffic off the
public internet and removes one security variable.

### Backup — Backblaze B2 (portable pg_dump)

Platform-independent copy of the data, separate from DO's snapshot format.

- Nightly `pg_dump` → gzip → upload to Backblaze B2 bucket
- Retention: 30 daily dumps kept, older pruned automatically via B2 lifecycle rules
- Restores anywhere: DO, self-hosted, VMware, any PostgreSQL instance
- Cost: effectively free at this data volume (~$0.006/GB/mo storage)

This is the disaster recovery artifact that travels with you regardless of platform.
DO's managed backups are for convenience and fast restore within DO. B2 is for
portability and long-term retention.

---

## Application Stack (Docker Compose)

```
makerspace_v0/app/
  Dockerfile
  docker-compose.yml          ← production compose
  docker-compose.override.yml ← local dev overrides (gitignored)
```

Production containers:
- **app** — Next.js (built, `NODE_ENV=production`)
- nginx runs on the host (not in Docker) to handle SSL and route to the app container

The database is DO Managed PostgreSQL — no database container in production.

---

## Networking

```
Internet → nginx (host, port 443) → app container (port 3000)
                                  → static assets (served by nginx directly)

App container → DO Managed PostgreSQL (private network, port 5432)
```

Subdomain: `makerspace.artisansasylum.com` (or similar — TBD)

---

## Deploy Workflow

### First deploy

```bash
# On the droplet
git clone <repo> /srv/makerspace
cd /srv/makerspace/app
cp .env.example .env          # fill in production values
docker compose up -d --build
```

### Subsequent deploys

```bash
cd /srv/makerspace
git pull
cd app
docker compose up -d --build
```

Optionally wrapped in a deploy script at `/srv/makerspace/deploy.sh`:

```bash
#!/bin/bash
set -e
cd /srv/makerspace
git pull
cd app
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
echo "Deploy complete: $(date)"
```

### Database migrations

Migrations run as part of the deploy script (`prisma migrate deploy` applies any pending
migrations without resetting data). Migration files are committed to the repo.

---

## Environment Variables

Production `.env` (on server, never committed):

```
DATABASE_URL=postgresql://...@private-db-host:5432/makerspace?sslmode=require
AUTH_SECRET=<random 32+ bytes>
AUTH_URL=https://makerspace.artisansasylum.com
NODE_ENV=production
```

Secrets managed directly on the server for now. If the team grows, migrate to DO Secrets
or a simple secrets manager.

---

## Backup Script

`/srv/backup/pg_backup.sh` (runs via cron, 2am nightly):

```bash
#!/bin/bash
set -e

DATE=$(date +%Y%m%d)
FILENAME="makerspace_${DATE}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

pg_dump "$DATABASE_URL" | gzip > "$TMPFILE"

# Upload to Backblaze B2
b2 upload-file makerspace-backups "$TMPFILE" "db/${FILENAME}"

rm "$TMPFILE"
echo "Backup complete: ${FILENAME}"
```

Cron entry:
```
0 2 * * * /srv/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

B2 bucket lifecycle rule: delete files older than 30 days.

To restore from B2:
```bash
b2 download-file-by-name makerspace-backups db/makerspace_20260401.sql.gz /tmp/restore.sql.gz
gunzip /tmp/restore.sql.gz
psql "$DATABASE_URL" < /tmp/restore.sql
```

---

## SSL / TLS

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d makerspace.artisansasylum.com
```

certbot installs a systemd timer for auto-renewal — no manual intervention needed.

---

## Monitoring (minimal)

- DO Managed PostgreSQL has built-in metrics and alerting (set alert on disk > 70%)
- Droplet CPU/memory alerts via DO monitoring (free)
- Simple uptime check: UptimeRobot free tier pings the health endpoint every 5 min

A `/api/health` endpoint returning `{ ok: true }` is the target — add this before
first production deploy.

---

## Open Questions

- [ ] Confirm production domain/subdomain
- [ ] Decide on datacenter region (NYC3 or SFO3 — Boston → NYC3 is closest)
- [ ] GitHub repo access for the droplet deploy user (deploy key or fine-grained PAT)
- [ ] Who holds the Backblaze B2 credentials and DO account
- [ ] Stripe webhook endpoint URL (needed before payment integration)
