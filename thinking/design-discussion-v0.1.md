# Makerspace Platform — Design Discussion Log
**Date:** 2026-02-22
**Status:** Initial scoping session

---

## Problem Statement

The organisation currently uses Nexudus to manage its makerspace. Nexudus is designed
for co-working spaces and handles makerspace workflows poorly. The two primary pain
points identified:

1. **Reporting** is inflexible and not useful — leading to a separate Python reporting
   project being built against the Nexudus API as a workaround.
2. **Reservation visibility** — members cannot easily see what is already booked when
   trying to reserve tools, rooms, or shops.

A secondary but significant issue: **day-pass members are unprofitable** under Nexudus
pricing. The per-member cost of Nexudus exceeds revenue from some day-pass sales,
creating ongoing financial bleed.

---

## Constraints Established

### Scale
- Current: ~500 members
- Target: ~1,000 members

### Budget
- **Initial development**: $8,000
- **Annual operating**: $4,000/year
  - ~$1,000/year hosting
  - ~$1,500/year Brivo → Auth0 integration
  - ~$1,500/year buffer for maintenance and surprises

### Technical Capacity
- One programmer gifting 6 months of full-time work to the organisation
- Minimal technical staff for ongoing maintenance after handoff
- No in-house full development team

### Non-profit Status
- Auth0: free at non-profit rate
- Stripe: transaction fees only, no monthly cost; non-profit pricing available

---

## Architecture Decisions

### Decision: Auth0 as Identity Plane
Auth0 will serve as the single identity provider across all systems. Both Brivo
and the new application authenticate against Auth0. This means:
- No auth to build from scratch
- SSO across all tools
- Member provisioning/deprovisioning in one place

### Decision: Brivo stays, integrated via Auth0 (not custom API)
Brivo handles physical building access and is not being replaced. Initially a
custom Brivo API integration was considered, but Brivo offers a direct Auth0
integration for ~$1,500/year (an upgrade from current plan).

**Rationale for paying for the integration rather than building it:**
Custom API integrations carry ongoing maintenance cost — API versioning, auth token
rotation, error handling. With minimal maintenance staff, eliminating this surface
entirely is worth $1,500/year. The $8,000 initial budget is freed of ~$2,000 in
Brivo integration work as a result.

**What Brivo is used for:**
- Building access for all active members
- Enforcing operating hours
- Time-limited day-pass keys (via Auth0 role, auto-expires)

**What Brivo is NOT used for:**
- Shop or tool access control — this is trust-enforced within the app only

### Decision: Shops and tools are trust-enforced, not hardware-gated
Shop and tool access is controlled by the booking system (certification check)
but not enforced by physical hardware. Members are trusted to only use equipment
they are certified for. This is the current model and will be carried forward.

**Implication:** Certification/team management is entirely an app-level concern.
Auth0 groups are not needed for equipment access — only for building access and
day-pass expiry.

### Decision: TypeScript / Next.js stack
The gifted programmer's preferred stack is TypeScript. Next.js (App Router) was
selected as the framework:
- Full-stack TypeScript reduces context switching
- Large ecosystem and community — important for long-term maintainability
- Well-documented — critical for minimal-staff maintenance after handoff

Full stack:
- Next.js 14+ (App Router)
- PostgreSQL
- Prisma ORM
- Auth0
- Stripe
- Railway or Render hosting

### Decision: Stripe for all membership billing
Stripe handles:
- Recurring subscriptions (membership tiers)
- Monthly add-ons (studio and storage rentals)
- One-time payments (day passes)

Eventbrite handles class billing and will not be replaced or replicated in Stripe.

### Decision: Eventbrite integration is Phase 2 (separate module)
Classes are the second revenue arm of the organisation. Billing is handled entirely
by Eventbrite. Rather than include this in the core 6-month build, it was scoped
as an independent module that slots into the core system later via the certifications
table. The natural seam:

- Core system owns certifications (admin grants manually)
- Classes module (Phase 2) adds Eventbrite webhook → auto-grant on class completion
- Classes module also adds class listings to the member portal
- Core system works fully without the module

This decision keeps the 6-month scope viable.

---

## Domain Model — Key Decisions

### Membership Tiers
Five tiers with the following access rules:
- **Tiers 1–2**: storage rental eligible; tool booking (with certification); building access
- **Tiers 3–5**: all of the above + studio rental eligible
- **Day-pass**: building access for one day; booking policy TBD

### Studios and Storage — monthly assignment, not short-term booking
Initially assumed to require a booking/calendar system. Clarified as long-term
monthly rentals:
- Studio average tenancy: 1+ year
- Storage average tenancy: 9+ months

**Implication:** No booking calendar needed for studios or storage. The system
manages assignments (admin assigns unit → member) and Stripe add-ons, not
availability calendars. This significantly reduces scope.

### Booking Calendar — tools, rooms, and whole shops
The short-term booking calendar covers three resource types:
- **Tools**: belong to a shop; require certification for the tool's equipment class
- **Meeting rooms**: no certification requirement; available to all active members
- **Shops (whole-space)**: bookable as a unit for events or dedicated sessions

A shop may contain 1–20 individual bookable tools.

### Certification System
The organisation uses a concept of "team membership" in Nexudus to control which
members may book which classes of equipment. This maps to a certifications table
in the new system:

```
member_certifications
  member_id
  equipment_class   (e.g. "laser", "cnc", "woodshop")
  certified_on
```

Admin grants certification → member can book tools in that equipment class.
Trust-enforced only.

### Day-Pass Flow — fully automated
Day passes are important revenue but currently loss-making under Nexudus pricing
because of per-member cost. The new system eliminates this overhead entirely:

1. Member purchases day pass online (Stripe one-time)
2. Auth0 account auto-provisioned with day-pass role
3. Brivo access granted automatically (via Auth0 → Brivo integration) for the day
4. Access expires automatically at end of day
5. Zero staff involvement required

This turns a loss-making member type into a low-overhead revenue line.

---

## Scope Assessment

### Fits in 6 months (core build)
1. Member management — 5 tiers + day pass
2. Stripe billing — subscriptions, studio/storage add-ons, one-time day passes
3. Studio & storage assignment management
4. Booking calendar — tools, rooms, shops with certification gates
5. Certification management — admin grants, member views
6. Day-pass self-service flow — buy → Auth0 provision → Brivo access → auto-expire
7. Member portal
8. Admin dashboard
9. Nexudus data migration
10. Reporting

### Phase 2 — Classes Module (separate, later)
- Display upcoming classes from Eventbrite API in member portal
- Eventbrite webhook → auto-grant certification on class completion
- (Later) create and manage Eventbrite events from within the app

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Brivo Auth0 integration does not support time-limited role expiry | High | Validate with Brivo before build starts — this is the day-pass mechanism |
| Stripe subscription add-on complexity (mid-month assignments, proration) | Medium | Spike Stripe add-on model early in development |
| Nexudus data export quality | Medium | Request data export early; assess cleaning effort before cutover |
| Scope creep over 6 months | High | Hold spec firmly; defer anything not in core list to Phase 2 |
| Programmer departure before handoff documentation complete | Medium | Documentation and deployment runbook are in-scope deliverables |

---

## Open Questions

- [ ] Confirm Brivo Auth0 integration supports time-limited role expiry for day passes
- [ ] Confirm day-pass booking policy (can day-pass members book tools? rooms only?)
- [ ] Membership tier names and exact monthly rates
- [ ] Studio and storage unit inventory counts
- [ ] Equipment class list and which tools require which class
- [ ] Proration policy for mid-month studio/storage assignments
- [ ] Data export format available from Nexudus for migration

---

## Next Steps

1. Resolve open questions above — especially Brivo time-limited access
2. Set up GitHub remote for this repository
3. Programmer reviews spec and produces a 6-month work plan
4. Spike: Brivo Auth0 integration (week 1)
5. Spike: Stripe subscription add-on model (week 1–2)
