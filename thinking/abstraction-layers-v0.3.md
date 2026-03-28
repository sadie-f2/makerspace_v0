# Data Abstraction Layer Requirements v0.3

**Supersedes:** `abstraction-layers.md`

**Project:** Makerspace Management Platform
**Context:** Next.js / TypeScript / PostgreSQL / Prisma
**Audience:** Core contributors and future integrators
**Status:** Design / Requirements. Build status annotated per layer.

---

## Philosophy

Each abstraction layer is defined as a TypeScript interface. The project ships
one reference implementation per layer. A plugin registry or dependency-injection
framework is intentionally deferred until a second real implementation is needed
— the interface discipline is what matters for v1.0, not the infrastructure for
swapping providers at runtime.

When a second provider becomes necessary, the interface already constrains what
it must satisfy. Until then, resist the temptation to over-engineer the seam.

---

## 1. Payment / Finance

**Status: Interface designed. Not yet integrated.**

Schema fields exist (`Member.stripeCustomerId`, `Rental.stripeSubscriptionItemId`,
`DayPass.stripePaymentIntentId`) but no Stripe API calls are made.

### Purpose

Abstracts all money movement: recurring membership subscriptions, add-on charges,
one-time payments, and inbound webhook events that drive state transitions.

### Interface

**Subscriptions**
- Create a subscription for a member at a given plan/price
- Add an add-on to an existing subscription (with mid-month proration on start,
  month-end termination)
- Remove an add-on from a subscription (effective end of billing period)
- Cancel a subscription (immediate or end-of-period)
- Retrieve current subscription state for a member

**One-time payments**
- Create a payment intent / charge for a specified amount and purpose
- Retrieve payment status

**Webhooks**
- Receive and validate a raw webhook payload from the provider
- Normalize into a standard internal event: `payment.succeeded`,
  `payment.failed`, `subscription.cancelled`, `subscription.updated`
- Return structured data sufficient for the application to act without knowing
  the provider

### Default Implementation

Stripe. Subscriptions with subscription items for add-ons, built-in proration,
Stripe Webhooks with signature verification.

### Known Alternatives

- **Square** — supports one-time payments well; subscription model less mature
- **PayPal** — commonly requested; webhook reliability inconsistent historically
- **Manual invoicing** — PDF invoice, admin marks paid; no payment processor
- **No payment (free spaces)** — null implementation; for grant-funded or
  invitation-only spaces

### Open Questions

- Proration policy should be configurable rather than hardcoded, but defer until
  a second provider forces the question
- Refund operations not yet specced — needed for equipment damage deposits, event
  cancellations
- Tax handling entirely out of scope for v1.0

---

## 2. Member Identity / Authentication

**Status: Built (local credentials). External provider adapter designed but not
implemented.**

### Purpose

Abstracts the identity provider: who can log in, how their account is
provisioned/deprovisioned, and what groups/roles they belong to.

### Current Implementation

NextAuth v5 with JWT strategy and Credentials provider. Session shape:
`{ id, name, email, role, tierId }`. See `trust-check-v0.3.md` for full
analysis.

Self-registration at `/register`. No external identity provider dependency.

### Interface

**Authentication**
- Initiate login flow (OIDC redirect or local credentials)
- Handle callback, returning normalized identity (internal ID, email, display
  name, role, tierId)
- Validate a session token and return the associated identity

**User provisioning**
- Create a user account given email and display name
- Assign a user to a membership tier
- Suspend a user account (login disabled, account retained)
- Deprovision a user account

**User profile**
- Retrieve current tier/role
- Set or update the WebID field
- Retrieve WebID for a user

### Default Implementation

Local credentials (bcrypt-hashed passwords in the application database).

### Known Alternatives

- **Okta** — OIDC login, Okta Groups for tier mapping, management API for
  provisioning, Brivo Identity Connector, Okta Workflows for lifecycle automation
- **Auth0** — near-identical OIDC; non-profit free tier; no Brivo connector or
  Workflows equivalent
- **Any OIDC provider** — Keycloak, Authentik, Dex, Google Workspace, Microsoft
  Entra — standard tokens satisfy auth; management API varies
- **Local auth** — current default; zero external dependency

### Open Questions

- Group-to-tier mapping: the interface returns role/tier from the DB. When an
  external provider is adopted, mapping provider groups to internal tiers is an
  application configuration concern, not embedded in the adapter.
- Invitation flow (admin invites member by email before first login) — whether
  this is identity-layer or application-layer is open
- WebID field semantics are not yet defined; stored but not consumed

---

## 3. Physical Access Control

**Status: Interface designed. Not integrated.**

### Purpose

Abstracts the physical access control system governing which members can open
doors, gates, or equipment lockouts.

### Interface

**Access provisioning**
- Grant access to a member, effective immediately or at a specified time
- Revoke access, effective immediately or at a specified time
- Suspend access (temporary hold, account retained)
- Restore access for a previously suspended member

**State query**
- Check whether a member currently has active access credentials
- (Optional) List which access groups or doors a member has access to

### Default Implementation

Brivo. Integrated via:
- **Option A:** Okta Identity Connector (group membership propagates
  automatically; no custom code)
- **Option B:** Direct Brivo REST API (custom provisioning/deprovisioning)

Decision tied to identity provider choice.

### Known Alternatives

- **Kisi** — cloud-based, REST API, similar model to Brivo
- **Salto** — common in European makerspaces; cloud and on-premise
- **Custom RFID** — Raspberry Pi / Arduino fob reader; interface allows custom
  adapter against whatever API that system exposes
- **No access control** — null implementation; for trust-only or digital-only
  spaces

### Open Questions

- Okta→Brivo connector means access changes are a side effect of identity group
  changes, not explicit calls through this layer. Must be documented clearly.
- Day passes are physical fobs, not automated. No time-limited credential
  requirement yet.
- Audit log retrieval (badge-in history) out of scope for v1.0 but likely
  future addition

---

## 4. Space and Equipment Management (Resource Model)

**Status: Built.**

### Purpose

Unified model for every reservable or leasable thing: rooms, tools, studios,
lockers, parking spots.

### Implementation (As Built)

The resource model is a Prisma-backed adjacency-list tree. Every node has:

| Field | Description |
|---|---|
| name | Display name |
| typeTag | Descriptive label from SpaceTypeConfig vocabulary |
| parentId | Parent node (null = root) |
| reservable | Can be booked for time slots |
| leasable | Can be rented long-term |
| reservationMode | EXCLUSIVE / ADVISORY / NONE |
| rentalAccessScope | TENANT_ONLY / TENANT_PLUS_LIST / ORG_WIDE |
| requiresCertClassId | Equipment class certification required to book |
| outOfService | Boolean with timestamp and note |

**Space Type Configuration:** Type tags are not hardcoded. `SpaceTypeConfig`
records define the vocabulary with admin-configurable labels, DXF layer
mappings, colours, and bookable/leasable defaults. Types form their own
hierarchy (e.g. `storage` → `pallet`, `shelf`, `tool_cart`).

**Design rule:** Application code must not branch on type tag values. If you're
tempted to write `if resource.typeTag === 'laser_cutter'`, add a flag or mode
to the model instead.

### Interface

**Resource tree management**
- Create, update, move, archive (soft delete) resource nodes
- Retrieve by ID, children, or full subtree

**Reservations**
- Create a reservation on a reservable node for a member and time window
- Check availability (returns conflicts or advisory notices)
- Cancel a reservation
- List reservations by member or resource

**Rentals**
- Create a rental on a leasable node with tenant and access scope
- Update (extend, change scope) or terminate a rental
- Retrieve current rental, list all active rentals

### What Changed from v1.0 Spec

- `Lease` renamed to `Rental` throughout (terminology change — see feature spec)
- `SpaceTypeConfig` added for admin-configurable type vocabulary
- `outOfService` fields added for equipment management
- Reservation UI not yet built (schema exists)
- `cascade-all` / `cascade-subset` / `cascade-none` reservation cascade
  behaviour not yet implemented
- Resource capacity (numeric limits) not yet modeled
- `tenant-plus-list` access scope join table not yet built

### Open Questions

- Reservation windows: slot-based scheduling (30-minute blocks, open/close
  hours) not yet modeled. Should be a scheduling policy on the resource.
- Waitlists on exclusive resources: built as a standalone `WaitlistEntry`
  model (by resource type tag), not as a property of the resource itself
- The access scope `tenant-plus-list` implies a join table — shape TBD

---

## 5. Notification / Messaging

**Status: Partially built (welcome email only).**

### Purpose

Abstracts delivery of transactional messages: booking confirmations, payment
receipts, access suspension warnings, reminders.

### Current Implementation

SMTP email via smtp2go / Nodemailer. Transport configured in `lib/email.ts`:
- Port 465 → implicit SSL
- All other ports → STARTTLS (enforced)
- Stubs gracefully when env vars absent

Currently sends: welcome email (admin-triggered from member detail page).

### Interface

**Message delivery**
- Send a notification to one or more recipients given a message type and
  structured data payload
- Message types: `booking.confirmed`, `booking.cancelled`, `booking.reminder`,
  `payment.receipt`, `payment.failed`, `access.suspended`, `access.restored`,
  `membership.expiring`
- Each type has a defined payload schema; the notification layer renders it
  appropriately for the channel
- Return delivery receipt or error

**Channel configuration**
- Multiple channels can be active simultaneously
- Fan out to all, or per-message channel targeting

### Known Alternatives

- **SMS** — Twilio or AWS SNS; for access warnings and same-day reminders
- **Slack webhooks** — common in maker communities
- **Discord webhooks** — same pattern as Slack
- **Push notifications** — future mobile app
- **No-op (logging only)** — for dev/test

### Open Questions

- Member notification preferences not modeled; required before SMS
  (unsubscribe compliance)
- Templates: database-editable vs version-controlled in code?
- Delivery failure handling: retry, queue, or surface error? v1.0 surfaces error

---

## 6. Reporting / Data Export

**Status: Interface designed. Not built.** Placeholder at `/admin/reports`.

### Purpose

Abstracts generation and delivery of operational reports.

### Interface

**Report definitions**
- Register a named report with input parameters and output schema
- List and retrieve available reports

**Report execution**
- Run a report with parameters, returning structured results
- Export to CSV (minimum)
- Deliver to a destination (email, file download)

**Scheduled reports**
- Create a schedule (cron, parameters, destination)
- List and cancel schedules

### Default Implementation

Built-in SQL queries against Prisma client, registered at startup. Informed by
`nxds_reports` Python project patterns.

### Known Alternatives

- **External BI** — Metabase, Redash connected to PostgreSQL
- **Excel/XLSX export** — common request in non-technical orgs
- **Webhook delivery** — push to external dashboards

### Open Questions

- Authorization on sensitive reports (financial data → admin only)
- Large report pagination/streaming
- Report versioning for scheduled outputs

---

## 7. External Calendar Sync

**Status: Interface designed. Not built.**

### Purpose

Abstracts synchronization of booking/event data with external calendar systems.

### Interface

**ICS feed generation**
- Generate ICS feed URL for a member's reservations (personal)
- Generate ICS feed URL for a resource's reservations (resource calendar)
- Serve valid RFC 5545 iCalendar at feed URL
- Generate standalone ICS file for a single booking (email attachment)

**Push calendar integration (optional)**
- Push/update/delete events on an external calendar
- Handle OAuth authorization for push access

### Default Implementation

ICS feed (universal). No external dependency. ICS files attached to booking
confirmation emails via notification layer.

### Known Alternatives

- **Google Calendar** — push via Google Calendar API (tt-cal model)
- **Outlook/Exchange** — push via Microsoft Graph API
- **Generic iCal** — the default; pull-only via feed subscription

### Open Questions

- Feed authentication: per-member secret token in URL (tt-cal pattern)
- Timezone handling in ICS (must emit explicit TZID, not floating times)
- Duplicate event risk when push + feed subscription are both active

---

## 8. Class / Event Management

**Status: Interface designed. Phase 2.**

### Purpose

Abstracts integration with external event platforms for class listings,
registration, and payment. This layer observes what platforms report and takes
downstream actions (primarily: granting certifications on class completion).

### Interface

**Event discovery**
- Fetch upcoming events/classes as normalized list
- Fetch single event details by external ID

**Webhook ingestion**
- Receive and validate raw webhook
- Normalize to: `registration.completed`, `attendance.confirmed`,
  `class.completed`
- Return member + class identifiers for certification lookup

**Certification grants**
- Retrieve certification associated with event/class ID
- Actual grant performed by application, not this layer

### Default Implementation

Eventbrite. One-way inbound: webhook on order completion → grant certification.
Application does not replace Eventbrite billing.

### Known Alternatives

- **Other platforms** — Humanitix, Ticket Tailor, Pretix (self-hosted)
- **Internal event management** — future, out of scope
- **Manual grant** — admin UI action (built, see certification management)

### Open Questions

- Admin workflow: create certification, link to Eventbrite event ID
- Order vs attendance webhooks (register but don't attend → still certified?)
- Free classes: order.placed fires on free registrations — handle identically

---

## Summary Table

| Layer | Default Implementation | Build Status | Phase |
|---|---|---|---|
| Payment / Finance | Stripe | Schema fields only | v1.0 |
| Member Identity / Auth | Local credentials (NextAuth) | **Built** | v1.0 |
| Physical Access Control | Brivo | Not started | v1.0 |
| Space & Equipment | Prisma / PostgreSQL (Resource tree) | **Built** | v1.0 |
| Notification / Messaging | SMTP email (Nodemailer) | **Partial** (welcome email) | v1.0 |
| Reporting / Data Export | Built-in SQL + CSV | Not started | v1.0 |
| External Calendar Sync | ICS feed | Not started | v1.0 |
| Class / Event Management | Eventbrite | Not started | v2.0 |

---

## Cross-Cutting Concerns

**Error handling:** Each layer should define typed error classes rather than
surfacing raw provider errors.

**Idempotency:** Webhook handlers and provisioning operations must be idempotent.
Same event delivered twice must not create duplicates.

**Logging and observability:** Structured log events at operation boundaries.
Consistent schemas across layers.

**Testing:** Each interface enables mock/stub implementations. Test suite runs
without external credentials.

**Configuration:** Provider credentials via environment variables. No
provider-specific configuration hardcoded.
