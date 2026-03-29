"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BookingMultiView, { type ResourceEntry } from "@/components/BookingMultiView";
import { Button } from "@/components/ui/button";
import { fmtTime, fmtDate, parseLocalDate, type SerializedBooking } from "@/lib/bookingTime";

interface Props {
  date:         string;
  timezone:     string;
  resources:    ResourceEntry[];
  cancelBooking: (id: string) => Promise<{ error?: string }>;
}

export default function AdminBookingCalendar({ date, timezone, resources, cancelBooking }: Props) {
  const router = useRouter();
  const [selected, setSelected]   = useState<{ booking: SerializedBooking; resourceName: string } | null>(null);
  const [pending,  setPending]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  function handleBookingClick(booking: SerializedBooking, resourceName: string) {
    setSelected({ booking, resourceName });
    setError(null);
  }

  async function handleCancel() {
    if (!selected) return;
    setPending(true); setError(null);
    const result = await cancelBooking(selected.booking.id);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <BookingMultiView
        date={date}
        timezone={timezone}
        resources={resources}
        canBook={false}
        onBookingClick={handleBookingClick}
      />

      {/* Booking detail / cancel panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">Booking detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <dl className="text-sm space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Resource</dt>
                <dd className="font-medium text-gray-700">{selected.resourceName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Member</dt>
                <dd className="text-gray-700">{selected.booking.memberName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Date</dt>
                <dd className="text-gray-700">{fmtDate(parseLocalDate(date), timezone)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Time</dt>
                <dd className="text-gray-700">
                  {fmtTime(new Date(selected.booking.startAt), timezone)}
                  {" – "}
                  {fmtTime(new Date(selected.booking.endAt), timezone)}
                </dd>
              </div>
            </dl>

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={handleCancel}
              >
                {pending ? "Cancelling…" : "Cancel booking"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
