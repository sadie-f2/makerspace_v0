# Plan — Optimistic Roadmap

**Written:** 2026-03-28
**Context:** End of first build sprint. Reviewing what's done, what's next,
and what it takes to make the case vs. continuing with Nexudus.

---

## Where We Are

Three days of focused, intensive work produced:

- Schema and core models
- Auth, roles, and fine-grained permissions
- Member CRUD with full admin depth
- Studio management with floor plan integration (DXF → SVG → Space sync),
  revision history, interactive viewer, naming convention, CSV bulk import
- Rental system (member-initiated request flow + direct admin path)
- Waitlist (full WAITING → OFFERED → ACCEPTED flow)
- Certification management (grant/revoke, volunteer permissions, directory)
- Day pass (request + history shell)
- Audit log with viewer
- Email (welcome)
- Admin dashboard (13 sections, most functional)
- Member portal (7 sections, most functional)
- Settings (tiers, studio sizes, space types)

The floor plan system was the deep end — novel, multi-layer, no library does
it for you. Everything remaining is more standard by comparison.

---

## Strategic Goal: Make the Case vs. Nexudus

The immediate objective is not "finish everything" — it's to have something
concrete enough that the organisation can make a real decision about whether
to invest in this platform vs. continuing with Nexudus.

### What Already Makes the Case

The floor plan system alone is visually striking to anyone who has wrestled
with Nexudus. Interactive occupancy overlay, revision history, live space
assignment — Nexudus has nothing comparable. Combined with the admin depth
(member detail, rental requests, audit log) this already looks like a serious
platform.

### The One Gap That Matters

The **booking calendar** is the conspicuous hole. The primary stated pain point
with Nexudus is booking visibility — members cannot clearly see what is already
booked. Showing a clean calendar view of equipment and room availability closes
the argument. Without it the demo has a gap right where the pitch is strongest.

The schema is ready. The conflict engine is interval arithmetic on a table that
exists. Prior art from nxds_reports carries forward. This is 3–5 focused days.

### What Can Wait for the Demo

**Stripe.** Payment processing can be shown as "in progress" — the UI, the
rental workflows, and the rate fields are all present. Nobody rejects a project
because Stripe isn't wired yet. Stripe is also the piece with the most
sandbox-to-production risk; building it under pressure is the wrong time.

---

## Remaining Work — Realistic Optimistic

### Must-Have for Workable

| Item | Estimate | Notes |
|---|---|---|
| Booking calendar | 3–5 days | Schema done, prior art, interval arithmetic |
| Stripe subscriptions + webhooks | 4–7 days | One item with real uncertainty — budget conservatively |
| Day pass Stripe (one-time payment) | 1 day | Simpler than subscriptions |
| Reporting (core reports) | 2–3 days | SQL + CSV, mechanical |
| Storage rental (after staff decisions) | 2–3 days | Largely repeats studio pattern |
| **Subtotal** | **~2.5–4 weeks** | |

### Nice-to-Have, Deferrable

| Item | Estimate |
|---|---|
| Waitlist self-service acceptance | 1 day |
| Notification expansion | 2–3 days |
| Undo UI | 2–3 days |
| Offsite backup | 1 day |

### QA / Hardening / Deployment

**1.5–2 weeks** — this does not compress like build work. It is waiting for
webhooks to misbehave, catching edge cases on real data, and validating Stripe
sandbox behaviour against production. Treat it as a floor.

### Total to Fully Workable (no Okta, no Brivo, no migration)

**4–6 weeks** of focused work. Minimum viable / "we could operate on this"
is possible in **~3 weeks** with some rough edges accepted.

---

## Identity Provider: Okta is Not Required Yet

Local credentials (NextAuth, bcrypt) are fully built and production-ready for
the scale of this deployment. The adapter pattern is in place — adding Okta or
Auth0 is a contained change to `auth.ts` when the time and budget are right.

**Okta at full rollout: ~$14,000/year.** That spend is justifiable once the
platform is proven. It is not necessary to prove the platform.

Deferring Okta also defers Brivo integration (the Okta → Brivo connector is the
clean path). Brivo can be integrated via direct API when Okta is adopted, or
kept as a manual process in the interim.

---

## Stripe Corner Cases to Budget For

The subscription add-on lifecycle (proration on start, month-end termination,
failed payment handling) is where sandbox-to-production surprises tend to live.
Known risk areas:

- Proration calculation differences between sandbox and production
- Webhook retry behaviour and idempotency (same event delivered twice)
- Subscription item removal timing (end-of-period vs immediate)
- Failed payment → member status → access suspension chain

Budget the high end of the Stripe estimate. It is the one place in the
remaining work where the pace established in this sprint may not hold.

---

## Sequencing Suggestion

1. **Booking calendar** — closes the demo gap, highest value for the "make the
   case" goal
2. **Core reporting** — membership, studio occupancy, bookings; gives staff
   something immediately useful
3. **Stripe** — take the time it takes; do it once correctly
4. **Storage rental** — after staff review resolves pricing/unit questions
5. **QA + hardening** — real-environment validation, not compressible

---

## This Is a Marathon

The first sprint established the hardest architectural foundation — floor plans,
resource model, audit trail, permissions — in three days. The remaining work is
more predictable. There is no deadline forcing bad decisions.

The platform is already far enough along that it can inform a real
organisational conversation about Nexudus. The booking calendar is the next
milestone that meaningfully advances that conversation.
