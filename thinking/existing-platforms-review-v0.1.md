# Existing Platforms Review — Makerspace Management
**Date:** 2026-02-23
**Purpose:** Evaluate starting from an existing codebase vs. building from scratch

---

## Requirements Summary (for reference)

- 500 members, growing to 1,000
- 5 membership tiers + day passes
- Stripe billing: subscriptions, studio/storage add-ons, one-time day passes
- Studio & storage: long-term monthly rental assignments
- Booking calendar: tools, rooms, whole shops — with member-facing availability view
- Certification/training prerequisites for equipment booking (trust-enforced, not hardware)
- Day-pass → Auth0 → Brivo automation (time-limited building access)
- Auth0 as identity provider (free, non-profit)
- Brivo for building access (integrated via Auth0, not custom API)
- Flexible reporting
- $8,000 initial budget; $4,000/year operating
- One programmer, 6 months gifted; minimal maintenance staff after handoff

---

## Option 1 — MemberMatters

**Repo:** [github.com/membermatters/MemberMatters](https://github.com/membermatters/MemberMatters)
**Stack:** Python / Django backend + Vue.js / TypeScript frontend
**License:** MIT
**Maturity:** v3.8.0 (March 2025); 5+ years in production; 22 contributors

### What it covers
- Member management + Stripe billing ✅
- OIDC / Auth0 integration ✅
- RFID interlock access control ✅ (not needed — you have Brivo)
- Basic kiosk sign-in / tool tracking ⚠️

### What's missing
- Full booking calendar with member-facing availability ❌
- Studio / storage long-term rental ❌
- Certification-gated booking ⚠️ partial
- Flexible reporting ❌
- Day-pass → Brivo automation ❌

### Production users
4 known deployments, all small Australian/UK community spaces (likely <200 members each).
**No evidence of deployment at your scale (500–1,000 members).**

### Verdict
❌ **Not recommended.**
Its strongest feature (RFID/interlock access control) is irrelevant to you.
The features you most need are absent. Stack mismatch for TypeScript programmer;
Python programmer could work in Django but would inherit significant complexity
they don't need.

---

## Option 2 — Tendenci

**Website:** [tendenci.com](https://tendenci.com)
**Stack:** Python / Django
**License:** MIT (open source); also available as hosted SaaS at $199/month
**Maturity:** Long-established; designed for associations and non-profits

### What it covers
- Member management ✅
- Event registration ✅
- Donations, newsletters, CRM ✅

### What's missing
- Booking calendar ❌
- Certification / training gates ❌
- Studio / storage rental ❌
- Makerspace-specific workflows ❌
- Auth0 integration ⚠️ would need custom work

### Verdict
❌ **Not recommended.**
Designed for associations, not makerspaces. None of the makerspace-specific
features are present. A Python programmer could work in it but would spend
6 months building everything from scratch anyway, inside a framework that
wasn't designed for this use case.

---

## Option 3 — CiviCRM

**Website:** [civicrm.org](https://civicrm.org)
**Stack:** PHP (runs as plugin for WordPress / Drupal / Joomla)
**License:** AGPL
**Maturity:** Very mature; widely used by non-profits

### What it covers
- Powerful membership management ✅
- Donations, events, CRM ✅
- Highly configurable ✅

### What's missing
- Booking calendar ❌
- Certification / training gates ❌
- Studio / storage rental ❌
- Makerspace-specific workflows ❌
- High maintenance burden — complex to operate ❌

### Verdict
❌ **Not recommended.**
PHP stack is wrong for either programmer. Extremely complex to set up and
maintain — directly contradicts the minimal-staff maintenance requirement.
Would fight you the whole way.

---

## Option 4 — Fabman (SaaS + partnership)

**Website:** [fabman.io](https://fabman.io)
**Type:** Commercial SaaS — NOT open source (API documentation only is public)
**Stack:** Unknown (proprietary)

### What it covers
- Member management + billing ✅
- Equipment booking calendar ✅ (recently improved)
- Door access control ✅
- Full REST API + webhooks ✅
- 100+ production deployments across fab labs and makerspaces ✅

### What's missing
- Studio / storage long-term rental ❌
- Certification-gated booking ⚠️ has access control, not trust-enforced cert model
- Auth0 native integration ⚠️ API workaround possible
- Day-pass → Brivo automation ❌
- Flexible reporting ❌

### Cost at your scale
| Item | Cost |
|---|---|
| Plus plan (unlimited members) | €199/month |
| ~20 integrated tools @ €10/mo | €200/month |
| 0.5% transaction fee on ~$50k/month | ~$250/month |
| **Estimated total** | **~$650–700/month (~$8,000/year)** |

Double your annual operating budget, before any custom development.

### Partnership angle
Connection to Neil Gershenfeld (fab lab network) and Kenneth Cheung does NOT
imply a relationship with Fabman — Fabman is a separate Austrian commercial company.
A partnership would need to be negotiated from scratch.

**Key risk:** Any features built into Fabman's codebase belong to Fabman.
You would remain a paying SaaS customer with no ownership of contributed work.

### Verdict
⚠️ **Not recommended as primary path.** Too expensive at scale; proprietary
codebase means no ownership of custom work. The API is good and could support
a hybrid approach (use Fabman for what it does well, build supplementary tools
on top) — but this recreates the same problem you have with Nexudus today.

---

## Option 5 — Fab Manager ⭐ Best Existing Option

**Repo:** [github.com/sleede/fab-manager](https://github.com/sleede/fab-manager)
**Website:** [fab-manager.com](https://fab-manager.com)
**Stack:** Ruby on Rails backend + TypeScript / React frontend + PostgreSQL
**License:** AGPL (free to self-host; modifications must be released if serving externally)
**Maturity:** v6.5.0 (February 2026); 8,185 commits; 300+ releases; 28 contributors
**Maintained by:** Sleede (French company); also available as hosted SaaS

### What it covers
- Member management + Stripe billing ✅
- Machine booking calendar ✅ core feature
- **Training prerequisites for machine booking** ✅ enforced (Issue #408 confirmed fixed)
- Room / space rental ✅
- Member portal ✅
- OAuth2 / SSO (Auth0 compatible) ✅
- RFID access control ✅ (not needed)
- Inventory management ✅
- Shop module (consumables) ✅
- iCal integration for reservations ✅
- Used by 100+ fab labs in production ✅
- Actively maintained — v6.5.0 released this month ✅

### What's missing
- Studio / storage long-term monthly rental ❌ (no evidence in changelog)
- Flexible reporting ❌ minimal progress historically
- Day-pass → Auth0 → Brivo automation ❌ custom work required
- Whole-shop booking as a distinct resource type ⚠️ unclear

### Stack reality
| Layer | Technology | Fit |
|---|---|---|
| Backend | Ruby on Rails | ❌ Neither programmer's strength |
| Frontend | TypeScript / React | ✅ TypeScript programmer's home ground |
| Database | PostgreSQL | ✅ Familiar |
| Deployment | Docker | ✅ Standard |

### Contribution model — important caveat
Fab Manager is **effectively a company product that Sleede has open-sourced**,
not a community-driven project. Analysis of merged PRs shows almost zero external
feature contributions — one external contributor (2 PRs) in the past 3 years.
Dependabot accounts for most non-Sleede activity.

**Risk:** Features you build are unlikely to be accepted upstream. You would
be maintaining a fork, not contributing to a community.

### Cost (self-hosted)
Free. $4,000/year operating budget is sufficient.

### Three paths with Fab Manager

**Path A — Self-host and fork**
Take the AGPL codebase, self-host, build missing features (studio/storage rental,
reporting, day-pass automation) on top. Accept you are maintaining a fork.
TypeScript programmer contributes to frontend; Ruby backend requires learning curve.
Sleede continues maintaining core upstream; you rebase periodically.

**Path B — Negotiate with Sleede directly**
Approach Sleede as a significant deployment partner. Offer programmer time in exchange
for upstream inclusion of features you need. Your scale (one of the largest deployments)
and Gershenfeld network give you standing. Requires Sleede to be interested —
not guaranteed given their SaaS business model.

**Path C — Build from scratch** (see below)

### Verdict
✅ **Best existing option if starting from a codebase.**
Training prerequisites cover a key requirement. Actively maintained.
Free to self-host. TypeScript frontend is relevant for your programmer.
However: Ruby backend is unfamiliar territory; contribution model means
likely maintaining a fork; studio/storage rental and reporting still need
to be built from scratch.

---

## Option 6 — Build from Scratch

**Stack:** Next.js 14+ / TypeScript / PostgreSQL / Prisma / Auth0 / Stripe
**Reference:** See `feature-spec-v0.1.md` for full scope

### Advantages over all existing options
- Right stack for TypeScript programmer — full speed from day one
- Own exactly what you need, nothing inherited you don't want
- Auth0 and Stripe integrations are first-class, not bolted on
- Maintenance staff inherit boring, well-documented TypeScript
- No upstream dependency — you control the roadmap
- No licensing constraints on what you build

### Honest costs
The training prerequisite system (Fab Manager's most relevant advantage)
is not large scope from scratch given the data model is already defined.
The booking calendar, member management, and Stripe billing are well-understood
problems with good TypeScript libraries available.

### Risk
6 months is tight for the full feature list. Scope discipline is critical.
See `feature-spec-v0.1.md` open questions and phased scope.

---

## Summary Comparison

| | MemberMatters | Tendenci | CiviCRM | Fabman | Fab Manager | Scratch |
|---|---|---|---|---|---|---|
| Makerspace-specific | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Training / certs | ⚠️ | ❌ | ❌ | ⚠️ | ✅ | Build |
| Booking calendar | ❌ | ❌ | ❌ | ✅ | ✅ | Build |
| Studio / storage | ❌ | ❌ | ❌ | ❌ | ❌ | Build |
| Auth0 / SSO | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | Build |
| Stripe billing | ✅ | ⚠️ | ❌ | ✅ | ✅ | Build |
| Fits stack (TS) | ⚠️ | ❌ | ❌ | N/A | ⚠️ frontend only | ✅ |
| Free / open source | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Production scale | Small | Medium | Large | Medium | Large | — |
| External contributions | ⚠️ | ⚠️ | ✅ | N/A | ❌ rare | N/A |
| Recommended | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ |

---

## Recommendation

**Build from scratch (Next.js / TypeScript) remains the strongest path**
given programmer preference and full ownership requirements.

**Fab Manager is worth a closer look only if:**
1. The programmer is willing to work in Ruby for the backend extensions, AND
2. A direct conversation with Sleede yields a genuine partnership (upstream
   inclusion of features, not just permission to fork), OR
3. A decision is made to maintain a fork indefinitely with clear eyes.

The Gershenfeld / Fab Lab network connection does not create a shortcut to
Fabman (separate commercial company) but may create standing for a conversation
with Sleede about Fab Manager's direction.
