import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

export default async function WaitlistPage() {
  const session = await auth();
  const memberId = session!.user.id;

  const entries = await prisma.waitlistEntry.findMany({
    where: { memberId },
    include: { offeredResource: { select: { name: true } } },
    orderBy: { requestedAt: "desc" },
  });

  const activeEntries = entries.filter(e => ["WAITING", "OFFERED"].includes(e.status));
  const closedEntries = entries.filter(e => ["ACCEPTED", "WITHDRAWN"].includes(e.status));

  // Which types the member is already waiting for (prevent duplicates)
  const waitingTypes = new Set(activeEntries.map(e => e.resourceTypeTag));

  async function joinWaitlist(formData: FormData) {
    "use server";
    const resourceTypeTag = formData.get("resourceTypeTag") as string;
    const note = (formData.get("note") as string ?? "").trim() || null;
    if (!resourceTypeTag) return;
    // No duplicate active entries
    const existing = await prisma.waitlistEntry.findFirst({
      where: { memberId, resourceTypeTag, status: { in: ["WAITING", "OFFERED"] } },
    });
    if (existing) return;

    const entry = await prisma.waitlistEntry.create({
      data: { memberId, resourceTypeTag, note },
    });
    await audit({
      actorId: memberId,
      action: "create", entityType: "WaitlistEntry", entityId: entry.id,
      before: null, after: { memberId, resourceTypeTag, note },
    });
    redirect("/portal/waitlist");
  }

  async function withdraw(formData: FormData) {
    "use server";
    const entryId = formData.get("entryId") as string;
    const entry = await prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.memberId !== memberId) return;
    await prisma.waitlistEntry.update({
      where: { id: entryId },
      data: { status: "WITHDRAWN" },
    });
    await audit({
      actorId: memberId,
      action: "update", entityType: "WaitlistEntry", entityId: entryId,
      before: { status: entry.status }, after: { status: "WITHDRAWN" },
      note: "Withdrawn by member",
    });
    redirect("/portal/waitlist");
  }

  const statusBadge = (status: string) => {
    if (status === "WAITING")  return "bg-amber-100 text-amber-800";
    if (status === "OFFERED")  return "bg-blue-100 text-blue-800";
    if (status === "ACCEPTED") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-500";
  };

  const typeLabel = (t: string) => t === "storage_unit" ? "Storage unit" : "Studio";

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-6">Waitlist</h2>

      {/* Active entries */}
      {activeEntries.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Your requests</h3>
          <div className="space-y-3">
            {activeEntries.map(e => (
              <div key={e.id} className="border rounded p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium">{typeLabel(e.resourceTypeTag)}</span>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Requested {e.requestedAt.toLocaleDateString()}
                    </div>
                    {e.note && (
                      <p className="text-xs text-gray-500 italic mt-1">"{e.note}"</p>
                    )}
                    {e.status === "OFFERED" && e.offeredResource && (
                      <p className="text-xs text-blue-700 mt-1">
                        Staff has offered: <strong>{e.offeredResource.name}</strong>
                        {e.offeredAt && <> on {e.offeredAt.toLocaleDateString()}</>}
                        {" "}— contact staff to accept.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusBadge(e.status)}`}>
                      {e.status}
                    </span>
                    <form action={withdraw}>
                      <input type="hidden" name="entryId" value={e.id} />
                      <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
                        Withdraw
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Join waitlist */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Join waitlist</h3>
        <div className="space-y-4">
          {(["studio_unit", "storage_unit"] as const).map(typeTag => (
            <div key={typeTag}>
              {waitingTypes.has(typeTag) ? (
                <p className="text-sm text-gray-400">
                  You are already on the {typeLabel(typeTag).toLowerCase()} waitlist.
                </p>
              ) : (
                <form action={joinWaitlist} className="space-y-2">
                  <input type="hidden" name="resourceTypeTag" value={typeTag} />
                  <p className="text-sm font-medium">{typeLabel(typeTag)}</p>
                  <div className="flex gap-2 items-center">
                    <input
                      name="note"
                      placeholder="Note (optional — size preference, etc.)"
                      className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 flex-1"
                    />
                    <Button type="submit" size="sm">Join</Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      {closedEntries.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">History</h3>
          <ul className="border rounded divide-y text-sm">
            {closedEntries.map(e => (
              <li key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                <span>{typeLabel(e.resourceTypeTag)}</span>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{e.requestedAt.toLocaleDateString()}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${statusBadge(e.status)}`}>
                    {e.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
