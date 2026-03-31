/**
 * Makerspace load test — two concurrent scenarios:
 *
 *   members  N VUs browsing the member portal
 *   admins   N VUs working in the admin panel
 *
 * Usage:
 *   k6 run tools/k6/makerspace.js
 *
 * Env vars:
 *   BASE_URL    Target origin  (default: http://localhost:3000)
 *   MEMBER_VUS  Member virtual users  (default: 10)
 *   ADMIN_VUS   Admin virtual users   (default: 3)
 *   DURATION    Scenario duration     (default: 2m)
 *   PASSWORD    Account password      (default: LoadTest!Dev1)
 *
 * Accounts must exist — run seed-test-accounts.ts first.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { login, withSession, BASE } from "./lib/auth.js";

// ── Config ────────────────────────────────────────────────────────────────────

const MEMBER_VUS = parseInt(__ENV.MEMBER_VUS || "10");
const ADMIN_VUS  = parseInt(__ENV.ADMIN_VUS  || "3");
const DURATION   = __ENV.DURATION || "2m";
const PASSWORD   = __ENV.PASSWORD || "LoadTest!Dev1";

const MEMBER_COUNT = parseInt(__ENV.MEMBER_COUNT || "10");
const ADMIN_COUNT  = parseInt(__ENV.ADMIN_COUNT  || "3");

// ── Scenarios ─────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    members: {
      executor:          "ramping-vus",
      startVUs:          0,
      stages: [
        { duration: "30s", target: MEMBER_VUS },
        { duration: DURATION, target: MEMBER_VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown:  "10s",
      exec:              "memberScenario",
    },
    admins: {
      executor:          "ramping-vus",
      startVUs:          0,
      stages: [
        { duration: "30s", target: ADMIN_VUS },
        { duration: DURATION, target: ADMIN_VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown:  "10s",
      exec:              "adminScenario",
    },
  },

  thresholds: {
    // 95th-percentile response under 2 s across all requests
    http_req_duration:              ["p(95)<2000"],
    // Less than 1% errors overall
    http_req_failed:                ["rate<0.01"],
    // Scenario-scoped trends (defined below)
    "portal_req_duration":          ["p(95)<2000"],
    "admin_req_duration":           ["p(95)<2000"],
  },
};

// ── Custom metrics ─────────────────────────────────────────────────────────────

const portalDuration = new Trend("portal_req_duration", true);
const adminDuration  = new Trend("admin_req_duration",  true);
const authErrors     = new Counter("auth_errors");
const checkFailures  = new Rate("check_failures");

// ── Setup: login all accounts once, return cookie arrays ──────────────────────

export function setup() {
  const memberCookies = [];
  const adminCookies  = [];

  console.log(`Logging in ${MEMBER_COUNT} member account(s)…`);
  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const email = `member${i}@loadtest.local`;
    try {
      memberCookies.push(login(email, PASSWORD));
    } catch (e) {
      authErrors.add(1);
      console.error(`  FAILED: ${email} — ${e.message}`);
    }
  }

  console.log(`Logging in ${ADMIN_COUNT} admin account(s)…`);
  for (let i = 1; i <= ADMIN_COUNT; i++) {
    const email = `admin${i}@loadtest.local`;
    try {
      adminCookies.push(login(email, PASSWORD));
    } catch (e) {
      authErrors.add(1);
      console.error(`  FAILED: ${email} — ${e.message}`);
    }
  }

  if (memberCookies.length === 0) throw new Error("No member sessions — cannot run test.");
  if (adminCookies.length === 0)  throw new Error("No admin sessions — cannot run test.");

  console.log(`Setup complete: ${memberCookies.length} member, ${adminCookies.length} admin sessions`);
  return { memberCookies, adminCookies };
}

// ── Portal endpoints (member scenario) ────────────────────────────────────────

const PORTAL_ENDPOINTS = [
  { path: "/portal",                   tag: "portal/dashboard"      },
  { path: "/portal/bookings",          tag: "portal/bookings"       },
  { path: "/portal/book",              tag: "portal/book"           },
  { path: "/portal/waitlist",          tag: "portal/waitlist"       },
  { path: "/portal/certifications",    tag: "portal/certifications" },
  { path: "/portal/profile",           tag: "portal/profile"        },
  { path: "/api/health",               tag: "api/health"            },
];

export function memberScenario({ memberCookies }) {
  const cookie = memberCookies[(__VU - 1) % memberCookies.length];
  const endpoint = PORTAL_ENDPOINTS[Math.floor(Math.random() * PORTAL_ENDPOINTS.length)];

  const res = http.get(
    BASE + endpoint.path,
    withSession(cookie, { tags: { name: endpoint.tag } }),
  );

  portalDuration.add(res.timings.duration);

  const ok = check(res, {
    "portal status 2xx or 3xx": r => r.status >= 200 && r.status < 400,
    "portal not 5xx":           r => r.status < 500,
  });
  if (!ok) checkFailures.add(1);

  sleep(1 + Math.random() * 2);
}

// ── Admin endpoints (admin scenario) ──────────────────────────────────────────

const ADMIN_ENDPOINTS = [
  { path: "/admin",                    tag: "admin/dashboard"       },
  { path: "/admin/members",            tag: "admin/members"         },
  { path: "/admin/bookings",           tag: "admin/bookings"        },
  { path: "/admin/waitlist",           tag: "admin/waitlist"        },
  { path: "/admin/studios",            tag: "admin/studios"         },
  { path: "/admin/storage",            tag: "admin/storage"         },
  { path: "/admin/rental-requests",    tag: "admin/rental-requests" },
  { path: "/admin/resources",          tag: "admin/resources"       },
  { path: "/admin/audit",              tag: "admin/audit"           },
];

export function adminScenario({ adminCookies }) {
  const cookie = adminCookies[(__VU - 1) % adminCookies.length];
  const endpoint = ADMIN_ENDPOINTS[Math.floor(Math.random() * ADMIN_ENDPOINTS.length)];

  const res = http.get(
    BASE + endpoint.path,
    withSession(cookie, { tags: { name: endpoint.tag } }),
  );

  adminDuration.add(res.timings.duration);

  const ok = check(res, {
    "admin status 2xx or 3xx": r => r.status >= 200 && r.status < 400,
    "admin not 5xx":           r => r.status < 500,
  });
  if (!ok) {
    checkFailures.add(1);
    console.warn(`admin ${res.status} ${endpoint.path}`);
  }

  sleep(1 + Math.random() * 3);
}
