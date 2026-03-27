import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/portal",                  label: "Home" },
  { href: "/portal/profile",          label: "Profile" },
  { href: "/portal/rentals",          label: "Rentals" },
  { href: "/portal/waitlist",         label: "Waitlist" },
  { href: "/portal/certifications",   label: "Certifications" },
  { href: "/portal/map",              label: "Map" },
  { href: "/portal/day-pass",         label: "Day Pass" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col h-screen">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">Artisans Asylum</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{session.user.name}</span>
          {(session.user.role === "STAFF" || session.user.role === "ADMIN") && (
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-700 underline">
              Admin
            </Link>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="outline" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-44 bg-gray-50 border-r px-3 py-4 shrink-0">
          <ul className="space-y-1">
            {navLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-200"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 overflow-auto p-6 bg-white">{children}</main>
      </div>
    </div>
  );
}
