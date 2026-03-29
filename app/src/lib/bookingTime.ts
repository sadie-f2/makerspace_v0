// Shared pure utilities for booking views (BookingDayView, BookingGridView)

// ── Types ───────────────────────────────────────────────────────────────────

export interface SerializedBooking {
  id: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  memberName: string;
  memberId: string;
}

export interface FreeBlock   { type: "free";   start: Date; end: Date }
export interface BookedBlock {
  type: "booked"; start: Date; end: Date; booking: SerializedBooking;
  clippedStart: boolean; // booking started before this day's window
  clippedEnd:   boolean; // booking ends after this day's window
}
export type Block = FreeBlock | BookedBlock;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

export function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz,
  }).format(d);
}

export function fmtDateShort(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: tz,
  }).format(new Date(isoStr));
}

export function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function slotsInRange(start: Date, end: Date): Date[] {
  const slots: Date[] = [];
  let cur = new Date(start);
  while (cur < end) { slots.push(new Date(cur)); cur = new Date(cur.getTime() + 15 * 60 * 1000); }
  return slots;
}

export function roundUpTo15(d: Date): Date {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

/** Full 24-hour window for the given local date string */
export function windowForDate(dateStr: string): { start: Date; end: Date } {
  const base  = parseLocalDate(dateStr);
  const start = new Date(base); start.setHours(0,  0, 0, 0);
  const end   = new Date(base); end.setHours(24, 0, 0, 0);  // = midnight next day
  return { start, end };
}

/** Interleave free and booked blocks for a given day, clipping to the day window */
export function computeBlocks(bookings: SerializedBooking[], dateStr: string): Block[] {
  const { start: ws, end: we } = windowForDate(dateStr);

  const sorted = bookings
    .map(b => ({ ...b, s: new Date(b.startAt), e: new Date(b.endAt) }))
    .filter(b => b.e > ws && b.s < we)
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  const blocks: Block[] = [];
  let cursor = ws;

  for (const b of sorted) {
    const bs = b.s < ws ? ws : b.s;
    const be = b.e > we ? we : b.e;
    if (bs > cursor) blocks.push({ type: "free", start: cursor, end: bs });
    blocks.push({ type: "booked", start: bs, end: be, booking: b,
      clippedStart: b.s < ws, clippedEnd: b.e > we });
    cursor = be;
  }
  if (cursor < we) blocks.push({ type: "free", start: cursor, end: we });
  return blocks;
}

/** Minutes elapsed since midnight for a given Date (JS local time) */
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Format a duration in milliseconds as "Xh Ym" */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return "0 min";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
