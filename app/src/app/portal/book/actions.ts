"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";

export async function createBooking(data: {
  resourceId: string;
  startAt: string;
  endAt: string;
  notes: string;
}): Promise<{ error?: string }> {
  await requireUnfrozen("/portal/book");

  const session = await auth();
  if (!session?.user.id) return { error: "Not authenticated" };
  const memberId = session.user.id;

  const startAt = new Date(data.startAt);
  const endAt   = new Date(data.endAt);

  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return { error: "Invalid time" };
  if (endAt <= startAt) return { error: "End time must be after start time" };
  if (startAt < new Date())  return { error: "Cannot book in the past" };

  const [resource, member] = await Promise.all([
    prisma.resource.findUnique({
      where: { id: data.resourceId, deletedAt: null },
      select: { id: true, name: true, reservable: true, reservationMode: true, requiresCertClassId: true },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      include: { tier: { select: { canBook: true } } },
    }),
  ]);

  if (!resource || !resource.reservable) return { error: "Resource is not reservable" };
  if (member?.tier && !member.tier.canBook) return { error: "Your membership tier does not include bookings" };

  if (resource.requiresCertClassId) {
    const cert = await prisma.certification.findFirst({
      where: { memberId, equipmentClassId: resource.requiresCertClassId, revokedAt: null },
    });
    if (!cert) return { error: "You do not hold the required certification for this resource" };
  }

  if (resource.reservationMode === "EXCLUSIVE") {
    const conflict = await prisma.reservation.findFirst({
      where: {
        resourceId: data.resourceId,
        deletedAt:  null,
        startAt:    { lt: endAt },
        endAt:      { gt: startAt },
      },
    });
    if (conflict) return { error: "This time slot is already booked" };
  }

  const reservation = await prisma.reservation.create({
    data: { resourceId: data.resourceId, memberId, startAt, endAt, notes: data.notes || null },
  });

  await audit({
    actorId: memberId, actorType: "MEMBER", action: "create",
    entityType: "Reservation", entityId: reservation.id,
    after: { resourceId: data.resourceId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), notes: data.notes },
  });

  revalidatePath(`/portal/book/${data.resourceId}`);
  revalidatePath("/portal/book");
  revalidatePath("/portal/bookings");

  return {};
}
