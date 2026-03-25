import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/portal", label: "Home" },
  { href: "/portal/bookings", label: "My Bookings" },
  { href: "/portal/book", label: "Book Equipment" },
  { href: "/portal/studio", label: "My Studio" },
  { href: "/portal/certifications", label: "Certifications" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-sm">Artisans Asylum</span>
          <nav className="flex gap-1">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{session.user.name}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6 bg-gray-50">{children}</main>
    </div>
  );
}
