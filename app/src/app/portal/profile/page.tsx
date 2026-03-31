import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { identity } from "@/lib/identity";
import { checkPasswordStrength, type PasswordRole } from "@/lib/passwordStrength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { saved?: string; pwsaved?: string; pwerror?: string };
}) {
  const session = await auth();
  const memberId = session!.user.id;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { name: true, email: true, phone: true, emergencyContact: true },
  });
  if (!member) redirect("/login");

  async function updateProfile(formData: FormData) {
    "use server";
    const name             = (formData.get("name") as string).trim();
    const phone            = (formData.get("phone") as string).trim() || null;
    const emergencyContact = (formData.get("emergencyContact") as string).trim() || null;
    if (!name) return;
    await prisma.member.update({ where: { id: memberId }, data: { name, phone, emergencyContact } });
    redirect("/portal/profile?saved=1");
  }

  async function changePassword(formData: FormData) {
    "use server";
    const current = formData.get("current") as string;
    const next    = formData.get("next") as string;
    const confirm = formData.get("confirm") as string;

    if (next !== confirm) redirect("/portal/profile?pwerror=mismatch");

    // Verify current password before allowing change
    const m = await prisma.member.findUnique({
      where:  { id: memberId },
      select: { email: true, passwordHash: true, role: true },
    });
    if (!m?.passwordHash) redirect("/portal/profile?pwerror=nopass");

    const valid = await identity.verifyCredentials(m.email, current);
    if (!valid) redirect("/portal/profile?pwerror=wrong");

    const check = checkPasswordStrength(next, m.role as PasswordRole);
    if (!check.ok) redirect(`/portal/profile?pwerror=${encodeURIComponent(check.message!)}`);

    await identity.setPassword({ memberId, newPassword: next });
    redirect("/portal/profile?pwsaved=1");
  }

  const pwErrors: Record<string, string> = {
    mismatch: "New passwords do not match.",
    wrong:    "Current password is incorrect.",
    nopass:   "No password set on this account.",
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-6">Profile</h2>

      {/* Profile form */}
      <section className="mb-10">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Contact info</h3>
        <form action={updateProfile} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" defaultValue={member.name} required className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={member.phone ?? ""} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emergencyContact">Emergency contact</Label>
            <Input id="emergencyContact" name="emergencyContact" defaultValue={member.emergencyContact ?? ""} className="h-9" />
          </div>
          <div className="text-sm text-gray-400">
            Email: {member.email} <span className="text-xs">(contact staff to change)</span>
          </div>
          {searchParams.saved && (
            <p className="text-sm text-green-600">Profile saved.</p>
          )}
          <Button type="submit">Save profile</Button>
        </form>
      </section>

      {/* Password form */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Change password</h3>
        <form action={changePassword} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="current">Current password</Label>
            <PasswordInput id="current" name="current" required autoComplete="current-password" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="next">New password</Label>
            <PasswordInput id="next" name="next" required autoComplete="new-password" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm">Confirm new password</Label>
            <PasswordInput id="confirm" name="confirm" required autoComplete="new-password" className="h-9" />
          </div>
          {searchParams.pwerror && (
            <p className="text-sm text-red-600">
              {pwErrors[searchParams.pwerror] ?? decodeURIComponent(searchParams.pwerror)}
            </p>
          )}
          {searchParams.pwsaved && (
            <p className="text-sm text-green-600">Password updated.</p>
          )}
          <Button type="submit">Change password</Button>
        </form>
      </section>
    </div>
  );
}
