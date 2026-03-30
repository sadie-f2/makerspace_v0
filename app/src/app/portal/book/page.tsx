import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import BookingMultiView, { type ResourceEntry } from "@/components/BookingMultiView";
import { createBooking } from "./actions";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayStr();
  const view = viewParam === "calendar" ? "calendar" : "list";

  const session  = await auth();
  const memberId = session?.user.id ?? "";

  const [resources, member, certifications, systemConfig] = await Promise.all([
    prisma.resource.findMany({
      where: { reservable: true, deletedAt: null },
      include: {
        requiresCertClass: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, typeTag: true } },
      },
      orderBy: [{ typeTag: "asc" }, { name: "asc" }],
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      include: { tier: { select: { canBook: true } } },
    }),
    prisma.certification.findMany({
      where: { memberId, revokedAt: null },
      select: { equipmentClassId: true },
    }),
    prisma.systemConfig.findFirst({ select: { timezone: true } }),
  ]);

  const canBook  = member?.tier?.canBook !== false;
  const certIds  = new Set(certifications.map(c => c.equipmentClassId));
  const timezone = systemConfig?.timezone ?? "America/New_York";

  // ── Calendar view ────────────────────────────────────────────────────────

  if (view === "calendar") {
    // Fetch all bookings for the selected day across all reservable resources
    const resourceIds = resources.map(r => r.id);
    const [y, m, d]   = date.split("-").map(Number);
    const dayStart    = new Date(y, m - 1, d,  0,  0,  0);
    const dayEnd      = new Date(y, m - 1, d, 23, 59, 59);

    const allBookings = await prisma.reservation.findMany({
      where: {
        resourceId: { in: resourceIds },
        deletedAt:  null,
        startAt:    { lt: dayEnd },
        endAt:      { gt: dayStart },
      },
      include: { member: { select: { name: true } } },
    });

    // Group bookings by resourceId
    const bookingsByResource = new Map<string, typeof allBookings>();
    for (const b of allBookings) {
      if (!bookingsByResource.has(b.resourceId)) bookingsByResource.set(b.resourceId, []);
      bookingsByResource.get(b.resourceId)!.push(b);
    }

    const resourceEntries: ResourceEntry[] = resources.map(r => ({
      id:           r.id,
      name:         r.name,
      typeTag:      r.typeTag,
      parentId:     r.parentId,
      parentName:   r.parent?.name ?? null,
      certRequired: !!r.requiresCertClassId,
      certOk:       !!r.requiresCertClassId && certIds.has(r.requiresCertClassId),
      certName:     r.requiresCertClass?.name ?? null,
      bookings:     (bookingsByResource.get(r.id) ?? []).map(b => ({
        id:         b.id,
        startAt:    b.startAt.toISOString(),
        endAt:      b.endAt.toISOString(),
        memberName: b.member.name,
      })),
    }));

    return (
      <div className="max-w-full px-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Book a resource</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Link href={`?date=${date}&view=list`}
                className="text-xs px-2.5 py-1 rounded border border-transparent text-gray-400 hover:text-gray-600">
                List
              </Link>
              <Link href={`?date=${date}&view=calendar`}
                className="text-xs px-2.5 py-1 rounded border bg-gray-100 border-gray-300 font-medium">
                Calendar
              </Link>
            </div>
            <Link href="/portal/bookings" className="text-xs text-gray-500 hover:underline">
              My bookings →
            </Link>
          </div>
        </div>

        {!canBook && (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
            Bookings are not included in your current membership tier.
          </div>
        )}

        <BookingMultiView
          date={date}
          timezone={timezone}
          resources={resourceEntries}
          canBook={canBook}
          createBooking={createBooking}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────

  const meetingRooms = resources.filter(r => r.typeTag === "meeting_room");
  const shops        = resources.filter(r => r.typeTag === "shop");
  const tools        = resources.filter(r => r.typeTag === "tool");
  const other        = resources.filter(r => !["meeting_room", "shop", "tool"].includes(r.typeTag));

  const shopGroups  = shops.map(s => ({ shop: s, tools: tools.filter(t => t.parentId === s.id) }));
  const orphanTools = tools.filter(t => !t.parentId || !shops.find(s => s.id === t.parentId));

  function certBadge(r: typeof resources[0]) {
    if (!r.requiresCertClassId) return null;
    return certIds.has(r.requiresCertClassId)
      ? <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">✓ certified</span>
      : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">cert required</span>;
  }

  function ResourceRow({ r, indent = false }: { r: typeof resources[0]; indent?: boolean }) {
    const certBlocked = !!r.requiresCertClassId && !certIds.has(r.requiresCertClassId);
    const blocked     = !canBook || certBlocked;
    return (
      <div className={`flex items-center justify-between py-2 ${indent ? "pl-5 border-l-2 border-gray-100 ml-3" : ""} ${blocked ? "opacity-60" : ""}`}>
        <div>
          <span className="text-sm font-medium">{r.name}</span>
          <div className="mt-0.5 flex gap-1.5 flex-wrap items-center">
            {certBadge(r)}
            {!canBook && <span className="text-xs text-gray-400">not available on your tier</span>}
          </div>
        </div>
        {blocked ? (
          <span className="text-xs text-gray-300 shrink-0 ml-4">unavailable</span>
        ) : (
          <Link
            href={`/portal/book/${r.id}`}
            className="text-xs text-blue-600 hover:underline border border-blue-200 hover:border-blue-400 rounded px-2 py-1 shrink-0 ml-4"
          >
            View calendar →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Book a resource</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Link href={`?view=list`}
              className="text-xs px-2.5 py-1 rounded border bg-gray-100 border-gray-300 font-medium">
              List
            </Link>
            <Link href={`?date=${todayStr()}&view=calendar`}
              className="text-xs px-2.5 py-1 rounded border border-transparent text-gray-400 hover:text-gray-600">
              Calendar
            </Link>
          </div>
          <Link href="/portal/bookings" className="text-xs text-gray-500 hover:underline">
            My bookings →
          </Link>
        </div>
      </div>

      {!canBook && (
        <div className="mb-5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
          Bookings are not included in your current membership tier.
        </div>
      )}

      {meetingRooms.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Meeting Rooms</h3>
          <div className="border rounded-md divide-y px-4">
            {meetingRooms.map(r => <ResourceRow key={r.id} r={r} />)}
          </div>
        </section>
      )}

      {shopGroups.map(({ shop, tools: shopTools }) => (
        <section key={shop.id} className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">{shop.name}</h3>
          <div className="border rounded-md divide-y px-4">
            <ResourceRow r={shop} />
            {shopTools.map(t => <ResourceRow key={t.id} r={t} indent />)}
          </div>
        </section>
      ))}

      {orphanTools.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Tools</h3>
          <div className="border rounded-md divide-y px-4">
            {orphanTools.map(r => <ResourceRow key={r.id} r={r} />)}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Other</h3>
          <div className="border rounded-md divide-y px-4">
            {other.map(r => <ResourceRow key={r.id} r={r} />)}
          </div>
        </section>
      )}

      {resources.length === 0 && (
        <p className="text-sm text-gray-400">No resources are available for booking yet.</p>
      )}
    </div>
  );
}
