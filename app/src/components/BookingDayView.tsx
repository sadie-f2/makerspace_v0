"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  parseLocalDate, fmtTime, fmtDate, fmtDateShort, addDays,
  slotsInRange, roundUpTo15, windowForDate,
  computeBlocks,
  type SerializedBooking, type FreeBlock,
} from "@/lib/bookingTime";

export type { SerializedBooking } from "@/lib/bookingTime";

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

  const [openFreeStart, setOpenFreeStart] = useState<string | null>(init?.openFreeStart ?? null);
  const [formStart, setFormStart]         = useState(init?.formStart ?? "");
  const [formEnd,   setFormEnd]           = useState(init?.formEnd   ?? "");
  const [formNotes, setFormNotes]         = useState("");
  const [pending,   setPending]           = useState(false);
  const [error,     setError]             = useState<string | null>(null);

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
  }

  async function handleQuickSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const result = await createBooking({ resourceId, startAt: formStart, endAt: formEnd, notes: formNotes });
    setPending(false);
    if (result.error) { setError(result.error); }
    else { setOpenFreeStart(null); router.refresh(); }
  }

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navTo(addDays(date, -1))}
          aria-label="Previous day"
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          <span aria-hidden="true">← Prev</span>
        </button>
        <span className="font-medium text-sm" aria-live="polite">{fmtDate(parseLocalDate(date), timezone)}</span>
        <button onClick={() => navTo(addDays(date, 1))}
          aria-label="Next day"
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          <span aria-hidden="true">Next →</span>
        </button>
        <button onClick={() => {
            const t = new Date(); const y = t.getFullYear(), mo = t.getMonth()+1, d = t.getDate();
            navTo(`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
          }}
          aria-label="Go to today"
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
          today
        </button>
      </div>

      {blockReason && (
        <div role="status" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">
          {blockReason}
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
