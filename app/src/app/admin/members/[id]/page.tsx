import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { identity } from "@/lib/identity";
import { access } from "@/lib/access";
import { notify } from "@/lib/notifications";
import { hasPermission, PERMISSION_LABELS } from "@/lib/permissions";
import { requireUnfrozen } from "@/lib/freeze";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VALID_ROLES = ["MEMBER", "VOLUNTEER", "STAFF", "ADMIN"] as const;
type ValidRole = typeof VALID_ROLES[number];

// Roles a staff member is allowed to assign (not STAFF or ADMIN — only admin can promote that high)
const STAFF_ASSIGNABLE: ValidRole[] = ["MEMBER", "VOLUNTEER"];

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { pwreset?: string };
}) {
  const { id } = await params;
  const session = await auth();
  const actorRole = session?.user.role as ValidRole | undefined;
  const isAdmin   = actorRole === "ADMIN";
  const isStaff   = actorRole === "STAFF" || isAdmin;

  const actorId = session?.user.id;

  const [member, tiers, allEquipmentClasses, availableResources, memberPermissions, actorCanGrantCerts] =
    await Promise.all([
      prisma.member.findUnique({
        where: { id, deletedAt: null },
        include: {
          tier: true,
          certifications: {
            include: { equipmentClass: { select: { id: true, name: true } } },
            orderBy: { grantedAt: "desc" },
          },
          rentals: {
            where: { deletedAt: null, endDate: null },
            include: { resource: { select: { name: true, typeTag: true } } },
            orderBy: { startDate: "desc" },
          },
        },
      }),
      prisma.memberTier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.equipmentClass.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
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
      prisma.memberPermission.findMany({
        where: { memberId: id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { grantedAt: "asc" },
      }),
      // Can the current actor grant certifications? (staff/admin always yes; volunteers check DB)
      actorId && !isStaff
        ? hasPermission(actorId, "certifications.grant")
        : Promise.resolve(isStaff),
    ]);

  if (!member) notFound();

  const activeCerts       = member.certifications.filter(c => !c.revokedAt);
  const certifiedClassIds = new Set(activeCerts.map(c => c.equipmentClass.id));
  const uncertifiedClasses = allEquipmentClasses.filter(ec => !certifiedClassIds.has(ec.id));
  const today = new Date().toISOString().split("T")[0];

  // Permission keys already held — for excluding from the grant picker
  const heldPermissions = new Set(memberPermissions.map(p => p.permission));

  // Permission keys available to grant (known labels not already held)
  const grantablePermissions = Object.entries(PERMISSION_LABELS).filter(
    ([key]) => !heldPermissions.has(key),
  );

  // ── Server actions ──────────────────────────────────────────────────────────

  async function updateProfile(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const name             = (formData.get("name") as string).trim();
    const email            = (formData.get("email") as string).trim();
    const phone            = (formData.get("phone") as string).trim() || null;
    const emergencyContact = (formData.get("emergencyContact") as string).trim() || null;
    if (!name || !email) return;
    await prisma.member.update({ where: { id }, data: { name, email, phone, emergencyContact } });
    await access.syncMember({ memberId: id, name, email, oktaId: member!.oktaId ?? undefined });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: { name: member!.name, email: member!.email, phone: member!.phone, emergencyContact: member!.emergencyContact },
      after:  { name, email, phone, emergencyContact },
      note: "Profile updated",
    });
    redirect(`/admin/members/${id}`);
  }

  async function assignRole(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const role = formData.get("role") as string;
    if (!VALID_ROLES.includes(role as ValidRole)) return;
    // Staff can only assign up to VOLUNTEER; admin can assign any
    const actorRoleNow = session?.user.role as ValidRole | undefined;
    if (actorRoleNow === "STAFF" && !STAFF_ASSIGNABLE.includes(role as ValidRole)) return;
    if (!["STAFF", "ADMIN"].includes(actorRoleNow ?? "")) return;
    await prisma.member.update({ where: { id }, data: { role: role as ValidRole } });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: { role: member!.role }, after: { role }, note: "Role changed",
    });
    redirect(`/admin/members/${id}`);
  }

  async function assignTier(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const tierId = (formData.get("tierId") as string) || null;
    await prisma.member.update({ where: { id }, data: { tierId } });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: { tierId: member!.tierId }, after: { tierId }, note: "Tier assignment changed",
    });
    redirect(`/admin/members/${id}`);
  }

  async function sendWelcome(_formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    await notify("welcome", { name: member!.name, email: member!.email }, {
      loginUrl: `${process.env.AUTH_URL ?? "http://localhost:3000"}/login`,
    });
    redirect(`/admin/members/${id}`);
  }

  async function resetPassword(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const newPassword = (formData.get("newPassword") as string).trim();
    if (newPassword.length < 8) return;
    await identity.setPassword({ memberId: id, newPassword });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: null, after: null, note: "Password reset by staff",
    });
    redirect(`/admin/members/${id}?pwreset=1`);
  }

  async function suspendAccess(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const reason = (formData.get("reason") as string).trim() || undefined;
    await prisma.member.update({
      where: { id },
      data:  { accessSuspended: true, accessSuspendedAt: new Date() },
    });
    await access.revokeAccess({ memberId: id, name: member!.name, email: member!.email, oktaId: member!.oktaId ?? undefined });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: { accessSuspended: false }, after: { accessSuspended: true },
      note: reason ? `Access suspended: ${reason}` : "Access suspended",
    });
    await notify("access.suspended", { name: member!.name, email: member!.email }, { reason });
    redirect(`/admin/members/${id}`);
  }

  async function restoreAccess(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const note = (formData.get("note") as string).trim() || undefined;
    await prisma.member.update({
      where: { id },
      data:  { accessSuspended: false, accessSuspendedAt: null },
    });
    await access.grantAccess({ memberId: id, name: member!.name, email: member!.email, oktaId: member!.oktaId ?? undefined });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Member", entityId: id,
      before: { accessSuspended: true }, after: { accessSuspended: false },
      note: note ? `Access restored: ${note}` : "Access restored",
    });
    await notify("access.restored", { name: member!.name, email: member!.email }, { note });
    redirect(`/admin/members/${id}`);
  }

  async function grantPermission(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    // Custom key takes precedence over picker selection
    const custom     = (formData.get("permissionCustom") as string ?? "").trim();
    const picked     = (formData.get("permissionSelect") as string ?? "").trim();
    const permission = custom || picked;
    if (!permission) return;
    await prisma.memberPermission.upsert({
      where: { memberId_permission: { memberId: id, permission } },
      update: { expiresAt: null, grantedAt: new Date(), grantedById: session!.user.id },
      create: { memberId: id, permission, grantedById: session!.user.id },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "create", entityType: "MemberPermission", entityId: id,
      before: null, after: { permission }, note: `Permission granted: ${permission}`,
    });
    redirect(`/admin/members/${id}`);
  }

  async function revokePermission(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const permissionId = formData.get("permissionId") as string;
    const perm = await prisma.memberPermission.findUnique({ where: { id: permissionId } });
    await prisma.memberPermission.delete({ where: { id: permissionId } });
    await audit({
      actorId: session?.user.id ?? null,
      action: "delete", entityType: "MemberPermission", entityId: id,
      before: { permission: perm?.permission }, after: null, note: `Permission revoked: ${perm?.permission}`,
    });
    redirect(`/admin/members/${id}`);
  }

  async function addRental(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const resourceId  = formData.get("resourceId") as string;
    const startDate   = new Date(formData.get("startDate") as string);
    const monthlyRate = parseFloat(formData.get("monthlyRate") as string);
    if (!resourceId || isNaN(startDate.getTime()) || isNaN(monthlyRate)) return;
    const rental = await prisma.rental.create({
      data: { memberId: id, resourceId, startDate, monthlyRate },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "create", entityType: "Rental", entityId: rental.id,
      before: null, after: { memberId: id, resourceId, startDate, monthlyRate },
    });
    redirect(`/admin/members/${id}`);
  }

  async function endRental(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const rentalId = formData.get("rentalId") as string;
    const endDate = new Date();
    await prisma.rental.update({ where: { id: rentalId }, data: { endDate } });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Rental", entityId: rentalId,
      before: { endDate: null }, after: { endDate }, note: "Rental ended",
    });
    redirect(`/admin/members/${id}`);
  }

  async function grantCert(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const equipmentClassId = formData.get("equipmentClassId") as string;
    const grantedById = session!.user.id;
    // Auth: staff/admin always allowed; volunteers need certifications.grant or class-specific grant
    const actorRoleNow = session?.user.role as ValidRole | undefined;
    const isActorStaff = actorRoleNow === "STAFF" || actorRoleNow === "ADMIN";
    if (!isActorStaff) {
      const allowed = await hasPermission(grantedById, `certifications.grant.${equipmentClassId}`);
      if (!allowed) return;
    }
    const existing = await prisma.certification.findUnique({
      where: { memberId_equipmentClassId: { memberId: id, equipmentClassId } },
    });
    const cert = await prisma.certification.upsert({
      where:  { memberId_equipmentClassId: { memberId: id, equipmentClassId } },
      update: { revokedAt: null, revokedById: null, grantedAt: new Date(), grantedById },
      create: { memberId: id, equipmentClassId, grantedById },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: existing ? "restore" : "create",
      entityType: "Certification", entityId: cert.id,
      before: existing ? { revokedAt: existing.revokedAt } : null,
      after:  { memberId: id, equipmentClassId, revokedAt: null },
    });
    redirect(`/admin/members/${id}`);
  }

  async function revokeCert(formData: FormData) {
    "use server";
    await requireUnfrozen(`/admin/members/${id}`);
    const certId    = formData.get("certId") as string;
    const revokedAt = new Date();
    await prisma.certification.update({
      where: { id: certId },
      data:  { revokedAt, revokedById: session!.user.id },
    });
    await audit({
      actorId: session?.user.id ?? null,
      action: "update", entityType: "Certification", entityId: certId,
      before: { revokedAt: null }, after: { revokedAt },
    });
    redirect(`/admin/members/${id}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const sectionHead = "text-sm font-medium text-gray-500 uppercase tracking-wide mb-3";
  const selectCls   = "border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";

  // Role options available to the current actor
  const roleOptions: ValidRole[] = isAdmin
    ? ["MEMBER", "VOLUNTEER", "STAFF", "ADMIN"]
    : ["MEMBER", "VOLUNTEER"];

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/admin/members" className="text-sm text-gray-500 hover:underline">
          ← Members
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">{member.name}</h2>
        <div className="flex items-center gap-2">
          <form action={sendWelcome}>
            <Button type="submit" size="sm" variant="outline">Send welcome email</Button>
          </form>
        </div>
      </div>

      {/* ── Profile ── */}
      <section className="mb-8">
        <h3 className={sectionHead}>Profile</h3>
        <form action={updateProfile} className="space-y-3">
          <div className="grid grid-cols-[10rem_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={member.name} required className="h-8" />
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={member.email} required className="h-8" />
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={member.phone ?? ""} className="h-8" />
            <Label htmlFor="emergencyContact">Emergency contact</Label>
            <Input id="emergencyContact" name="emergencyContact" defaultValue={member.emergencyContact ?? ""} className="h-8" />
            <span className="text-gray-500">Joined</span>
            <span className="text-sm">{member.createdAt.toLocaleDateString()}</span>
          </div>
          <Button type="submit" size="sm">Save profile</Button>
        </form>
        {isStaff && (
          <form action={resetPassword} className="flex items-center gap-2 mt-3">
            <Input
              name="newPassword"
              type="password"
              placeholder="Set new password"
              minLength={8}
              required
              className="h-8 w-48 text-sm"
            />
            <Button type="submit" size="sm" variant="outline">Set password</Button>
            {searchParams.pwreset && (
              <span className="text-xs text-green-600">Password updated.</span>
            )}
          </form>
        )}
      </section>

      {/* ── Access Control (staff + admin) ── */}
      {isStaff && (
        <section className="mb-8">
          <h3 className={sectionHead}>Building Access</h3>
          <div className="flex items-center gap-3 text-sm mb-3">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              member.accessSuspended
                ? "bg-red-100 text-red-800"
                : "bg-green-100 text-green-800"
            }`}>
              {member.accessSuspended ? "Suspended" : "Active"}
            </span>
            {member.accessSuspendedAt && (
              <span className="text-gray-400 text-xs">
                since {member.accessSuspendedAt.toLocaleDateString()}
              </span>
            )}
          </div>
          {member.accessSuspended ? (
            <form action={restoreAccess} className="flex items-center gap-2">
              <Input name="note" placeholder="Reason for restoration (optional)" className="h-8 text-sm w-64" />
              <Button type="submit" size="sm">Restore access</Button>
            </form>
          ) : (
            <form action={suspendAccess} className="flex items-center gap-2">
              <Input name="reason" placeholder="Reason for suspension (optional)" className="h-8 text-sm w-64" />
              <Button type="submit" size="sm" variant="destructive">Suspend access</Button>
            </form>
          )}
        </section>
      )}

      {/* ── Role (staff + admin) ── */}
      {isStaff && (
        <section className="mb-8">
          <h3 className={sectionHead}>Role</h3>
          <form action={assignRole} className="flex items-center gap-3">
            <select name="role" defaultValue={member.role} className={selectCls}>
              {roleOptions.map(r => (
                <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <Button size="sm" type="submit">Save</Button>
          </form>
          {!isAdmin && (
            <p className="text-xs text-gray-400 mt-1">Staff can assign Member or Volunteer only.</p>
          )}
        </section>
      )}

      {/* ── Permissions (staff + admin) ── */}
      {isStaff && (
        <section className="mb-8">
          <h3 className={sectionHead}>Permissions</h3>
          {memberPermissions.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">No extra permissions.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {memberPermissions.map(p => (
                <form key={p.id} action={revokePermission} className="inline-flex">
                  <input type="hidden" name="permissionId" value={p.id} />
                  <Badge variant="secondary" className="pr-1 gap-1 font-mono text-xs">
                    {PERMISSION_LABELS[p.permission] ?? p.permission}
                    <button type="submit" className="ml-1 text-gray-400 hover:text-red-600" title="Revoke">
                      ×
                    </button>
                  </Badge>
                </form>
              ))}
            </div>
          )}
          <form action={grantPermission} className="flex gap-2 items-center flex-wrap">
            <select name="permissionSelect" className={selectCls}>
              <option value="">Grant permission…</option>
              {grantablePermissions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <Input
              name="permissionCustom"
              placeholder="or custom key (e.g. certifications.grant.abc123)"
              className="h-8 text-sm flex-1 min-w-48 font-mono"
            />
            <Button size="sm" type="submit">Grant</Button>
          </form>
          <p className="text-xs text-gray-400 mt-1">
            Custom key overrides picker. Use picker for standard permissions.
          </p>
        </section>
      )}

      {/* ── Tier ── */}
      <section className="mb-8">
        <h3 className={sectionHead}>Membership Tier</h3>
        <form action={assignTier} className="flex items-center gap-3">
          <select name="tierId" defaultValue={member.tierId ?? ""} className={`${selectCls} w-64`}>
            <option value="">— No tier —</option>
            {tiers.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} — ${Number(t.monthlyRate).toFixed(0)}/mo
              </option>
            ))}
          </select>
          <Button size="sm" type="submit">Save</Button>
        </form>
      </section>

      {/* ── Rentals ── */}
      <section className="mb-8">
        <h3 className={sectionHead}>Active Rentals</h3>
        {member.rentals.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">No active rentals.</p>
        ) : (
          <ul className="text-sm border rounded divide-y mb-4">
            {member.rentals.map(l => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="font-medium">{l.resource.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{l.resource.typeTag}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 text-xs">
                    ${Number(l.monthlyRate).toFixed(0)}/mo · since {l.startDate.toLocaleDateString()}
                  </span>
                  <form action={endRental}>
                    <input type="hidden" name="rentalId" value={l.id} />
                    <button type="submit" className="text-xs text-red-400 hover:text-red-600">End</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {availableResources.length > 0 && (
          <form action={addRental} className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Resource</label>
              <select name="resourceId" required className={selectCls}>
                <option value="">Select resource…</option>
                {availableResources.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.typeTag === "storage_unit" ? "storage" : "studio"})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Start date</label>
              <Input name="startDate" type="date" defaultValue={today} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Monthly rate ($)</label>
              <Input name="monthlyRate" type="number" min="0" step="0.01" placeholder="0.00" required className="h-8 w-28 text-sm" />
            </div>
            <Button type="submit" size="sm">Add rental</Button>
          </form>
        )}
      </section>

      {/* ── Certifications ── */}
      <section>
        <h3 className={sectionHead}>Certifications ({activeCerts.length})</h3>
        {activeCerts.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">No active certifications.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {activeCerts.map(c => (
              <form key={c.id} action={revokeCert} className="inline-flex items-center">
                <input type="hidden" name="certId" value={c.id} />
                <Badge variant="secondary" className="pr-1 gap-1">
                  <Link href={`/admin/equipment/${c.equipmentClass.id}`} className="hover:underline">
                    {c.equipmentClass.name}
                  </Link>
                  <button type="submit" className="ml-1 text-gray-400 hover:text-red-600 leading-none" title="Revoke">
                    ×
                  </button>
                </Badge>
              </form>
            ))}
          </div>
        )}
        {uncertifiedClasses.length > 0 && actorCanGrantCerts && (
          <form action={grantCert} className="flex gap-2 items-center">
            <select name="equipmentClassId" required className={selectCls}>
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
