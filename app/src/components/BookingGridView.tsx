"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  parseLocalDate, fmtTime, fmtDate, fmtDateShort, addDays,
  windowForDate, computeBlocks, minutesFromMidnight,
  type SerializedBooking, type BookedBlock,
} from "@/lib/bookingTime";
import BookingDialog from "@/components/BookingDialog";

interface CreateBookingData {
  resourceId: string;
  startAt: string;
  endAt: string;
  notes: string;
}

interface Props {
  resourceId:    string;
  date:          string;       // YYYY-MM-DD
  timezone:      string;
  bookings:      SerializedBooking[];
  canBook:       boolean;
  blockReason?:  string;
  initialTime?:  string;       // HH:MM
  createBooking: (data: CreateBookingData) => Promise<{ error?: string }>;
}

// 1 hour = 64px
const PX_PER_HOUR = 64;
const PX_PER_MIN  = PX_PER_HOUR / 60;

function minsToPx(mins: number): number { return mins * PX_PER_MIN; }

function snapToGrid(relativeY: number): Date {
  // relativeY is pixels from top of the 24h container (midnight = 0)
  const rawMinutes = relativeY / PX_PER_MIN;
  const snapped = Math.floor(rawMinutes / 15) * 15;
  const clamped = Math.max(0, Math.min(snapped, 24 * 60 - 15));
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + clamped * 60 * 1000);
}

function snapToGridForDate(relativeY: number, dateStr: string): Date {
  const rawMinutes = relativeY / PX_PER_MIN;
  const snapped = Math.floor(rawMinutes / 15) * 15;
  const clamped = Math.max(0, Math.min(snapped, 24 * 60 - 15));
  const base = parseLocalDate(dateStr);
  base.setHours(0, 0, 0, 0);
  return new Date(base.getTime() + clamped * 60 * 1000);
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function BookingGridView({
  resourceId, date, timezone, bookings, canBook, blockReason, initialTime, createBooking,
}: Props) {
  const router   = useRouter();
  const now      = new Date();
  const { start: dayStart } = windowForDate(date);
  const blocks   = computeBlocks(bookings, date);

  // Scroll viewport ref
  const scrollRef = useRef<HTMLDivElement>(null);

  // Two-click booking selection state
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  // Dialog state
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [dialogInitStart, setDialogInitStart] = useState("");
  const [dialogInitEnd,   setDialogInitEnd]   = useState("");

  // Scroll to 6am (or initialTime hour) on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const targetHour = initialTime ? parseInt(initialTime.split(":")[0], 10) : 6;
    el.scrollTop = Math.max(0, targetHour * PX_PER_HOUR - 32); // centre a bit above
  }, [initialTime]);

  // Update "now" line every minute
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Navigation (carries view=grid)
  function navTo(newDate: string) {
    router.push(`?date=${newDate}&view=grid`);
    setPendingStart(null);
  }

  // Compute "now" offset
  const nowInDay = now >= dayStart && now < new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const nowTopPx = nowInDay ? minsToPx(minutesFromMidnight(now)) : null;

  // Overlay click handler
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canBook) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const relativeY = e.clientY - rect.top + scrollTop;
    const clicked = snapToGridForDate(relativeY, date);

    if (!pendingStart) {
      // First click — set start
      setPendingStart(clicked);
    } else {
      // Second click — open dialog
      let start = pendingStart;
      let end   = clicked;
      if (end <= start) {
        // Swap + add 15 min if same slot
        [start, end] = [end, start];
        if (start.getTime() === end.getTime()) {
          end = new Date(start.getTime() + 15 * 60 * 1000);
        }
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      const toLocal = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDialogInitStart(toLocal(start));
      setDialogInitEnd(toLocal(end));
      setDialogOpen(true);
      setPendingStart(null);
    }
  }, [canBook, pendingStart, date]);

  function handleDialogClose() {
    setDialogOpen(false);
    router.refresh();
  }

  // Pending start indicator height
  const pendingTopPx = pendingStart
    ? minsToPx(minutesFromMidnight(pendingStart))
    : null;

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
        <div role="status" className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded">
          {blockReason}
        </div>
      )}

      {canBook && (
        <p aria-live="polite" className="mb-2 text-xs text-gray-400">
          {pendingStart
            ? <>Click a second time to set the end — or <button className="underline" onClick={() => setPendingStart(null)}>cancel</button></>
            : "Click to set start time, click again to set end time and open the booking form."
          }
        </p>
      )}

      {/* Grid */}
      <div
        ref={scrollRef}
        className="border rounded-md overflow-y-auto overscroll-contain"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        <div className="flex">
          {/* Hour label gutter */}
          <div className="w-14 shrink-0 select-none">
            {HOURS.map(h => (
              <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
                <span className="absolute -top-2.5 right-2 text-xs text-gray-400 leading-none">
                  {h === 0 ? "" : h < 12 ? `${h}` : h === 12 ? "12" : `${h-12}`}
                  {h > 0 && <span className="text-gray-300">{h < 12 ? "a" : "p"}</span>}
                </span>
              </div>
            ))}
            {/* 24:00 label */}
            <div className="relative h-0">
              <span className="absolute -top-2.5 right-2 text-xs text-gray-300 leading-none">12a</span>
            </div>
          </div>

          {/* Grid body */}
          <div
            className="relative flex-1 border-l"
            style={{ height: 24 * PX_PER_HOUR }}
          >
            {/* Hour lines */}
            {HOURS.map(h => (
              <div key={h} className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: h * PX_PER_HOUR }} />
            ))}
            {/* 30-min sub-lines */}
            {HOURS.map(h => (
              <div key={`h${h}`} className="absolute left-0 right-0 border-t border-gray-50"
                style={{ top: h * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
            ))}

            {/* Booking blocks */}
            {blocks.map((block, i) => {
              if (block.type !== "booked") return null;
              const b = block as BookedBlock;
              const topPx    = minsToPx(minutesFromMidnight(b.start));
              const heightPx = Math.max(minsToPx((b.end.getTime() - b.start.getTime()) / 60000), 20);
              return (
                <div
                  key={i}
                  className={[
                    "absolute left-1 right-1 bg-blue-100 border border-blue-300 rounded text-xs overflow-hidden",
                    "pointer-events-none select-none z-10",
                    b.clippedStart ? "border-t-2 border-t-dashed" : "",
                    b.clippedEnd   ? "border-b-2 border-b-dashed" : "",
                  ].join(" ")}
                  style={{ top: topPx, height: heightPx }}
                >
                  <div className="px-1.5 py-0.5">
                    <div className="font-medium text-blue-800 truncate">{b.booking.memberName}</div>
                    <div className="text-blue-500 truncate">
                      {b.clippedStart && <span title={`Starts ${fmtDateShort(b.booking.startAt, timezone)}`}>← </span>}
                      {fmtTime(b.start, timezone)}–{fmtTime(b.end, timezone)}
                      {b.clippedEnd && <span title={`Ends ${fmtDateShort(b.booking.endAt, timezone)}`}> →</span>}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Now line */}
            {nowTopPx !== null && (
              <div
                className="absolute left-0 right-0 border-t-2 border-red-400 z-20 pointer-events-none"
                style={{ top: nowTopPx }}
              >
                <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-400" />
              </div>
            )}

            {/* Pending start indicator */}
            {pendingTopPx !== null && (
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-blue-500 z-30 pointer-events-none"
                style={{ top: pendingTopPx }}
              >
                <span className="absolute left-2 -top-4 text-xs text-blue-600 bg-white px-1 rounded shadow-sm border border-blue-200">
                  {pendingStart && fmtTime(pendingStart, timezone)} — click to set end
                </span>
              </div>
            )}

            {/* Transparent click overlay */}
            {canBook && (
              <div
                className="absolute inset-0 z-40 cursor-crosshair"
                onClick={handleOverlayClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* Booking dialog */}
      <BookingDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        initialStart={dialogInitStart}
        initialEnd={dialogInitEnd}
        timezone={timezone}
        resourceId={resourceId}
        createBooking={createBooking}
      />
    </div>
  );
}
