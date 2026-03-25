import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await auth();
  if (session) {
    redirect(session.user.role === "ADMIN" || session.user.role === "STAFF"
      ? "/admin"
      : "/portal");
  }
  redirect("/login");
}
