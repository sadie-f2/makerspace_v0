import { auth } from "@/auth";

/** Guard for /api/admin/* route handlers. Returns a 403 Response if the
 *  caller is not authenticated as STAFF or ADMIN; otherwise returns null. */
export async function requireAdminApi(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user || !["STAFF", "ADMIN"].includes(session.user.role)) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
