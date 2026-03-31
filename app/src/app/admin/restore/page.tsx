import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";

export default async function RestorePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/admin");

  const { error } = await searchParams;

  const [members, resources, rentals, equipmentClasses, reservations] = await Promise.all([
    prisma.member.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, email: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.resource.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, typeTag: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.rental.findMany({
      where: { deletedAt: { not: null } },
      include: {
        member:   { select: { name: true } },
        resource: { select: { name: true } },
      },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.equipmentClass.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.reservation.findMany({
      where: { deletedAt: { not: null } },
      include: {
        member:   { select: { name: true } },
        resource: { select: { name: true } },
      },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  const total =
    members.length + resources.length + rentals.length +
    equipmentClasses.length + reservations.length;

  // ── Server actions ──────────────────────────────────────────────────────────

  async function restoreMember(formData: FormData) {
    "use server";
    const s = await auth();
    if (s?.user?.role !== "ADMIN") return;
    const id = formData.get("id") as string;
    try {
      await prisma.member.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      await audit({ actorId: s.user.id, action: "restore", entityType: "Member", entityId: id, note: "Restored from trash" });
    } catch {
      redirect(`/admin/restore?error=${encodeURIComponent("Failed to restore member")}`);
    }
    redirect("/admin/restore");
  }

  async function restoreResource(formData: FormData) {
    "use server";
    const s = await auth();
    if (s?.user?.role !== "ADMIN") return;
    const id = formData.get("id") as string;
    try {
      await prisma.resource.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      await audit({ actorId: s.user.id, action: "restore", entityType: "Resource", entityId: id, note: "Restored from trash" });
    } catch {
      redirect(`/admin/restore?error=${encodeURIComponent("Failed to restore resource")}`);
    }
    redirect("/admin/restore");
  }

  async function restoreRental(formData: FormData) {
    "use server";
    const s = await auth();
    if (s?.user?.role !== "ADMIN") return;
    const id = formData.get("id") as string;
    try {
      await prisma.rental.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      await audit({ actorId: s.user.id, action: "restore", entityType: "Rental", entityId: id, note: "Restored from trash" });
    } catch {
      redirect(`/admin/restore?error=${encodeURIComponent("Failed to restore rental")}`);
    }
    redirect("/admin/restore");
  }

  async function restoreEquipmentClass(formData: FormData) {
    "use server";
    const s = await auth();
    if (s?.user?.role !== "ADMIN") return;
    const id = formData.get("id") as string;
    try {
      await prisma.equipmentClass.update({ where: { id }, data: { deletedAt: null } });
      await audit({ actorId: s.user.id, action: "restore", entityType: "EquipmentClass", entityId: id, note: "Restored from trash" });
    } catch {
      redirect(`/admin/restore?error=${encodeURIComponent("Failed to restore equipment class")}`);
    }
    redirect("/admin/restore");
  }

  async function restoreReservation(formData: FormData) {
    "use server";
    const s = await auth();
    if (s?.user?.role !== "ADMIN") return;
    const id = formData.get("id") as string;
    try {
      await prisma.reservation.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      await audit({ actorId: s.user.id, action: "restore", entityType: "Reservation", entityId: id, note: "Restored from trash" });
    } catch {
      redirect(`/admin/restore?error=${encodeURIComponent("Failed to restore reservation")}`);
    }
    redirect("/admin/restore");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function RestoreButton({ id, action }: { id: string; action: (fd: FormData) => Promise<void> }) {
    return (
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300 hover:bg-green-50">
          Restore
        </Button>
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Restore Deleted Records</h2>
        <span className="text-sm text-gray-400">{total} soft-deleted record{total !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        Records below were soft-deleted and remain in the database. Restoring them makes them
        active again. Each restore is audit-logged.{" "}
        <Link href="/admin/audit?entity=Member" className="underline hover:text-gray-700">View audit log</Link>
      </p>

      {total === 0 && (
        <div className="rounded-md border px-6 py-8 text-center text-gray-400 text-sm">
          No soft-deleted records found.
        </div>
      )}

      {/* Members */}
      {members.length > 0 && (
        <Section title="Members" count={members.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{m.name}</td>
                  <td className="px-4 py-2 text-gray-500">{m.email}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{m.deletedAt!.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RestoreButton id={m.id} action={restoreMember} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Resources */}
      {resources.length > 0 && (
        <Section title="Resources" count={resources.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {resources.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.typeTag}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{r.deletedAt!.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RestoreButton id={r.id} action={restoreResource} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Rentals */}
      {rentals.length > 0 && (
        <Section title="Rentals" count={rentals.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Resource</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rentals.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.member.name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.resource.name}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{r.deletedAt!.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RestoreButton id={r.id} action={restoreRental} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Equipment Classes */}
      {equipmentClasses.length > 0 && (
        <Section title="Equipment Classes" count={equipmentClasses.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {equipmentClasses.map(ec => (
                <tr key={ec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{ec.name}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{ec.deletedAt!.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RestoreButton id={ec.id} action={restoreEquipmentClass} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Reservations */}
      {reservations.length > 0 && (
        <Section title="Reservations (cancelled bookings)" count={reservations.length}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Resource</th>
                <th className="px-4 py-2">Start</th>
                <th className="px-4 py-2">Deleted</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reservations.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.member.name}</td>
                  <td className="px-4 py-2 text-gray-500">{r.resource.name}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.startAt.toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{r.deletedAt!.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <RestoreButton id={r.id} action={restoreReservation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        {title} <span className="font-normal text-gray-400">({count})</span>
      </h3>
      <div className="rounded-md border overflow-hidden">{children}</div>
    </div>
  );
}
