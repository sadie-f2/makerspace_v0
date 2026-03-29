"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  parseLocalDate, fmtTime, fmtDate, fmtDateShort, addDays,
  windowForDate, minutesFromMidnight,
  type SerializedBooking, type BookedBlock,
} from "@/lib/bookingTime";
import BookingDialog from "@/components/BookingDialog";

// ── Constants ────────────────────────────────────────────────────────────────

const PX_PER_HOUR = 80;   // horizontal pixels per hour
const TOTAL_W     = 24 * PX_PER_HOUR; // 1920px
const ROW_H       = 52;   // px per resource row
const HEADER_H    = 28;   // px for time label header row
const LABEL_W     = 176;  // px for fixed resource name column (w-44)

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResourceEntry {
  id:              string;
  name:            string;
  typeTag:         string;
  parentId:        string | null;
  parentName:      string | null;
  certRequired:    boolean;
  certOk:          boolean;
  certName:        string | null;
  bookings:        SerializedBooking[];
}

interface CreateBookingData {
  resourceId: string;
  startAt:    string;
  endAt:      string;
  notes:      string;
}

interface Props {
  date:             string;
  timezone:         string;
  resources:        ResourceEntry[];
  canBook:          boolean;
  createBooking?:   (data: CreateBookingData) => Promise<{ error?: string }>;
  onBookingClick?:  (booking: SerializedBooking, resourceName: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0–24 for tick marks

function snapX(relativeX: number, dateStr: string): Date {
  const rawMinutes = (relativeX / PX_PER_HOUR) * 60;
  const snapped    = Math.floor(rawMinutes / 15) * 15;
  const clamped    = Math.max(0, Math.min(snapped, 24 * 60 - 15));
  const base       = parseLocalDate(dateStr);
  base.setHours(0, 0, 0, 0);
  return new Date(base.getTime() + clamped * 60 * 1000);
}

function leftPx(d: Date): number  { return (minutesFromMidnight(d) / 60) * PX_PER_HOUR; }
function widthPx(s: Date, e: Date): number {
  return Math.max(((e.getTime() - s.getTime()) / 3_600_000) * PX_PER_HOUR, 4);
}

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BookingMultiView({
  date, timezone, resources, canBook, createBooking, onBookingClick,
}: Props) {
  const router     = useRouter();
  const now        = new Date();
  const { start: dayStart } = windowForDate(date);
  const gridRef    = useRef<HTMLDivElement>(null);

  // Shop filter — derive shop groups from resources
  const shops = Array.from(
    new Map(
      resources
        .filter(r => r.parentId && r.parentName)
        .map(r => [r.parentId!, r.parentName!])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const [activeShop, setActiveShop] = useState<string | null>(null);

  const filteredResources = activeShop
    ? resources.filter(r => r.parentId === activeShop || r.id === activeShop)
    : resources;

  // Two-click state
  const [pendingStart, setPendingStart] = useState<{ resourceId: string; time: Date } | null>(null);

  // Dialog state
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [dialogResourceId, setDialogResourceId] = useState("");
  const [dialogInitStart,  setDialogInitStart]  = useState("");
  const [dialogInitEnd,    setDialogInitEnd]    = useState("");

  // Scroll to 8am on mount
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollLeft = 8 * PX_PER_HOUR;
  }, []);

  // Now-line tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  function navTo(newDate: string) {
    router.push(`?date=${newDate}&view=calendar`);
    setPendingStart(null);
  }

  const nowInDay  = now >= dayStart && now < new Date(dayStart.getTime() + 86_400_000);
  const nowLeftPx = nowInDay ? leftPx(now) : null;

  const toLocalInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const handleRowClick = useCallback((resourceId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!canBook) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX  = e.clientX - rect.left;
    const clicked = snapX(relX, date);

    if (!pendingStart || pendingStart.resourceId !== resourceId) {
      setPendingStart({ resourceId, time: clicked });
    } else {
      // Second click on same resource
      let start = pendingStart.time;
      let end   = clicked;
      if (end.getTime() <= start.getTime()) {
        [start, end] = [end, start];
        if (start.getTime() === end.getTime()) end = new Date(start.getTime() + 15 * 60_000);
      }
      setDialogResourceId(resourceId);
      setDialogInitStart(toLocalInput(start));
      setDialogInitEnd(toLocalInput(end));
      setDialogOpen(true);
      setPendingStart(null);
    }
  }, [canBook, pendingStart, date]);

  function handleDialogClose() {
    setDialogOpen(false);
    router.refresh();
  }

  return (
    <div>
      {/* Date nav */}
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
            const t = new Date();
            navTo(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
          today
        </button>
      </div>

      {/* Shop filter */}
      {shops.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          <button
            onClick={() => setActiveShop(null)}
            className={`text-xs px-2.5 py-1 rounded border ${!activeShop ? "bg-gray-100 border-gray-300 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            All
          </button>
          {shops.map(s => (
            <button key={s.id}
              onClick={() => setActiveShop(activeShop === s.id ? null : s.id)}
              className={`text-xs px-2.5 py-1 rounded border ${activeShop === s.id ? "bg-gray-100 border-gray-300 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {canBook && (
        <p className="mb-2 text-xs text-gray-400">
          {pendingStart
            ? <>
                <span className="font-medium text-blue-600">
                  {fmtTime(pendingStart.time, timezone)} on {resources.find(r => r.id === pendingStart.resourceId)?.name}
                </span>
                {" — click again on the same row to set end. "}
                <button className="underline" onClick={() => setPendingStart(null)}>cancel</button>
              </>
            : "Click a row to set start time, click again to set end and open the booking form."
          }
        </p>
      )}

      {/* Grid */}
      <div className="border rounded-md overflow-hidden">
        <div className="flex">
          {/* Fixed label column */}
          <div className="shrink-0 border-r bg-white z-10" style={{ width: LABEL_W }}>
            {/* Header spacer */}
            <div style={{ height: HEADER_H }} className="border-b bg-gray-50" />
            {filteredResources.map(r => (
              <div key={r.id} style={{ height: ROW_H }}
                className="flex items-center px-3 border-b last:border-0 gap-1.5">
                <div className="min-w-0">
                  <Link
                    href={`/portal/book/${r.id}?date=${date}`}
                    className="text-xs font-medium text-gray-700 hover:text-blue-600 hover:underline truncate block"
                  >
                    {r.name}
                  </Link>
                  {r.certRequired && (
                    <span className={`text-xs ${r.certOk ? "text-green-600" : "text-amber-600"}`}>
                      {r.certOk ? "✓" : "cert req'd"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable time grid */}
          <div ref={gridRef} className="overflow-x-auto flex-1" style={{ overscrollBehaviorX: "contain" } as React.CSSProperties}>
            <div style={{ width: TOTAL_W }}>
              {/* Time header */}
              <div className="relative border-b bg-gray-50" style={{ height: HEADER_H }}>
                {HOURS.map(h => (
                  <span key={h}
                    className="absolute text-xs text-gray-400 leading-none"
                    style={{ left: h * PX_PER_HOUR, top: "50%", transform: "translate(-50%, -50%)" }}
                  >
                    {hourLabel(h)}
                  </span>
                ))}
              </div>

              {/* Resource rows + global now-line wrapper */}
              <div className="relative">
                {/* Now line — spans all rows */}
                {nowLeftPx !== null && (
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-red-400 z-20 pointer-events-none"
                    style={{ left: nowLeftPx }}
                  >
                    <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-red-400" />
                  </div>
                )}

                {filteredResources.map(r => {
                  const isPending = pendingStart?.resourceId === r.id;
                  const pendingLeftPx = isPending ? leftPx(pendingStart!.time) : null;

                  // Candidate block — shown while dialog is open for this resource
                  const isCandidate = dialogOpen && dialogResourceId === r.id;
                  const candidateLeft  = isCandidate ? leftPx(new Date(dialogInitStart)) : null;
                  const candidateWidth = isCandidate
                    ? Math.max(widthPx(new Date(dialogInitStart), new Date(dialogInitEnd)), 4)
                    : null;

                  return (
                    <div key={r.id} className="relative border-b last:border-0"
                      style={{ height: ROW_H }}>
                      {/* Hour grid lines */}
                      {HOURS.slice(0, 24).map(h => (
                        <div key={h}
                          className="absolute top-0 bottom-0 border-l border-gray-100"
                          style={{ left: h * PX_PER_HOUR }} />
                      ))}

                      {/* Candidate block (dialog open) */}
                      {candidateLeft !== null && candidateWidth !== null && (
                        <div
                          className="absolute top-1 bg-blue-200 border-2 border-dashed border-blue-500 rounded pointer-events-none z-10"
                          style={{ left: candidateLeft + 1, width: candidateWidth - 2, height: ROW_H - 8 }}
                        />
                      )}

                      {/* Booking blocks */}
                      {r.bookings.map(b => {
                        const bs = new Date(b.startAt);
                        const be = new Date(b.endAt);
                        // Clip to day window
                        const cs = bs < dayStart ? dayStart : bs;
                        const ce = be > new Date(dayStart.getTime() + 86_400_000) ? new Date(dayStart.getTime() + 86_400_000) : be;
                        const clippedStart = bs < dayStart;
                        const clippedEnd   = be > new Date(dayStart.getTime() + 86_400_000);
                        const clickable = !!onBookingClick;
                        return (
                          <div key={b.id}
                            className={[
                              "absolute top-1 bg-blue-100 border border-blue-300 rounded text-xs overflow-hidden",
                              clickable ? "cursor-pointer hover:bg-blue-200 pointer-events-auto z-10" : "pointer-events-none",
                              clippedStart ? "border-l-2 border-l-dashed" : "",
                              clippedEnd   ? "border-r-2 border-r-dashed" : "",
                            ].join(" ")}
                            style={{
                              left:   leftPx(cs) + 1,
                              width:  widthPx(cs, ce) - 2,
                              height: ROW_H - 8,
                            }}
                            onClick={clickable ? (e) => { e.stopPropagation(); onBookingClick(b, r.name); } : undefined}
                          >
                            <div className="px-1 py-0.5 truncate">
                              <span className="font-medium text-blue-800">{b.memberName}</span>
                              {" "}
                              <span className="text-blue-500 text-xs">
                                {clippedStart && <span title={`Starts ${fmtDateShort(b.startAt, timezone)}`}>← </span>}
                                {fmtTime(cs, timezone)}–{fmtTime(ce, timezone)}
                                {clippedEnd && <span title={`Ends ${fmtDateShort(b.endAt, timezone)}`}> →</span>}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Pending start marker for this row */}
                      {pendingLeftPx !== null && (
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-dashed border-blue-500 z-10 pointer-events-none"
                          style={{ left: pendingLeftPx }}
                        />
                      )}

                      {/* Click overlay */}
                      {canBook && (
                        <div
                          className={`absolute inset-0 z-30 ${isPending ? "cursor-crosshair" : "cursor-pointer"}`}
                          onClick={e => handleRowClick(r.id, e)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {createBooking && (
        <BookingDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          initialStart={dialogInitStart}
          initialEnd={dialogInitEnd}
          timezone={timezone}
          resourceId={dialogResourceId}
          createBooking={createBooking}
        />
      )}
    </div>
  );
}
