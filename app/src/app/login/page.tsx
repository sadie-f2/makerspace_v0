import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl: callbackParam } = await searchParams;
  const callbackUrl = callbackParam ?? "/portal";

  async function handleLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/login?error=invalid&callbackUrl=${callbackUrl}`);
      }
      throw error; // redirects rethrow
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Artisans Asylum</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p id="login-error" role="alert" className="text-sm text-red-600">
                Invalid email or password.
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            No account?{" "}
            <a href="/register" className="underline">Create one</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
