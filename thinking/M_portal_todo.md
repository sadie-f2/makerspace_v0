# Member Portal — Design Questions & Todo

Questions to resolve before building. Answers will drive scope of first portal sprint.

## Auth / Accounts

1. **Account creation flow** — Does staff create accounts (admin side already has welcome email),
   or is there a self-registration `/register` page for new members?

2. **Password management** — Can members change their own password in the portal,
   or is that staff-managed for now? (Password reset email would need an email token flow.)

## Member Actions — need scope decision

3. **Lease requests** — Can members submit a lease start or end request from the portal?
   (Admin review queue is already built.)

4. **Waitlist** — Can members join the studio/storage waitlist from the portal?

5. **Cancel / withdraw** — Can members cancel a pending lease request or withdraw
   themselves from the waitlist?

6. **Certifications** — Can members see their cert list? Can they request a cert?
   (Granting remains staff-only; question is whether members can see status or initiate.)

7. **Bookings / reservations** — In scope for this portal sprint, or deferred?

## Read-only views

8. **Leases & billing** — Should members see their active leases and monthly rate? Current tier?

9. **Floor plan** — Should members see a "where is my studio" view (highlighted space on floor plan)?

## Day Passes

10. **Self-service day passes** — Stripe self-purchase in scope, or staff-managed only for now?

---

## Presumed minimum viable portal (pending answers above)

- Login (already exists at `/login`)
- `/portal` — dashboard: name, tier, active leases summary
- `/portal/profile` — view & edit own profile (name, phone, emergency contact)
- `/portal/leases` — lease request form + status of pending requests
- `/portal/waitlist` — join waitlist + status of own entries
- `/portal/certifications` — view active certs (read-only)

All behind auth middleware protecting `/portal/*`.
