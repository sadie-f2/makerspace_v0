import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireStaff } from "@/lib/requireStaff";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function WaitlistPage() {
  await requireStaff();
  const session = await auth();

  const [waiting, availableResources, recentlyActioned] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where:   { status: { in: ["WAITING", "OFFERED"] } },
      include: {
        member:          { select: { id: true, name: true, email: true } },
        offeredResource: { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.resource.findMany({
      where: {
        typeTag: { in: ["studio", "studio_unit", "storage_unit"] },
        deletedAt: null,
        rentals: { none: { deletedAt: null, endDate: null } },
      },
      select: { id: true, name: true, typeTag: true },
      orderBy: { name: "asc" },
    }),
    prisma.waitlistEntry.findMany({
      where:   { status: { in: ["ACCEPTED", "WITHDRAWN"] } },
      include: { member: { select: { id: true, name: true } } },
      orderBy: { requestedAt: "desc" },
      take:    10,
    }),
  ]);

  async function offerResource(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/waitlist");
    const entryId    = formData.get("entryId") as string;
    const resourceId = formData.get("resourceId") as string;
    if (!resourceId) return;
    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data:  { status: "OFFERED", offeredResourceId: resourceId, offeredAt: new Date() },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "WaitlistEntry", entityId: entryId,
      before: { status: "WAITING" }, after: { status: "OFFERED", offeredResourceId: resourceId },
      note: "Resource offered to waitlist member",
    });
    redirect("/admin/waitlist");
  }

  async function acceptOffer(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/waitlist");
    // Staff accepts on behalf of member (member portal flow deferred)
    const entryId    = formData.get("entryId") as string;
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: entryId },
      include: { member: true },
    });
    if (!entry || entry.status !== "OFFERED" || !entry.offeredResourceId) return;
    // Create rental with rate TBD (staff will set via member detail)
    const rental = await prisma.rental.create({
      data: {
        memberId:    entry.memberId,
        resourceId:  entry.offeredResourceId,
        startDate:   new Date(),
        monthlyRate: 0, // staff sets actual rate on the rental via member detail
      },
    });
    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data:  { status: "ACCEPTED" },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "create", entityType: "Rental", entityId: rental.id,
      before: null,
      after:  { memberId: entry.memberId, resourceId: entry.offeredResourceId },
      note:   "Created from waitlist offer acceptance",
    });
    redirect("/admin/waitlist");
  }

  async function withdraw(formData: FormData) {
    "use server";
    await requireUnfrozen("/admin/waitlist");
    const entryId = formData.get("entryId") as string;
    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data:  { status: "WITHDRAWN" },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "WaitlistEntry", entityId: entryId,
      before: { status: "WAITING" }, after: { status: "WITHDRAWN" },
    });
    redirect("/admin/waitlist");
  }

  const statusBadge = (status: string) => {
    if (status === "WAITING")  return "bg-amber-100 text-amber-800";
    if (status === "OFFERED")  return "bg-blue-100 text-blue-800";
    if (status === "ACCEPTED") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-600";
  };

  const typeLabel = (typeTag: string) =>
    typeTag === "storage_unit" ? "storage" : "studio";

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-6">Waitlist</h2>

      {waiting.length === 0 ? (
        <p className="text-sm text-gray-400">No one on the waitlist.</p>
      ) : (
        <div className="space-y-3 mb-10">
          {waiting.map((e, i) => (
            <div key={e.id} className="border rounded p-4 text-sm">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className="text-gray-400 text-xs mr-2">#{i + 1}</span>
                  <Link href={`/admin/members/${e.member.id}`} className="font-medium hover:underline">
                    {e.member.name}
                  </Link>
                  <span className="ml-2 text-gray-400 text-xs">{e.member.email}</span>
                  <div className="mt-0.5 text-gray-500 text-xs">
                    Wants: <strong>{e.resourceTypeTag === "storage_unit" ? "storage" : "studio"}</strong>
                    {" · "}requested {e.requestedAt.toLocaleDateString()}
                  </div>
                  {e.note && (
                    <p className="mt-1 text-gray-500 text-xs italic">"{e.note}"</p>
                  )}
                  {e.status === "OFFERED" && e.offeredResource && (
                    <p className="mt-1 text-blue-700 text-xs">
                      Offered: <strong>{e.offeredResource.name}</strong>
                      {e.offeredAt && <> on {e.offeredAt.toLocaleDateString()}</>}
                    </p>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${statusBadge(e.status)}`}>
                  {e.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {e.status === "WAITING" && availableResources.length > 0 && (
                  <form action={offerResource} className="flex gap-2 items-center">
                    <input type="hidden" name="entryId" value={e.id} />
                    <select
                      name="resourceId"
                      required
                      className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      <option value="">Offer resource…</option>
                      {availableResources
                        .filter(r => r.typeTag === e.resourceTypeTag || e.resourceTypeTag.startsWith("studio") && r.typeTag.startsWith("studio"))
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({typeLabel(r.typeTag)})
                          </option>
                        ))}
                    </select>
                    <Button type="submit" size="sm" className="h-7 text-xs">Offer</Button>
                  </form>
                )}
                {e.status === "OFFERED" && (
                  <form action={acceptOffer}>
                    <input type="hidden" name="entryId" value={e.id} />
                    <Button type="submit" size="sm" className="h-7 text-xs">
                      Accept (create rental)
                    </Button>
                  </form>
                )}
                <form action={withdraw}>
                  <input type="hidden" name="entryId" value={e.id} />
                  <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
                    Withdraw
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {recentlyActioned.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Recently closed
          </h3>
          <div className="rounded-md border divide-y text-sm">
            {recentlyActioned.map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <Link href={`/admin/members/${e.member.id}`} className="hover:underline">
                  {e.member.name}
                </Link>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{e.resourceTypeTag === "storage_unit" ? "storage" : "studio"}</span>
                  <span>{e.requestedAt.toLocaleDateString()}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadge(e.status)}`}>
                    {e.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
