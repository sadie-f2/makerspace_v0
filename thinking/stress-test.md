# Stress Test Framework

## Topology

```
  Dev machine (8-core Xeon, 64GB)        Staging Droplet (1-2 vCPU, 1-2GB)
  ┌─────────────────────────┐            ┌──────────────────────────┐
  │  k6 (load generator)    │──────────▶│  nginx                   │
  │                         │  HTTPS     │  Next.js (single process) │
  │  generates load,        │            │  PostgreSQL               │
  │  collects metrics       │            │                          │
  └─────────────────────────┘            └──────────────────────────┘
```

The dev machine is the k6 client. The staging Droplet mirrors production
specs. Results reflect real production bottlenecks, not dev machine capacity.

## Setup

### Staging Droplet
- Mirror production: same Droplet size, same Docker/nginx config, same
  `NODE_ENV=production`, same `npm run build && npm run start`
- Seed test accounts (see below) — do not use real member data
- Confirm the app is running and accessible over HTTPS before testing

### Test accounts
Create a small pool of dedicated load-test members directly in the staging DB:

```bash
# One-off seed — run against staging DB only
DATABASE_URL=... npx tsx tools/seed-loadtest.ts
```

Suggested accounts:
```
loadtest1@internal  /  LoadTest#1pass
loadtest2@internal  /  LoadTest#2pass
loadtest3@internal  /  LoadTest#3pass
```

One MEMBER role account is sufficient for portal endpoint testing.
Add one STAFF account if testing admin endpoints.

### Install k6
```bash
# macOS
brew install k6

# Linux (dev machine or CI)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
```

---

## Test Scripts

### Auth flow helper (`tools/k6/auth.js`)
NextAuth credentials login requires a CSRF token first.

```js
import http from "k6/http";

const BASE = __ENV.BASE_URL || "https://staging.orgdomain.org";

export function login(email, password) {
  // Step 1: get CSRF token
  const csrf = http.get(`${BASE}/api/auth/csrf`);
  const csrfToken = JSON.parse(csrf.body).csrfToken;

  // Step 2: authenticate
  const res = http.post(
    `${BASE}/api/auth/callback/credentials`,
    {
      csrfToken,
      email,
      password,
      redirect: "false",
      callbackUrl: `${BASE}/portal`,
      json: "true",
    },
    { redirects: 0 }
  );

  const cookie = res.cookies["authjs.session-token"];
  if (!cookie || !cookie[0]) {
    throw new Error(`Login failed for ${email}`);
  }
  return cookie[0].value;
}

export function authHeaders(cookie) {
  return { headers: { Cookie: `authjs.session-token=${cookie}` } };
}

export { BASE };
```

---

### Test 1: Baseline portal load (`tools/k6/portal-load.js`)
Steady load across common portal endpoints. Establishes baseline latency
and the concurrent user count before degradation begins.

```js
import http from "k6/http";
import { sleep, check } from "k6";
import { login, authHeaders, BASE } from "./auth.js";

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // warm up
    { duration: "1m",  target: 25 },   // normal load
    { duration: "1m",  target: 50 },   // moderate load
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ["p95<2000"],   // 95% of requests under 2s
    http_req_failed:   ["rate<0.01"],  // less than 1% errors
  },
};

export function setup() {
  const cookie = login("loadtest1@internal", "LoadTest#1pass");
  return { cookie };
}

const ENDPOINTS = [
  "/portal",
  "/portal/profile",
  "/portal/bookings",
  "/portal/waitlist",
  "/portal/certifications",
  "/api/health",
];

export default function ({ cookie }) {
  const url = BASE + ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const res = http.get(url, authHeaders(cookie));
  check(res, { "status 200": r => r.status === 200 });
  sleep(1 + Math.random() * 2);
}
```

---

### Test 2: Auth endpoint stress (`tools/k6/auth-stress.js`)
Each VU logs in independently. Tests the auth endpoint under load and
verifies rate limiting kicks in correctly.

```js
import http from "k6/http";
import { sleep, check } from "k6";
import { login, BASE } from "./auth.js";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m",  target: 50 },
    { duration: "30s", target: 100 },  // spike — expect 429s here
    { duration: "30s", target: 0 },
  ],
};

export default function () {
  try {
    const cookie = login("loadtest1@internal", "LoadTest#1pass");
    check(cookie, { "got session cookie": c => !!c });
  } catch {
    // 429s from rate limiter are expected at high VU counts — that's the goal
  }
  sleep(1);
}
```

---

### Test 3: Spike / resource exhaustion (`tools/k6/spike.js`)
Sudden traffic spike to find the breaking point. Watch server resources
during this test.

```js
import http from "k6/http";
import { sleep } from "k6";
import { login, authHeaders, BASE } from "./auth.js";

export const options = {
  stages: [
    { duration: "10s", target: 5 },    // baseline
    { duration: "10s", target: 200 },  // sudden spike
    { duration: "1m",  target: 200 },  // hold
    { duration: "10s", target: 5 },    // recover
    { duration: "30s", target: 5 },    // watch recovery
  ],
};

export function setup() {
  return { cookie: login("loadtest1@internal", "LoadTest#1pass") };
}

export default function ({ cookie }) {
  http.get(BASE + "/portal", authHeaders(cookie));
  sleep(0.5);
}
```

---

## Running Tests

```bash
# Basic run
k6 run --env BASE_URL=https://staging.orgdomain.org tools/k6/portal-load.js

# With HTML report
k6 run --out json=results.json tools/k6/portal-load.js
k6 report results.json   # generates results.html

# Auth stress
k6 run --env BASE_URL=https://staging.orgdomain.org tools/k6/auth-stress.js
```

---

## Server-side Monitoring (run on staging Droplet during tests)

```bash
# In one terminal — watch system resources
watch -n 1 'echo "=== CPU/MEM ===" && uptime && free -m && \
  echo "=== CONNECTIONS ===" && ss -s && \
  echo "=== POSTGRES ===" && psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null'

# In another — watch nginx access log for 429s and 5xxs
tail -f /var/log/nginx/access.log | grep -E " [45][0-9]{2} "

# Docker stats if containerized
docker stats
```

---

## What to Look For

| Symptom | Likely cause |
|---------|-------------|
| p95 latency climbs past 2s | App or DB under CPU pressure |
| Error rate spikes (502/504) | App process crashed or overwhelmed |
| 429s appear on auth endpoints | Rate limiter working correctly |
| Postgres connection count maxes out | Need to tune Prisma pool size |
| Memory grows and doesn't recover | Possible memory leak in app |
| CPU pegged at 100% on one core | Single-process Node.js saturation — consider clustering |
| Recovery after spike is slow | Keep-alive connections not being released |

---

## Sequence

1. Deploy to staging Droplet mirroring production specs
2. Seed test accounts
3. Run Test 1 (baseline) — record p95 latency and max stable VU count
4. Add nginx rate limiting (from security-audit-plan.md)
5. Run Test 2 (auth stress) — confirm 429s appear at expected threshold
6. Run Test 3 (spike) — find breaking point, observe recovery
7. Tune as needed (Prisma pool, nginx worker_connections, keepalive)
8. Document results — use as production capacity baseline
