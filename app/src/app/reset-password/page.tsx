import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { identity } from "@/lib/identity";
import { audit } from "@/lib/audit";
import { checkPasswordStrength, STRENGTH_REQUIREMENTS, type PasswordRole } from "@/lib/passwordStrength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const member = await prisma.member.findUnique({
    where:  { id: session.user.id },
    select: { requiresPasswordReset: true, role: true, name: true },
  });

  // If the flag isn't set, nothing to do here
  if (!member?.requiresPasswordReset) redirect("/portal");

  const { error } = await searchParams;
  const isElevated = member.role === "STAFF" || member.role === "ADMIN";

  async function handleReset(formData: FormData) {
    "use server";
    const s = await auth();
    if (!s?.user) redirect("/login");

    const password = formData.get("password") as string;
    const confirm  = formData.get("confirm") as string;

    if (password !== confirm) redirect("/reset-password?error=Passwords+do+not+match.");

    const m = await prisma.member.findUnique({
      where:  { id: s.user.id },
      select: { role: true },
    });
    const check = checkPasswordStrength(password, m!.role as PasswordRole);
    if (!check.ok) redirect(`/reset-password?error=${encodeURIComponent(check.message!)}`);

    await identity.setPassword({ memberId: s.user.id, newPassword: password });
    await prisma.member.update({
      where: { id: s.user.id },
      data:  { requiresPasswordReset: false },
    });
    await audit({
      actorId: s.user.id, action: "update",
      entityType: "Member", entityId: s.user.id,
      before: null, after: null,
      note: "Password reset (required on elevation)",
    });

    redirect("/portal");
  }

  const reqs = isElevated ? STRENGTH_REQUIREMENTS.elevated : STRENGTH_REQUIREMENTS.standard;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg border p-8 space-y-5">
        <div>
          <h1 className="text-lg font-semibold">Set a new password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your account requires a password reset before you can continue.
          </p>
        </div>

        <ul className="text-xs text-gray-500 space-y-1 pl-4 list-disc">
          {reqs.map(r => <li key={r}>{r}</li>)}
        </ul>

        <form action={handleReset} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              name="confirm"
              autoComplete="new-password"
              required
              className="h-9"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600" role="alert">{decodeURIComponent(error)}</p>
          )}
          <Button type="submit" className="w-full">Set password</Button>
        </form>
      </div>
    </div>
  );
}
