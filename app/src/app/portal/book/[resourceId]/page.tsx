import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import BookingDayView, { type SerializedBooking } from "@/components/BookingDayView";
import { createBooking } from "../actions";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BookResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<{ date?: string; time?: string }>;
}) {
  const { resourceId } = await params;
  const { date: dateParam, time: timeParam } = await searchParams;
  const date        = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : todayStr();
  const initialTime = /^\d{2}:\d{2}$/.test(timeParam ?? "")        ? timeParam  : undefined;

  const session  = await auth();
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

  // Siblings — other reservable resources in the same shop
  const siblings = resource.parentId
    ? await prisma.resource.findMany({
        where: { parentId: resource.parentId, deletedAt: null, reservable: true, id: { not: resourceId } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Day boundaries
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d,  0,  0,  0);
  const dayEnd   = new Date(y, m - 1, d, 23, 59, 59);

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

  // Eligibility check
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 flex-wrap">
        <Link href="/portal/book" className="hover:underline">Browse</Link>
        {resource.parent && (
          <>
            <span>›</span>
            <span>{resource.parent.name}</span>
          </>
        )}
      </div>

      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold">{resource.name}</h2>
      </div>

      {resource.requiresCertClass && (
        <p className="text-xs text-gray-500 mb-1">
          Requires: {resource.requiresCertClass.name} certification
          {canBook && <span className="ml-1 text-green-600">✓ you are certified</span>}
        </p>
      )}

      {/* Siblings + calendar link */}
      <div className="flex items-center gap-2 flex-wrap mb-4 mt-2">
        {siblings.length > 0 && (
          <>
            <span className="text-xs text-gray-400">Also in {resource.parent?.name}:</span>
            {siblings.map(s => (
              <Link key={s.id} href={`/portal/book/${s.id}?date=${date}`}
                className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-1.5 py-0.5">
                {s.name}
              </Link>
            ))}
            <span className="text-gray-200">|</span>
          </>
        )}
        <Link href={`/portal/book?date=${date}&view=calendar`}
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
          ← All resources calendar
        </Link>
      </div>

      <BookingDayView
        resourceId={resourceId}
        date={date}
        timezone={timezone}
        bookings={bookings}
        canBook={canBook}
        blockReason={blockReason}
        initialTime={initialTime}
        createBooking={createBooking}
      />
    </div>
  );
}
