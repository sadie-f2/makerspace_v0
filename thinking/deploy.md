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
# Install prerequisites (provision.sh does this)
apt install docker.io docker-compose-plugin nginx certbot python3-certbot-nginx nodejs npm
sudo npm install -g pnpm

# Clone and configure
git clone <repo> /srv/makerspace
cd /srv/makerspace/app
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), AUTH_URL

# Generate pnpm lockfile (required for Docker build)
# pnpm-lock.yaml must exist — copy from dev or run:
pnpm install
pnpm approve-builds   # approve: prisma, @prisma/engines, sharp, esbuild
# If pnpm-lock.yaml differs from dev, copy from dev instead to keep consistent

# Optional: add swap if server RAM < 4GB (prevents OOM during next build)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

docker compose up -d --build
```

Migrations run automatically at container startup (`prisma migrate deploy`).

### nginx setup

After `docker compose up`:

```bash
cp nginx.conf.example /etc/nginx/sites-available/makerspace
ln -s /etc/nginx/sites-available/makerspace /etc/nginx/sites-enabled/makerspace
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d devops.artisans-collab.org
# certbot rewrites the config file in place — add the location / proxy block manually
# if certbot doesn't include it (it won't on a minimal config):
```

Add inside the `server { listen 443 ... }` block:
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

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
