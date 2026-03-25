# Makerspace Management Platform — Feature Spec v0.1

## Overview

A web application to replace Nexudus as the management platform for a makerspace
with 500 members, growing toward 1,000. Nexudus is designed for co-working and
handles makerspace workflows poorly — specifically tool/equipment booking visibility,
certification management, and reporting flexibility.

### Goals
- Self-service member portal with clear booking availability
- Membership and billing management via Stripe
- Equipment certification tracking (trust-enforced, not hardware-gated)
- Lightweight day-pass flow with automated building access
- Flexible reporting
- Maintainable by minimal technical staff after initial build

### Non-Goals (Phase 2 — Classes Module)
- Eventbrite integration for class listings
- Auto-certification from class attendance
- Class scheduling and management

---

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Auth0 (free — non-profit rate) |
| Billing | Stripe |
| Hosting | Railway or Render (~$80–100/month) |

---

## Budget

| Item | Cost |
|---|---|
| Initial development | $8,000 |
| Hosting | ~$1,000/year |
| Brivo → Auth0 integration | ~$1,500/year |
| Buffer (maintenance, surprises) | ~$1,500/year |
| **Total annual operating** | ~$4,000/year |

Programmer: 6 months dedicated, gifted to the organisation.

---

## External Integrations

### Auth0
- Identity provider for all members and staff
- SSO across the app and Brivo
- Day-pass members provisioned as time-limited Auth0 accounts
- Non-profit rate: free

### Brivo (building access)
- Integrated directly with Auth0 (no custom API code required)
- Enforces building access and operating hours for all members
- Day-pass members receive time-limited Brivo keys via Auth0 role
- Keys auto-expire at end of day
- **Not used** for shop or tool access — that is trust-enforced

### Stripe
- Recurring subscriptions for membership tiers
- Monthly add-ons for studio and storage rentals
- One-time payments for day passes
- Non-profit pricing applies

---

## Membership

### Tiers
Five membership tiers (names TBD). Tier properties:

| Property | Tiers 1–2 | Tiers 3–5 |
|---|---|---|
| Studio rental eligible | No | Yes |
| Storage rental eligible | Yes | Yes |
| Tool booking | Yes (with certification) | Yes (with certification) |
| Building access | Yes | Yes |

### Day-Pass Members
- Purchase a day pass online (Stripe one-time payment)
- Auth0 account auto-provisioned with day-pass role
- Brivo building access granted automatically for the day
- Access expires automatically — zero staff involvement required
- Not counted as recurring members; minimal overhead is a hard requirement

---

## Billing (Stripe)

### Subscription Structure
Each active member has a Stripe subscription consisting of:
- **Base product**: membership tier (monthly recurring)
- **Studio add-on**: monthly, if a studio is assigned (tiers 3–5 only)
- **Storage add-on**: monthly, if a storage unit is assigned (any tier)

### Day Passes
- One-time Stripe payment
- Triggers automated Auth0/Brivo provisioning

### Billing Rules
- Studio and storage charges are added/removed when assignments are
  created or ended by an admin
- Proration handled by Stripe

---

## Studio Management

Studios are rented monthly by members on tiers 3–5. Average tenancy is 1+ year.

### Data Model
- Studio inventory (name, description, size, monthly rate)
- Assignment: studio → member, start date, end date (nullable)

### Admin Workflows
- Assign studio to eligible member → Stripe add-on created automatically
- End assignment → Stripe add-on removed automatically
- View all studios: occupied / vacant

### Member Portal
- Member can see their assigned studio and current monthly charge

---

## Storage Management

Storage units are rented monthly by any active member. Average tenancy is 9+ months.

### Data Model
- Storage unit inventory (identifier, monthly rate)
- Assignment: unit → member, start date, end date (nullable)

### Admin Workflows
- Assign unit to member → Stripe add-on created automatically
- End assignment → Stripe add-on removed automatically
- View all units: occupied / vacant

### Member Portal
- Member can see their assigned unit(s) and current monthly charge

---

## Certification Management

Most tools require certification before a member may book them. Certification is
trust-enforced within the app — there is no hardware access gate on shop doors.

### Data Model
- Equipment classes (e.g. Laser, CNC, Woodshop, Metal Shop)
- Member certifications: member → equipment class → certified\_on date

### Admin Workflows
- Grant certification to a member for an equipment class
- Revoke certification
- View all certifications for a member
- View all certified members for an equipment class

### Member Portal
- Member can view their certifications

---

## Booking Calendar

Members can book tools, meeting rooms, and whole shops. The core UX requirement
is that members can clearly see what is available before attempting to book.

### Resource Types

**Tools**
- Belong to a shop
- Require a specific equipment class certification to book
- A shop may have 1–20 tools

**Meeting Rooms**
- No certification requirement
- Available to all active members

**Shops (whole-space)**
- Bookable as a unit (e.g. for an event or dedicated session)
- No certification requirement to book the whole shop

### Booking Rules
- Member must hold the required certification to book a tool
- Day-pass members: booking policy TBD (likely meeting rooms only)
- Double-booking prevented by the system
- Bookings are visible to all members (availability view)

### Member Workflows
- Browse availability calendar across all resource types
- Create a booking (with certification check)
- Cancel a booking
- View upcoming bookings

### Admin Workflows
- View all bookings
- Cancel any booking
- Manage resource inventory (add/edit tools, rooms, shops)
- Assign tools to shops and equipment classes

---

## Member Portal

Self-service portal for authenticated members.

### Sections
- **Dashboard**: membership status, upcoming bookings, quick links
- **Membership**: tier, billing summary, payment history
- **Bookings**: calendar view, create/cancel bookings
- **Certifications**: list of held certifications
- **Studio / Storage**: current assignments and monthly charges
- **Profile**: contact details, password (via Auth0)

---

## Admin Dashboard

Internal tool for staff.

### Sections
- **Members**: list, search, view/edit member details, change tier
- **Studios**: inventory, current assignments, assign/end
- **Storage**: inventory, current assignments, assign/end
- **Certifications**: grant/revoke per member
- **Resources**: manage tools, rooms, shops; assign tools to shops/classes
- **Bookings**: view all, cancel
- **Day Passes**: view issued passes, active now
- **Reporting**: see Reporting section

---

## Reporting

Flexible reporting was a primary Nexudus pain point. Core reports:

- **Membership by tier**: current count per tier, trend over time
- **Revenue summary**: recurring MRR, add-ons, day pass income
- **Studio occupancy**: occupied vs. vacant, revenue per studio
- **Storage occupancy**: occupied vs. vacant, revenue
- **Booking utilisation**: bookings per resource, peak times
- **Certifications**: members certified per equipment class
- **Day pass volume**: passes sold per day/week/month

Reports exportable as CSV.

---

## Data Migration (Nexudus)

A one-time migration at cutover:

- Members (profiles, tier assignments)
- Active studio and storage assignments
- Certifications
- Bookable resource inventory (tools, rooms, shops)

Historical billing data remains in Nexudus for reference; not migrated.

---

## Out of Scope — Phase 2: Classes Module

Classes are the second revenue arm. Billing is handled entirely by Eventbrite and
will not be replaced. The Classes Module is a separate, independent module that
integrates with the core system via the certifications table.

### Planned Phase 2 Features
- Display upcoming classes from Eventbrite API in the member portal
- Eventbrite webhook → auto-grant certification on class completion
- (Later) create and manage Eventbrite events from within the app

---

## Open Questions

- [ ] Confirm day-pass booking policy (can day-pass members book tools? rooms only?)
- [ ] Confirm Brivo Auth0 integration supports time-limited role expiry for day passes
- [ ] Membership tier names and exact monthly rates
- [ ] Studio and storage unit inventory counts
- [ ] Equipment class list and which tools require which class
- [ ] Proration policy for mid-month studio/storage assignments
- [ ] Data export format available from Nexudus for migration
