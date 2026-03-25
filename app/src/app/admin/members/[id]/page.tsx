import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const [member, tiers, allEquipmentClasses] = await Promise.all([
    prisma.member.findUnique({
      where: { id, deletedAt: null },
      include: {
        tier: true,
        certifications: {
          include: { equipmentClass: { select: { id: true, name: true } } },
          orderBy: { grantedAt: "desc" },
        },
        leases: {
          where: { deletedAt: null, endDate: null },
          include: { resource: { select: { name: true, typeTag: true } } },
        },
      },
    }),
    prisma.memberTier.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.equipmentClass.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!member) notFound();

  const activeCerts = member.certifications.filter(c => !c.revokedAt);
  const certifiedClassIds = new Set(activeCerts.map(c => c.equipmentClass.id));
  const uncertifiedClasses = allEquipmentClasses.filter(ec => !certifiedClassIds.has(ec.id));

  async function assignTier(formData: FormData) {
    "use server";
    const tierId = formData.get("tierId") as string | null;
    await prisma.member.update({
      where: { id },
      data: { tierId: tierId || null },
    });
    redirect(`/admin/members/${id}`);
  }

  async function grantCert(formData: FormData) {
    "use server";
    const equipmentClassId = formData.get("equipmentClassId") as string;
    const grantedById = session!.user.id;
    await prisma.certification.upsert({
      where: { memberId_equipmentClassId: { memberId: id, equipmentClassId } },
      update: { revokedAt: null, revokedById: null, grantedAt: new Date(), grantedById },
      create: { memberId: id, equipmentClassId, grantedById },
    });
    redirect(`/admin/members/${id}`);
  }

  async function revokeCert(formData: FormData) {
    "use server";
    const certId = formData.get("certId") as string;
    await prisma.certification.update({
      where: { id: certId },
      data: { revokedAt: new Date(), revokedById: session!.user.id },
    });
    redirect(`/admin/members/${id}`);
  }

  const fields: [string, React.ReactNode][] = [
    ["Email", member.email],
    ["Phone", member.phone ?? <span className="text-gray-400">—</span>],
    ["Emergency contact", member.emergencyContact ?? <span className="text-gray-400">—</span>],
    ["Role", member.role],
    ["Joined", member.createdAt.toLocaleDateString()],
  ];

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/admin/members" className="text-sm text-gray-500 hover:underline">
          ← Members
        </Link>
      </div>

      <h2 className="text-lg font-semibold mb-6">{member.name}</h2>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Profile</h3>
        <dl className="divide-y border rounded">
          {fields.map(([label, value]) => (
            <div key={label} className="flex px-4 py-2.5 text-sm">
              <dt className="w-44 text-gray-500 shrink-0">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Membership Tier
        </h3>
        <form action={assignTier} className="flex items-center gap-3">
          <select
            name="tierId"
            defaultValue={member.tierId ?? ""}
            className="border rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">— No tier —</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — ${Number(t.monthlyRate).toFixed(0)}/mo
              </option>
            ))}
          </select>
          <Button size="sm" type="submit">Save</Button>
        </form>
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Active Leases
        </h3>
        {member.leases.length === 0 ? (
          <p className="text-sm text-gray-400">No active leases.</p>
        ) : (
          <ul className="text-sm border rounded divide-y">
            {member.leases.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
                <span>{l.resource.name}</span>
                <span className="text-gray-500">
                  ${Number(l.monthlyRate).toFixed(0)}/mo · since {l.startDate.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Certifications ({activeCerts.length})
        </h3>
        {activeCerts.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">No active certifications.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {activeCerts.map((c) => (
              <form key={c.id} action={revokeCert} className="inline-flex items-center">
                <input type="hidden" name="certId" value={c.id} />
                <Badge variant="secondary" className="pr-1 gap-1">
                  <Link href={`/admin/equipment/${c.equipmentClass.id}`} className="hover:underline">
                    {c.equipmentClass.name}
                  </Link>
                  <button
                    type="submit"
                    className="ml-1 text-gray-400 hover:text-red-600 leading-none"
                    title="Revoke"
                  >
                    ×
                  </button>
                </Badge>
              </form>
            ))}
          </div>
        )}
        {uncertifiedClasses.length > 0 && (
          <form action={grantCert} className="flex gap-2 items-center">
            <select
              name="equipmentClassId"
              required
              className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">Grant certification…</option>
              {uncertifiedClasses.map(ec => (
                <option key={ec.id} value={ec.id}>{ec.name}</option>
              ))}
            </select>
            <Button size="sm" type="submit">Grant</Button>
          </form>
        )}
      </section>
    </div>
  );
}
