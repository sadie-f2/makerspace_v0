# Trust Check — Auth & Dependencies v0.3

**Supersedes:** `trust-check.md`

**Status:** Updated to reflect the four-tier role system and current dependency
state. Core analysis is unchanged — the auth architecture has not drifted from
the original design.

---

## Design Goal

Two components were designated as critical/simple to review at the outset:
**auth** and **finance**. This document covers auth. The session shape abstraction
means auth complexity is contained entirely in `src/auth.ts` — no other file
needs to understand providers or token mechanics.

---

## Library Trust Assessment

### `bcryptjs`
Pure JavaScript port of bcrypt. Recognized, widely deployed, no native
dependencies. Intentionally slow by design. At makerspace scale the JS vs
native speed difference is irrelevant. No significant security incidents.

**Trust level: high.**

### `next-auth` (v5 beta)
The most complex dependency in the auth chain. Handles JWT signing/verification,
session management, CSRF protection, and provider abstraction. Maintained by
Vercel-adjacent contributors, widely deployed, v5 beta has been stable in
practice.

The JWT secret (`AUTH_SECRET`) is what protects sessions — stored in `.env`,
never committed. A compromised or weak `AUTH_SECRET` is the primary risk surface.

The v5 beta designation warrants periodic changelog checks for security fixes.
When the stable release ships, upgrade promptly.

**Trust level: medium-high. Monitor for stable release.**

### `@prisma/adapter-pg` + `pg` (node-postgres)
`pg` is the canonical PostgreSQL driver for Node.js, in production since ~2010,
extensively audited. Prisma wraps it via the adapter pattern. No concerns.

**Trust level: high.**

### Supply chain generally
`package-lock.json` is committed and `npm ci` is used on deploy — exact pinned
versions, not fresh resolution. Protects against compromised new patch releases
between deploys. This is the right practice and is in place.

---

## The `jwt` Callback — `src/auth.ts`

```ts
callbacks: {
  jwt({ token, user }) {
    if (user) {
      token.role = user.role;
      token.tierId = user.tierId;
    }
    return token;
  },
  session({ session, token }) {
    session.user.id = token.sub!;
    session.user.role = token.role as MemberRole;
    session.user.tierId = (token.tierId ?? null) as string | null;
    return session;
  },
},
```

### What happens at login
1. `authorize` (CredentialsProvider) verifies email/password against the DB,
   returns `{ id, name, email, role, tierId }`
2. NextAuth calls `jwt({ token, user })` — `user` is present only on first call
3. `role` and `tierId` are copied into the token; NextAuth puts `user.id` into
   `token.sub`
4. Token is signed with `AUTH_SECRET` and stored as an encrypted cookie

### What happens on every subsequent request
1. NextAuth decodes and verifies the cookie signature
2. Calls `jwt({ token })` — `user` is absent, `if (user)` block skipped
3. Calls `session({ session, token })` to build the session object:
   - `token.sub` → `session.user.id`
   - `token.role` → `session.user.role`
   - `token.tierId` → `session.user.tierId`

### What to trust
- The token is signed — a client cannot tamper with `role` or `tierId` without
  invalidating the signature. Role elevation by cookie manipulation is not
  possible.
- The session shape (`id`, `name`, `email`, `role`, `tierId`) is consistent
  regardless of auth provider.

### Role System (Updated for v0.3)

The `MemberRole` enum is now four-tier:

```
MEMBER < VOLUNTEER < STAFF < ADMIN
```

The `role` value in the JWT is one of these four. All downstream authorization
checks (`session.user.role`) work against this enum. The fine-grained
`MemberPermission` system is checked server-side per action — it is not carried
in the JWT.

### Known Limitations / Things to Watch

**Role changes don't take effect until re-login.**
`role` and `tierId` are frozen into the JWT at login. If an admin changes a
member's role mid-session, the change is not reflected until the member logs out
and back in. For a makerspace this is acceptable. Options if it becomes a
problem: shorter JWT lifetime, or a server-side session blocklist.

**`as MemberRole` cast.**
`token.role` is typed as `unknown` by NextAuth; we assert it as `MemberRole`.
Not a runtime security risk — the value entered from the DB enum at login — but
it is a TypeScript assertion. Future hardening: runtime check against valid enum
values.

**`token.sub!` non-null assertion.**
We assert `token.sub` is always set. It is — NextAuth sets it from `user.id` —
but it is an assertion. Same category as the role cast.

**Fine-grained permissions are not in the JWT.**
`MemberPermission` grants (e.g. `certifications.grant`, `equipment.manage`) are
checked server-side via `hasPermission()` on each action. They are not cached in
the token. This is intentional — permissions can be granted/revoked without
requiring re-login, unlike role changes.

---

## Route Protection

**Change from v1.0:** `proxy.ts` replaces `middleware.ts`. The proxy runtime is
Node.js (not Edge), so Prisma and auth imports work without the cookie-check
workaround previously required in Edge middleware.

Protected routes: `/portal/*` and `/admin/*`. Unauthenticated requests redirect
to `/login` with callback URL.

Role-based page access (e.g. admin pages restricted to STAFF/ADMIN) is enforced
in page-level server components and server actions, not in the proxy.

---

## Identity Provider Migration Path

When an external provider (Okta, Auth0) is adopted, the `jwt` callback gains
one addition:

```ts
jwt({ token, user, account }) {
  if (account?.provider === "okta") {
    const member = await prisma.member.findUnique({
      where: { oktaId: token.sub },
      select: { id: true, role: true, tierId: true },
    });
    token.sub = member.id;       // swap provider id for DB id
    token.role = member.role;
    token.tierId = member.tierId;
  }
  if (user) {
    token.role = user.role;
    token.tierId = user.tierId;
  }
  return token;
},
```

No other file changes. The session shape remains identical. This is the intended
property of the abstraction.

The `Member` model carries both `oktaId` and `webId` fields for this purpose.

---

## Periodic Review Checklist

- [ ] Check next-auth changelog for security releases
- [ ] Verify `AUTH_SECRET` rotation policy (recommend annual or on personnel change)
- [ ] Confirm `package-lock.json` is up to date and `npm audit` is clean
- [ ] Review JWT lifetime setting (currently NextAuth default — 30 days)
- [ ] Confirm `.env` is not present in any Docker image layers (`docker history`)
- [ ] Review MemberPermission grants for stale or over-broad entries
