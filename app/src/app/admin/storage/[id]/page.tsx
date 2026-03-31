import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireStaff } from "@/lib/requireStaff";
import { requireUnfrozen } from "@/lib/freeze";
import { audit } from "@/lib/audit";
import { payment } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function StorageUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireStaff();
  const session = await auth();
  const { id } = await params;
  const { error, success } = await searchParams;

  // Resolve storage type slugs for the typeLabel lookup
  const storageParent = await prisma.spaceTypeConfig.findUnique({ where: { slug: "storage_unit" } });
  const typeConfigs = storageParent
    ? await prisma.spaceTypeConfig.findMany({
        where: { OR: [{ id: storageParent.id }, { parentId: storageParent.id }] },
        select: { slug: true, label: true, defaultMonthlyRate: true },
      })
    : [];
  const typeLabel: Record<string, string> = Object.fromEntries(typeConfigs.map(t => [t.slug, t.label]));
  const typeDefaultRate: Record<string, string | null> = Object.fromEntries(
    typeConfigs.map(t => [t.slug, t.defaultMonthlyRate?.toString() ?? null]),
  );

  const resource = await prisma.resource.findUnique({
    where: { id, deletedAt: null },
    include: {
      spaces: {
        select: { id: true, externalId: true, bayCode: true, shelfLevel: true, blockType: true },
        take: 1,
      },
      rentals: {
        where: { deletedAt: null, endDate: null },
        include: { member: { select: { id: true, name: true, email: true } } },
        take: 1,
      },
    },
  });

  if (!resource) notFound();

  // Verify this is a storage resource
  const storageSlugs = typeConfigs.map(t => t.slug);
  if (!storageSlugs.includes(resource.typeTag)) notFound();

  const space       = resource.spaces[0];
  const activeRental = resource.rentals[0] ?? null;
  const defaultRate  = typeDefaultRate[resource.typeTag] ?? "";
  const label        = typeLabel[resource.typeTag] ?? resource.typeTag;

  // All active members for the assignment datalist
  const members = await prisma.member.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // ── Server actions ──────────────────────────────────────────────────────────

  async function renameAction(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s   = await auth();
    const name = (formData.get("name") as string).trim();
    if (!name) redirect(`/admin/storage/${id}?error=Name+is+required`);

    const taken = await prisma.resource.findFirst({ where: { name, deletedAt: null, id: { not: id } } });
    if (taken) redirect(`/admin/storage/${id}?error=${encodeURIComponent(`Name "${name}" is already taken`)}`);

    const old = await prisma.resource.findUnique({ where: { id }, select: { name: true } });
    await prisma.resource.update({ where: { id }, data: { name } });
    await audit({
      actorId: s?.user?.id ?? null, action: "update",
      entityType: "Resource", entityId: id,
      before: { name: old?.name }, after: { name },
      note: "Storage unit renamed",
    });
    redirect(`/admin/storage/${id}?success=Renamed`);
  }

  async function oosOnAction(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s    = await auth();
    const note = (formData.get("note") as string).trim() || null;
    await prisma.resource.update({
      where: { id },
      data: { outOfService: true, outOfServiceAt: new Date(), outOfServiceNote: note },
    });
    await audit({
      actorId: s?.user?.id ?? null, action: "update",
      entityType: "Resource", entityId: id,
      before: { outOfService: false }, after: { outOfService: true, outOfServiceNote: note },
      note: "Marked out of service",
    });
    redirect(`/admin/storage/${id}?success=Marked+out+of+service`);
  }

  async function oosOffAction(_formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s = await auth();
    await prisma.resource.update({
      where: { id },
      data: { outOfService: false, outOfServiceAt: null, outOfServiceNote: null },
    });
    await audit({
      actorId: s?.user?.id ?? null, action: "update",
      entityType: "Resource", entityId: id,
      before: { outOfService: true }, after: { outOfService: false },
      note: "Returned to service",
    });
    redirect(`/admin/storage/${id}?success=Returned+to+service`);
  }

  async function assignAction(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s         = await auth();
    const email     = (formData.get("email") as string).trim().toLowerCase();
    const startDate = new Date(formData.get("startDate") as string);
    const rate      = parseFloat(formData.get("rate") as string);

    if (!email || isNaN(startDate.getTime()) || isNaN(rate)) {
      redirect(`/admin/storage/${id}?error=Invalid+form+data`);
    }

    const member = await prisma.member.findFirst({ where: { email, deletedAt: null } });
    if (!member) redirect(`/admin/storage/${id}?error=${encodeURIComponent(`No member found with email "${email}"`)}`);

    const existing = await prisma.rental.findFirst({
      where: { resourceId: id, deletedAt: null, endDate: null },
    });
    if (existing) redirect(`/admin/storage/${id}?error=Unit+already+has+an+active+rental`);

    const rental = await prisma.rental.create({
      data: { memberId: member!.id, resourceId: id, startDate, monthlyRate: rate },
    });

    // Create Stripe subscription if payment is configured and member has a customer
    if (member!.stripeCustomerId) {
      try {
        const { subscriptionId, subscriptionItemId } = await payment.createSubscription({
          customerId:  member!.stripeCustomerId,
          unitAmount:  Math.round(rate * 100), // cents
          currency:    "usd",
          description: `Storage rental: ${resource!.name}`,
          metadata:    { rentalId: rental.id, memberId: member!.id },
        });
        await prisma.rental.update({
          where: { id: rental.id },
          data:  { stripeSubscriptionId: subscriptionId, stripeSubscriptionItemId: subscriptionItemId },
        });
      } catch {
        // Stripe failure is non-fatal — rental record still created
      }
    }

    await audit({
      actorId: s?.user?.id ?? null, action: "create",
      entityType: "Rental", entityId: rental.id,
      after: { memberId: member!.id, resourceId: id, startDate, monthlyRate: rate },
      note: `Storage rental assigned to ${member!.name}`,
    });
    redirect(`/admin/storage/${id}?success=${encodeURIComponent(`Assigned to ${member!.name}`)}`);
  }

  async function endRentalAction(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s        = await auth();
    const rentalId = formData.get("rentalId") as string;

    const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
    if (!rental || rental.resourceId !== id) redirect(`/admin/storage/${id}?error=Rental+not+found`);

    if (rental!.stripeSubscriptionId) {
      try { await payment.cancelSubscription(rental!.stripeSubscriptionId); } catch { /* non-fatal */ }
    }

    const endDate = new Date();
    await prisma.rental.update({ where: { id: rentalId }, data: { endDate } });
    await audit({
      actorId: s?.user?.id ?? null, action: "update",
      entityType: "Rental", entityId: rentalId,
      before: { endDate: null }, after: { endDate },
      note: "Storage rental ended",
    });
    redirect(`/admin/storage/${id}?success=Rental+ended`);
  }

  async function deleteAction(_formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/storage/${id}`);
    const s = await auth();

    const active = await prisma.rental.findFirst({
      where: { resourceId: id, deletedAt: null, endDate: null },
    });
    if (active) redirect(`/admin/storage/${id}?error=End+the+active+rental+before+deleting`);

    const r = await prisma.resource.findUnique({
      where: { id }, include: { spaces: { select: { externalId: true } } },
    });

    await prisma.space.updateMany({ where: { resourceId: id }, data: { resourceId: null } });
    await prisma.resource.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({
      actorId: s?.user?.id ?? null, action: "delete",
      entityType: "Resource", entityId: id,
      before: { name: r?.name, spaces: r?.spaces.map(s => s.externalId) },
      after:  { deletedAt: new Date() },
      note:   "Storage unit deleted — space unlinked",
    });
    redirect("/admin/storage");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-xl">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-400">
        <Link href="/admin/storage" className="hover:text-gray-700 hover:underline">Storage</Link>
        {" / "}
        <span className="text-gray-700">{resource.name}</span>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{resource.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {label}
            {space?.bayCode && <span className="ml-2 font-mono">{space.bayCode}</span>}
            {space?.shelfLevel != null && <span className="ml-1">L{space.shelfLevel}</span>}
            {space?.externalId && (
              <span className="ml-2 text-gray-400 text-xs">({space.externalId})</span>
            )}
          </p>
          {resource.outOfService && (
            <p className="mt-1 text-xs text-amber-700 font-medium">
              Out of service{resource.outOfServiceNote ? `: ${resource.outOfServiceNote}` : ""}
            </p>
          )}
        </div>
        <Link href={`/admin/audit?entity=Resource&entityId=${id}`} className="text-xs text-gray-400 hover:underline">
          audit log
        </Link>
      </div>

      {/* ── Rename ── */}
      <Section title="Name">
        <form action={renameAction} className="flex gap-2">
          <Input name="name" defaultValue={resource.name} className="h-8 text-sm" required />
          <Button type="submit" size="sm" variant="outline">Rename</Button>
        </form>
      </Section>

      {/* ── Out of service ── */}
      <Section title="Service status">
        {resource.outOfService ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-amber-700">
              Out of service{resource.outOfServiceAt
                ? ` since ${resource.outOfServiceAt.toLocaleDateString()}`
                : ""}
              {resource.outOfServiceNote && ` — ${resource.outOfServiceNote}`}
            </span>
            <form action={oosOffAction}>
              <Button type="submit" size="sm" variant="outline">Return to service</Button>
            </form>
          </div>
        ) : (
          <form action={oosOnAction} className="flex gap-2 items-center">
            <Input name="note" placeholder="Reason (optional)" className="h-8 text-sm w-52" />
            <Button type="submit" size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50">
              Mark out of service
            </Button>
          </form>
        )}
      </Section>

      {/* ── Rental ── */}
      <Section title="Rental">
        {activeRental ? (
          <div>
            <div className="mb-3 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-500">Tenant</span>
                <Link href={`/admin/members/${activeRental.member.id}`} className="font-medium hover:underline">
                  {activeRental.member.name}
                </Link>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-500">Started</span>
                <span>{activeRental.startDate.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Rate</span>
                <span>${Number(activeRental.monthlyRate).toFixed(2)}/mo</span>
              </div>
            </div>
            <form action={endRentalAction}>
              <input type="hidden" name="rentalId" value={activeRental.id} />
              <Button type="submit" size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
                End rental
              </Button>
            </form>
          </div>
        ) : (
          <div>
            <p className="text-sm text-green-700 font-medium mb-3">Vacant</p>
            <form action={assignAction} className="space-y-2">
              <datalist id="member-list">
                {members.map(m => (
                  <option key={m.id} value={m.email}>{m.name}</option>
                ))}
              </datalist>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Member email</label>
                <Input
                  name="email"
                  type="email"
                  list="member-list"
                  placeholder="member@example.com"
                  className="h-8 text-sm"
                  required
                />
              </div>
              <div className="flex gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start date</label>
                  <Input name="startDate" type="date" defaultValue={today} className="h-8 text-sm" required />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monthly rate ($)</label>
                  <Input name="rate" type="number" step="0.01" min="0"
                    defaultValue={defaultRate} className="h-8 text-sm w-28" required />
                </div>
              </div>
              <Button type="submit" size="sm">Assign</Button>
            </form>
          </div>
        )}
      </Section>

      {/* ── Danger zone ── */}
      <Section title="Danger zone">
        {activeRental ? (
          <p className="text-sm text-gray-400">End the active rental before deleting this unit.</p>
        ) : (
          <form action={deleteAction}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Delete unit
            </Button>
            <p className="mt-1 text-xs text-gray-400">
              Unlinks the floor plan space. The space can be re-imported later.
            </p>
          </form>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="rounded-md border px-4 py-3">{children}</div>
    </div>
  );
}
