# Trust Check — Auth & Dependencies

A record of security-relevant design decisions and library trust assessments.
Intended to support periodic review and onboarding of collaborators.

---

## Design Goal

Two components were designated as critical/simple to review at the outset:
**auth** and **finance**. This document covers auth. The session shape abstraction
means auth complexity is contained entirely in `app/src/auth.ts` — no other file
needs to understand providers or token mechanics.

---

## Library Trust Assessment

### `bcryptjs`
Pure JavaScript port of bcrypt. Recognized, widely deployed, no native dependencies
(easier to build/deploy than the C++ `bcrypt` module). Intentionally slow by design —
that's the point of bcrypt. At makerspace scale the JS vs native speed difference
is irrelevant. No significant security incidents.

**Trust level: high.**

### `next-auth` (v5 beta)
The most complex dependency in the auth chain. Handles JWT signing and verification,
session management, CSRF protection, and provider abstraction. Maintained by
Vercel-adjacent contributors, widely deployed, v5 beta has been stable in practice.

The JWT secret (`AUTH_SECRET`) is what protects sessions — stored in `.env`,
never committed to the repo. A compromised or weak `AUTH_SECRET` is the primary
risk surface.

The v5 beta designation warrants periodic checks of the changelog for security
fixes. When the stable release ships, upgrade promptly.

**Trust level: medium-high. Monitor for stable release.**

### `@prisma/adapter-pg` + `pg` (node-postgres)
`pg` is the canonical PostgreSQL driver for Node.js, in production since ~2010,
extensively audited. Prisma wraps it via the adapter pattern. No concerns.

**Trust level: high.**

### Supply chain generally
`package-lock.json` is committed and `npm ci` is used on deploy — this installs
exact pinned versions rather than resolving fresh, protecting against a compromised
new patch release between deploys. This is the right practice and is already in place.

---

## The `jwt` Callback — `app/src/auth.ts`

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
2. NextAuth calls `jwt({ token, user })` — `user` is present only on this first call
3. `role` and `tierId` are copied into the token; NextAuth puts `user.id` into `token.sub`
4. Token is signed with `AUTH_SECRET` and stored as an encrypted cookie

### What happens on every subsequent request
1. NextAuth decodes and verifies the cookie signature
2. Calls `jwt({ token })` — `user` is absent, `if (user)` block skipped, token returned unchanged
3. Calls `session({ session, token })` to build the session object the app sees:
   - `token.sub` → `session.user.id`
   - `token.role` → `session.user.role`
   - `token.tierId` → `session.user.tierId`

### What to trust
- The token is signed — a client cannot tamper with `role` or `tierId` without
  invalidating the `AUTH_SECRET` signature. Role elevation by cookie manipulation
  is not possible.
- The session shape (`id`, `name`, `email`, `role`, `tierId`) is consistent
  regardless of auth provider. All downstream pages and actions consume this shape;
  none need to know which provider was used.

### Known limitations / things to watch

**Role changes don't take effect until re-login.**
`role` and `tierId` are frozen into the JWT at login time. If an admin changes a
member's role mid-session, the change won't be reflected until the member logs out
and back in. For a makerspace this is acceptable. If it becomes a problem, options
are: shorter JWT lifetime, or a server-side session blocklist checked on each request.

**`as MemberRole` cast on line 79.**
`token.role` is typed as `unknown` by NextAuth; we assert it as `MemberRole` rather
than validating it at runtime. This is not a runtime security risk — the value
entered the token from the DB enum at login — but it is a TypeScript assertion rather
than a proof. A future hardening step would be a runtime check:
```ts
const validRoles: MemberRole[] = ["MEMBER", "STAFF", "ADMIN"];
if (!validRoles.includes(token.role)) throw new Error("Invalid role in token");
```

**`token.sub!` non-null assertion on line 78.**
We assert `token.sub` is always set. It is — NextAuth sets it from `user.id` at
login — but it is an assertion. Same category as the role cast: low practical risk,
worth a comment.

---

## Okta Migration Path

When Okta credentials are available, an Okta provider is added to `auth.ts`.
The `jwt` callback will need one addition: when the provider is Okta, look up the
Member by `oktaId` or email and populate `token.sub` with the DB Member id (not
the Okta user id). `role` and `tierId` are then fetched from the DB at that point.

```ts
jwt({ token, user, account }) {
  if (account?.provider === "okta") {
    const member = await prisma.member.findUnique({
      where: { oktaId: token.sub },
      select: { id: true, role: true, tierId: true },
    });
    token.sub = member.id;       // swap Okta id for DB id
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

No other file in the app changes. The session shape remains identical.
This is the intended property of the abstraction.

---

## Periodic Review Checklist

- [ ] Check next-auth changelog for security releases
- [ ] Verify `AUTH_SECRET` rotation policy (recommend annual or on personnel change)
- [ ] Confirm `package-lock.json` is up to date and `npm audit` is clean
- [ ] Review JWT lifetime setting (currently NextAuth default — 30 days)
- [ ] Confirm `.env` is not present in any Docker image layers (`docker history`)
