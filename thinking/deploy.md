# Deployment Architecture

## Philosophy

Ease and stability of deploy over cost of infrastructure. The app serves ~500 members
and handles memberships, rentals, and eventually payments — data integrity and operational
simplicity matter more than squeezing margin out of the hosting bill.

---

## Infrastructure

### Application server

- Ubuntu 24.04 LTS
- Docker + Docker Compose (app + PostgreSQL)
- nginx (reverse proxy, SSL termination)
- Let's Encrypt / certbot (TLS)

### Database

PostgreSQL 16 runs in Docker Compose alongside the app (`db` service). Data persists
in a named Docker volume (`pgdata`). No external managed database.

---

## Application Stack (Docker Compose)

```
app/
  Dockerfile
  docker-compose.yml
  .env                ← server-side only, never committed
  .env.example        ← committed template
  deploy.sh           ← pull + rebuild
```

Containers:
- **app** — Next.js standalone build (`NODE_ENV=production`), port 3000
- **db** — postgres:16-alpine, healthchecked before app starts

nginx runs on the host, proxies to the app container on port 3000.

---

## Networking

```
Internet → nginx (host, port 443) → app container (port 3000)
App container → db container (Docker internal network, port 5432)
```

---

## First deploy

```bash
# Install prerequisites
apt install docker.io docker-compose-plugin nginx certbot python3-certbot-nginx python3

# Clone and configure
git clone <repo> /srv/makerspace
cd /srv/makerspace/app
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), AUTH_URL

docker compose up -d --build
```

Migrations run automatically at container startup (`prisma migrate deploy`).

## Subsequent deploys

```bash
cd /srv/makerspace/app
./deploy.sh
```

---

## Backup

Local `pg_dump` to a directory on the host, rotated by cron.

`/srv/backup/pg_backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR=/srv/backup/db
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d)
FILENAME="makerspace_${DATE}.sql.gz"

docker compose -f /srv/makerspace/app/docker-compose.yml exec -T db \
  pg_dump -U makerspace makerspace | gzip > "$BACKUP_DIR/$FILENAME"

# Keep 30 days
find "$BACKUP_DIR" -name "makerspace_*.sql.gz" -mtime +30 -delete

echo "Backup complete: $FILENAME"
```

Cron entry (2am nightly):
```
0 2 * * * /srv/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

To restore:
```bash
gunzip -c /srv/backup/db/makerspace_20260401.sql.gz | \
  docker compose exec -T db psql -U makerspace makerspace
```

---

## SSL / TLS

```bash
certbot --nginx -d devops.artisans-collab.org
```

certbot installs a systemd timer for auto-renewal.

---

## Monitoring

- UptimeRobot free tier — pings `/api/health` every 5 min
- `/api/health` returns `{ ok: true, db: "ok" }` (already built)

---

## Open Questions

- [ ] Confirm production domain/subdomain
- [ ] GitHub repo access for the server deploy user (deploy key or fine-grained PAT)
- [ ] Stripe webhook endpoint URL (needed before payment integration)
