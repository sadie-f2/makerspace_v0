import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/requireStaff";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { identity } from "@/lib/identity";
import { payment } from "@/lib/payment";
import { requireUnfrozen } from "@/lib/freeze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const VALID_ROLES = ["MEMBER", "VOLUNTEER", "STAFF", "ADMIN"] as const;
type ValidRole = typeof VALID_ROLES[number];

export default async function NewMemberPage() {
  await requireStaff();
  const session = await auth();
  const actorRole = session?.user.role as ValidRole | undefined;
  const isAdmin = actorRole === "ADMIN";

  const tiers = await prisma.memberTier.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  async function createMember(formData: FormData) {
    "use server";
    const session = await auth();
    await requireUnfrozen("/admin/members/new");
    const name  = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = (formData.get("phone") as string) || null;
    const tierId = (formData.get("tierId") as string) || null;
    const password = formData.get("password") as string;

    // Role: only admins may set STAFF/ADMIN; others always create MEMBER
    const actorRoleNow = session?.user.role as ValidRole | undefined;
    const rawRole = (formData.get("role") as string) || "MEMBER";
    const role: ValidRole =
      actorRoleNow === "ADMIN" && VALID_ROLES.includes(rawRole as ValidRole)
        ? (rawRole as ValidRole)
        : "MEMBER";
    const requiresPasswordReset = ["STAFF", "ADMIN"].includes(role);

    const member = await prisma.member.create({
      data: { name, email, phone, tierId, role, requiresPasswordReset },
    });

    await identity.provisionUser({ memberId: member.id, name, email, initialPassword: password || undefined });

    const stripeCustomerId = await payment.createCustomer({ memberId: member.id, name, email });
    await prisma.member.update({ where: { id: member.id }, data: { stripeCustomerId } });

    await audit({
      actorId: session?.user.id ?? null,
      action: "create",
      entityType: "Member",
      entityId: member.id,
      before: null,
      after: { name, email, phone, tierId },
    });

    redirect(`/admin/members/${member.id}`);
  }

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href="/admin/members" className="text-sm text-gray-500 hover:underline">
          ← Members
        </Link>
      </div>
      <h2 className="text-lg font-semibold mb-6">New Member</h2>

      <form action={createMember} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tierId">Membership tier</Label>
          <Select name="tierId">
            <SelectTrigger>
              <SelectValue placeholder="Select tier…" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} — ${Number(t.monthlyRate).toFixed(0)}/mo
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && (
          <div className="space-y-1">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              defaultValue="MEMBER"
              className="border rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="MEMBER">Member</option>
              <option value="VOLUNTEER">Volunteer</option>
              <option value="STAFF">Staff (requires password reset)</option>
              <option value="ADMIN">Admin (requires password reset)</option>
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="password">
            Temporary password{" "}
            <span className="text-gray-400 font-normal">(defaults to "changeme")</span>
          </Label>
          <PasswordInput id="password" name="password" placeholder="changeme" className="h-9" />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit">Create member</Button>
          <Link href="/admin/members">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
