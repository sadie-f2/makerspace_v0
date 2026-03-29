import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";

function fmtDateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(d);
}

export default async function MyBookingsPage() {
  const session = await auth();
  const memberId = session?.user.id ?? "";

  const now = new Date();
  const past60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [upcoming, past, systemConfig] = await Promise.all([
    prisma.reservation.findMany({
      where: { memberId, deletedAt: null, startAt: { gte: now } },
      include: { resource: { select: { id: true, name: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.reservation.findMany({
      where: { memberId, deletedAt: null, endAt: { lt: now, gte: past60 } },
      include: { resource: { select: { id: true, name: true } } },
      orderBy: { startAt: "desc" },
      take: 50,
    }),
    prisma.systemConfig.findFirst({ select: { timezone: true } }),
  ]);

  const timezone = systemConfig?.timezone ?? "America/New_York";

  async function cancelBooking(formData: FormData) {
    "use server";
    await requireUnfrozen("/portal/bookings");
    const id = formData.get("id") as string;
    const session = await auth();
    if (!session?.user.id) redirect("/portal/bookings");

    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation || reservation.memberId !== session.user.id) redirect("/portal/bookings");
    if (reservation.startAt < new Date()) redirect("/portal/bookings?error=past");

    await prisma.reservation.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedById: session.user.id },
    });
    await audit({
      actorId: session.user.id, actorType: "MEMBER", action: "delete",
      entityType: "Reservation", entityId: id,
      before: { startAt: reservation.startAt, endAt: reservation.endAt, resourceId: reservation.resourceId },
      after:  null,
      note:   "Member cancelled booking",
    });
    redirect("/portal/bookings");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">My Bookings</h2>
        <Link href="/portal/book">
          <Button size="sm">+ Make a booking</Button>
        </Link>
      </div>

      {/* Upcoming */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400">
            No upcoming bookings.{" "}
            <Link href="/portal/book" className="underline text-gray-500">Browse resources →</Link>
          </p>
        ) : (
          <div className="rounded-md border divide-y">
            {upcoming.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link href={`/portal/book/${r.resource.id}`} className="font-medium hover:underline">
                    {r.resource.name}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtDateTime(r.startAt, timezone)} – {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone,
                    }).format(r.endAt)}
                  </p>
                  {r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</p>}
                </div>
                <form action={cancelBooking} className="ml-4 shrink-0">
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs">
                    Cancel
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <details>
          <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800 mb-3">
            Past bookings (last 60 days, {past.length})
          </summary>
          <div className="rounded-md border divide-y mt-3">
            {past.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm text-gray-500">
                <div>
                  <span className="font-medium text-gray-700">{r.resource.name}</span>
                  <p className="text-xs mt-0.5">
                    {fmtDateTime(r.startAt, timezone)} – {new Intl.DateTimeFormat("en-US", {
                      hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone,
                    }).format(r.endAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
