import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

export default async function RentalsPage() {
  const session = await auth();
  const memberId = session!.user.id;

  const [rentals, availableStudios, availableStorage, pendingRequests] = await Promise.all([
    prisma.rental.findMany({
      where: { memberId, deletedAt: null, endDate: null },
      include: { resource: { select: { name: true, typeTag: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.resource.findMany({
      where: {
        typeTag: { in: ["studio", "studio_unit"] },
        deletedAt: null,
        outOfService: false,
        rentals: { none: { deletedAt: null, endDate: null } },
      },
      select: { id: true, name: true, typeTag: true },
      orderBy: { name: "asc" },
    }),
    prisma.resource.findMany({
      where: {
        typeTag: "storage_unit",
        deletedAt: null,
        outOfService: false,
        rentals: { none: { deletedAt: null, endDate: null } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.rentalRequest.findMany({
      where: { memberId, status: "PENDING" },
      include: { resource: { select: { name: true, typeTag: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  async function requestRental(formData: FormData) {
    "use server";
    const resourceId = formData.get("resourceId") as string;
    if (!resourceId) return;
    // Check the resource is still available
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { rentals: { where: { deletedAt: null, endDate: null } } },
    });
    if (!resource || resource.rentals.length > 0) redirect("/portal/rentals?error=taken");

    await prisma.rentalRequest.create({
      data: {
        memberId,
        resourceId,
        requestType: "START",
        requestedStartDate: new Date(),
      },
    });
    await audit({
      actorId: memberId,
      action: "create", entityType: "RentalRequest", entityId: resourceId,
      before: null, after: { memberId, resourceId, requestType: "START" },
      note: "Member requested rental",
    });
    redirect("/portal/rentals?submitted=1");
  }

  async function requestEnd(formData: FormData) {
    "use server";
    const rentalId = formData.get("rentalId") as string;
    const rental = await prisma.rental.findUnique({
      where: { id: rentalId },
      select: { memberId: true, resourceId: true },
    });
    if (!rental || rental.memberId !== memberId) return;

    await prisma.rentalRequest.create({
      data: { memberId, resourceId: rental.resourceId, requestType: "END", rentalId },
    });
    redirect("/portal/rentals?endrequested=1");
  }

  async function cancelRequest(formData: FormData) {
    "use server";
    const requestId = formData.get("requestId") as string;
    const req = await prisma.rentalRequest.findUnique({ where: { id: requestId } });
    if (!req || req.memberId !== memberId || req.status !== "PENDING") return;
    await prisma.rentalRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", reviewNote: "Cancelled by member" },
    });
    redirect("/portal/rentals");
  }

  const noStudios  = availableStudios.length === 0;
  const noStorage  = availableStorage.length === 0;

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-6">Rentals</h2>

      {/* Active rentals */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Active</h3>
        {rentals.length === 0 ? (
          <p className="text-sm text-gray-400">No active rentals.</p>
        ) : (
          <ul className="border rounded divide-y text-sm">
            {rentals.map(r => (
              <li key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{r.resource.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {r.resource.typeTag === "storage_unit" ? "storage" : "studio"}
                  </span>
                  <div className="text-xs text-gray-400 mt-0.5">
                    ${Number(r.monthlyRate).toFixed(0)}/mo · since {r.startDate.toLocaleDateString()}
                  </div>
                </div>
                <form action={requestEnd}>
                  <input type="hidden" name="rentalId" value={r.id} />
                  <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
                    Request end
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Pending requests</h3>
          <ul className="border rounded divide-y text-sm">
            {pendingRequests.map(r => (
              <li key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${
                    r.requestType === "START" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
                  }`}>{r.requestType}</span>
                  <span>{r.resource.name}</span>
                  <div className="text-xs text-gray-400 mt-0.5">Awaiting staff review</div>
                </div>
                <form action={cancelRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700">
                    Cancel
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Request new rental */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Request a space</h3>

        {/* Studio */}
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Studio</p>
          {noStudios ? (
            <div className="text-sm text-gray-500">
              No studios currently available.{" "}
              <Link href="/portal/waitlist" className="underline">Join the waitlist →</Link>
            </div>
          ) : (
            <form action={requestRental} className="flex gap-2 items-center">
              <select name="resourceId" required className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
                <option value="">Select studio…</option>
                {availableStudios.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm">Request</Button>
            </form>
          )}
        </div>

        {/* Storage */}
        <div>
          <p className="text-sm font-medium mb-2">Storage</p>
          {noStorage ? (
            <div className="text-sm text-gray-500">
              No storage units currently available.{" "}
              <Link href="/portal/waitlist" className="underline">Join the waitlist →</Link>
            </div>
          ) : (
            <form action={requestRental} className="flex gap-2 items-center">
              <select name="resourceId" required className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
                <option value="">Select storage unit…</option>
                {availableStorage.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm">Request</Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
