"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fmtDuration } from "@/lib/bookingTime";

interface CreateBookingData {
  resourceId: string;
  startAt: string;
  endAt: string;
  notes: string;
}

interface Props {
  open:          boolean;
  onClose:       () => void;
  initialStart:  string; // ISO or datetime-local string
  initialEnd:    string; // ISO or datetime-local string
  timezone:      string;
  resourceId:    string;
  createBooking: (data: CreateBookingData) => Promise<{ error?: string }>;
}

/** Convert a Date to the value expected by <input type="datetime-local"> */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookingDialog({
  open, onClose, initialStart, initialEnd, timezone, resourceId, createBooking,
}: Props) {
  // Initialise from props; re-sync when dialog is opened
  const [start,   setStart]   = useState("");
  const [end,     setEnd]     = useState("");
  const [notes,   setNotes]   = useState("");
  const [pending, setPending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      // Normalise: if ISO string, convert to local datetime-local value
      const parseInput = (s: string) => {
        try { return toLocalInput(new Date(s)); } catch { return s; }
      };
      setStart(parseInput(initialStart));
      setEnd(parseInput(initialEnd));
      setNotes("");
      setError(null);
    }
    prevOpen.current = open;
  }, [open, initialStart, initialEnd]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // Live duration display
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs   = end   ? new Date(end).getTime()   : NaN;
  const duration = !isNaN(startMs) && !isNaN(endMs) && endMs > startMs
    ? fmtDuration(endMs - startMs)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) return;
    const startAt = new Date(start).toISOString();
    const endAt   = new Date(end).toISOString();
    if (endAt <= startAt) { setError("End must be after start."); return; }
    setPending(true); setError(null);
    const result = await createBooking({ resourceId, startAt, endAt, notes });
    setPending(false);
    if (result.error) { setError(result.error); }
    else { onClose(); }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">New booking</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Start</label>
              <input
                type="datetime-local"
                value={start}
                onChange={e => setStart(e.target.value)}
                required
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">End</label>
              <input
                type="datetime-local"
                value={end}
                onChange={e => setEnd(e.target.value)}
                required
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {duration && (
            <p className="text-xs text-gray-400">Duration: <span className="font-medium text-gray-600">{duration}</span></p>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What are you working on?"
              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <p className="text-xs text-gray-400">
            Times are in your local browser timezone.{" "}
            <span className="text-gray-500">Space timezone: {timezone}</span>
          </p>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={pending || !start || !end}>
              {pending ? "Booking…" : "Confirm booking"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
