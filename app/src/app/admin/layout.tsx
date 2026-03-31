import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSystemFrozen } from "@/lib/freeze";
import type { MemberRole } from "@/generated/prisma/enums";
import NavLinks from "@/components/NavLinks";

// Links visible to all admin-eligible roles (VOLUNTEER, STAFF, ADMIN)
const volunteerLinks = [
  { href: "/admin",           label: "Dashboard" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/equipment", label: "Equipment" },
  { href: "/admin/bookings",  label: "Bookings" },
];

// Additional links for STAFF and ADMIN only
const staffLinks = [
  { href: "/admin/members",          label: "Members" },
  { href: "/admin/rental-requests",  label: "Rental Requests" },
  { href: "/admin/waitlist",         label: "Waitlist" },
  { href: "/admin/studios",          label: "Studios" },
  { href: "/admin/storage",          label: "Storage" },
  { href: "/admin/floorplans",       label: "Floor Plans" },
  { href: "/admin/reports",          label: "Reports" },
  { href: "/admin/audit",            label: "Audit" },
  { href: "/admin/settings",         label: "Settings" },
];

function navLinksForRole(role: MemberRole) {
  if (role === "STAFF" || role === "ADMIN") return [...volunteerLinks, ...staffLinks];
  return volunteerLinks;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // MEMBER role has no admin access; unauthenticated users go to login
  if (!session?.user) redirect("/login");
  if (session.user.role === "MEMBER") redirect("/portal");

  const frozen = await isSystemFrozen();
  const navLinks = navLinksForRole(session.user.role);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-sm focus:font-medium">
        Skip to main content
      </a>
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
      {frozen && (
        <div role="alert" className="bg-red-600 text-white text-center text-sm py-1.5 px-4 shrink-0">
          <span aria-hidden="true">⚠</span>{" "}System is frozen — write operations are disabled.{" "}
          <Link href="/admin/settings" className="underline font-medium">Manage in Settings</Link>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <nav aria-label="Admin navigation" className="w-48 bg-gray-50 border-r px-3 py-4 shrink-0">
          <NavLinks links={navLinks} />
        </nav>
        <main id="main-content" className="flex-1 overflow-auto p-6 bg-white">{children}</main>
      </div>
    </div>
  );
}
