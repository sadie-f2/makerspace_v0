# Disaster Recovery Plan & Test Procedure

## Overview

Recovery from total infrastructure loss requires restoring two independent components:
the database (from pg_dump in DO Spaces) and the application server (from git + 1Password).
These can be done in parallel by two people or sequentially by one.

Target RTO (Recovery Time Objective): under 60 minutes for a practiced operator.
A backup you have never restored is a backup you do not actually have — run this drill
before go-live and annually thereafter.

---

## What Lives Where

| Asset | Source of truth | Recovery source |
|---|---|---|
| Member data, leases, certs | DO Managed PostgreSQL | pg_dump in DO Spaces |
| Application code | GitHub repo | `git clone` |
| Production secrets (.env) | 1Password | 1Password |
| nginx config | GitHub repo (`devops/nginx/`) | `git clone` |
| Deploy script | GitHub repo | `git clone` |
| SSL certificates | Let's Encrypt | `certbot` (regenerate free) |
| Docker images | Built from Dockerfile | `docker compose build` |

Nothing irreplaceable lives on the application server.

---

## Database Recovery Procedure

### 1. Provision a new DO Managed PostgreSQL instance
- Region: NYC3
- Plan: Basic, 1GB RAM (match production spec)
- Note the new private connection string

### 2. Download the latest pg_dump from DO Spaces
```bash
# Install s3cmd or use DO Spaces web console
s3cmd get s3://makerspace-backups/db/makerspace_YYYYMMDD.sql.gz /tmp/restore.sql.gz
```
Or download via the DO Spaces web console.

### 3. Restore
```bash
gunzip /tmp/restore.sql.gz
psql "$NEW_DATABASE_URL" < /tmp/restore.sql
```

### 4. Verify data integrity
```bash
psql "$NEW_DATABASE_URL" <<EOF
SELECT COUNT(*) FROM "Member" WHERE "deletedAt" IS NULL;
SELECT COUNT(*) FROM "Lease" WHERE "deletedAt" IS NULL AND "endDate" IS NULL;
SELECT COUNT(*) FROM "Certification" WHERE "revokedAt" IS NULL;
SELECT * FROM "SystemConfig" LIMIT 1;
EOF
```
Spot-check a few known members by name. Verify the most recent audit log entry
matches expected recent activity.

---

## Application Server Recovery Procedure

### 1. Provision a new DO Droplet
- Ubuntu 24.04 LTS, NYC3
- Basic Premium Intel, 4GB RAM
- Add SSH key
- Enable private networking (same VPC as the DB)

### 2. Install dependencies
```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
systemctl enable docker
```

### 3. Clone the repo
```bash
git clone https://github.com/<org>/makerspace_v0 /srv/makerspace
```

### 4. Restore secrets
Retrieve the production `.env` from 1Password and place it at:
```
/srv/makerspace/app/.env
```
Update `DATABASE_URL` to point at the new DB instance connection string if the DB
was also reprovisioned.

### 5. Deploy the app
```bash
cd /srv/makerspace
./deploy.sh
```

### 6. Configure nginx
```bash
cp /srv/makerspace/devops/nginx/makerspace.conf /etc/nginx/sites-available/makerspace
ln -s /etc/nginx/sites-available/makerspace /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7. Restore SSL certificate
```bash
certbot --nginx -d makerspace.artisansasylum.com
```

### 8. Restore backup cron
```bash
cp /srv/makerspace/devops/cron/pg_backup.sh /srv/backup/pg_backup.sh
chmod +x /srv/backup/pg_backup.sh
# Add DO Spaces credentials to environment or ~/.s3cfg
crontab -e
# Add: 0 2 * * * /srv/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1
```

---

## Smoke Test Checklist

Run after recovery before declaring the system live:

- [ ] `curl https://makerspace.artisansasylum.com/api/health` returns `{ "ok": true }`
- [ ] Login page loads
- [ ] Admin can log in with known credentials
- [ ] Member list loads and count matches expectation
- [ ] Member detail page loads (certifications, tier, leases visible)
- [ ] At least one resource visible in `/admin/resources`
- [ ] Floor plan SVG loads (if provisioned)
- [ ] Backup cron: run manually, verify file appears in DO Spaces

---

## DR Drill Procedure

Run before go-live and annually after. Use a staging environment — do not drill
against production data.

### Preparation
- [ ] Confirm latest pg_dump exists in DO Spaces and is dated within 24 hours
- [ ] Confirm `.env` is current in 1Password
- [ ] Confirm repo is up to date on GitHub
- [ ] Note current member count and a few member names for verification

### Execution
1. Follow Database Recovery Procedure above against a **new temporary DB instance**
2. Follow Application Server Recovery Procedure above against a **new temporary droplet**
3. Run full Smoke Test Checklist
4. Record actual time taken for each step

### Post-drill
- [ ] Document any steps that were missing or wrong in this file
- [ ] Update 1Password if any secrets were out of date
- [ ] Terminate the temporary DB instance and droplet
- [ ] Record drill date and RTO below

### Drill log

| Date | Operator | RTO | Notes |
|------|----------|-----|-------|
| — | — | — | Pre-go-live drill not yet run |
