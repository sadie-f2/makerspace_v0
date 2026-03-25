# UI Notes

## Context

Early feedback on tt-cal (Perl/Mojolicious) and the booking app (Python/FastAPI) found the UI
lacking. Those tools are server-render-first with minimal JS — the UI limitations are a natural
consequence of those stacks, not a constraint on this project.

The new stack (Next.js + React) separates UI from application logic cleanly. UI quality is
fully addressable independently of backend decisions.

---

## Design Goals

- **Simple**: not visually complex, focused on function, high information density
- **Lightweight**: minimal client-side JS, fast load, no heavy animations or effects
- Closer to a well-designed internal tool than a consumer product
- Members want fast and clear — they're booking equipment and checking their studio

---

## Stack Choices

**Component library: shadcn/ui**
- Copy-paste components built on Radix UI primitives
- Only include what you use — no runtime library overhead
- Fully owned and customisable
- Good accessible defaults (important for future accessibility review)
- Pairs naturally with Tailwind

**Styling: Tailwind CSS**
- Utility-first, tiny final CSS bundle, no runtime
- Enforces visual consistency without a heavy design system

**Charts/reporting: Recharts** (bundled with shadcn)
- Reasonable weight; consider plain CSS tables for simple reporting pages

---

## Lightweight Architecture

Next.js App Router (Server Components) is designed for this:

- Most pages render on the server — tables, lists, dashboards ship as HTML + CSS
- Client components only where interactivity is required:
  - Booking calendar
  - Floor plan SVG overlay
  - Forms with live validation
- No global client-side state management library (Redux etc.) needed
- Navigation is hybrid partial-update, not full SPA reload

---

## Things to Avoid

- Animations and transitions on every interaction
- Client-side data fetching where server rendering works fine
- Heavy chart libraries
- Full SPA behaviour
- Excessive modal nesting or multi-step flows where a single page works

---

## Bespoke UI Pieces

- **Interactive floor plan**: inline SVG, client-side JS for state overlay and click handlers.
  This is the one inherently heavyweight page — still just a single SVG fetch + DOM updates,
  nothing exotic.
- **Booking calendar**: client component; keep it simple (CSS grid preferred over a heavy
  calendar library)

---

## Open Questions

- [ ] Confirm component library choice (shadcn/ui assumed above)
- [ ] Accessibility review: user has contact who is an expert screen reader user — schedule
      post-build review
- [ ] Mobile: management app is likely primarily desktop; confirm whether member portal needs
      a mobile-optimised view
