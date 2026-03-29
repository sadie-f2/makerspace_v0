import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function BookPage() {
  const session  = await auth();
  const memberId = session?.user.id ?? "";

  const [resources, member, certifications] = await Promise.all([
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
  ]);

  const canBook = member?.tier?.canBook !== false;
  const certIds = new Set(certifications.map(c => c.equipmentClassId));

  const meetingRooms = resources.filter(r => r.typeTag === "meeting_room");
  const shops        = resources.filter(r => r.typeTag === "shop");
  const tools        = resources.filter(r => r.typeTag === "tool");
  const other        = resources.filter(r => !["meeting_room", "shop", "tool"].includes(r.typeTag));

  // Group tools under their parent shop
  const shopGroups = shops.map(s => ({
    shop:  s,
    tools: tools.filter(t => t.parentId === s.id),
  }));
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
        <Link href="/portal/bookings" className="text-xs text-gray-500 hover:underline">
          My bookings →
        </Link>
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
            {/* The shop itself (whole-space booking) */}
            <ResourceRow r={shop} />
            {/* Tools in this shop, indented */}
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
