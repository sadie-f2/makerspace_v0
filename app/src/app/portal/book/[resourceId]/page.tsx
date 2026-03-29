import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import BookingDayView, { type SerializedBooking } from "@/components/BookingDayView";
import { createBooking } from "./actions";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BookResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { resourceId } = await params;
  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayStr();

  const session = await auth();
  const memberId = session?.user.id ?? "";

  const [resource, member, systemConfig] = await Promise.all([
    prisma.resource.findUnique({
      where: { id: resourceId, deletedAt: null, reservable: true },
      include: {
        requiresCertClass: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
      },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      include: { tier: { select: { canBook: true } } },
    }),
    prisma.systemConfig.findFirst({ select: { timezone: true } }),
  ]);

  if (!resource) notFound();

  const timezone = systemConfig?.timezone ?? "America/New_York";

  // Day boundaries in UTC (server local — approximate; booking conflict check is exact)
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd   = new Date(`${date}T23:59:59`);

  const rawBookings = await prisma.reservation.findMany({
    where: {
      resourceId,
      deletedAt: null,
      startAt: { lt: dayEnd },
      endAt:   { gt: dayStart },
    },
    include: { member: { select: { name: true } } },
    orderBy: { startAt: "asc" },
  });

  const bookings: SerializedBooking[] = rawBookings.map(b => ({
    id:         b.id,
    startAt:    b.startAt.toISOString(),
    endAt:      b.endAt.toISOString(),
    memberName: b.member.name,
    memberId:   b.memberId,
  }));

  // Determine if member can book
  let canBook = true;
  let blockReason: string | undefined;

  if (member?.tier && !member.tier.canBook) {
    canBook = false;
    blockReason = "Your membership tier does not include bookings.";
  } else if (resource.requiresCertClassId) {
    const cert = await prisma.certification.findFirst({
      where: { memberId, equipmentClassId: resource.requiresCertClassId, revokedAt: null },
    });
    if (!cert) {
      canBook = false;
      blockReason = `This resource requires ${resource.requiresCertClass?.name ?? "a certification"} certification. Contact staff to get certified.`;
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <Link href="/portal/book" className="hover:underline">Browse resources</Link>
          <span>›</span>
          {resource.parent && (
            <>
              <span>{resource.parent.name}</span>
              <span>›</span>
            </>
          )}
        </div>
        <h2 className="text-lg font-semibold">{resource.name}</h2>
        {resource.requiresCertClass && (
          <p className="text-xs text-gray-500 mt-0.5">
            Requires: {resource.requiresCertClass.name} certification
            {canBook && <span className="ml-1 text-green-600">✓ you are certified</span>}
          </p>
        )}
      </div>

      <BookingDayView
        resourceId={resourceId}
        date={date}
        timezone={timezone}
        bookings={bookings}
        canBook={canBook}
        blockReason={blockReason}
        createBooking={createBooking}
      />
    </div>
  );
}
