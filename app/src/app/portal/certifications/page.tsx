import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = await auth();
  const memberId = session!.user.id;
  const query = searchParams.q?.trim() ?? "";

  const [myCerts, allMembers] = await Promise.all([
    // Current member's own certs
    prisma.certification.findMany({
      where: { memberId, revokedAt: null },
      include: { equipmentClass: { select: { id: true, name: true } } },
      orderBy: { grantedAt: "desc" },
    }),
    // All members with at least one active cert (for directory)
    prisma.member.findMany({
      where: {
        deletedAt: null,
        certifications: { some: { revokedAt: null } },
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { certifications: { some: { revokedAt: null, equipmentClass: { name: { contains: query, mode: "insensitive" } } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        certifications: {
          where: { revokedAt: null },
          include: { equipmentClass: { select: { name: true } } },
          orderBy: { grantedAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-6">Certifications</h2>

      {/* My certs */}
      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Your certifications ({myCerts.length})
        </h3>
        {myCerts.length === 0 ? (
          <p className="text-sm text-gray-400">No certifications yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myCerts.map(c => (
              <span key={c.id} className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-800 rounded text-sm">
                {c.equipmentClass.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Member directory */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Member directory</h3>
        <form className="mb-4">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or certification…"
            className="border rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </form>
        {allMembers.length === 0 ? (
          <p className="text-sm text-gray-400">No results.</p>
        ) : (
          <div className="space-y-3">
            {allMembers.map(m => (
              <div key={m.id} className="border rounded p-3 text-sm">
                <p className="font-medium mb-1.5">{m.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.certifications.map(c => (
                    <span key={c.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                      {c.equipmentClass.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
