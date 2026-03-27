import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/rental-requests", label: "Rental Requests" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/studios", label: "Studios" },
  { href: "/admin/storage", label: "Storage" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/floorplans", label: "Floor Plans" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">Artisans Asylum — Admin</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            {session.user.name} ({session.user.role})
          </span>
          <Link href="/portal" className="text-xs text-gray-400 hover:text-gray-700 underline">
            Member portal
          </Link>
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
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-48 bg-gray-50 border-r px-3 py-4 shrink-0">
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
