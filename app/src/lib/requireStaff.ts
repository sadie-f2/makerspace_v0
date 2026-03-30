import { auth } from "@/auth";
import { redirect } from "next/navigation";

/** Guard for staff-only admin pages. Redirects VOLUNTEER-role users back to
 *  the admin dashboard. Call at the top of restricted server components. */
export async function requireStaff(): Promise<void> {
  const session = await auth();
  if (!session?.user || !["STAFF", "ADMIN"].includes(session.user.role)) {
    redirect("/admin");
  }
}
