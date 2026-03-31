import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSystemFrozen } from "@/lib/freeze";
import type { MemberRole } from "@/generated/prisma/enums";
import LayoutShell from "@/components/LayoutShell";

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

  const headerRight = (
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
  );

  const frozenBanner = frozen ? (
    <div role="alert" className="bg-red-600 text-white text-center text-sm py-1.5 px-4 shrink-0">
      <span aria-hidden="true">⚠</span>{" "}System is frozen — write operations are disabled.{" "}
      <Link href="/admin/settings" className="underline font-medium">Manage in Settings</Link>
    </div>
  ) : undefined;

  return (
    <LayoutShell
      title="Artisans Asylum — Admin"
      headerRight={headerRight}
      navLinks={navLinks}
      navLabel="Admin navigation"
      frozenBanner={frozenBanner}
    >
      {children}
    </LayoutShell>
  );
}
