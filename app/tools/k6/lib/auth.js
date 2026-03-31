/**
 * NextAuth credentials login helper.
 *
 * NextAuth requires a CSRF token before it will accept a credentials POST.
 * This helper handles the two-step flow and returns the session cookie value,
 * or null if login failed.
 */

import http from "k6/http";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

/**
 * Login with email + password.
 * Returns the session cookie string, or throws on failure.
 */
export function login(email, password) {
  // Step 1: fetch CSRF token
  const csrfRes = http.get(`${BASE}/api/auth/csrf`, {
    tags: { name: "auth/csrf" },
  });
  if (csrfRes.status !== 200) {
    throw new Error(`CSRF fetch failed: ${csrfRes.status}`);
  }
  const { csrfToken } = JSON.parse(csrfRes.body);

  // Step 2: submit credentials
  const loginRes = http.post(
    `${BASE}/api/auth/callback/credentials`,
    {
      csrfToken,
      email,
      password,
      redirect:    "false",
      callbackUrl: `${BASE}/portal`,
      json:        "true",
    },
    {
      redirects: 0,
      tags:      { name: "auth/login" },
    }
  );

  const cookie = (loginRes.cookies["authjs.session-token"] || [])[0];
  if (!cookie) {
    throw new Error(`Login failed for ${email} — status ${loginRes.status}`);
  }
  return cookie.value;
}

/**
 * Return request params with the session cookie set.
 */
export function withSession(cookieValue, extra = {}) {
  return {
    ...extra,
    headers: {
      ...(extra.headers || {}),
      Cookie: `authjs.session-token=${cookieValue}`,
    },
  };
}

export { BASE };
