"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface SerializedBooking {
  id: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  memberName: string;
  memberId: string;
}

interface CreateBookingData {
  resourceId: string;
  startAt: string;
  endAt: string;
  notes: string;
}

interface Props {
  resourceId:    string;
  date:          string;   // YYYY-MM-DD
  timezone:      string;   // IANA (e.g. "America/New_York")
  bookings:      SerializedBooking[];
  canBook:       boolean;
  blockReason?:  string;
  createBooking: (data: CreateBookingData) => Promise<{ error?: string }>;
}

// ── Time helpers ───────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as a Date at midnight local time */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as "9:30 AM" in the given timezone */
function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

/** Format a Date as "Tue, Mar 29" in the given timezone */
function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz,
  }).format(d);
}

/** Add N days to a YYYY-MM-DD string, return new YYYY-MM-DD */
function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Generate 30-min slot Date objects between start (inclusive) and end (exclusive) */
function slotsInRange(start: Date, end: Date): Date[] {
  const slots: Date[] = [];
  let cur = new Date(start);
  while (cur < end) {
    slots.push(new Date(cur));
    cur = new Date(cur.getTime() + 30 * 60 * 1000);
  }
  return slots;
}

/** Build display-window start/end (8am and 11pm) for a local date */
function windowForDate(dateStr: string): { start: Date; end: Date } {
  const base = parseLocalDate(dateStr);
  const start = new Date(base); start.setHours(8,  0, 0, 0);
  const end   = new Date(base); end.setHours(23,  0, 0, 0);
  return { start, end };
}

// ── Block computation ──────────────────────────────────────────────────────

interface FreeBlock  { type: "free";   start: Date; end: Date }
interface BookedBlock { type: "booked"; start: Date; end: Date; booking: SerializedBooking }
type Block = FreeBlock | BookedBlock;

function computeBlocks(bookings: SerializedBooking[], dateStr: string): Block[] {
  const { start: windowStart, end: windowEnd } = windowForDate(dateStr);

  // Clip bookings to window, sort by start
  const sorted = bookings
    .map(b => ({ ...b, s: new Date(b.startAt), e: new Date(b.endAt) }))
    .filter(b => b.e > windowStart && b.s < windowEnd)
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  const blocks: Block[] = [];
  let cursor = windowStart;

  for (const b of sorted) {
    const bs = b.s < windowStart ? windowStart : b.s;
    const be = b.e > windowEnd   ? windowEnd   : b.e;
    if (bs > cursor) {
      blocks.push({ type: "free", start: cursor, end: bs });
    }
    blocks.push({ type: "booked", start: bs, end: be, booking: b });
    cursor = be;
  }
  if (cursor < windowEnd) {
    blocks.push({ type: "free", start: cursor, end: windowEnd });
  }
  return blocks;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BookingDayView({
  resourceId, date, timezone, bookings, canBook, blockReason, createBooking,
}: Props) {
  const router = useRouter();
  const [openFreeStart, setOpenFreeStart] = useState<string | null>(null); // ISO of free block start
  const [formStart, setFormStart]         = useState("");
  const [formEnd, setFormEnd]             = useState("");
  const [formNotes, setFormNotes]         = useState("");
  const [pending, setPending]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const blocks = computeBlocks(bookings, date);
  const now    = new Date();

  function openForm(freeBlock: FreeBlock) {
    if (!canBook) return;
    // Default start: the free block start, or now-rounded-up if in the past
    const earliest = freeBlock.start < now
      ? roundUpTo30(now)
      : freeBlock.start;
    if (earliest >= freeBlock.end) return; // entirely in the past
    setOpenFreeStart(freeBlock.start.toISOString());
    setFormStart(earliest.toISOString());
    setFormEnd(new Date(earliest.getTime() + 60 * 60 * 1000).toISOString()); // default +1h
    setFormNotes("");
    setError(null);
  }

  function roundUpTo30(d: Date): Date {
    const ms = 30 * 60 * 1000;
    return new Date(Math.ceil(d.getTime() / ms) * ms);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formStart || !formEnd) return;
    setPending(true);
    setError(null);
    const result = await createBooking({ resourceId, startAt: formStart, endAt: formEnd, notes: formNotes });
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      setOpenFreeStart(null);
      router.refresh();
    }
  }

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.push(`?date=${addDays(date, -1)}`)}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400"
        >
          ← Prev
        </button>
        <span className="font-medium text-sm">
          {fmtDate(parseLocalDate(date), timezone)}
        </span>
        <button
          onClick={() => router.push(`?date=${addDays(date, 1)}`)}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400"
        >
          Next →
        </button>
        <button
          onClick={() => {
            const today = new Date();
            const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
            router.push(`?date=${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
        >
          today
        </button>
      </div>

      {blockReason && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">
          {blockReason}
        </div>
      )}

      {/* Timeline */}
      <div className="border rounded-md overflow-hidden">
        {blocks.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-400">No bookings found for this window.</div>
        )}
        {blocks.map((block, i) => {
          if (block.type === "booked") {
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b last:border-0">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-700">{block.booking.memberName}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {fmtTime(block.start, timezone)} – {fmtTime(block.end, timezone)}
                  </span>
                </div>
              </div>
            );
          }

          // Free block
          const isFuture = block.end > now;
          const isOpen   = openFreeStart === block.start.toISOString();

          // Start slots: 30-min increments in the free block, but not before now
          const earliest = block.start < now ? roundUpTo30(now) : block.start;
          const startSlots = slotsInRange(earliest, block.end);
          // End slots: after the selected start, up to free block end
          const selectedStart = formStart ? new Date(formStart) : null;
          const endSlots = selectedStart
            ? slotsInRange(new Date(selectedStart.getTime() + 30 * 60 * 1000), new Date(block.end.getTime() + 1))
            : [];

          return (
            <div key={i} className="border-b last:border-0">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-400">
                  {fmtTime(block.start, timezone)} – {fmtTime(block.end, timezone)}
                  <span className="ml-2 text-gray-300">free</span>
                </span>
                {canBook && isFuture && startSlots.length > 0 && !isOpen && (
                  <button
                    onClick={() => openForm(block)}
                    className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-0.5"
                  >
                    + Book
                  </button>
                )}
              </div>

              {isOpen && (
                <form onSubmit={handleSubmit} className="px-4 pb-4 bg-blue-50 border-t border-blue-100">
                  <div className="flex flex-wrap gap-3 mt-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-600 font-medium">Start</label>
                      <select
                        value={formStart}
                        onChange={e => {
                          setFormStart(e.target.value);
                          const s = new Date(e.target.value);
                          const def = new Date(s.getTime() + 60 * 60 * 1000);
                          setFormEnd(def <= block.end ? def.toISOString() : block.end.toISOString());
                        }}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      >
                        {startSlots.map(s => (
                          <option key={s.toISOString()} value={s.toISOString()}>
                            {fmtTime(s, timezone)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-600 font-medium">End</label>
                      <select
                        value={formEnd}
                        onChange={e => setFormEnd(e.target.value)}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      >
                        {endSlots.map(s => (
                          <option key={s.toISOString()} value={s.toISOString()}>
                            {fmtTime(s, timezone)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-40 space-y-1">
                      <label className="text-xs text-gray-600 font-medium">Notes (optional)</label>
                      <input
                        type="text"
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        placeholder="What are you working on?"
                        className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    </div>
                  </div>
                  {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2 mt-3">
                    <Button type="submit" size="sm" disabled={pending || !formStart || !formEnd}>
                      {pending ? "Booking…" : "Confirm booking"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => { setOpenFreeStart(null); setError(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
