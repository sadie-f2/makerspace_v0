import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function RentalRequestsPage() {
  const session = await auth();

  const [pending, recent] = await Promise.all([
    prisma.rentalRequest.findMany({
      where:   { status: "PENDING" },
      include: {
        member:   { select: { id: true, name: true, email: true } },
        resource: { select: { id: true, name: true, typeTag: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rentalRequest.findMany({
      where:   { status: { in: ["APPROVED", "REJECTED"] } },
      include: {
        member:     { select: { id: true, name: true } },
        resource:   { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take:    20,
    }),
  ]);

  async function approve(formData: FormData) {
    "use server";
    const requestId = formData.get("requestId") as string;
    const reviewNote = (formData.get("reviewNote") as string).trim() || null;

    const req = await prisma.rentalRequest.findUnique({
      where: { id: requestId },
      include: { resource: true },
    });
    if (!req || req.status !== "PENDING") return;

    if (req.requestType === "START") {
      // Create the rental
      const startDate   = req.requestedStartDate ?? new Date();
      const monthlyRate = req.requestedMonthlyRate ?? 0;
      const rental = await prisma.rental.create({
        data: { memberId: req.memberId, resourceId: req.resourceId, startDate, monthlyRate },
      });
      await prisma.rentalRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedById: session?.user.id,
          reviewedAt: new Date(),
          reviewNote,
          rentalId: rental.id,
        },
      });
      await audit({
        actorId: session?.user.id ?? null,
        action: "create", entityType: "Rental", entityId: rental.id,
        before: null,
        after: { memberId: req.memberId, resourceId: req.resourceId, startDate, monthlyRate },
        note: "Created via rental request approval",
      });
    } else {
      // END — close the active rental for this resource + member
      const rental = await prisma.rental.findFirst({
        where: { memberId: req.memberId, resourceId: req.resourceId, deletedAt: null, endDate: null },
      });
      if (rental) {
        await prisma.rental.update({ where: { id: rental.id }, data: { endDate: new Date() } });
        await audit({
          actorId: session?.user.id ?? null,
          action: "update", entityType: "Rental", entityId: rental.id,
          before: { endDate: null }, after: { endDate: new Date() },
          note: "Ended via rental request approval",
        });
      }
      await prisma.rentalRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedById: session?.user.id,
          reviewedAt: new Date(),
          reviewNote,
          rentalId: rental?.id,
        },
      });
    }
    redirect("/admin/rental-requests");
  }

  async function reject(formData: FormData) {
    "use server";
    const requestId  = formData.get("requestId") as string;
    const reviewNote = (formData.get("reviewNote") as string).trim() || null;
    await prisma.rentalRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedById: session?.user.id,
        reviewedAt: new Date(),
        reviewNote,
      },
    });
    redirect("/admin/rental-requests");
  }

  const badge = (status: string) => {
    if (status === "PENDING")  return "bg-amber-100 text-amber-800";
    if (status === "APPROVED") return "bg-green-100 text-green-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-6">Rental Requests</h2>

      {/* ── Pending ── */}
      <section className="mb-10">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No pending requests.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="border rounded p-4 text-sm">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <Link href={`/admin/members/${r.member.id}`} className="font-medium hover:underline">
                      {r.member.name}
                    </Link>
                    <span className="ml-2 text-gray-400 text-xs">{r.member.email}</span>
                    <div className="text-gray-600 mt-0.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${
                        r.requestType === "START" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
                      }`}>
                        {r.requestType}
                      </span>
                      <Link href={`/admin/resources`} className="hover:underline">
                        {r.resource.name}
                      </Link>
                      <span className="ml-1 text-gray-400">({r.resource.typeTag})</span>
                    </div>
                    {r.requestType === "START" && (
                      <div className="text-gray-500 text-xs mt-1">
                        {r.requestedStartDate && <>Start: {new Date(r.requestedStartDate).toLocaleDateString()} · </>}
                        {r.requestedMonthlyRate && <>Rate: ${Number(r.requestedMonthlyRate).toFixed(0)}/mo</>}
                      </div>
                    )}
                    <div className="text-gray-400 text-xs mt-0.5">
                      Requested {r.createdAt.toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-end">
                  <form action={approve} className="flex gap-2 items-end">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Input name="reviewNote" placeholder="Note (optional)" className="h-7 text-xs w-48" />
                    <Button type="submit" size="sm" className="h-7 text-xs">Approve</Button>
                  </form>
                  <form action={reject} className="flex gap-2 items-end">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Input name="reviewNote" placeholder="Reason (optional)" className="h-7 text-xs w-48" />
                    <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">Reject</Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent decisions ── */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Recent decisions
        </h3>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">None yet.</p>
        ) : (
          <div className="rounded-md border divide-y text-sm">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 gap-4">
                <div className="min-w-0">
                  <Link href={`/admin/members/${r.member.id}`} className="font-medium hover:underline">
                    {r.member.name}
                  </Link>
                  <span className="mx-1 text-gray-400">·</span>
                  <span className="text-gray-600">{r.resource.name}</span>
                  {r.reviewNote && (
                    <span className="ml-2 text-gray-400 text-xs truncate">"{r.reviewNote}"</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400">
                  <span>{r.reviewedBy?.name ?? "—"}</span>
                  <span>{r.reviewedAt?.toLocaleDateString()}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${badge(r.status)}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
