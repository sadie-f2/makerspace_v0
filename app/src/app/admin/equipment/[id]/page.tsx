import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { requireUnfrozen } from "@/lib/freeze";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function EquipmentClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const [ec, allMembers] = await Promise.all([
    prisma.equipmentClass.findUnique({
      where: { id, deletedAt: null },
      include: {
        certifications: {
          include: { member: { select: { id: true, name: true, email: true } } },
          orderBy: { grantedAt: "desc" },
        },
        resources: { where: { deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.member.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!ec) notFound();

  const certifiedIds = new Set(ec.certifications.filter(c => !c.revokedAt).map(c => c.memberId));
  const uncertified = allMembers.filter(m => !certifiedIds.has(m.id));

  async function grantCert(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/equipment/${id}`);
    const memberId = formData.get("memberId") as string;
    const grantedById = session!.user.id;
    const existing = await prisma.certification.findUnique({
      where: { memberId_equipmentClassId: { memberId, equipmentClassId: id } },
    });
    const cert = await prisma.certification.upsert({
      where: { memberId_equipmentClassId: { memberId, equipmentClassId: id } },
      update: { revokedAt: null, revokedById: null, grantedAt: new Date(), grantedById },
      create: { memberId, equipmentClassId: id, grantedById },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: existing ? "restore" : "create",
      entityType: "Certification",
      entityId: cert.id,
      before: existing ? { revokedAt: existing.revokedAt } : null,
      after: { memberId, equipmentClassId: id, revokedAt: null },
    });
    redirect(`/admin/equipment/${id}`);
  }

  async function revokeCert(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/equipment/${id}`);
    const certId = formData.get("certId") as string;
    const revokedAt = new Date();
    await prisma.certification.update({
      where: { id: certId },
      data: { revokedAt, revokedById: session!.user.id },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update",
      entityType: "Certification",
      entityId: certId,
      before: { revokedAt: null },
      after: { revokedAt },
    });
    redirect(`/admin/equipment/${id}`);
  }

  const active = ec.certifications.filter(c => !c.revokedAt);

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/admin/equipment" className="text-sm text-gray-500 hover:underline">
          ← Equipment
        </Link>
      </div>
      <h2 className="text-lg font-semibold mb-1">{ec.name}</h2>
      {ec.description && <p className="text-sm text-gray-500 mb-4">{ec.description}</p>}

      {ec.resources.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {ec.resources.map(r => <Badge key={r.name} variant="outline">{r.name}</Badge>)}
        </div>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Certified Members ({active.length})
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-gray-400 text-center py-6">
                  No certified members.
                </TableCell>
              </TableRow>
            )}
            {active.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/admin/members/${c.member.id}`} className="hover:underline">
                    {c.member.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {c.grantedAt.toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <form action={revokeCert}>
                    <input type="hidden" name="certId" value={c.id} />
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                      Revoke
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Grant Certification
        </h3>
        <form action={grantCert} className="flex gap-3">
          <select
            name="memberId"
            required
            className="border rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">Select member…</option>
            {uncertified.map(m => (
              <option key={m.id} value={m.id}>{m.name} — {m.email}</option>
            ))}
          </select>
          <Button size="sm" type="submit">Grant</Button>
        </form>
      </section>
    </div>
  );
}
