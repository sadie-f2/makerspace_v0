import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function PortalPage() {
  const session = await auth();
  const memberId = session!.user.id;

  const [member, rentals, certs, waitlistEntries] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { name: true, email: true, tier: { select: { name: true, monthlyRate: true } } },
    }),
    prisma.rental.findMany({
      where: { memberId, deletedAt: null, endDate: null },
      include: { resource: { select: { name: true, typeTag: true } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.certification.findMany({
      where: { memberId, revokedAt: null },
      include: { equipmentClass: { select: { name: true } } },
      orderBy: { grantedAt: "desc" },
      take: 5,
    }),
    prisma.waitlistEntry.findMany({
      where: { memberId, status: { in: ["WAITING", "OFFERED"] } },
      orderBy: { requestedAt: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">Welcome, {member?.name}</h2>
      {member?.tier ? (
        <p className="text-sm text-gray-500 mb-6">
          {member.tier.name} — ${Number(member.tier.monthlyRate).toFixed(0)}/mo
        </p>
      ) : (
        <p className="text-sm text-gray-400 mb-6">No membership tier assigned.</p>
      )}

      {/* Active rentals */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Active Rentals</h3>
          <Link href="/portal/rentals" className="text-xs text-gray-400 hover:underline">View all →</Link>
        </div>
        {rentals.length === 0 ? (
          <p className="text-sm text-gray-400">No active rentals.{" "}
            <Link href="/portal/rentals" className="underline">Request a space</Link>
          </p>
        ) : (
          <ul className="border rounded divide-y text-sm">
            {rentals.map(r => (
              <li key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium">{r.resource.name}</span>
                <span className="text-xs text-gray-400">
                  {r.resource.typeTag === "storage_unit" ? "storage" : "studio"} ·
                  ${Number(r.monthlyRate).toFixed(0)}/mo
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Waitlist */}
      {waitlistEntries.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Waitlist</h3>
            <Link href="/portal/waitlist" className="text-xs text-gray-400 hover:underline">Manage →</Link>
          </div>
          <ul className="border rounded divide-y text-sm">
            {waitlistEntries.map(e => (
              <li key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                <span>{e.resourceTypeTag === "storage_unit" ? "Storage unit" : "Studio"}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  e.status === "OFFERED" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                }`}>{e.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent certs */}
      {certs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Certifications</h3>
            <Link href="/portal/certifications" className="text-xs text-gray-400 hover:underline">View all →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {certs.map(c => (
              <span key={c.id} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                {c.equipmentClass.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
