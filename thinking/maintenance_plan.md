# Long-Term Maintenance & Business Continuity Plan

## OS Lifecycle

Ubuntu 24.04 LTS standard support runs to **April 2029** (5 years), with Canonical
Extended Security Maintenance (ESM) extending to **April 2034**. The "decide in 2-3
years" window is actually 4-5 years before any action is required.

Options at end of standard support:
- Pay for Canonical ESM (~$25/node/year at small scale) — extends to 2034, no changes
- Provision new Droplet on Ubuntu 26.04 or 28.04 LTS and migrate — preferred if there
  is ongoing dev anyway, since the upgrade is not a significant additional lift
- Containerize (see below) — decouples app from host OS lifecycle entirely

## Framework Stack Aging

**The framework stack ages faster than Ubuntu.** Node.js LTS cycles are ~30 months;
Next.js major versions are roughly annual; Prisma and Auth.js follow similar cadences.
The binding constraint for "the app stops working" is more likely a framework API
removal than an Ubuntu EOL event.

Minimum sustainable posture: **security-only maintenance mode** — no features, but
CVE patches applied. Stripe and Auth.js will force your hand on this regardless
(they deprecate old API versions on their own schedule).

## Containerization

Freezing the entire runtime stack as a Docker image is the most practical "let it
ride" strategy. The image isolates the app from host OS changes and can run on any
Droplet regardless of Ubuntu version. Periodic image rebuilds (on your schedule)
address CVEs in the image layers without requiring an app migration.

This extends the practical no-touch window significantly and simplifies multi-host
deployment if the app scales to multiple makerspaces.

## Backup Strategy

**Managed PostgreSQL:** DO managed DB retains backups for 7 days. For longer retention,
schedule a nightly `pg_dump` via rclone or s3cmd to DO Spaces with a 365-day lifecycle
policy. Cost is ~cents/month for a makerspace-scale DB.

**Floor plan files (DXF/SVG):** ~100 MB of infrequently-changing files. Staff retain
source DXF files by definition (they are the import source). SVGs are derived artifacts
and can be regenerated from DXFs. Recommended approach: nightly `rclone sync` from the
Droplet DXF directory to DO Spaces. Simple, app-code-independent, negligible overhead.

```bash
# /etc/cron.d/dxf-backup
0 3 * * * root rclone sync /var/app/floorplans spaces:bucket/floorplans \
  --log-file /var/log/rclone-backup.log
```

DO Spaces stores objects with 3× replication within the region, independent of Droplet
health. Minimum cost is $5/month (250 GB floor), effectively free for this use case.

**Droplet snapshots:** Crash-consistent (COW at the storage layer — VM never pauses).
Useful as a floor for unplanned failures; not a substitute for clean-shutdown discipline.
DO Managed DB backups are application-consistent (PostgreSQL checkpoint before snapshot).

## High Availability

DO Managed PostgreSQL HA adds a hot standby with automatic failover. SLA is 99.99%
(~52 min/year) vs no failover guarantee on single-node. Cost is approximately 2× the
base node price. Recommended: start with HA from the beginning — set-and-forget failover
is worth the price of entry. One-click upgrade in the DO console, no app changes required.

## Framework Update Effort Estimates (per 24-month cycle)

| Component | Expected Effort | Notes |
|---|---|---|
| Node.js | ~0 | Next.js abstracts Node API surface; application code rarely touched |
| Prisma | 0.5–1 day | Good migration guides; Prisma 6→7 driver adapter shift was the big one |
| Stripe SDK | 0.5 day | API is versioned independently; focused usage surface (subscriptions, webhooks) |
| Next.js | 2–5 days | Already on App Router (committed path); variance from Vercel architectural shifts |
| Auth.js | 1–3 days | Highest risk — NextAuth v4→v5 was near-rewrite for many apps; logic is well-isolated |

**Realistic totals:**

| Scenario | Effort |
|---|---|
| Routine majors, good migration guides | 4–8 days |
| One component has an architectural shift | 2–3 weeks |
| Auth.js pivots again and/or Next.js shifts a primitive | 4–6 weeks |

Budget **2 weeks per 24-month cycle** as the expected case. Auth.js is the highest-risk
component; mitigation is that auth logic is well-isolated behind `requireStaff` and
`requireAdminApi` helpers, making the underlying mechanism straightforward to swap.

## Multi-Makerspace / Community Model

If the app extends beyond Artisans Asylum, the established path is:
- GitHub org with contribution guidelines and a clear maintainer model
- Open Collective fiscal sponsorship for shared hosting costs
- 4–5 makerspaces each contributing ~$50/month covers hosting and buys part-time
  maintenance capacity

Ongoing community development makes OS and framework update cycles a non-issue —
they become routine housekeeping rather than periodic migrations.
