# Multi-Host Deployment Plan

## Model

One cloud server node hosts multiple independent makerspace deployments.
Each org is fully isolated — separate service, separate database, separate domain.

```
                    Internet
                       │
              ┌────────▼────────┐
              │   nginx (443)   │  TLS termination + virtual host routing
              └────────┬────────┘
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     :3000           :3001         :3002
  artisans.org    nextorg.org   thirdorg.org
  Next.js app     Next.js app   Next.js app
      │               │              │
      ▼               ▼              ▼
  DB: asylum      DB: nextorg   DB: thirdorg
          └────────────┼────────────┘
                       ▼
              PostgreSQL server
              (one instance, multiple databases)
```

## Per-Org Isolation

Each deployment gets:

| Config | Per-org value |
|--------|--------------|
| `DATABASE_URL` | `postgres://user:pass@localhost/orgname` |
| `AUTH_SECRET` | Unique random secret (JWTs non-transferable between orgs) |
| `AUTH_URL` | `https://orgdomain.org` |
| `STRIPE_SECRET_KEY` | Org's own Stripe account |
| `SMTP_*` | Org's own email sender |
| PostgreSQL role | Granted access to own DB only |

## Cookie Isolation

Each org has its own domain. NextAuth does not set an explicit `domain`
attribute on cookies, so browser same-origin policy scopes them to the
exact hostname. No cross-org cookie leakage is possible.

`AUTH_SECRET` uniqueness means a JWT issued for org A is cryptographically
invalid on org B even if it somehow crossed origins.

## Database Setup (per new org)

```sql
CREATE DATABASE orgname;
CREATE USER orgname_user WITH PASSWORD 'strong-random-password';
GRANT ALL PRIVILEGES ON DATABASE orgname TO orgname_user;
```

Then from the app directory:
```bash
DATABASE_URL=postgres://orgname_user:password@localhost/orgname \
  npx prisma migrate deploy
```

## nginx Virtual Host (per org)

Each org gets a server block:

```nginx
server {
    listen 443 ssl;
    server_name orgdomain.org;

    ssl_certificate     /etc/letsencrypt/live/orgdomain.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orgdomain.org/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;  # org-specific port
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certbot handles TLS per domain:
```bash
certbot --nginx -d orgdomain.org
```

## Service Management

Each org runs as a separate Docker container (or systemd service).
Recommended: Docker Compose file per org, or a single Compose file with
multiple named services.

Port assignment: maintain a simple registry (e.g., in a file on the server)
mapping org → port to avoid conflicts.

```
3000  artisans-asylum
3001  next-org
3002  third-org
...
```

## DNS

Each org points their domain at the server's IP. Standard A record:
```
orgdomain.org.  A  <server-ip>
```

Most orgs will already have DNS control. No shared subdomain infrastructure
needed — each org is fully independent at the DNS level.

## What Requires No Code Changes

The app is already fully configured through environment variables.
Each deployment thinks it is the only one. No multi-tenant logic exists
in the codebase — isolation is entirely at the infrastructure layer.

## Operational Notes

- **Backups**: each DB backed up independently; cron per org or a single
  script that iterates all org databases
- **Updates**: deploy one org at a time; test before rolling to others
- **Prisma migrations**: run `prisma migrate deploy` per org on each update
- **Secrets rotation**: `AUTH_SECRET` rotation invalidates all active sessions
  for that org — coordinate with org admins
- **PostgreSQL version upgrades**: affect all orgs simultaneously; schedule
  maintenance window
