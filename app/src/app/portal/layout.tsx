import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LayoutShell from "@/components/LayoutShell";

const navLinks = [
  { href: "/portal",                  label: "Home" },
  { href: "/portal/profile",          label: "Profile" },
  { href: "/portal/rentals",          label: "Rentals" },
  { href: "/portal/bookings",         label: "Bookings" },
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

  const headerRight = (
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
  );

  return (
    <LayoutShell
      title="Artisans Asylum"
      headerRight={headerRight}
      navLinks={navLinks}
      navLabel="Member navigation"
    >
      {children}
    </LayoutShell>
  );
}
