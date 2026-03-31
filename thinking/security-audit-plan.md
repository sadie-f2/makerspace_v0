# Security Audit Plan

## 1. Local Tooling (run on the server)

### System-level
```bash
# General Linux hardening audit — scores and recommends
apt install lynis
lynis audit system

# Check for rootkits
apt install rkhunter
rkhunter --check

# Open ports — what's actually listening
ss -tlnp
# Expect: 22 (SSH), 80/443 (nginx), 5432 (postgres — localhost only), app ports (localhost only)

# Who has access
cat /etc/passwd | grep -v nologin
last                  # recent logins
lastb                 # failed logins
```

### Postgres-specific
```bash
# Is postgres reachable from outside?
nmap -p 5432 <your-server-ip>   # should show filtered/closed

# pg_hba.conf — should use md5/scram, not trust
cat /etc/postgresql/*/main/pg_hba.conf

# Check DB user privileges — no app user should be superuser
psql -U postgres -c "\du"

# Check each app DB user only has access to its own DB
psql -U postgres -c "\l"
```

### Application
```bash
# Node dependency vulnerabilities
cd /home/sadie/src/makerspace_v0/app
npm audit
npm audit --audit-level=high   # fail on high/critical

# Python dependencies (dxf_to_svg.py)
pip install pip-audit
pip-audit

# Scan for raw SQL in the codebase (should be zero)
grep -r '\$queryRaw\|\$executeRaw' src/

# Check .env is not committed
git log --all --full-history -- .env
git log --all --full-history -- '**/.env'

# Container vulnerability scan (if using Docker)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image makerspace-app:latest
```

### fail2ban (already in provision.sh — verify config)
```bash
fail2ban-client status
fail2ban-client status sshd
# Add jail for nginx auth endpoints (see section 5)
```

---

## 2. Remote Tooling (external perspective)

Run these from a separate machine, simulating an attacker.

### Port / surface scan
```bash
# Full port scan from outside
nmap -sV -p- <server-ip>
# Expected open: 80, 443 only. Everything else filtered.

# TLS configuration quality
docker run --rm drwetter/testssl.sh https://orgdomain.org
# Checks: cipher suites, protocol versions, cert validity, HSTS, etc.
```

### Web application scanning
```bash
# Nikto — quick web server fingerprint + known vuln check
nikto -h https://orgdomain.org

# OWASP ZAP — passive scan (safe, no active attacks)
# Run as Docker:
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://orgdomain.org -r zap-report.html

# nuclei — template-based vulnerability scanner
nuclei -u https://orgdomain.org -t exposures/ -t misconfiguration/
```

### HTTP headers (can also use online tools)
```bash
# curl inspection
curl -sI https://orgdomain.org | grep -iE \
  "strict-transport|x-content-type|x-frame|referrer-policy|content-security|permissions-policy"

# Online: https://securityheaders.com
# Online: https://observatory.mozilla.org
```

---

## 3. DoS / Resource Exhaustion

### Current gaps
- No rate limiting on `/login`, `/register`, or any `/api/*` route
- Prisma default connection pool (10 connections) — fine for now, worth monitoring
- No explicit request body size limit (Next.js defaults apply: 4MB for API routes)

### nginx rate limiting (to implement)
```nginx
# In nginx.conf http block:
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m  rate=30r/m;

# In each org server block:
location ~ ^/(login|register) {
    limit_req zone=auth burst=3 nodelay;
    limit_req_status 429;
    proxy_pass http://localhost:300X;
}
location /api/ {
    limit_req zone=api burst=10;
    proxy_pass http://localhost:300X;
}
```

### Application-level (proxy.ts)
For single-server deployments, a lightweight in-memory counter in `proxy.ts`
can supplement nginx for finer-grained control (e.g., per-user API rate limiting).
Not needed until nginx limiting is in place.

### Postgres connection exhaustion
Prisma default pool = 10 connections. For multi-org on one server, each org
uses up to 10. With 5 orgs that's 50 — fine for a single postgres instance
(default max_connections = 100). Monitor with:
```sql
SELECT count(*) FROM pg_stat_activity;
```

---

## 4. Credential Hijacking

### Current state assessment

| Vector | Status | Notes |
|--------|--------|-------|
| Password hashing | ✅ bcrypt via identity layer | |
| Brute force on /login | ❌ No protection | Top priority |
| Session storage | ✅ httpOnly JWT cookie | Not in localStorage |
| Session fixation | ✅ Not possible | New JWT issued on login |
| Token leakage (XSS) | ✅ httpOnly cookie | JS can't read it |
| Cookie sameSite | ✅ lax (NextAuth default) | Blocks CSRF POST |
| Cookie secure flag | ✅ auto on https | |
| Account enumeration | ✅ Generic error message | "Invalid email or password" |
| Password reset flow | ✅ Admin-set or current-pw required | No email token attack surface |
| Auth secret strength | ⚠️ Depends on .env | Must be 32+ random bytes |

### Auth secret check
```bash
# AUTH_SECRET should be at minimum 32 bytes of random data
# Generate if not already strong:
openssl rand -base64 32
```

### JWT session invalidation gap
JWTs are stateless — there's no server-side revocation. If a token is stolen
(e.g., via physical access to the cookie), it remains valid until expiry.
NextAuth default session expiry is 30 days.

Mitigation options (in priority order):
1. Reduce session maxAge (e.g., 8 hours) — trade-off vs. user convenience
2. Add a `jti` (JWT ID) blocklist for explicit revocation (e.g., on password change)
3. Accept the risk given httpOnly cookie already prevents JS extraction

Currently: option 3 is acceptable for v1. Log it as a known trade-off.

---

## 5. Database Security

### Current state assessment

| Area | Status | Notes |
|------|--------|-------|
| SQL injection | ✅ Prisma ORM | Parameterized by default |
| Raw SQL usage | Verify | Grep for $queryRaw |
| Postgres internet exposure | Verify | Should be localhost only |
| DB user privileges | Verify | Should not be superuser |
| Credentials in git | ✅ .env in .gitignore | Verify with git log |
| Backup encryption | ❌ Not implemented | Plaintext backups |
| pg_hba.conf auth method | Verify | Should be scram-sha-256 |

### Actions
```bash
# Verify no raw SQL
grep -r '\$queryRaw\|\$executeRaw' app/src/

# Lock down postgres to localhost in postgresql.conf
listen_addresses = 'localhost'

# pg_hba.conf — use scram-sha-256 (strongest)
# local   all   all   scram-sha-256
# host    all   all   127.0.0.1/32   scram-sha-256

# Revoke superuser from app users
ALTER USER orgname_user NOSUPERUSER NOCREATEDB NOCREATEROLE;
```

### Backup encryption (to implement)
Current provision.sh backup cron dumps plaintext SQL. Should encrypt at rest:
```bash
pg_dump orgname | gpg --symmetric --cipher-algo AES256 \
  -o /backups/orgname_$(date +%Y%m%d).sql.gpg
```

---

## 6. HTTP Security Headers

### Current state (from proxy.ts)
```
Content-Security-Policy  ✅  strict-dynamic + nonce, frame-ancestors: none
X-Content-Type-Options   ❌  not set
Strict-Transport-Security ❌  not set (should be in nginx)
X-Frame-Options          ❌  not set (redundant with CSP but belt+suspenders)
Referrer-Policy          ❌  not set
Permissions-Policy       ❌  not set
```

### To add in nginx (applies before the app even sees the request)
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

### To add in proxy.ts (belt+suspenders for app-layer)
```ts
response.headers.set("X-Content-Type-Options", "nosniff");
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
// HSTS stays in nginx — only meaningful over TLS which nginx terminates
```

---

## 7. Dependency Vulnerability Scanning

### npm audit (add to deploy workflow)
```bash
# In deploy.sh, before starting the app:
npm audit --audit-level=high || exit 1
```

### Automated via GitHub
- Enable **Dependabot alerts** in repo settings → Security
- Enable **Dependabot security updates** — auto-PRs for vulnerable deps
- Consider adding a GitHub Actions workflow:
```yaml
- name: Audit dependencies
  run: npm audit --audit-level=high
```

### Python (dxf_to_svg.py)
```bash
pip install pip-audit
pip-audit  # checks against PyPA advisory database
```

---

## Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | nginx rate limiting on /login + /register | Low |
| 2 | Add missing HTTP headers (nginx + proxy.ts) | Low |
| 3 | Verify postgres not internet-exposed | Low (verify only) |
| 4 | Verify no $queryRaw usage | Low (grep) |
| 5 | Encrypt backups | Medium |
| 6 | Run npm audit + add to deploy.sh | Low |
| 7 | Run lynis + review findings | Medium |
| 8 | Run testssl.sh + ZAP from external | Medium |
| 9 | Session maxAge review | Design decision |
| 10 | AUTH_SECRET strength check | Low (verify .env) |
