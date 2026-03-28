import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { identity } from "@/lib/identity";
import { payment } from "@/lib/payment";
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

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  async function handleRegister(formData: FormData) {
    "use server";
    const name     = (formData.get("name") as string).trim();
    const email    = (formData.get("email") as string).trim().toLowerCase();
    const password = formData.get("password") as string;
    const confirm  = formData.get("confirm") as string;

    if (!name || !email || !password) redirect("/register?error=missing");
    if (password !== confirm)         redirect("/register?error=mismatch");
    if (password.length < 8)          redirect("/register?error=short");

    const existing = await prisma.member.findUnique({ where: { email } });
    if (existing) redirect("/register?error=taken");

    const member = await prisma.member.create({
      data: { name, email },
    });
    await identity.provisionUser({ memberId: member.id, name, email, initialPassword: password });

    const stripeCustomerId = await payment.createCustomer({ memberId: member.id, name, email });
    await prisma.member.update({ where: { id: member.id }, data: { stripeCustomerId } });

    await signIn("credentials", { email, password, redirectTo: "/portal" });
  }

  const errorMessages: Record<string, string> = {
    missing:  "Please fill in all fields.",
    mismatch: "Passwords do not match.",
    short:    "Password must be at least 8 characters.",
    taken:    "An account with that email already exists.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Artisans Asylum member portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleRegister} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
            </div>
            {searchParams.error && (
              <p className="text-sm text-red-600">
                {errorMessages[searchParams.error] ?? "Something went wrong."}
              </p>
            )}
            <Button type="submit" className="w-full">Create account</Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{" "}
            <Link href="/login" className="underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
