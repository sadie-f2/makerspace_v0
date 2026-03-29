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
  date:          string;       // YYYY-MM-DD
  timezone:      string;       // IANA (e.g. "America/New_York")
  bookings:      SerializedBooking[];
  canBook:       boolean;
  blockReason?:  string;
  initialTime?:  string;       // HH:MM — auto-opens form at this time if free
  createBooking: (data: CreateBookingData) => Promise<{ error?: string }>;
}

// ── Time helpers ────────────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

function fmtDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz,
  }).format(d);
}

function fmtDateShort(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: tz,
  }).format(new Date(isoStr));
}

function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slotsInRange(start: Date, end: Date): Date[] {
  const slots: Date[] = [];
  let cur = new Date(start);
  while (cur < end) { slots.push(new Date(cur)); cur = new Date(cur.getTime() + 15 * 60 * 1000); }
  return slots;
}

function roundUpTo15(d: Date): Date {
  const ms = 15 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

/** Full 24-hour window for the given date */
function windowForDate(dateStr: string): { start: Date; end: Date } {
  const base  = parseLocalDate(dateStr);
  const start = new Date(base); start.setHours(0,  0, 0, 0);
  const end   = new Date(base); end.setHours(24, 0, 0, 0);   // = midnight next day
  return { start, end };
}

// ── Block computation ───────────────────────────────────────────────────────

interface FreeBlock   { type: "free";   start: Date; end: Date }
interface BookedBlock {
  type: "booked"; start: Date; end: Date; booking: SerializedBooking;
  clippedStart: boolean; // booking started before this day's window
  clippedEnd:   boolean; // booking ends after this day's window
}
type Block = FreeBlock | BookedBlock;

function computeBlocks(bookings: SerializedBooking[], dateStr: string): Block[] {
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

// ── Component ───────────────────────────────────────────────────────────────

export default function BookingDayView({
  resourceId, date, timezone, bookings, canBook, blockReason, initialTime, createBooking,
}: Props) {
  const router = useRouter();
  const now    = new Date();
  const blocks = computeBlocks(bookings, date);

  // Compute initial form state from initialTime prop (find free block at that time)
  function getInitialState() {
    if (!initialTime) return null;
    const [h, m] = initialTime.split(":").map(Number);
    const target = parseLocalDate(date); target.setHours(h, m, 0, 0);
    const fb = blocks.find(b => b.type === "free" && b.start <= target && b.end > target) as FreeBlock | undefined;
    if (!fb) return null;
    const earliest = fb.start < now ? roundUpTo15(now) : fb.start;
    if (earliest >= fb.end) return null;
    const defEnd = new Date(earliest.getTime() + 60 * 60 * 1000);
    return {
      openFreeStart: fb.start.toISOString(),
      formStart:     earliest.toISOString(),
      formEnd:       defEnd <= fb.end ? defEnd.toISOString() : fb.end.toISOString(),
    };
  }
  const init = getInitialState();

  // Same-day quick booking form state
  const [openFreeStart, setOpenFreeStart] = useState<string | null>(init?.openFreeStart ?? null);
  const [formStart, setFormStart]         = useState(init?.formStart ?? "");
  const [formEnd,   setFormEnd]           = useState(init?.formEnd   ?? "");
  const [formNotes, setFormNotes]         = useState("");
  const [pending,   setPending]           = useState(false);
  const [error,     setError]             = useState<string | null>(null);

  // Multi-day custom booking form state
  const [showCustom,    setShowCustom]    = useState(false);
  const [customStart,   setCustomStart]   = useState(`${date}T00:00`);
  const [customEnd,     setCustomEnd]     = useState(`${addDays(date, 1)}T00:00`);
  const [customNotes,   setCustomNotes]   = useState("");
  const [customPending, setCustomPending] = useState(false);
  const [customError,   setCustomError]   = useState<string | null>(null);

  // Navigation helper — carries selected time across day changes
  function navTo(newDate: string) {
    let url = `?date=${newDate}`;
    if (openFreeStart && formStart) {
      const s = new Date(formStart);
      url += `&time=${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`;
    }
    router.push(url);
  }

  function openForm(fb: FreeBlock) {
    if (!canBook) return;
    const earliest = fb.start < now ? roundUpTo15(now) : fb.start;
    if (earliest >= fb.end) return;
    setOpenFreeStart(fb.start.toISOString());
    setFormStart(earliest.toISOString());
    const defEnd = new Date(earliest.getTime() + 60 * 60 * 1000);
    setFormEnd(defEnd <= fb.end ? defEnd.toISOString() : fb.end.toISOString());
    setFormNotes("");
    setError(null);
    setShowCustom(false);
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const result = await createBooking({ resourceId, startAt: formStart, endAt: formEnd, notes: formNotes });
    setPending(false);
    if (result.error) { setError(result.error); }
    else { setOpenFreeStart(null); router.refresh(); }
  }

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCustomPending(true); setCustomError(null);
    // datetime-local → browser converts local time to ISO UTC via new Date()
    const startAt = new Date(customStart).toISOString();
    const endAt   = new Date(customEnd).toISOString();
    const result  = await createBooking({ resourceId, startAt, endAt, notes: customNotes });
    setCustomPending(false);
    if (result.error) { setCustomError(result.error); }
    else { setShowCustom(false); setCustomNotes(""); router.refresh(); }
  }

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navTo(addDays(date, -1))}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          ← Prev
        </button>
        <span className="font-medium text-sm">{fmtDate(parseLocalDate(date), timezone)}</span>
        <button onClick={() => navTo(addDays(date, 1))}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          Next →
        </button>
        <button onClick={() => {
            const t = new Date(); const y = t.getFullYear(), m = t.getMonth()+1, d = t.getDate();
            navTo(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
          today
        </button>
      </div>

      {blockReason && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">
          {blockReason}
        </div>
      )}

      {/* Custom / multi-day booking form */}
      {canBook && (
        <div className="mb-4 border rounded-md overflow-hidden">
          <button
            onClick={() => { setShowCustom(o => !o); setOpenFreeStart(null); }}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm text-left"
          >
            <span className="font-medium">Custom date range booking</span>
            <span className="text-xs text-gray-400">{showCustom ? "▲ hide" : "▼ expand"} — multi-day or cross-midnight</span>
          </button>
          {showCustom && (
            <form onSubmit={handleCustomSubmit} className="px-4 py-4 border-t">
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Start</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    required
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">End</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    required
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="flex-1 min-w-48 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
                  <input
                    type="text"
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    placeholder="What are you working on?"
                    className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              {customError && <p className="mt-2 text-xs text-red-600">{customError}</p>}
              <p className="mt-2 text-xs text-gray-400">
                Times are interpreted as your local browser time. All-day or multi-day bookings OK.
              </p>
              <div className="mt-3">
                <Button type="submit" size="sm" disabled={customPending}>
                  {customPending ? "Booking…" : "Confirm booking"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Day timeline */}
      <div className="border rounded-md overflow-hidden">
        {blocks.map((block, i) => {
          if (block.type === "booked") {
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-3 bg-blue-50 border-b last:border-0">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1.5" />
                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-700">{block.booking.memberName}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {block.clippedStart
                      ? <span title={`Starts ${fmtDateShort(block.booking.startAt, timezone)}`}>← </span>
                      : null}
                    {fmtTime(block.start, timezone)} – {fmtTime(block.end, timezone)}
                    {block.clippedEnd
                      ? <span title={`Ends ${fmtDateShort(block.booking.endAt, timezone)}`}> →</span>
                      : null}
                  </span>
                  {(block.clippedStart || block.clippedEnd) && (
                    <p className="text-xs text-blue-400 mt-0.5">
                      {block.clippedStart && `Started ${fmtDateShort(block.booking.startAt, timezone)}`}
                      {block.clippedStart && block.clippedEnd && " · "}
                      {block.clippedEnd && `Ends ${fmtDateShort(block.booking.endAt, timezone)}`}
                    </p>
                  )}
                </div>
              </div>
            );
          }

          // Free block
          const isFuture  = block.end > now;
          const isOpen    = openFreeStart === block.start.toISOString();
          const earliest  = block.start < now ? roundUpTo15(now) : block.start;
          const startSlots = slotsInRange(earliest, block.end);
          const selectedStart = formStart ? new Date(formStart) : null;
          const endSlots = selectedStart && isOpen
            ? slotsInRange(
                new Date(selectedStart.getTime() + 15 * 60 * 1000),
                block.end,
              )
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
                <form onSubmit={handleQuickSubmit} className="px-4 pb-4 bg-blue-50 border-t border-blue-100">
                  <div className="flex flex-wrap gap-3 mt-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-600 font-medium">Start</label>
                      <select
                        value={formStart}
                        onChange={e => {
                          setFormStart(e.target.value);
                          const s  = new Date(e.target.value);
                          const d1 = new Date(s.getTime() + 60 * 60 * 1000);
                          setFormEnd(d1 <= block.end ? d1.toISOString() : block.end.toISOString());
                        }}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      >
                        {startSlots.map(s => (
                          <option key={s.toISOString()} value={s.toISOString()}>{fmtTime(s, timezone)}</option>
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
                          <option key={s.toISOString()} value={s.toISOString()}>{fmtTime(s, timezone)}</option>
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
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => { setOpenFreeStart(null); setError(null); }}>
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
