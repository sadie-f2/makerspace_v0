export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: { email?: string; error?: string };
}) {
  const email = searchParams.email ?? "";

  async function handleConfirm(formData: FormData) {
    "use server";
    const rawEmail = (formData.get("email") as string).trim().toLowerCase();
    const code     = (formData.get("code") as string).trim().toUpperCase();

    if (!rawEmail || !code) redirect(`/confirm-email?email=${encodeURIComponent(rawEmail)}&error=missing`);

    const member = await prisma.member.findUnique({
      where: { email: rawEmail, deletedAt: null },
      select: { id: true, emailConfirmCode: true, emailConfirmExpiresAt: true },
    });

    if (!member || member.emailConfirmCode === null) {
      redirect(`/confirm-email?email=${encodeURIComponent(rawEmail)}&error=invalid`);
    }
    if (member.emailConfirmCode !== code) {
      redirect(`/confirm-email?email=${encodeURIComponent(rawEmail)}&error=invalid`);
    }
    if (member.emailConfirmExpiresAt && member.emailConfirmExpiresAt < new Date()) {
      redirect(`/confirm-email?email=${encodeURIComponent(rawEmail)}&error=expired`);
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { emailVerified: new Date(), emailConfirmCode: null, emailConfirmExpiresAt: null },
    });

    // Password was set at registration — sign in now that the account is confirmed
    // We can't sign in with credentials here (no password in scope), so redirect to login
    redirect(`/login?email=${encodeURIComponent(rawEmail)}&confirmed=1`);
  }

  const errorMessages: Record<string, string> = {
    missing: "Please enter your code.",
    invalid: "That code is incorrect.",
    expired: "That code has expired. Please register again.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Confirm your email</CardTitle>
          <CardDescription>
            Enter the 4-character code we sent to{" "}
            {email ? <strong>{email}</strong> : "your email address"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleConfirm} className="space-y-4">
            <input type="hidden" name="email" value={email} />
            <div className="space-y-1">
              <Label htmlFor="code">Confirmation code</Label>
              <Input
                id="code"
                name="code"
                required
                maxLength={4}
                placeholder="A3F2"
                className="text-center text-2xl tracking-widest font-mono uppercase"
                autoComplete="off"
                autoFocus
              />
            </div>
            {searchParams.error && (
              <p className="text-sm text-red-600">
                {errorMessages[searchParams.error] ?? "Something went wrong."}
              </p>
            )}
            <Button type="submit" className="w-full">Confirm</Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Wrong email?{" "}
            <Link href="/register" className="underline">Start over</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
