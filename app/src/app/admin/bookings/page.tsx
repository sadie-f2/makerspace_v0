import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import AdminBookingCalendar from "@/components/AdminBookingCalendar";
import { type ResourceEntry } from "@/components/BookingMultiView";
import { addDays } from "@/lib/bookingTime";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayStr();
  const view = viewParam === "table" ? "table" : "calendar";

  const [y, m, d] = date.split("-").map(Number);
  const dayStart  = new Date(y, m - 1, d,  0,  0,  0);
  const dayEnd    = new Date(y, m - 1, d, 23, 59, 59);

  const [reservations, resources, systemConfig] = await Promise.all([
    prisma.reservation.findMany({
      where: { deletedAt: null, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: {
        resource: { select: { id: true, name: true } },
        member:   { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.resource.findMany({
      where: { reservable: true, deletedAt: null },
      include: { parent: { select: { id: true, name: true } } },
      orderBy: [{ typeTag: "asc" }, { name: "asc" }],
    }),
    prisma.systemConfig.findFirst({ select: { timezone: true } }),
  ]);

  const timezone  = systemConfig?.timezone ?? "America/New_York";
  const prevDate  = addDays(date, -1);
  const nextDate  = addDays(date, 1);
  const displayDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: timezone,
  }).format(new Date(y, m - 1, d));

  async function adminCancelBooking(id: string): Promise<{ error?: string }> {
    "use server";
    await requireUnfrozen("/admin/bookings");
    const session = await auth();
    if (!session?.user.id) return { error: "Not authenticated" };

    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) return { error: "Booking not found" };

    await prisma.reservation.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedById: session.user.id },
    });
    await audit({
      actorId: session.user.id, actorType: "ADMIN", action: "delete",
      entityType: "Reservation", entityId: id,
      before: { startAt: reservation.startAt, endAt: reservation.endAt,
                resourceId: reservation.resourceId, memberId: reservation.memberId },
      after: null, note: "Admin cancelled booking",
    });
    return {};
  }

  // Group bookings by resourceId for calendar view
  const bookingsByResource = new Map<string, typeof reservations>();
  for (const b of reservations) {
    if (!bookingsByResource.has(b.resourceId)) bookingsByResource.set(b.resourceId, []);
    bookingsByResource.get(b.resourceId)!.push(b);
  }

  const resourceEntries: ResourceEntry[] = resources.map(r => ({
    id:          r.id,
    name:        r.name,
    typeTag:     r.typeTag,
    parentId:    r.parentId,
    parentName:  r.parent?.name ?? null,
    certRequired: false,
    certOk:       false,
    certName:     null,
    bookings:    (bookingsByResource.get(r.id) ?? []).map(b => ({
      id:         b.id,
      startAt:    b.startAt.toISOString(),
      endAt:      b.endAt.toISOString(),
      memberName: b.member.name,
    })),
  }));

  return (
    <div className={view === "calendar" ? "max-w-full px-1" : "max-w-3xl"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Bookings</h2>
        <div className="flex items-center gap-1">
          <Link href={`?date=${date}&view=calendar`}
            className={`text-xs px-2.5 py-1 rounded border ${view === "calendar" ? "bg-gray-100 border-gray-300 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            Calendar
          </Link>
          <Link href={`?date=${date}&view=table`}
            className={`text-xs px-2.5 py-1 rounded border ${view === "table" ? "bg-gray-100 border-gray-300 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
            Table
          </Link>
        </div>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 mb-5">
        <Link href={`?date=${prevDate}&view=${view}`}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          ← Prev
        </Link>
        <span className="font-medium text-sm">{displayDate}</span>
        <Link href={`?date=${nextDate}&view=${view}`}
          className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded border hover:border-gray-400">
          Next →
        </Link>
        <Link href={`?view=${view}`}
          className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
          today
        </Link>
        <span className="text-xs text-gray-400 ml-2">
          {reservations.length} booking{reservations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {view === "calendar" ? (
        <AdminBookingCalendar
          date={date}
          timezone={timezone}
          resources={resourceEntries}
          cancelBooking={adminCancelBooking}
        />
      ) : (
        /* Table view */
        reservations.length === 0 ? (
          <p className="text-sm text-gray-400">No bookings on this day.</p>
        ) : (
          <div className="rounded-md border divide-y">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>Time</span><span>Resource</span><span>Member</span><span></span>
            </div>
            {reservations.map(r => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center px-4 py-3 text-sm">
                <div>
                  <span>{fmtTime(r.startAt, timezone)}</span>
                  <span className="text-gray-400 mx-1">–</span>
                  <span className="text-gray-500">{fmtTime(r.endAt, timezone)}</span>
                  <p className="text-xs text-gray-400">{fmtDateTime(r.startAt, timezone).split(",")[0]}</p>
                </div>
                <Link href={`/portal/book/${r.resource.id}`} className="text-gray-700 hover:underline text-sm">
                  {r.resource.name}
                </Link>
                <Link href={`/admin/members/${r.member.id}`} className="text-gray-700 hover:underline text-sm">
                  {r.member.name}
                </Link>
                <form action={async (formData) => {
                  "use server";
                  const id = formData.get("id") as string;
                  await adminCancelBooking(id);
                  redirect(`/admin/bookings?date=${formData.get("date")}&view=table`);
                }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="date" value={date} />
                  <Button type="submit" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs">
                    Cancel
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
