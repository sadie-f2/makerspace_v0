# Booking App Design Notes

  How to create the token: In Nexudus admin panel → Settings → Apps/Integrations → register a new App, select only those four sections with those actions.
  That gives you a bearer token scoped to exactly those operations — no billing write access, no settings, nothing else.

  The current setup uses your full admin basic-auth credentials. Before going live you'd want to swap NEXUDUS_BOOKING_TOKEN to a properly scoped app token.
  The booking app's nexudus adapter already expects it in that env var.

✻ Sautéed for 1m 49s · 1 background task still running (↓ to manage)

⏺ Agent "Nexudus API privileges research" completed                                                                                                           
                                  
⏺ Here's the complete picture from the research:                                                                                                              
                                                                                              
  ---                                                                                                                                                         
  Token/auth model                                                                                                                                            
                                                                                                                                                              
  Nexudus has no OAuth scope parameters — scope is purely role-based on the authenticating account. There is no way to narrow a token below its user's role.
  Least-privilege means creating a custom minimal role and attaching it to a dedicated service account.

  Recommended custom role for the booking app:

  ┌──────────────┬─────────────────────────────────────────────┐
  │  Permission  │                   Actions                   │
  ├──────────────┼─────────────────────────────────────────────┤
  │ Booking      │ List, Read, Create, Delete                  │
  ├──────────────┼─────────────────────────────────────────────┤
  │ Resource     │ List, Read                                  │
  ├──────────────┼─────────────────────────────────────────────┤
  │ Coworker     │ List, Read                                  │
  ├──────────────┼─────────────────────────────────────────────┤
  │ Contract     │ List, Read (for /billing/coworkercontracts) │
  ├──────────────┼─────────────────────────────────────────────┤
  │ AccessToken  │ Create, Read (token lifecycle)              │
  ├──────────────┼─────────────────────────────────────────────┤
  │ RefreshToken │ Create, Read                                │
  ├──────────────┼─────────────────────────────────────────────┤
  │ Business     │ List, Read (space metadata)                 │
  └──────────────┴─────────────────────────────────────────────┘

  Create the role in admin → Settings → Roles, assign it to a dedicated service account (e.g. booking-app@artisansasylum.org), then authenticate as that
  account to get bearer tokens. That account can do nothing in Nexudus except what's listed.

  One design option worth knowing: the Nexudus Public API supports members authenticating as themselves (POST /api/en/token with their email + password) —
  bookings made that way would be subject to their plan's resource rules enforced server-side. Our current trust-first approach (service account books on
  behalf of anyone) bypasses that, which is probably what you want for staff flexibility. The one relevant restriction: you cannot delete a booking via the
  Public API if it has already been invoiced — not an issue with the admin token.



_Conversation summary, 2026-02-27_

## Problem Statement

The Nexudus member portal makes it difficult to see upcoming bookings and impossible to see who has booked a resource. Members don't bother booking because the friction is too high. Staff and managers have difficulty looking things up. The goal is a simpler, shop-focused visibility and booking tool.

## Scope

**Not** a full booking system replacement. Primarily a visibility and coordination tool:

- Members can see what's booked on any resource (including who has it)
- Members can book directly from a kiosk at the facility
- Staff can look up bookings by resource, member, or date
- Scheduling is for coordination only — there is no enforcement need (compliance is already excellent; the barrier is Nexudus usability, not member trust)

## Stack Decision

**FastAPI (Python) + HTMX + FullCalendar (vanilla JS bundle)**

- No React build pipeline — plain HTML + HTMX handles partial page updates
- FullCalendar handles the calendar widget natively without React
- Python throughout — fits existing codebase, maintainable by same team
- Hosting: Render.com ($7–22/month; free tier available)

Existing `nexudus.py` and booking fetch logic carry over directly.

## API Structure

```
POST   /auth/login                   # email + PIN → session cookie (Phase 2)
POST   /auth/logout
GET    /auth/me

GET    /resources                    # list all bookable resources
GET    /resources/{id}

GET    /bookings                     # ?from=&to=&resource_id=&member_id=
GET    /bookings/{id}                # shows member name

GET    /availability                 # open slots for resource + date
                                     # ?resource_id=&date=

POST   /bookings                     # create booking (writes to Nexudus)
DELETE /bookings/{id}                # cancel
```

Reads cached with 5-minute TTL. Writes go directly to Nexudus.

### Roles
- `member` — view all bookings (names visible), book/cancel own
- `staff` — same + search any member, cancel any booking

## Key Design Decisions

### Availability is simple
All shops are 24/7. No operating hours logic needed. Availability = "existing bookings for this resource; everything else is open." Just time-interval arithmetic.

### Auth: trust-first, verify later
Auth adds friction, and friction is the enemy of the goal. Members are already trusted (they walked in with a keyfob). Booking is a coordination record, not an access control decision.

**Version 1 — name picker only:**
```
[Search name] → CoworkerId → POST /bookings
```
Walk up, type "ali", tap your name, pick slot, confirm. 3 taps. No password.

**Version 2 — verification added later:**
```
[Search name] → [verify: PIN / email code / RFID] → CoworkerId → POST /bookings
```
Everything downstream is identical. Auth is a single pluggable step added in front of the existing flow — not a redesign.

**RFID is worth flagging**: if Brivo keyfob IDs can be mapped to Nexudus member IDs, booking becomes tap-fob + tap-resource + tap-time. Lowest possible friction.

### Data flow
```
Browser/Kiosk
      │
      ▼
FastAPI app ── cache (5 min) ──► Nexudus GET /spaces/bookings
      │                          Nexudus GET /spaces/resources
      └── direct ─────────────► Nexudus POST /spaces/bookings
                                 Nexudus DELETE /spaces/bookings/{id}
```

## File Layout

```
app/
  main.py           # FastAPI app, mounts routers
  auth.py           # login/logout, session, role check (Phase 2)
  resources.py      # /resources endpoints
  bookings.py       # /bookings read + write
  availability.py   # slot calculation (interval arithmetic only)
  nexudus.py        # adapter wrapping existing nexudus.py
  cache.py          # simple TTL cache
  models.py         # Pydantic schemas
static/
  index.html        # FullCalendar + HTMX
  app.js            # minimal JS glue
```

## Phased Delivery

### Phase 1 — Read-only visibility (~23–40 hrs)
- FastAPI + bookings/resources endpoints
- FullCalendar calendar view (scope TBD: resource-timeline vs. per-resource day/week view)
- 5-minute cache
- Deploy to Render
- No auth — staff-only URL initially

**Frontend scope options:**
- Narrowest: table/list per resource (~5 hrs frontend)
- Medium: FullCalendar day/week view, one resource at a time
- Full: resource-timeline showing all resources simultaneously (most useful, most work)

### Phase 2 — Kiosk booking (~15–25 hrs, no auth)
- Name search → CoworkerId
- Conflict check (is slot taken?)
- Write to Nexudus
- Cancel own booking

### Phase 3 — Auth (deferred, scope TBD)
- PIN, email code, or RFID tap
- Plugs into the existing identity seam between name resolution and booking write

## Total Estimate

| Phase | Hours |
|---|---|
| Phase 1 (read-only) | 23–40 |
| Phase 2 (kiosk booking, no auth) | 15–25 |
| Phase 3 (auth) | TBD |
| **Phases 1+2** | **~40–65 hrs** |

Head start from existing `nexudus.py` and booking fetch/transform logic.

## Open Questions

- FullCalendar view scope: resource-timeline vs. per-resource? (user to decide)
- Kiosk hardware: tablet model, touch screen size
- RFID: are Brivo fob IDs accessible and mappable to Nexudus CoworkerId?
- Developer: internal or contractor?



---                                                                                                                                                         
  Web App for Viewing & Booking Resources
                                                                                                                                                              
  Recommended Stack                                         

  - Backend: FastAPI (Python) — fits your existing Python codebase, lightweight REST API
  - Frontend: React + https://fullcalendar.io/ — purpose-built calendar component with resource/room views, drag-to-book support
  - Auth: Nexudus SSO or simple email+token login backed by Nexudus member lookup
  - Hosting: Render.com — $7–22/month (free tier available for low-traffic, paid for always-on)

  What It Would Do

  - Read view: calendar showing booked resources by day/week, filterable by shop/resource
  - Booking view: available slots per resource, click to book (calls Nexudus POST /spaces/bookings)
  - Member auth: verify against Nexudus to restrict booking to active members

  Effort Estimate

  ┌─────────────────────────────────────────────────────┬────────────┐
  │                        Phase                        │   Hours    │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ API wrapper (bookings read/write, auth)             │ 10–20      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Backend (FastAPI endpoints)                         │ 15–25      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Calendar frontend (FullCalendar, resource grouping) │ 25–40      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Booking flow (slot selection, form, confirmation)   │ 20–35      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Auth + member gate                                  │ 10–20      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Deploy + polish                                     │ 10–20      │
  ├─────────────────────────────────────────────────────┼────────────┤
  │ Total                                               │ 80–160 hrs │
  └─────────────────────────────────────────────────────┴────────────┘

  Considerations

  - Nexudus already has a member portal with booking — the value here is a simpler, shop-focused view (e.g. "what's on the laser cutter this week?")
  - FullCalendar's resource timeline view is ideal for showing multiple machines side-by-side
  - If the goal is read-only (staff dashboard, not self-service booking), effort drops to the lower end (~40–60 hrs)

  ---
  Want to scope this further, or is this a back-burner item for now?

✻ Crunched for 1m 55s                 

❯ a main reason is that in the web UI most membeers cannot easily see upcoming bookings, and can never see who has booked a resource - and staff /            
  managers have a difficult time looking things up                                                                                                           
                                                                                                                                                              
⏺ That's a much cleaner scope — it's a visibility problem, not a booking system. That changes the effort significantly.                                       
                                                                                                                                                              
  Revised Scope: Read-Only Booking Visibility                                                                                                                 
   
  What members/staff actually need:                                                                                                                           
  - See what's booked on any resource this week / next week 
  - See who has a resource at a given time (currently hidden in Nexudus member portal)
  - Staff can look up "what has Alice booked?" or "what's on the laser cutter Thursday?"

  What This Simplifies

  No booking workflow, no payment, no slot-conflict logic, no write access to Nexudus. Just:

  1. Fetch bookings via the API (already working in report_bookings.py)
  2. Display them in a calendar/timeline view
  3. Filter by resource, member, date

  Revised estimate: 20–40 hours vs. 80–160 for the full booking system.

  Could be even simpler with a few shortcuts:
  - No auth required if booking visibility is considered non-sensitive (member names visible to all members — same as a physical sign-up sheet)
  - Polling/cache instead of webhooks — refresh from Nexudus every 5–15 minutes
  - Static-ish frontend — could be plain HTML + vanilla JS + FullCalendar, no React build pipeline needed

  Simplest Viable Version

  FastAPI app (Python)
    GET /api/bookings?from=&to=&resource=  → JSON
    GET /                                  → serves index.html

  index.html
    FullCalendar resource-timeline view
    Filter bar: shop dropdown, date picker
    Click booking → shows member name + duration

  Deploy on Render free tier, point staff/members at the URL.

  ---
  Does this match what you're picturing? And is the audience members-only, or public-facing (i.e. does anyone need to log in)?

❯ members-only, and I'd be thinking to build it for actually booking on a kiosk at the facility - building it so that when we do the whole app, it would      
  be easy to reuse the code ... how what about old school AJAX vs react? would that be a bad idea?                                                           
                                                                                                                                                              
⏺ AJAX isn't a bad idea — it's actually a reasonable choice here. Let me lay out the tradeoffs honestly:                                                      
                                                                                                                                                              
  Old-school AJAX (vanilla JS + FullCalendar)                                                                                                                 
   
  Pros:                                                                                                                                                       
  - No build pipeline (no npm, no webpack, no node_modules) 
  - Any Python dev can maintain the whole thing
  - FullCalendar has a vanilla JS bundle — React not required
  - Simpler to debug, simpler to deploy

  Cons:
  - As booking logic grows (step-by-step flow, real-time slot updates, kiosk state), managing state in vanilla JS gets messy fast
  - You'll likely reinvent component patterns React already solved

  Modern middle ground: HTMX

  Worth knowing about — it's "old-school AJAX done right." Server renders HTML, HTMX handles partial page updates. No build step. Python/FastAPI devs can own
  the whole stack.

  <!-- Example: clicking a resource loads its available slots -->
  <button hx-get="/slots?resource=laser" hx-target="#slot-list">
    Check availability
  </button>

  Very popular in the FastAPI/Django world right now. Good fit for a kiosk where the flow is linear.

  React

  Better choice only if you expect the booking flow to get complex (multi-step, lots of reactive state) or plan to hire frontend developers.

  ---
  My recommendation for your situation

  HTMX + FullCalendar (vanilla bundle) + FastAPI

  - Read-only calendar view: FullCalendar handles it natively
  - Booking flow on kiosk: HTMX form submissions, server validates + writes to Nexudus
  - Auth: FastAPI session cookie, members enter email + a PIN or passcode
  - "Reuse later" value comes from the API layer (clean FastAPI endpoints), not the frontend framework — so you're not locked in

  The backend endpoints you'd build are the same regardless of frontend choice. If you later want to rebuild the frontend in React, the API stays.

  ---
  Shall I sketch out what the FastAPI endpoint structure would look like? That's the part worth designing carefully upfront.

❯ yes, sketch out the API structure                                                                                                                           
                                   
⏺ Here's the structure I'd recommend. The key principle: thin proxy layer over Nexudus, with a clean separation between read and write.                       
                                         

